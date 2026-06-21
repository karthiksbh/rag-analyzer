from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.auth import (
    get_google_auth_url,
    exchange_code_for_userinfo,
    get_or_create_user,
    get_or_create_dev_user,
    create_jwt,
    get_current_user,
)
from app.core.settings import settings
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/google")
async def google_login(db: Session = Depends(get_db)):
    """
    Step 1 — redirect to Google's consent screen.
    In dev mode, skips Google entirely and goes straight to the frontend
    with a token for the local dev user, since no real OAuth is configured.
    """
    if settings.ENVIRONMENT == "local":
        user  = get_or_create_dev_user(db)
        token = create_jwt(user.id)
        return RedirectResponse(f"{settings.REACT_APP_URL}/auth/callback?token={token}")

    return RedirectResponse(get_google_auth_url())


@router.get("/google/callback")
async def google_callback(code: str = Query(...), db: Session = Depends(get_db)):
    """Step 2 — Google redirects here with a code. Not used in dev mode."""
    if settings.ENVIRONMENT == "local":
        raise HTTPException(status_code=400, detail="OAuth callback not used in local dev mode.")

    try:
        google_data = await exchange_code_for_userinfo(code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Google auth failed: {e}")

    if not google_data.get("email_verified"):
        raise HTTPException(status_code=400, detail="Google email not verified.")

    user  = get_or_create_user(db, google_data)
    token = create_jwt(user.id)

    # Redirect to frontend — React reads the token from the URL and stores it
    return RedirectResponse(f"{settings.REACT_APP_URL}/auth/callback?token={token}")


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    """Returns the current logged-in user (or the dev user in local mode)."""
    return {
        "id":         user.id,
        "email":      user.email,
        "name":       user.name,
        "picture":    user.picture,
        "created_at": user.created_at,
        "dev_mode":   settings.ENVIRONMENT == "local",
    }


@router.post("/logout")
async def logout():
    """
    JWTs are stateless so there's nothing to invalidate server-side.
    Frontend just deletes the token from localStorage.
    """
    return {"message": "Logged out. Delete the token on the client."}