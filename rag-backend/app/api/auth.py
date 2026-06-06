from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.auth import (
    get_google_auth_url,
    exchange_code_for_userinfo,
    get_or_create_user,
    create_jwt,
    get_current_user,
)
from app.core.settings import settings
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/google")
async def google_login():
    """
    Step 1 — redirect user to Google's consent screen.
    Frontend calls: window.location.href = '/api/auth/google'
    """
    url = get_google_auth_url()
    return RedirectResponse(url)


@router.get("/google/callback")
async def google_callback(
    code: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Step 2 — Google redirects here with a code.
    We exchange it for user info, create/find the user, issue a JWT,
    then redirect back to the frontend with the token in the URL.
    """
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
    """
    Returns the current logged-in user.
    Frontend can call this on load to verify the token is still valid.
    """
    return {
        "id":         user.id,
        "email":      user.email,
        "name":       user.name,
        "picture":    user.picture,
        "created_at": user.created_at,
    }


@router.post("/logout")
async def logout():
    """
    JWTs are stateless so there's nothing to invalidate server-side.
    Frontend just deletes the token from localStorage.
    """
    return {"message": "Logged out. Delete the token on the client."}