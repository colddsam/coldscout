"""
Public Booking Redirect Endpoint.

Provides a clean /book/{username} URL that resolves the user's booking link
and redirects the visitor to it. Resolution order:
  1. FreelancerProfile.booking_url (per-user override)
  2. settings.BOOKING_LINK (system-wide default from .env)
  3. 404 if neither is configured
"""

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.profile import UserProfile, FreelancerProfile
from app.config import get_settings

router = APIRouter(prefix="/book", tags=["booking"])
settings = get_settings()


def _is_safe_booking_url(url: str) -> bool:
    """Validate that a booking URL uses http/https to prevent javascript: / data: redirects."""
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url.strip())
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


@router.get("/{username}")
async def booking_redirect(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Redirect to the user's booking/scheduling page.

    Looks up the freelancer's personal booking_url first; falls back
    to the system-wide BOOKING_LINK from the environment.
    """
    username = username.strip().lower()

    result = await db.execute(
        select(UserProfile).where(UserProfile.username == username)
    )
    profile = result.scalars().first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Try per-user booking URL from FreelancerProfile
    fl_result = await db.execute(
        select(FreelancerProfile).where(FreelancerProfile.user_id == profile.user_id)
    )
    freelancer = fl_result.scalars().first()

    booking_url = None
    if freelancer and freelancer.booking_url:
        booking_url = freelancer.booking_url
    elif settings.BOOKING_LINK:
        booking_url = settings.BOOKING_LINK

    if not booking_url:
        raise HTTPException(
            status_code=404,
            detail="No booking link configured for this user."
        )

    if not _is_safe_booking_url(booking_url):
        raise HTTPException(
            status_code=400,
            detail="Configured booking URL is invalid."
        )

    return RedirectResponse(url=booking_url, status_code=302)
