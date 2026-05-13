"""
Booking Integrations API.
Handles linking Google Calendar via OAuth.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Dict, Any

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.profile import FreelancerProfile
from app.modules.scheduling.google_calendar import get_google_auth_flow, credentials_to_dict

router = APIRouter(prefix="/booking-integrations", tags=["booking-integrations"])

class ConnectResponse(BaseModel):
    auth_url: str

@router.get("/google/connect", response_model=ConnectResponse)
async def connect_google_calendar(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the Google OAuth authorization URL."""
    # Build redirect URI based on frontend domain
    # Example: https://coldscout.colddsam.com/dashboard/bookings/integrations/callback
    frontend_url = request.headers.get("origin", "http://localhost:5173")
    redirect_uri = f"{frontend_url}/dashboard/bookings/integrations/callback"
    
    flow = get_google_auth_flow(redirect_uri)
    auth_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent'
    )
    
    # Store state in session/db if needed, but for now we'll just return auth_url
    return {"auth_url": auth_url}

class CallbackRequest(BaseModel):
    code: str
    redirect_uri: str

@router.post("/google/callback")
async def google_calendar_callback(
    req: CallbackRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Handle the Google OAuth callback and save credentials."""
    flow = get_google_auth_flow(req.redirect_uri)
    try:
        flow.fetch_token(code=req.code)
        credentials = flow.credentials
        creds_dict = credentials_to_dict(credentials)
        
        # Save to DB
        result = await db.execute(
            select(FreelancerProfile).where(FreelancerProfile.user_id == current_user.id)
        )
        profile = result.scalars().first()
        
        if not profile:
            raise HTTPException(status_code=404, detail="Freelancer profile not found")
            
        profile.google_calendar_credentials = creds_dict
        await db.commit()
        
        return {"status": "success", "message": "Google Calendar linked successfully"}
    except HTTPException:
        raise
    except Exception:
        # Swallow Google SDK / network detail; log server-side only. The
        # callback is user-visible so leaking exception strings could
        # surface internal IDs or partial OAuth URLs to the browser.
        from loguru import logger as _lg
        _lg.exception("Google Calendar OAuth callback failed")
        raise HTTPException(status_code=400, detail="OAuth exchange failed.")

@router.delete("/google/disconnect")
async def disconnect_google_calendar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Disconnect Google Calendar."""
    result = await db.execute(
        select(FreelancerProfile).where(FreelancerProfile.user_id == current_user.id)
    )
    profile = result.scalars().first()
    
    if not profile:
        raise HTTPException(status_code=404, detail="Freelancer profile not found")
        
    profile.google_calendar_credentials = None
    await db.commit()
    
    return {"status": "success", "message": "Google Calendar disconnected successfully"}
