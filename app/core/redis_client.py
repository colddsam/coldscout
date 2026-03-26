"""
Redis Client Connectivity Module.

This module provides an optional Redis client connection for distributed caching and Celery brokerage.
It is currently a passive module reserved for future horizontal scaling, as the system currently uses APScheduler's in-memory / persistent JobManager strategy which is sufficient for single-instance deployments.

To enable Redis client connectivity, follow these steps:

1. Install the required Redis package: `pip install redis==5.2.0`
2. Configure the Redis connection URL by setting the `REDIS_URL` environment variable.
3. Import the `get_redis()` function to access the Redis client instance.

Note: This module uses the `redis.asyncio` library to establish an asynchronous Redis connection.
"""

import redis.asyncio as redis
from app.config import get_settings

# Global Redis client instance
_redis_client = None

def get_redis() -> redis.Redis:
    """
    Retrieves the Redis client instance.

    If the client instance is not already created, it is initialized with the Redis connection URL from the environment settings.

    Returns:
        redis.Redis: The Redis client instance.
    """
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )
    return _redis_client

async def close_redis():
    """
    Closes the Redis client connection.

    If the client instance is not None, it is closed and reset to None.

    Note: This function is intended to be called when the application is shutting down to release system resources.
    """
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None