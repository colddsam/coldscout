"""
Booking URL resolution utility for Cold Scout.
Provides a multi-tiered resolution hierarchy for outreach links.
"""
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.config import get_settings
from app.models.user import User
from app.models.profile import FreelancerProfile, UserProfile

settings = get_settings()

async def get_resolved_booking_url(db: AsyncSession, user_id: Optional[int] = None) -> Optional[str]:
    """
    Resolves the target booking URL based on a multi-tier hierarchy:
    1.  Freelancer's native scheduling link (/book/{username}) if they have a profile.
    2.  Freelancer's external booking_url override.
    3.  None (triggers mailto: fallback in the email template).
    
    The global settings.BOOKING_LINK is NOT used as a fallback here to prevent 
    cross-tenant information leakage (where one freelancer's email might contain 
    another person's booking link).
    """
    if user_id is not None:
        logger.info(f"Booking: Resolving for user_id: {user_id}")
        try:
            # Ensure user_id is an integer for SQL comparison.
            user_id = int(user_id)
            
            res = await db.execute(
                select(User.email, UserProfile.username, FreelancerProfile)
                .outerjoin(UserProfile, User.id == UserProfile.user_id)
                .outerjoin(FreelancerProfile, User.id == FreelancerProfile.user_id)
                .where(User.id == user_id)
            )
            row = res.first()
            if row:
                email, username, fl_profile = row
                
                # A. Check Availability Toggle (if freelancer profile exists)
                if fl_profile:
                    # If marked not_available or visibility hidden, fallback to mailto (None)
                    availability = getattr(fl_profile, "availability", "")
                    show_availability = getattr(fl_profile, "show_availability", True)
                    if availability == "not_available" or not show_availability:
                        logger.info(f"Booking: User {user_id} is marked as not available.")
                        return None
                
                # B. External Override (User explicitly set an external scheduling link like Calendly)
                if fl_profile and getattr(fl_profile, "booking_url", None):
                    booking_url = fl_profile.booking_url.strip()
                    
                    # CRITICAL: If the URL looks like a meeting link (Google Meet, Zoom, etc.),
                    # we ignore it as a scheduling link and fall back to the native booking page.
                    is_meeting = any(x in booking_url.lower() for x in ["meet.google.com", "zoom.us", "teams.microsoft", "webex"])
                    
                    if booking_url and not is_meeting and "user-override" not in booking_url:
                        logger.info(f"Booking: Returning external override for user {user_id}: {booking_url}")
                        return booking_url

                # C. Native Scheduling (If username exists and user is a freelancer)
                if username and fl_profile:
                    native_url = f"{settings.FRONTEND_DOMAIN}/book/{username.strip().lower()}"
                    logger.debug(f"Resolved native booking URL for user {user_id}: {native_url}")
                    return native_url


                # D. Direct Mailto Fallback (Per User)
                if email:
                    logger.info(f"Booking: No links found for user {user_id}. Returning mailto:{email}")
                    return f"mailto:{email}"

        except Exception as e:
            logger.warning(f"Error fetching booking data for user {user_id}: {e}")

    # Final fallback to mailto: (None)
    logger.info(f"Booking: No resolution possible for user {user_id}. Returning None.")
    return None
