"""
API Dependency Injection Module.

Provides reusable FastAPI dependencies for database sessions, 
authentication verification, and RBAC (Role-Based Access Control) checks.
"""

from typing import Generator, Optional
from loguru import logger
from fastapi import Depends, HTTPException, status, Security
from fastapi.security.api_key import APIKeyHeader
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import ALGORITHM
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
        logger.error(f"API Key mismatch! Received: '{api_key_header[:8]}...', Expected: '{settings.API_KEY[:8]}...'")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate API KEY"
        )
    return api_key_header


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(reusable_oauth2)
) -> User:
    """
    Verifies the PROVIDED JWT and retrieves the associated user from the DB.

    This acts as the primary gatekeeper for protected administrative routes.

    Returns:
        User: The authenticated user instance.
    """
    try:
        payload = jwt.decode(
            token, settings.APP_SECRET_KEY, algorithms=[ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (JWTError, Exception):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    
    result = await db.execute(select(User).where(User.id == token_data.sub))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


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
            status_code=400, detail="The user doesn't have enough privileges"
        )
    return current_user