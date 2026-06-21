import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User
from app.core.settings import settings

bearer_scheme = HTTPBearer(auto_error=False)  # auto_error=False so dev-mode can skip it cleanly

DEV_USER_EMAIL    = "dev@local.test"
DEV_USER_GOOGLE_ID = "dev-local-bypass"
DEV_USER_NAME     = "Local Dev"

def create_jwt(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_google_auth_url(state: str | None = None) -> str:
    params = {
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "redirect_uri":  settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "offline",
    }
    if state:
        params["state"] = state
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{settings.GOOGLE_AUTH_URL}?{query}"


async def exchange_code_for_userinfo(code: str) -> dict:
    """Exchange OAuth code → access token → user info from Google."""
    async with httpx.AsyncClient() as client:
        # Step 1: exchange code for tokens
        token_res = await client.post(settings.GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri":  settings.GOOGLE_REDIRECT_URI,
            "grant_type":    "authorization_code",
        })
        token_res.raise_for_status()
        access_token = token_res.json()["access_token"]

        # Step 2: fetch user info
        userinfo_res = await client.get(
            settings.GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        userinfo_res.raise_for_status()
        return userinfo_res.json()


def get_or_create_user(db: Session, google_data: dict) -> User:
    """Find existing user by google_id or create a new one."""
    user = db.query(User).filter(User.google_id == google_data["sub"]).first()
    if user:
        # Update name/picture in case they changed on Google
        user.name    = google_data.get("name", user.name)
        user.picture = google_data.get("picture", user.picture)
        db.commit()
        db.refresh(user)
        return user

    user = User(
        google_id = google_data["sub"],
        email     = google_data["email"],
        name      = google_data.get("name", ""),
        picture   = google_data.get("picture"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def get_or_create_dev_user(db: Session) -> User:
    """
    Used only when settings.ENVIRONMENT == 'local'.
    Always returns the same single fake user — no Google OAuth needed.
    Lets people clone the repo and try the app immediately without
    setting up Google Cloud credentials.
    """
    user = db.query(User).filter(User.google_id == DEV_USER_GOOGLE_ID).first()
    if user:
        return user

    user = User(
        google_id = DEV_USER_GOOGLE_ID,
        email     = DEV_USER_EMAIL,
        name      = DEV_USER_NAME,
        picture   = None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    db: Session = Depends(get_db),
) -> User:
    """
    Dependency used on every protected route.

    In dev mode (settings.ENVIRONMENT == "local"), this bypasses JWT/Google
    entirely and returns a single hardcoded local user — no token needed.
    In normal mode, it behaves as before: decode the JWT and look up the user.
    """
    if settings.ENVIRONMENT == "local":
        return get_or_create_dev_user(db)

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_jwt(credentials.credentials)
    user_id = int(payload["sub"])

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    return user