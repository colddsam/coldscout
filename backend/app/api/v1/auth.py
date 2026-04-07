"""
Authentication and Session Management API.

Provides endpoints for creating access tokens (Login), verifying
current user session identity, and syncing Supabase Auth sessions.

Supports both legacy email/password authentication and Supabase Auth
(social logins via Google, GitHub, Facebook, LinkedIn).
"""
from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from loguru import logger

from app.api import deps
from app.core import security
from app.core.database import get_db
from app.models.user import User
from app.schemas.user import Token, UserOut, SupabaseUserSync
from app.config import get_settings

router = APIRouter()
settings = get_settings()


@router.post("/login/access-token", response_model=Token)
async def login_access_token(
    db: AsyncSession = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    Standard OAuth2-compatible password flow used to obtain a JWT.

    LEGACY: This endpoint is maintained for backward compatibility with
    existing admin sessions and cron job integrations using X-API-Key.

    Validates credentials against the PostgreSQL user pool. If successful,
    returns a signed access token with a 7-day expiration.
    """
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    # Check if user has a password (social login users might not)
    if not user.hashed_password:
        raise HTTPException(
            status_code=400,
            detail="This account uses social login. Please sign in with your social provider."
        )

    if not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
        "user": user,
    }


@router.post("/auth/sync", response_model=UserOut)
async def sync_supabase_user(
    user_data: SupabaseUserSync,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Syncs a Supabase Auth user to the local database.

    **Authenticated**: Requires a valid Supabase JWT in the Authorization
    header. The user's identity (supabase_uid, email) is derived from the
    verified token via ``get_current_user``, NOT from the request body.
    The body is only used for supplementary fields (role hint for first
    creation, which ``get_current_user`` already handles via its upsert).

    This endpoint is called by the frontend after a successful Supabase
    authentication to ensure the user exists in our local database.

    Returns:
        UserOut: The synced user record
    """
    # Identity is already verified and upserted by get_current_user.
    # We only need to update supplementary metadata that may have changed.
    updated = False

    if user_data.full_name and current_user.full_name != user_data.full_name:
        current_user.full_name = user_data.full_name
        updated = True
    if user_data.avatar_url and current_user.avatar_url != user_data.avatar_url:
        current_user.avatar_url = user_data.avatar_url
        updated = True
    if user_data.auth_provider and current_user.auth_provider != user_data.auth_provider:
        current_user.auth_provider = user_data.auth_provider
        updated = True

    if updated:
        await db.commit()
        await db.refresh(current_user)
        logger.info(f"Updated user {current_user.email} from authenticated sync")

    return current_user


@router.get("/me", response_model=UserOut)
async def read_user_me(
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieves the identity of the currently authenticated administrator.

    Works with both Supabase Auth tokens and legacy JWT tokens.
    """
    return current_user
