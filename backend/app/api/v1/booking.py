"""
Public Booking Endpoints.

Provides public-facing native booking endpoints and slot calculations.
Handles both legacy redirects (if configured) and native booking flow.
"""

from datetime import datetime, timedelta, timezone
import zoneinfo
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
from app.modules.scheduling.slot_calculator import calculate_available_slots, WEEKDAY_NAMES
from app.modules.scheduling.google_calendar import create_google_meet_event

router = APIRouter(prefix="/book", tags=["booking"])
settings = get_settings()

class SlotResponse(BaseModel):
    slots: List[datetime]
    freelancer_timezone: str
    is_closed: bool = False

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
    visitor_timezone: Optional[str] = Query(None),
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

    # Determine if "Closed"
    # A day is "Closed" if slots are empty AND either:
    #   - the freelancer has no working hours configured for that weekday, OR
    #   - the working hours for that day have already ended (requested date is today/past)
    is_closed = False
    prefs = freelancer.scheduling_preferences or {}
    fl_tz_name = prefs.get("timezone", "UTC")

    if not slots:
        try:
            tz = zoneinfo.ZoneInfo(fl_tz_name)
            now_fl = datetime.now(tz)
            requested_fl = start_date.astimezone(tz)

            working_hours = prefs.get("working_hours") or {}
            day_name = WEEKDAY_NAMES[requested_fl.weekday()]
            day_periods = working_hours.get(day_name, [])

            if not day_periods:
                # No working hours configured for this weekday → schedule closed.
                is_closed = True
            elif requested_fl.date() <= now_fl.date():
                # Working hours exist for this day — check whether they've ended.
                latest_end = None
                for p in day_periods:
                    try:
                        p_end = datetime.strptime(p['end'], "%H:%M").time()
                        if latest_end is None or p_end > latest_end:
                            latest_end = p_end
                    except Exception:
                        continue

                if latest_end:
                    if requested_fl.date() < now_fl.date() or now_fl.time() > latest_end:
                        is_closed = True

        except Exception:
            pass

    return {
        "slots": slots,
        "freelancer_timezone": fl_tz_name,
        "is_closed": is_closed
    }

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
    from loguru import logger
    username = username.strip().lower()
    logger.info(f"Booking attempt for {username} by {req.guest_email} at {req.start_time}")

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
            
    # NEW: Fallback to permanent meeting link from profile if still None
    if status == 'approved' and not meeting_link:
        meeting_link = getattr(freelancer, "meeting_link", None)

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

    # Resolve timezone for display
    fl_tz_name = (freelancer.scheduling_preferences or {}).get("timezone", "UTC")
    try:
        fl_tz = zoneinfo.ZoneInfo(fl_tz_name)
    except Exception:
        fl_tz = timezone.utc
        fl_tz_name = "UTC"
    
    # Ensure req.start_time is offset-aware (it should be from Pydantic, but just in case)
    start_utc = req.start_time
    if start_utc.tzinfo is None:
        start_utc = start_utc.replace(tzinfo=timezone.utc)
    
    display_time = start_utc.astimezone(fl_tz)
    # Use 12-hour format for better readability
    time_str = display_time.strftime('%b %d, %I:%M %p')
    
    # Resolve explicit timezone label
    tz_label = ""
    if fl_tz_name == "UTC":
        tz_label = "UTC"
    elif "Kolkata" in fl_tz_name or "India" in fl_tz_name:
        tz_label = "IST"
    else:
        # Try to get the short name (e.g. EST, PDT)
        tz_label = display_time.strftime('%Z') or fl_tz_name
        
    time_str += f" {tz_label}"

    from app.modules.notifications.events import system_message
    from app.modules.outreach.email_sender import send_email

    # Notify Freelancer
    alert_body = f"{req.guest_name} booked a session for {time_str}."
    if status == 'approved' and not meeting_link:
        alert_body += "\n\nIMPORTANT: No meeting link was provided for this session. Please update your profile or contact the lead."
    
    await system_message(
        db,
        user_id=freelancer.user_id,
        title="New Booking Request",
        body=alert_body
    )
    
    # Optional: Send email to guest (using existing send_email utility, assuming default outbound config)
    guest_html = f"<p>Hi {req.guest_name},</p><p>Your booking with <strong>{username}</strong> for <strong>{time_str}</strong> is <strong>{status}</strong>.</p>"
    if meeting_link:
        guest_html += f"<p><strong>Meeting Link:</strong> <a href='{meeting_link}'>{meeting_link}</a></p>"
    
    try:
        from_name = user.full_name or profile.username or "Admin"
        # Email to Lead
        await send_email(
            to_email=req.guest_email,
            subject=f"Booking Confirmation: {username}",
            html_content=guest_html,
            from_name=from_name,
        )
        
        # Email to Freelancer
        fl_html = f"<p>Hi {user.full_name or 'Freelancer'},</p><p>You have a new booking from <strong>{req.guest_name}</strong> ({req.guest_email}) for <strong>{time_str}</strong>.</p>"
        fl_html += f"<ul><li><strong>Status:</strong> {status}</li>"
        if meeting_link:
            fl_html += f"<li><strong>Meeting Link:</strong> <a href='{meeting_link}'>{meeting_link}</a></li>"
        if req.guest_notes:
            fl_html += f"<li><strong>Notes:</strong> {req.guest_notes}</li>"
        fl_html += "</ul>"
            
        await send_email(
            to_email=user.email,
            subject=f"New Booking: {req.guest_name}",
            html_content=fl_html
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
