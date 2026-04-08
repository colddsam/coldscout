"""
API Dependency Injection Module.

Provides reusable FastAPI dependencies for database sessions,
authentication verification, and RBAC (Role-Based Access Control) checks.

Supports both legacy JWT authentication and Supabase Auth.
"""

from typing import Optional
from loguru import logger
from fastapi import Depends, HTTPException, status, Security
from fastapi.security.api_key import APIKeyHeader
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import ALGORITHM, verify_supabase_token, verify_legacy_token
from app.config import get_settings
from app.models.user import User
from app.schemas.user import TokenPayload

"""
Configuration and Dependencies
-----------------------------

The following dependencies are used throughout this module to provide
reusable functionality for authentication and authorization.
"""

settings = get_settings()

"""
API Key Security
----------------

The following OAuth2PasswordBearer instance is used to authenticate
requests against the provided API key.
"""
reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.APP_URL}/api/v1/login/access-token"
)

"""
API Key Header Security
-----------------------

The following APIKeyHeader instance is used to validate the API key
provided in the request headers.
"""
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=True)


async def get_api_key(
    api_key_header: str = Security(api_key_header),
    settings: object = Depends(get_settings),
) -> str:
    """
    Validates the API key provided in the request header against the configured secret.

    Args:
        api_key_header (str): The API key extracted from the request headers.
        settings (object): The application settings dependency.

    Raises:
        HTTPException: If the provided API key is invalid or missing.

    Returns:
        str: The validated API key.
    """
    if api_key_header != settings.API_KEY:
        # Do NOT log any portion of the received or expected key — even a prefix
        # is an information leak that aids brute-force enumeration attacks.
        logger.error("API key validation failed: provided key does not match the configured secret.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate API KEY"
        )
    return api_key_header


async def get_or_create_user_by_supabase_uid(
    db: AsyncSession,
    supabase_uid: str,
    email: str,
    auth_provider: str = "email",
    full_name: Optional[str] = None,
    avatar_url: Optional[str] = None,
    role: str = "freelancer"
) -> User:
    """
    Gets an existing user by Supabase UID or creates a new one (upsert pattern).

    This enables auto-provisioning of users on their first Supabase Auth login,
    supporting seamless social authentication flows.

    Args:
        db: Database session.
        supabase_uid: The Supabase Auth user UUID.
        email: The user's email address.
        auth_provider: The OAuth provider used (e.g., 'google', 'github').
        full_name: The user's full name from OAuth.
        avatar_url: The user's avatar URL from OAuth.
        role: The user's role ('client' or 'freelancer').

    Returns:
        User: The existing or newly created user.
    """
    # First, try to find by supabase_uid
    result = await db.execute(
        select(User).where(User.supabase_uid == supabase_uid)
    )
    user = result.scalars().first()

    if user:
        # Update user metadata if changed
        updated = False
        if full_name and user.full_name != full_name:
            user.full_name = full_name
            updated = True
        if avatar_url and user.avatar_url != avatar_url:
            user.avatar_url = avatar_url
            updated = True
        if updated:
            await db.commit()
            await db.refresh(user)
        return user

    # Check if user exists by email (might be a legacy user)
    result = await db.execute(
        select(User).where(User.email == email)
    )
    user = result.scalars().first()

    if user:
        # Link existing email user to Supabase
        user.supabase_uid = supabase_uid
        user.auth_provider = auth_provider
        if full_name:
            user.full_name = full_name
        if avatar_url:
            user.avatar_url = avatar_url
        await db.commit()
        await db.refresh(user)
        logger.info(f"Linked existing user {email} to Supabase UID {supabase_uid}")
        return user

    # Create new user
    new_user = User(
        supabase_uid=supabase_uid,
        email=email,
        auth_provider=auth_provider,
        full_name=full_name,
        avatar_url=avatar_url,
        role=role,
        hashed_password=None,  # No password for social login users
        is_active=True,
        is_superuser=False
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    logger.info(f"Created new {role} user {email} with Supabase UID {supabase_uid}")
    return new_user


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(reusable_oauth2)
) -> User:
    """
    Verifies the provided JWT and retrieves the associated user from the DB.

    This acts as the primary gatekeeper for protected administrative routes.
    Supports both Supabase Auth JWTs and legacy application JWTs.

    Authentication Flow:
    1. Try to verify as Supabase JWT (if SUPABASE_JWT_SECRET is configured)
    2. Fall back to legacy JWT verification
    3. Look up user by supabase_uid (Supabase) or id (legacy)
    4. Auto-create user if Supabase auth and user doesn't exist

    Returns:
        User: The authenticated user instance.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Could not validate credentials",
    )

    # Try Supabase JWT verification first
    supabase_payload = verify_supabase_token(token)

    if supabase_payload:
        # Supabase JWT - extract user info
        supabase_uid = supabase_payload.get("sub")
        email = supabase_payload.get("email")

        if not supabase_uid or not email:
            logger.error("Supabase token payload missing 'sub' or 'email'.")
            raise credentials_exception

        # Extract user metadata from token
        user_metadata = supabase_payload.get("user_metadata", {})
        app_metadata = supabase_payload.get("app_metadata", {})

        full_name = user_metadata.get("full_name") or user_metadata.get("name")
        avatar_url = user_metadata.get("avatar_url") or user_metadata.get("picture")
        provider = app_metadata.get("provider", "email")

        # Read role from user_metadata (set during email signUp or preserved after
        # first sync). Validated against the allowed set so malformed tokens cannot
        # escalate privileges. Falls back to 'freelancer' only when absent.
        raw_role = user_metadata.get("role", "freelancer")
        role = raw_role if raw_role in ("client", "freelancer") else "freelancer"

        # Get or create user (upsert pattern)
        user = await get_or_create_user_by_supabase_uid(
            db=db,
            supabase_uid=supabase_uid,
            email=email,
            auth_provider=provider,
            full_name=full_name,
            avatar_url=avatar_url,
            role=role,
        )

        if not user.is_active:
            logger.warning(f"Rejecting inactive user: {email}")
            raise HTTPException(status_code=400, detail="Inactive user")

        logger.info(f"Authenticated user {email} via Supabase JWT.")
        return user

    # Fall back to legacy JWT verification
    legacy_payload = verify_legacy_token(token)

    if legacy_payload:
        try:
            token_data = TokenPayload(**legacy_payload)
        except Exception as e:
            logger.error(f"Legacy token payload validation failed: {str(e)}")
            raise credentials_exception

        # Legacy tokens use integer user IDs
        if token_data.sub is None:
            raise credentials_exception

        try:
            user_id = int(token_data.sub)
        except (ValueError, TypeError):
            raise credentials_exception

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()

        if not user:
            logger.error(f"User not found for legacy token ID: {user_id}")
            raise HTTPException(status_code=404, detail="User not found")
        if not user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")

        logger.info(f"Authenticated user {user.email} via Legacy JWT.")
        return user

    # Both verification methods failed — do not log any token content.
    logger.error("Token verification failed: not a valid Supabase or Legacy JWT.")
    raise credentials_exception


async def get_current_active_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Enforces superuser privilege requirements on the authenticated user.

    Returns:
        User: The authenticated superuser instance.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user
