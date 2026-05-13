"""
Postgres Advisory Locking System.

This module provides a mechanism for distributed locking using PostgreSQL's
advisory locks. This is critical for preventing concurrent execution of the
same discovery or outreach stage across multiple application instances,
ensuring data integrity and preventing duplicate API costs.

Contract
--------
On lock contention the context manager **raises** :class:`LockNotAcquiredError`
so the protected body never executes. Callers that want a "skip-and-continue"
outcome catch the exception (the per-stage dispatcher does this and reports
the run as ``skipped`` rather than ``failed``).

This is a deliberate change from the original "yield False" behaviour, which
silently allowed parallel runs to proceed because every caller wrote
``async with advisory_lock(...):`` without unpacking the yielded value.
"""
import hashlib
import asyncio
from contextlib import asynccontextmanager
from sqlalchemy import text
from loguru import logger
from app.core.database import get_session_maker


class LockNotAcquiredError(RuntimeError):
    """Raised by :func:`advisory_lock` when the lock cannot be acquired in time.

    Callers that treat "someone else is running this stage" as a benign skip
    should catch this exception. The dispatcher in ``daily_pipeline`` does so
    and records the run as ``skipped`` instead of ``failed``.
    """

    def __init__(self, lock_name: str, timeout: int):
        self.lock_name = lock_name
        self.timeout = timeout
        super().__init__(
            f"Could not acquire advisory lock '{lock_name}' after {timeout}s"
        )


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
        LockNotAcquiredError: If the lock cannot be acquired within ``timeout``
            seconds. The protected body is **not** executed in that case —
            callers must treat the exception as the lock failure signal.
    """
    lock_id = _str_to_int64(lock_name)
    async_session = get_session_maker()
    locked = False

    async with async_session() as session:
        try:
            # try_advisory_lock returns true if lock acquired
            result = await session.execute(text("SELECT pg_try_advisory_lock(:id)"), {"id": lock_id})
            locked = bool(result.scalar())

            if not locked:
                logger.warning(f"Lock '{lock_name}' is already held. Waiting up to {timeout}s...")
                for _ in range(timeout):
                    await asyncio.sleep(1)
                    result = await session.execute(text("SELECT pg_try_advisory_lock(:id)"), {"id": lock_id})
                    if result.scalar():
                        locked = True
                        break

            if not locked:
                # Hard failure — body must not run. The dispatcher converts
                # this into a "skipped" run; anything else surfaces it as a
                # failure with the lock_name attached.
                logger.warning(
                    f"Skipping body for '{lock_name}' — lock held by another process after {timeout}s."
                )
                raise LockNotAcquiredError(lock_name, timeout)

            logger.debug(f"Acquired advisory lock: {lock_name} ({lock_id})")
            yield True

        finally:
            if locked:
                try:
                    # ``asyncio.shield`` keeps the unlock from being aborted
                    # mid-flight if the surrounding task was cancelled (e.g.
                    # uvicorn shutdown). Postgres also releases session-level
                    # locks when the connection closes, so even if shield
                    # fails the lock is not leaked beyond the lifetime of
                    # the SQLAlchemy connection.
                    await asyncio.shield(
                        session.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": lock_id})
                    )
                    logger.debug(f"Released advisory lock: {lock_name}")
                except Exception as e:
                    # If the connection is closed, the lock is already released by Postgres.
                    # We log it as a warning but don't crash since the work is done.
                    logger.warning(f"Failed to release advisory lock '{lock_name}' (connection might be closed): {e}")
