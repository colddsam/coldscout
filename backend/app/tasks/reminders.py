"""
Automated Booking Reminders
Sends email reminders for upcoming bookings 24 hours and 1 hour before the start time.
"""

from datetime import datetime, timezone, timedelta
from loguru import logger
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.core.database import get_session_maker
from app.models.booking import Booking
from app.modules.outreach.email_sender import send_email

async def send_booking_reminders():
    """
    Scans for approved bookings and sends 24h or 1h reminders if not already sent.
    """
    now = datetime.now(timezone.utc)
    target_24h = now + timedelta(hours=24)
    target_1h = now + timedelta(hours=1)
    
    async with get_session_maker()() as db:
        # Find all upcoming approved bookings within the next 24 hours and 5 minutes
        res = await db.execute(
            select(Booking)
            .options(joinedload(Booking.freelancer))
            .where(
                Booking.status == 'approved',
                Booking.start_time >= now,
                Booking.start_time <= target_24h + timedelta(minutes=15)
            )
        )
        bookings = res.scalars().all()
        
        for booking in bookings:
            reminders_sent = booking.reminders_sent or []
            
            time_until = booking.start_time - now
            
            # Check 24h reminder
            if "24h" not in reminders_sent and time_until <= timedelta(hours=24):
                await _dispatch_reminder(booking, "24h")
                reminders_sent.append("24h")
                
            # Check 1h reminder
            if "1h" not in reminders_sent and time_until <= timedelta(hours=1):
                await _dispatch_reminder(booking, "1h")
                reminders_sent.append("1h")
                
            booking.reminders_sent = list(reminders_sent) # Re-assign list to ensure SQLAlchemy detects change
            
        await db.commit()

async def _dispatch_reminder(booking: Booking, timeframe: str):
    """Sends the actual reminder email to the guest and freelancer."""
    start_str = booking.start_time.strftime('%b %d, %H:%M')
    subject = f"Reminder: Upcoming Meeting in {timeframe.replace('h', ' Hours')}"
    if timeframe == "1h":
        subject = "Reminder: Upcoming Meeting in 1 Hour"
        
    freelancer = booking.freelancer
    freelancer_name = getattr(freelancer, "first_name", "your freelancer")
    
    body = f"Hi {booking.guest_name},\n\nThis is a friendly reminder for your upcoming {booking.event_type_title or 'meeting'} with {freelancer_name} at {start_str}.\n"
    if booking.meeting_link:
        body += f"\nMeeting Link: {booking.meeting_link}\n"
        
    body += "\nLooking forward to speaking with you!"
    
    logger.info(f"Sending {timeframe} reminder for booking {booking.id} to {booking.guest_email}")
    try:
        await send_email(
            to_email=booking.guest_email,
            subject=subject,
            html_content=f"<p>{body.replace(chr(10), '<br>')}</p>"
        )
        
        # Also notify freelancer
        fl_body = f"Reminder: Your meeting with {booking.guest_name} starts in {timeframe}.\nTime: {start_str}"
        if booking.meeting_link:
            fl_body += f"\nLink: {booking.meeting_link}"
            
        await send_email(
            to_email=freelancer.email,
            subject=f"Meeting Reminder: {booking.guest_name} ({timeframe})",
            html_content=f"<p>{fl_body.replace(chr(10), '<br>')}</p>"
        )
    except Exception as e:
        logger.error(f"Failed to send reminder for booking {booking.id}: {e}")
