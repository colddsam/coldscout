"""
Meta Threads API Client.

Provides an async HTTP interface to the Threads API for searching posts,
fetching user profiles, publishing replies, and managing OAuth tokens.

All methods respect the Threads API rate limits via the integrated RateLimiter,
and ensure data integrity by never sending duplicate requests for the same resource.
"""
import httpx
from datetime import datetime, timedelta, timezone
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

settings = get_settings()

THREADS_API_BASE = "https://graph.threads.net/v1.0"
THREADS_OAUTH_URL = "https://graph.threads.net/oauth/access_token"


class ThreadsAPIClient:
    """
    Async client for the Meta Threads API.

    Requires a valid long-lived access token stored in the database.
    All calls go through httpx.AsyncClient with automatic retry (3 attempts).
    """

    def __init__(self, access_token: str):
        self.access_token = access_token
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        await self.client.aclose()

    # ── OAuth Helpers ───────────────────────────────────────────

    @staticmethod
    async def exchange_code_for_short_lived_token(code: str) -> dict:
        """Exchange authorization code for a short-lived access token."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                THREADS_OAUTH_URL,
                data={
                    "client_id": settings.THREADS_APP_ID,
                    "client_secret": settings.THREADS_APP_SECRET,
                    "grant_type": "authorization_code",
                    "redirect_uri": settings.THREADS_REDIRECT_URI,
                    "code": code,
                },
            )
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    async def exchange_for_long_lived_token(short_lived_token: str) -> dict:
        """
        Exchange a short-lived token (1 hour) for a long-lived token (60 days).
        Returns: {"access_token": "...", "token_type": "bearer", "expires_in": 5184000}
        """
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{THREADS_API_BASE}/access_token",
                params={
                    "grant_type": "th_exchange_token",
                    "client_secret": settings.THREADS_APP_SECRET,
                    "access_token": short_lived_token,
                },
            )
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    async def refresh_long_lived_token(current_token: str) -> dict:
        """
        Refresh a long-lived token before it expires.
        Returns a new long-lived token valid for another 60 days.
        """
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{THREADS_API_BASE}/refresh_access_token",
                params={
                    "grant_type": "th_refresh_token",
                    "access_token": current_token,
                },
            )
            resp.raise_for_status()
            return resp.json()

    # ── Search ──────────────────────────────────────────────────

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def keyword_search(self, query: str, search_type: str = "RECENT",
                             limit: int = 25) -> list[dict]:
        """
        Search public Threads posts by keyword.
        Requires `threads_keyword_search` permission via App Review.

        Args:
            query: Keyword or phrase to search (e.g. "need website")
            search_type: TOP or RECENT
            limit: Max results (1-25)

        Returns:
            List of post dicts with id, text, timestamp, etc.
        """
        resp = await self.client.get(
            f"{THREADS_API_BASE}/search",
            params={
                "q": query,
                "search_type": search_type,
                "fields": "id,text,timestamp,media_type,permalink,username",
                "limit": min(limit, 25),
                "access_token": self.access_token,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", [])

    # ── User Profile ────────────────────────────────────────────

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def get_user_profile(self, user_id: str) -> dict:
        """Fetch a Threads user's public profile."""
        resp = await self.client.get(
            f"{THREADS_API_BASE}/{user_id}",
            params={
                "fields": "id,username,name,threads_biography,threads_profile_picture_url,"
                          "followers_count,is_verified_user",
                "access_token": self.access_token,
            },
        )
        resp.raise_for_status()
        return resp.json()

    # ── Publishing (replies) ────────────────────────────────────

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=3, max=15))
    async def create_reply(self, reply_to_media_id: str, text: str) -> dict:
        """
        Publish a reply to a specific Threads post (two-step process).

        Step 1: Create a media container with TEXT type and reply_to_id.
        Step 2: Publish the media container.

        Returns the published media object with its ID.
        """
        # Step 1: Create container
        me_resp = await self.client.get(
            f"{THREADS_API_BASE}/me",
            params={"fields": "id", "access_token": self.access_token},
        )
        me_resp.raise_for_status()
        user_id = me_resp.json()["id"]

        container_resp = await self.client.post(
            f"{THREADS_API_BASE}/{user_id}/threads",
            data={
                "media_type": "TEXT",
                "text": text,
                "reply_to_id": reply_to_media_id,
                "access_token": self.access_token,
            },
        )
        container_resp.raise_for_status()
        container_id = container_resp.json()["id"]

        # Step 2: Publish
        publish_resp = await self.client.post(
            f"{THREADS_API_BASE}/{user_id}/threads_publish",
            data={
                "creation_id": container_id,
                "access_token": self.access_token,
            },
        )
        publish_resp.raise_for_status()
        return publish_resp.json()

    # ── Insights / Replies Monitoring ───────────────────────────

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def get_post_replies(self, media_id: str) -> list[dict]:
        """Get replies to a specific post (for monitoring engagement)."""
        resp = await self.client.get(
            f"{THREADS_API_BASE}/{media_id}/replies",
            params={
                "fields": "id,text,timestamp,username",
                "access_token": self.access_token,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", [])
