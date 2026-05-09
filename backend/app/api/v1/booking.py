"""
Public Booking Endpoints.

Provides public-facing native booking endpoints and slot calculations.
Handles both legacy redirects (if configured) and native booking flow.
"""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import List, Optional

from app.core.database import get_db
from app.models.profile import UserProfile, FreelancerProfile
from app.models.booking import Booking
from app.models.event_type import EventType
from app.config import get_settings
from app.modules.scheduling.slot_calculator import calculate_available_slots
from app.modules.scheduling.google_calendar import create_google_meet_event

router = APIRouter(prefix="/book", tags=["booking"])
settings = get_settings()

class SlotResponse(BaseModel):
    slots: List[datetime]

# ── Helper ────────────────────────────────────────────────────────────────────

DEFAULT_EVENT = {
    "id": 0,
    "title": "30 Minute Meeting",
    "slug": "30-min-meeting",
    "duration_minutes": 30,
    "description": "Web conferencing details provided upon confirmation.",
    "color": "#ffffff",
    "is_active": True,
}


@router.get("/{username}/events")
async def list_public_event_types(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """Return a freelancer's active event types (public-facing).

    If no custom event types have been created, returns a single
    default 30-minute meeting so the booking page always has something
    to display.
    """
    username = username.strip().lower()

    result = await db.execute(
        select(UserProfile).where(UserProfile.username == username)
    )
    profile = result.scalars().first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    et_result = await db.execute(
        select(EventType)
        .where(EventType.freelancer_id == profile.user_id, EventType.is_active == True)  # noqa: E712
        .order_by(EventType.created_at.asc())
    )
    event_types = et_result.scalars().all()

    if not event_types:
        return {"event_types": [DEFAULT_EVENT], "has_custom": False}

    return {
        "event_types": [
            {
                "id": et.id,
                "title": et.title,
                "slug": et.slug,
                "duration_minutes": et.duration_minutes,
                "description": et.description,
                "color": et.color,
                "is_active": et.is_active,
            }
            for et in event_types
        ],
        "has_custom": True,
    }


@router.get("/{username}/slots", response_model=SlotResponse)
async def get_booking_slots(
    username: str,
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    duration: int = Query(30, description="Duration in minutes"),
    db: AsyncSession = Depends(get_db),
):
    """Fetch available time slots for a freelancer."""
    username = username.strip().lower()

    # Find user profile
    result = await db.execute(
        select(UserProfile).where(UserProfile.username == username)
    )
    profile = result.scalars().first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Find freelancer profile
    fl_result = await db.execute(
        select(FreelancerProfile).where(FreelancerProfile.user_id == profile.user_id)
    )
    freelancer = fl_result.scalars().first()
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer profile not found")

    slots = await calculate_available_slots(
        db=db,
        freelancer_id=freelancer.user_id,
        scheduling_preferences=freelancer.scheduling_preferences,
        google_creds=freelancer.google_calendar_credentials,
        start_date=start_date,
        end_date=end_date,
        duration_minutes=duration
    )

    return {"slots": slots}

class CreateBookingRequest(BaseModel):
    guest_name: str
    guest_email: EmailStr
    guest_notes: Optional[str] = None
    start_time: datetime
    duration_minutes: int = 30
    event_slug: Optional[str] = None

@router.post("/{username}")
async def create_booking(
    username: str,
    req: CreateBookingRequest,
    db: AsyncSession = Depends(get_db)
):
    """Create a new booking."""
    username = username.strip().lower()

    # Find user profile
    from app.models.user import User
    result = await db.execute(
        select(UserProfile, User)
        .join(User, User.id == UserProfile.user_id)
        .where(UserProfile.username == username)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile, user = row

    # Find freelancer profile
    fl_result = await db.execute(
        select(FreelancerProfile).where(FreelancerProfile.user_id == profile.user_id)
    )
    freelancer = fl_result.scalars().first()
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer profile not found")

    # Resolve event type
    from app.models.event_type import EventType
    active_event = None
    if req.event_slug:
        et_result = await db.execute(
            select(EventType).where(
                EventType.freelancer_id == freelancer.user_id,
                EventType.slug == req.event_slug
            )
        )
        active_event = et_result.scalars().first()

    end_time = req.start_time + timedelta(minutes=req.duration_minutes)

    # Re-verify slot availability to prevent race conditions
    available_slots = await calculate_available_slots(
        db=db,
        freelancer_id=freelancer.user_id,
        scheduling_preferences=freelancer.scheduling_preferences,
        google_creds=freelancer.google_calendar_credentials,
        start_date=req.start_time,
        end_date=req.start_time + timedelta(minutes=req.duration_minutes),
        duration_minutes=req.duration_minutes
    )
    
    # Check if the requested start time exists in the calculated available slots
    # (Note: available_slots returns a list of datetimes)
    if not any(s.replace(tzinfo=timezone.utc) == req.start_time.replace(tzinfo=timezone.utc) for s in available_slots):
        raise HTTPException(
            status_code=400, 
            detail="This slot is no longer available. Please select another time."
        )

    # Determine status based on confirmation mode
    mode = freelancer.booking_confirmation_mode or 'auto'
    status = 'approved' if mode == 'auto' else 'pending'
    
    meeting_link = None
    google_event_id = None
    
    # If auto-approved and google calendar connected, create Google Meet link immediately
    if status == 'approved' and freelancer.google_calendar_credentials:
        try:
            event = await create_google_meet_event(
                creds_data=freelancer.google_calendar_credentials,
                summary=f"Meeting with {req.guest_name}",
                description=req.guest_notes or "",
                start_time=req.start_time,
                end_time=end_time,
                attendee_email=req.guest_email
            )
            meeting_link = event.get('meet_link')
            google_event_id = event.get('event_id')
        except Exception as e:
            import logging
            logging.error(f"Failed to create Google Meet event: {e}")
            # Fall back to pending/manual if Google Calendar fails
            pass

    booking = Booking(
        freelancer_id=freelancer.user_id,
        guest_name=req.guest_name,
        guest_email=req.guest_email,
        guest_notes=req.guest_notes,
        start_time=req.start_time,
        end_time=end_time,
        status=status,
        meeting_link=meeting_link,
        google_event_id=google_event_id,
        event_type_id=active_event.id if active_event else None,
        event_type_title=active_event.title if active_event else "Standard Meeting"
    )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)

    from app.modules.notifications.events import system_message
    from app.modules.outreach.email_sender import send_email

    # Notify Freelancer
    await system_message(
        db,
        user_id=freelancer.user_id,
        title="New Booking Request",
        body=f"{req.guest_name} booked a session for {req.start_time.strftime('%b %d, %H:%M')}."
    )
    
    # Optional: Send email to guest (using existing send_email utility, assuming default outbound config)
    guest_email_body = f"Hi {req.guest_name},\n\nYour booking with {username} for {req.start_time.strftime('%b %d, %H:%M')} is {status}.\n"
    if meeting_link:
        guest_email_body += f"Meeting Link: {meeting_link}\n"
    
    try:
        from_name = user.full_name or profile.username or "Admin"
        # Email to Lead
        await send_email(
            to_email=req.guest_email,
            subject=f"Booking Confirmation: {username}",
            html_content=f"<p>{guest_email_body.replace(chr(10), '<br>')}</p>",
            from_name=from_name,
        )
        
        # Email to Freelancer
        fl_email_body = f"Hi {user.first_name or 'Freelancer'},\n\nYou have a new booking from {req.guest_name} ({req.guest_email}) for {req.start_time.strftime('%b %d, %H:%M')}.\nStatus: {status}\n"
        if meeting_link:
            fl_email_body += f"Meeting Link: {meeting_link}\n"
        if req.guest_notes:
            fl_email_body += f"Notes: {req.guest_notes}\n"
            
        await send_email(
            to_email=user.email,
            subject=f"New Booking: {req.guest_name}",
            html_content=f"<p>{fl_email_body.replace(chr(10), '<br>')}</p>"
        )
    except Exception as e:
        import logging
        logging.error(f"Failed to send booking emails: {e}")

    return {
        "status": "success", 
        "booking_id": booking.id, 
        "booking_status": booking.status,
        "meeting_link": booking.meeting_link
    }

class CustomBookingRequest(BaseModel):
    guest_name: str
    guest_email: EmailStr
    guest_notes: Optional[str] = None
    proposed_times: str

@router.post("/{username}/custom-request")
async def request_custom_time(
    username: str,
    req: CustomBookingRequest,
    db: AsyncSession = Depends(get_db)
):
    """Lead requests a custom time."""
    username = username.strip().lower()

    # Find user profile
    from app.models.user import User
    result = await db.execute(
        select(UserProfile, User)
        .join(User, User.id == UserProfile.user_id)
        .where(UserProfile.username == username)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile, user = row

    # Find freelancer profile
    fl_result = await db.execute(
        select(FreelancerProfile).where(FreelancerProfile.user_id == profile.user_id)
    )
    freelancer = fl_result.scalars().first()
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer profile not found")

    # We set a dummy time for start_time/end_time since they don't have a specific slot yet
    now = datetime.now(timezone.utc)
    
    booking = Booking(
        freelancer_id=freelancer.user_id,
        guest_name=req.guest_name,
        guest_email=req.guest_email,
        guest_notes=req.guest_notes,
        proposed_times=req.proposed_times,
        start_time=now,
        end_time=now + timedelta(minutes=30),
        status="pending",
        booking_type="custom_request"
    )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)

    from app.modules.notifications.events import system_message
    from app.modules.outreach.email_sender import send_email
    
    await system_message(
        db,
        user_id=freelancer.user_id,
        title="Custom Time Request",
        body=f"{req.guest_name} requested a custom meeting time: {req.proposed_times}."
    )

    # Email notifications for custom request
    try:
        from_name = user.full_name or profile.username or "Admin"
        # To Lead
        lead_body = f"Hi {req.guest_name},\n\nThank you for requesting a custom time with {username}. We have notified them of your availability ({req.proposed_times}) and they will get back to you soon."
        await send_email(
            to_email=req.guest_email,
            subject=f"Meeting Request Sent: {username}",
            html_content=f"<p>{lead_body.replace(chr(10), '<br>')}</p>",
            from_name=from_name,
        )
        
        # To Freelancer
        fl_body = f"Hi {user.first_name or 'Freelancer'},\n\n{req.guest_name} ({req.guest_email}) could not find a suitable time on your calendar and has requested a custom meeting.\n\nProposed Times: {req.proposed_times}\n"
        if req.guest_notes:
            fl_body += f"Notes: {req.guest_notes}\n"
            
        await send_email(
            to_email=user.email,
            subject=f"Custom Time Request: {req.guest_name}",
            html_content=f"<p>{fl_body.replace(chr(10), '<br>')}</p>"
        )
    except Exception as e:
        import logging
        logging.error(f"Failed to send custom request emails: {e}")

    return {
        "status": "success",
        "booking_id": booking.id
    }

@router.get("/{username}/legacy")
async def legacy_booking_redirect(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Fallback Redirect to the user's external booking/scheduling page.
    Used if native scheduling is disabled or if accessing the old /book/{username} URL.
    """
    username = username.strip().lower()

    result = await db.execute(
        select(UserProfile).where(UserProfile.username == username)
    )
    profile = result.scalars().first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

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

    return RedirectResponse(url=booking_url, status_code=302)
