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
        try:
            res = await db.execute(
                select(FreelancerProfile, UserProfile.username)
                .join(UserProfile, FreelancerProfile.user_id == UserProfile.user_id)
                .where(FreelancerProfile.user_id == user_id)
            )
            row = res.first()
            if row:
                fl_profile, username = row
                
                # A. Check Availability Toggle
                if getattr(fl_profile, "availability", "") == "not_available" or not getattr(fl_profile, "show_availability", True):
                    logger.info(f"Booking link suppressed for {username} because availability is off.")
                    return None
                
                # B. External Override (Robust Check)
                booking_url = (fl_profile.booking_url or "").strip()
                if booking_url:
                    logger.info(f"Using freelancer {user_id} external override: {booking_url}")
                    return booking_url
                
                # C. Native Scheduling (Robust Fallback)
                if username:
                    native_url = f"{settings.FRONTEND_DOMAIN}/book/{username.strip().lower()}"
                    logger.info(f"Using native scheduling link for {username}: {native_url}")
                    return native_url
                    
        except Exception as e:
            logger.warning(f"Error fetching booking data for user {user_id}: {e}")

    # 3. Try to find the freelancer profile for the system admin (Case-Insensitive)
    if settings.ADMIN_EMAIL:
        try:
            admin_res = await db.execute(
                select(FreelancerProfile)
                .join(User, FreelancerProfile.user_id == User.id)
                .where(func.lower(User.email) == settings.ADMIN_EMAIL.lower())
            )
            admin_profile = admin_res.scalars().first()
            
            admin_url = (admin_profile.booking_url or "").strip() if admin_profile else None
            if admin_url:
                logger.info(f"Using admin profile override: {admin_url}")
                return admin_url
                
        except Exception as e:
            logger.warning(f"Error fetching admin profile: {e}")

    # 4. Try the first available freelancer profile if admin override is missing
    try:
        first_res = await db.execute(
            select(FreelancerProfile)
            .where(FreelancerProfile.booking_url.isnot(None), FreelancerProfile.booking_url != "")
            .limit(1)
        )
        first_profile = first_res.scalars().first()
        
        fallback_url = (first_profile.booking_url or "").strip() if first_profile else None
        if fallback_url:
            logger.info(f"Using fallback profile override: {fallback_url}")
            return fallback_url
            
    except Exception as e:
        logger.warning(f"Error fetching fallback profile: {e}")

    # 5. Use system default from .env
    sys_default = (settings.BOOKING_LINK or "").strip()
    if sys_default:
        logger.info(f"Using system-wide default booking link: {sys_default}")
        return sys_default

    # 6. Fallback to mailto: (None)
    logger.info("No booking URL found. Falling back to mailto: links.")
    return None
