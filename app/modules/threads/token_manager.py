"""
Threads OAuth Token Manager.

Handles the full lifecycle of Threads API access tokens:
  1. Stores tokens in the database (threads_auth table)
  2. Automatically refreshes long-lived tokens before expiry (7 days early)
  3. Provides a simple `get_valid_token()` interface for other modules

Design: Only one active token per Threads user ID is maintained.
"""
from datetime import datetime, timedelta, timezone
from loguru import logger
from sqlalchemy import select

from app.core.database import get_session_maker
from app.models.threads import ThreadsAuth
from app.modules.threads.client import ThreadsAPIClient


class ThreadsTokenManager:
    """
    Manages Threads API access token lifecycle.

    Usage:
        manager = ThreadsTokenManager()
        token = await manager.get_valid_token()
        if token is None:
            # No token configured — OAuth flow not completed yet
    """

    REFRESH_BUFFER_DAYS = 7  # Refresh token 7 days before expiry

    async def get_valid_token(self) -> str | None:
        """
        Returns a valid access token, refreshing if necessary.
        Returns None if no token is stored (user hasn't completed OAuth).
        """
        async with get_session_maker()() as db:
            stmt = select(ThreadsAuth).order_by(ThreadsAuth.updated_at.desc()).limit(1)
            result = await db.execute(stmt)
            auth = result.scalars().first()

            if auth is None:
                logger.warning("No Threads auth token found — OAuth flow not yet completed.")
                return None

            now = datetime.now(timezone.utc)
            refresh_threshold = auth.expires_at - timedelta(days=self.REFRESH_BUFFER_DAYS)

            if now >= auth.expires_at:
                logger.error("Threads token has EXPIRED. Manual re-authentication required.")
                return None

            if now >= refresh_threshold:
                logger.info("Threads token nearing expiry — auto-refreshing...")
                try:
                    refreshed = await ThreadsAPIClient.refresh_long_lived_token(auth.access_token)
                    auth.access_token = refreshed["access_token"]
                    auth.expires_at = now + timedelta(seconds=refreshed.get("expires_in", 5184000))
                    auth.updated_at = now
                    await db.commit()
                    logger.info(f"Threads token refreshed — new expiry: {auth.expires_at}")
                except Exception as e:
                    logger.error(f"Failed to refresh Threads token: {e}")
                    # Token is still valid for a few more days, return it anyway
                    if now < auth.expires_at:
                        return auth.access_token
                    return None

            return auth.access_token

    async def store_token(self, threads_user_id: str, access_token: str,
                          token_type: str, expires_in: int) -> None:
        """
        Store or update an access token in the database.
        Upserts by threads_user_id to maintain a single active token.
        """
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=expires_in)

        async with get_session_maker()() as db:
            stmt = select(ThreadsAuth).where(
                ThreadsAuth.threads_user_id == threads_user_id
            )
            result = await db.execute(stmt)
            existing = result.scalars().first()

            if existing:
                existing.access_token = access_token
                existing.token_type = token_type
                existing.expires_at = expires_at
                existing.updated_at = now
            else:
                db.add(ThreadsAuth(
                    threads_user_id=threads_user_id,
                    access_token=access_token,
                    token_type=token_type,
                    expires_at=expires_at,
                ))

            await db.commit()
            logger.info(
                f"Threads token stored for user {threads_user_id} "
                f"(type={token_type}, expires={expires_at})"
            )
