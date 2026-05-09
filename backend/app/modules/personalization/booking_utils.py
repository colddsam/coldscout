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
    1.  Freelancer's external booking_url override (if user_id provided).
    2.  Freelancer's native scheduling link (/book/{username}) if they have a profile.
    3.  Primary user's (ADMIN_EMAIL) per-user override.
    4.  First available FreelancerProfile's override.
    5.  System-wide default from .env (BOOKING_LINK).
    6.  None (triggers mailto: fallback in the email template).
    """
    from sqlalchemy import func

    # 1 & 2. Try to find the specific freelancer's booking setup
    if user_id is not None:
        logger.info(f"Booking: Resolving for user_id: {user_id} (type: {type(user_id)})")
        try:

            # Ensure user_id is an integer for SQL comparison. Incoming values
            # from the job queue or API might be strings (e.g. '10'), which
            # causes the join/where clause to fail silently and fallback to
            # the system-wide default.
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
                    if getattr(fl_profile, "availability", "") == "not_available" or not getattr(fl_profile, "show_availability", True):
                        logger.info(f"Booking: User {user_id} is marked as not available.")
                        return None
                
                # B. Native Scheduling (Primary Platform Choice)
                if username:
                    native_url = f"{settings.FRONTEND_DOMAIN}/book/{username.strip().lower()}"
                    logger.info(f"Booking: Found username '{username}' for user {user_id}. Returning native URL: {native_url}")
                    return native_url

                # C. External Override (Fallback)
                booking_url = (fl_profile.booking_url or "").strip()
                if booking_url:
                    logger.info(f"Booking: No username found for user {user_id}. Returning external override: {booking_url}")
                    return booking_url

                # D. Direct Mailto Fallback (Per User)
                # If no meeting link is possible, direct the lead to email the freelancer.
                if email:
                    logger.info(f"Booking: No links found for user {user_id}. Returning mailto:{email}")
                    return f"mailto:{email}"

                    
        except Exception as e:
            logger.warning(f"Error fetching booking data for user {user_id}: {e}")

    # 3. Try the system-wide default from .env if the specific user lookup failed
    sys_default = (settings.BOOKING_LINK or "").strip()
    if sys_default:
        logger.info(f"Booking: Falling back to system default: {sys_default}")
        return sys_default

    # 4. Final fallback to mailto: (None)
    logger.info("Booking: No resolution possible. Triggering template mailto: fallback.")
    return None
