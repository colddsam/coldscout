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
from app.models.profile import FreelancerProfile

settings = get_settings()

async def get_resolved_booking_url(db: AsyncSession) -> Optional[str]:
    """
    Resolves the target booking URL based on a four-tier hierarchy:
    1.  Primary user's (ADMIN_EMAIL) per-user override.
    2.  First available FreelancerProfile's override.
    3.  System-wide default from .env (BOOKING_LINK).
    4.  None (triggers mailto: fallback in the email template).
    """
    
    # 1. Try to find the freelancer profile for the system admin
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

    # 2. Try the first available freelancer profile if admin override is missing
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

    # 3. Use system default from .env
    if settings.BOOKING_LINK and settings.BOOKING_LINK != "":
        logger.info(f"Using system-wide default booking link: {settings.BOOKING_LINK}")
        return settings.BOOKING_LINK

    # 4. Fallback to mailto: (None)
    logger.info("No booking URL found. Falling back to mailto: links.")
    return None
