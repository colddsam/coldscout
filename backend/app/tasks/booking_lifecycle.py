"""
Booking Lifecycle Management Tasks.
"""

from datetime import datetime, UTC
from loguru import logger
from sqlalchemy import select, update
from app.core.database import get_session_maker
from app.models.booking import Booking

async def close_past_bookings():
    """
    Automatically transition 'approved' bookings to 'completed' once their end_time has passed.
    This ensures historical accuracy in reports and clean UI dashboards.
    """
    now = datetime.now(UTC)
    
    async_session_factory = get_session_maker()
    async with async_session_factory() as session:
        async with session.begin():
            # Find all approved bookings where end_time is in the past
            stmt = (
                update(Booking)
                .where(Booking.status == 'approved')
                .where(Booking.end_time < now)
                .values(status='completed')
                .execution_options(synchronize_session=False)
            )
            
            result = await session.execute(stmt)
            count = result.rowcount
            
            if count > 0:
                logger.info(f"✅ Automatically closed {count} past bookings.")
            else:
                logger.debug("No past bookings to close.")

async def cleanup_pending_bookings():
    """
    Optionally cleanup or mark as 'expired' pending bookings that were never approved
    and are now in the past.
    """
    now = datetime.now(UTC)
    
    async_session_factory = get_session_maker()
    async with async_session_factory() as session:
        async with session.begin():
            stmt = (
                update(Booking)
                .where(Booking.status == 'pending')
                .where(Booking.start_time < now)
                .values(status='cancelled') # Or 'expired' if we add that status
                .execution_options(synchronize_session=False)
            )
            
            result = await session.execute(stmt)
            count = result.rowcount
            
            if count > 0:
                logger.info(f"🧹 Cleaned up {count} expired pending bookings.")
