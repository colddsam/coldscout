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
    Resolves the target booking URL based on a five-tier hierarchy:
    1.  Freelancer's external booking_url override (if user_id provided).
    2.  Freelancer's native scheduling link (/book/{username}) if configured.
    3.  Primary user's (ADMIN_EMAIL) per-user override.
    4.  First available FreelancerProfile's override.
    5.  System-wide default from .env (BOOKING_LINK).
    6.  None (triggers mailto: fallback in the email template).
    """
    
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
                # 1. Check Availability Toggle
                if getattr(fl_profile, "availability", "") == "not_available" or not getattr(fl_profile, "show_availability", True):
                    logger.info(f"Booking link suppressed for {username} because availability is off.")
                    return None
                
                # 2. External Override
                if fl_profile.booking_url:
                    logger.info(f"Using freelancer {user_id} external override: {fl_profile.booking_url}")
                    return fl_profile.booking_url
                
                # 3. Native Scheduling
                # If they have preferences set, we assume they want to use native scheduling
                if fl_profile.scheduling_preferences:
                    native_url = f"{settings.FRONTEND_DOMAIN}/book/{username}"
                    logger.info(f"Using native scheduling link for {username}: {native_url}")
                    return native_url
                    
        except Exception as e:
            logger.warning(f"Error fetching booking data for user {user_id}: {e}")

    # 3. Try to find the freelancer profile for the system admin
    try:
        admin_res = await db.execute(
            select(FreelancerProfile)
            .join(User)
            .where(User.email == settings.ADMIN_EMAIL)
        )
        admin_profile = admin_res.scalars().first()
        
        if admin_profile and admin_profile.booking_url:
            logger.info(f"Using admin profile override: {admin_profile.booking_url}")
            return admin_profile.booking_url
            
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
        
        if first_profile and first_profile.booking_url:
            logger.info(f"Using fallback profile override: {first_profile.booking_url}")
            return first_profile.booking_url
            
    except Exception as e:
        logger.warning(f"Error fetching fallback profile: {e}")

    # 5. Use system default from .env
    if settings.BOOKING_LINK and settings.BOOKING_LINK != "":
        logger.info(f"Using system-wide default booking link: {settings.BOOKING_LINK}")
        return settings.BOOKING_LINK

    # 6. Fallback to mailto: (None)
    logger.info("No booking URL found. Falling back to mailto: links.")
    return None
