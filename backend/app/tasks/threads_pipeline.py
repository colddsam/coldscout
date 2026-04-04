"""
Threads Pipeline Task Wrappers.

Thin async wrappers for APScheduler integration. These functions are
registered in the job_map and called by the scheduler at configured intervals.
Each wrapper logs the start/end of its stage and catches top-level exceptions
to prevent scheduler crashes.

This module contains the following tasks:
- `run_threads_discovery_stage`: Scheduler task for Threads keyword search and profile discovery.
- `run_threads_qualification_stage`: Scheduler task for AI-powered Threads profile qualification.
- `run_threads_engagement_stage`: Scheduler task for generating and publishing Threads replies.
- `run_threads_response_check`: Scheduler task for monitoring sent engagements for lead responses.
"""

from loguru import logger

from app.config import get_settings
from app.modules.threads.discovery import run_threads_discovery
from app.modules.threads.qualifier import run_threads_qualification
from app.modules.threads.engagement import run_threads_engagement, check_engagement_responses

def get_settings():
    """
    Retrieves application settings from the configuration module.
    """
    return get_settings()

async def run_threads_discovery_stage():
    """
    Scheduler task: Threads keyword search and profile discovery.

    This task is responsible for discovering new Threads profiles using keyword search.
    It logs the start and end of the stage, and catches any top-level exceptions to prevent scheduler crashes.

    Returns:
        None
    """
    logger.info("🔍 [THREADS] Starting Discovery Stage...")
    try:
        result = await run_threads_discovery()
        logger.info(f"🔍 [THREADS] Discovery Complete: {result}")
    except Exception as e:
        logger.exception(f"🔍 [THREADS] Discovery Stage FAILED: {e}")


async def run_threads_qualification_stage():
    """
    Scheduler task: AI-powered Threads profile qualification.

    This task is responsible for qualifying discovered Threads profiles using AI-powered qualification.
    It logs the start and end of the stage, and catches any top-level exceptions to prevent scheduler crashes.

    Returns:
        None
    """
    logger.info("🎯 [THREADS] Starting Qualification Stage...")
    try:
        result = await run_threads_qualification()
        logger.info(f"🎯 [THREADS] Qualification Complete: {result}")
    except Exception as e:
        logger.exception(f"🎯 [THREADS] Qualification Stage FAILED: {e}")


async def run_threads_engagement_stage():
    """
    Scheduler task: Generate and publish Threads replies.

    This task is responsible for generating and publishing Threads replies.
    It logs the start and end of the stage, and catches any top-level exceptions to prevent scheduler crashes.

    Returns:
        None
    """
    logger.info("💬 [THREADS] Starting Engagement Stage...")
    try:
        result = await run_threads_engagement()
        logger.info(f"💬 [THREADS] Engagement Complete: {result}")
    except Exception as e:
        logger.exception(f"💬 [THREADS] Engagement Stage FAILED: {e}")


async def run_threads_response_check():
    """
    Scheduler task: Monitor sent engagements for lead responses.

    This task is responsible for monitoring sent engagements for lead responses.
    It logs the start and end of the stage, and catches any top-level exceptions to prevent scheduler crashes.

    Returns:
        None
    """
    logger.info("📬 [THREADS] Checking Engagement Responses...")
    try:
        result = await check_engagement_responses()
        logger.info(f"📬 [THREADS] Response Check Complete: {result}")
    except Exception as e:
        logger.exception(f"📬 [THREADS] Response Check FAILED: {e}")