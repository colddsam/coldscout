"""
Postgres Advisory Locking System.

This module provides a mechanism for distributed locking using PostgreSQL's
advisory locks. This is critical for preventing concurrent execution of the 
same discovery or outreach stage across multiple application instances, 
ensuring data integrity and preventing duplicate API costs.
"""
import hashlib
import asyncio
from contextlib import asynccontextmanager
from sqlalchemy import text
from loguru import logger
from app.core.database import get_session_maker

def _str_to_int64(s: str) -> int:
    """
    Deterministically transforms a string name into a 64-bit integer.
    
    Postgres advisory locks require a numeric ID (bigint). We use MD5 
    to hash the name and extract the first 8 bytes to ensure the same 
    lock name always maps to the same numeric identifier.
    """
    hash_obj = hashlib.md5(s.encode())
    return int.from_bytes(hash_obj.digest()[:8], byteorder='big', signed=True)

@asynccontextmanager
async def advisory_lock(lock_name: str, timeout: int = 5):
    """
    An asynchronous context manager that gatekeeps a section of code 
    using a global Postgres session-level advisory lock.

    Example:
        async with advisory_lock("discovery_stage"):
            await run_discovery()

    Args:
        lock_name (str): The unique identifier for the lock (e.g., 'qualification').
        timeout (int):   Seconds to wait/poll before giving up if the lock is held.

    Raises:
        RuntimeError: If the lock remains unavailable after the timeout expires.
    """
    lock_id = _str_to_int64(lock_name)
    async_session = get_session_maker()
    
    async with async_session() as session:
        try:
            # try_advisory_lock returns true if lock acquired
            result = await session.execute(text("SELECT pg_try_advisory_lock(:id)"), {"id": lock_id})
            locked = result.scalar()
            
            if not locked:
                logger.warning(f"Lock '{lock_name}' is already held. Waiting up to {timeout}s...")
                for _ in range(timeout):
                    await asyncio.sleep(1)
                    result = await session.execute(text("SELECT pg_try_advisory_lock(:id)"), {"id": lock_id})
                    if result.scalar():
                        locked = True
                        break
            
            if not locked:
                logger.error(f"Failed to acquire lock '{lock_name}' after {timeout}s.")
                raise RuntimeError(f"Could not acquire lock for {lock_name}")
            
            logger.debug(f"Acquired advisory lock: {lock_name} ({lock_id})")
            yield
            
        finally:
            if locked:
                try:
                    await session.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": lock_id})
                    logger.debug(f"Released advisory lock: {lock_name}")
                except Exception as e:
                    # If the connection is closed, the lock is already released by Postgres.
                    # We log it as a warning but don't crash since the work is done.
                    logger.warning(f"Failed to release advisory lock '{lock_name}' (connection might be closed): {e}")
