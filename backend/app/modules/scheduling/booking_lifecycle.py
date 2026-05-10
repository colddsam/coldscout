"""
Booking Lifecycle Management.

Background tasks for updating booking statuses based on time progression.
"""

from datetime import datetime, timezone
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.models.booking import Booking

async def process_booking_lifecycle(db: AsyncSession):
    """
    Scans for 'confirmed' or 'approved' bookings whose end_time has passed 
    and marks them as 'completed'.
    """
    now = datetime.now(timezone.utc)
    
    # 1. Update confirmed/approved bookings to completed
    try:
        # We find bookings that are confirmed or approved and have already ended
        query = (
            update(Booking)
            .where(
                and_(
                    Booking.status.in_(['confirmed', 'approved']),
                    Booking.end_time <= now
                )
            )
            .values(status='completed')
            .execution_options(synchronize_session=False)
        )
        
        result = await db.execute(query)
        await db.commit()
        
        if result.rowcount > 0:
            logger.info(f"Lifecycle: Marked {result.rowcount} bookings as completed.")
            
    except Exception as e:
        logger.error(f"Error in booking lifecycle processing: {e}")
        await db.rollback()

    # 2. Optionally: Auto-reject pending bookings that are now in the past
    try:
        query_past_pending = (
            update(Booking)
            .where(
                and_(
                    Booking.status == 'pending',
                    Booking.start_time <= now
                )
            )
            .values(status='rejected', guest_notes=Booking.guest_notes + "\n[Auto-rejected: Event time passed]")
            .execution_options(synchronize_session=False)
        )
        
        result_pending = await db.execute(query_past_pending)
        await db.commit()
        
        if result_pending.rowcount > 0:
            logger.info(f"Lifecycle: Auto-rejected {result_pending.rowcount} stale pending bookings.")
            
    except Exception as e:
        logger.error(f"Error auto-rejecting stale bookings: {e}")
        await db.rollback()
