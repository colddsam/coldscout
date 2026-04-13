"""
Health Check API Endpoint
==========================

Provides system status for monitoring and diagnostics.

This endpoint performs a comprehensive system health check, including checks on the database,
scheduler, and production status.
"""

from fastapi import APIRouter, Depends
from loguru import logger
from app.config import get_settings, get_production_status
from app.core.scheduler import scheduler

class HealthCheckRouter(APIRouter):
    """
    API Router for Health Check Endpoints
    """

    def __init__(self):
        super().__init__()

    @staticmethod
    def get_health_check_router():
        """
        Returns the health check API router instance.

        Returns:
            APIRouter: The health check API router instance.
        """
        return HealthCheckRouter()

router = HealthCheckRouter().get_health_check_router()

@router.get("/health")
async def health_check(
    settings: object = Depends(get_settings)
) -> dict:
    """
    Performs a comprehensive system health check.

    Returns:
        dict: A status report of the system's core components.
    """
    from app.models.daily_report import DailyReport
    from sqlalchemy import select, text
    from app.core.database import get_session_maker

    # Initialize variables
    last_status = "unknown"
    db_healthy = False
    redis_healthy: bool | None = None  # None => not configured

    try:
        # Check database health by running a lightweight connectivity query
        # plus fetching the latest report's pipeline status.
        async with get_session_maker()() as db:
            await db.execute(text("SELECT 1"))
            db_healthy = True
            stmt = select(DailyReport).order_by(DailyReport.report_date.desc()).limit(1)
            res = await db.execute(stmt)
            latest = res.scalars().first()
            if latest:
                last_status = latest.pipeline_status
    except Exception as e:
        logger.error(f"Health check database error: {e}")

    # Check Redis if configured (pipeline tracking dependency)
    try:
        if getattr(settings, "REDIS_URL", ""):
            from app.core.redis_client import ping_redis
            redis_healthy = await ping_redis()
    except Exception as e:
        logger.warning(f"Health check Redis error: {e}")
        redis_healthy = False

    overall_status = "healthy" if db_healthy else "degraded"

    return {
        "status": overall_status,
        "version": getattr(settings, "APP_VERSION", "1.0.0"),
        "environment": settings.APP_ENV,
        "last_pipeline_status": last_status,
        "scheduler_running": scheduler.running,
        "production_status": get_production_status() == "RUN",
        "database_healthy": db_healthy,
        "redis_healthy": redis_healthy,
    }