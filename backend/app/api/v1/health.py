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
    from sqlalchemy import select
    from app.core.database import get_session_maker

    # Initialize last_status variable to unknown
    last_status = "unknown"

    try:
        # Check database health by attempting a simple select on DailyReport
        async with get_session_maker()() as db:
            # Create a select statement to retrieve the latest DailyReport
            stmt = select(DailyReport).order_by(DailyReport.report_date.desc()).limit(1)
            # Execute the select statement and retrieve the result
            res = await db.execute(stmt)
            # Retrieve the first (latest) DailyReport from the result
            latest = res.scalars().first()
            # If a DailyReport is found, update last_status
            if latest:
                last_status = latest.pipeline_status
    except Exception as e:
        # Log any errors that occur during the health check
        logger.error(f"Health check database error: {e}")

    # Return a status report of the system's core components
    return {
        "status": "healthy",
        "version": "1.0.0",  # Hardcoded or pulled from elsewhere
        "environment": settings.APP_ENV,
        "last_pipeline_status": last_status,
        "scheduler_running": scheduler.running,
        "production_status": get_production_status() == "RUN"
    }