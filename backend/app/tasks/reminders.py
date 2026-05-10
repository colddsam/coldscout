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
        from app.models.user import User
        # Find all upcoming approved bookings within the next 24 hours and 5 minutes
        res = await db.execute(
            select(Booking)
            .options(
                joinedload(Booking.freelancer).joinedload(User.freelancer_profile)
            )
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
    import zoneinfo
    
    # Resolve freelancer's timezone for display
    fl_tz_name = "UTC"
    freelancer = booking.freelancer
    fl_profile = getattr(freelancer, "freelancer_profile", None)
    
    if fl_profile and fl_profile.scheduling_preferences:
        fl_tz_name = fl_profile.scheduling_preferences.get("timezone", "UTC")

    try:
        fl_tz = zoneinfo.ZoneInfo(fl_tz_name)
    except Exception:
        fl_tz = timezone.utc
        fl_tz_name = "UTC"

    display_time = booking.start_time.astimezone(fl_tz)
    time_str = display_time.strftime('%b %d, %I:%M %p')
    
    # Resolve explicit timezone label
    tz_label = "UTC" if fl_tz_name == "UTC" else ("IST" if ("Kolkata" in fl_tz_name or "India" in fl_tz_name) else (display_time.strftime('%Z') or fl_tz_name))
    start_str = f"{time_str} {tz_label}"
    subject = f"Reminder: Upcoming Meeting in {timeframe.replace('h', ' Hours')}"
    if timeframe == "1h":
        subject = "Reminder: Upcoming Meeting in 1 Hour"
        
    freelancer = booking.freelancer
    freelancer_name = getattr(freelancer, "full_name", None) or getattr(freelancer, "email", "your freelancer")
    if freelancer_name and " " in freelancer_name:
        freelancer_name = freelancer_name.split(" ")[0]
    
    # Resolve meeting link: Check booking first, then fallback to current profile link
    meeting_link = booking.meeting_link
    if not meeting_link and freelancer:
        # We need the FreelancerProfile record, not just the User record
        # Note: Booking.freelancer usually points to the User model in many implementations here
        # But let's assume we have access to it or can resolve it.
        # Looking at reminders.py, it imports Booking.freelancer. 
        # In models/booking.py, freelancer is a relationship to User.
        # User has a freelancer_profile relationship.
        fl_profile = getattr(freelancer, "freelancer_profile", None)
        if fl_profile:
            meeting_link = getattr(fl_profile, "meeting_link", None)

    body = f"Hi {booking.guest_name},\n\nThis is a friendly reminder for your upcoming {booking.event_type_title or 'meeting'} with {freelancer_name} at {start_str}.\n"
    
    if meeting_link:
        body += f"\nMeeting Link: {meeting_link}\n"
    elif timeframe == "1h":
        body += "\nNOTE: The conferencing link is not yet available. Your host will provide it shortly or contact you via email.\n"
        
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
        if meeting_link:
            fl_body += f"\nLink: {meeting_link}"
        elif timeframe == "1h":
            fl_body += "\n\nWARNING: No meeting link was found for this session. The guest has been notified that you will provide it shortly. Please update your profile or send the link manually!"
            
        await send_email(
            to_email=freelancer.email,
            subject=f"Meeting Reminder: {booking.guest_name} ({timeframe})",
            html_content=f"<p>{fl_body.replace(chr(10), '<br>')}</p>"
        )
    except Exception as e:
        logger.error(f"Failed to send reminder for booking {booking.id}: {e}")
