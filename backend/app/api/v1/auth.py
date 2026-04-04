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
) -> Any:
    """
    Syncs a Supabase Auth user to the local database.

    This endpoint is called by the frontend after a successful Supabase
    authentication to ensure the user exists in our local database.
    Creates a new user if they don't exist, or updates existing user data.

    This is part of the "upsert on first login" pattern that enables
    seamless social authentication without pre-registration.

    Request Body:
        supabase_uid: The Supabase Auth user UUID
        email: The user's email address
        role: The user's role ('client' or 'freelancer')
        auth_provider: The OAuth provider used
        full_name: The user's full name (optional)
        avatar_url: The user's avatar URL (optional)

    Returns:
        UserOut: The synced user record
    """
    # Check if user exists by supabase_uid
    result = await db.execute(
        select(User).where(User.supabase_uid == user_data.supabase_uid)
    )
    user = result.scalars().first()

    if user:
        # Update existing user — do NOT overwrite role.
        # Role is the authoritative record set at account creation; it is only
        # changed by admin action or a payment webhook, never by the sync call.
        if user_data.full_name:
            user.full_name = user_data.full_name
        if user_data.avatar_url:
            user.avatar_url = user_data.avatar_url
        if user_data.auth_provider:
            user.auth_provider = user_data.auth_provider

        await db.commit()
        await db.refresh(user)
        logger.info(f"Updated user {user.email} from Supabase sync")
        return user

    # Check if user exists by email (might be a legacy user)
    result = await db.execute(
        select(User).where(User.email == user_data.email)
    )
    user = result.scalars().first()

    if user:
        # Link existing email user to Supabase — preserve their existing role.
        user.supabase_uid = user_data.supabase_uid
        user.auth_provider = user_data.auth_provider
        if user_data.full_name:
            user.full_name = user_data.full_name
        if user_data.avatar_url:
            user.avatar_url = user_data.avatar_url

        await db.commit()
        await db.refresh(user)
        logger.info(f"Linked existing user {user.email} to Supabase UID {user_data.supabase_uid}")
        return user

    # Create new user
    new_user = User(
        supabase_uid=user_data.supabase_uid,
        email=user_data.email,
        role=user_data.role,
        auth_provider=user_data.auth_provider,
        full_name=user_data.full_name,
        avatar_url=user_data.avatar_url,
        hashed_password=None,  # No password for social login users
        is_active=True,
        is_superuser=False
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    logger.info(f"Created new user {new_user.email} from Supabase sync")
    return new_user


@router.get("/me", response_model=UserOut)
async def read_user_me(
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieves the identity of the currently authenticated administrator.

    Works with both Supabase Auth tokens and legacy JWT tokens.
    """
    return current_user
