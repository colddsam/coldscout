"""
Threads Pipeline Task Wrappers.

Thin async wrappers for APScheduler / manual-trigger integration. Each
wrapper accepts ``manual`` and ``user_id`` kwargs to match the signature
contract of the shared pipeline queue worker in ``app/api/v1/pipeline.py``.

When ``user_id`` is None the underlying module preserves legacy global
behavior (operates across all rows). Otherwise the stage is scoped to
that freelancer only.
"""

from loguru import logger

from app.modules.threads.discovery import run_threads_discovery
from app.modules.threads.qualifier import run_threads_qualification
from app.modules.threads.engagement import run_threads_engagement, check_engagement_responses


async def run_threads_discovery_stage(manual: bool = False, user_id: int | None = None):
    """Scheduler task: Threads keyword search and profile discovery."""
    logger.info(f"🔍 [THREADS] Starting Discovery Stage (user_id={user_id})...")
    try:
        result = await run_threads_discovery(manual=manual, user_id=user_id)
        logger.info(f"🔍 [THREADS] Discovery Complete: {result}")
        return result
    except Exception as e:
        logger.exception(f"🔍 [THREADS] Discovery Stage FAILED: {e}")
        raise


async def run_threads_qualification_stage(manual: bool = False, user_id: int | None = None):
    """Scheduler task: AI-powered Threads profile qualification."""
    logger.info(f"🎯 [THREADS] Starting Qualification Stage (user_id={user_id})...")
    try:
        result = await run_threads_qualification(manual=manual, user_id=user_id)
        logger.info(f"🎯 [THREADS] Qualification Complete: {result}")
        return result
    except Exception as e:
        logger.exception(f"🎯 [THREADS] Qualification Stage FAILED: {e}")
        raise


async def run_threads_engagement_stage(manual: bool = False, user_id: int | None = None):
    """Scheduler task: Generate and publish Threads replies."""
    logger.info(f"💬 [THREADS] Starting Engagement Stage (user_id={user_id})...")
    try:
        result = await run_threads_engagement(manual=manual, user_id=user_id)
        logger.info(f"💬 [THREADS] Engagement Complete: {result}")
        return result
    except Exception as e:
        logger.exception(f"💬 [THREADS] Engagement Stage FAILED: {e}")
        raise


async def run_threads_response_check(manual: bool = False, user_id: int | None = None):
    """Scheduler task: Monitor sent engagements for lead responses."""
    logger.info(f"📬 [THREADS] Checking Engagement Responses (user_id={user_id})...")
    try:
        result = await check_engagement_responses(manual=manual, user_id=user_id)
        logger.info(f"📬 [THREADS] Response Check Complete: {result}")
        return result
    except Exception as e:
        logger.exception(f"📬 [THREADS] Response Check FAILED: {e}")
        raise
