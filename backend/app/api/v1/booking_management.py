"""
Private Booking Management Endpoints.

Allows freelancers to view, approve, reject, or cancel their bookings.
"""

import html
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.booking import Booking
from app.models.profile import FreelancerProfile
from app.modules.scheduling.google_calendar import create_google_meet_event
from app.modules.outreach.email_sender import send_email
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

router = APIRouter(prefix="/bookings", tags=["booking-management"])

class ManualBlockRequest(BaseModel):
    title: str
    start_time: datetime
    end_time: datetime

class InstantMeetingRequest(BaseModel):
    guest_name: str
    guest_email: EmailStr
    title: str
    description: Optional[str] = None
    duration_minutes: int = 30
    start_time: Optional[datetime] = None
    use_native_video: bool = False
    """When True, mint a branded in-app /meet/{room_id} room (Pro/Enterprise) instead of Google Meet."""
    lead_id: Optional[UUID] = None
    """Optional CRM lead to link to a native-video room (powers the in-call sidebar)."""

@router.post("/manual-block")
async def create_manual_block(
    req: ManualBlockRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Freelancer manually blocks out time on their schedule."""
    booking = Booking(
        freelancer_id=current_user.id,
        guest_name=req.title,
        guest_email=current_user.email, # Dummy email since it's an internal block
        guest_notes="Manual block",
        start_time=req.start_time,
        end_time=req.end_time,
        status="approved",
        booking_type="manual_block"
    )
    db.add(booking)
    await db.commit()
    return {"status": "success", "booking_id": booking.id}

@router.post("/instant")
async def create_instant_meeting(
    req: InstantMeetingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Freelancer generates an instant meeting for a guest."""
    start_time = req.start_time or datetime.now(timezone.utc)
    end_time = start_time + timedelta(minutes=req.duration_minutes)

    # Find freelancer profile
    fl_result = await db.execute(
        select(FreelancerProfile).where(FreelancerProfile.user_id == current_user.id)
    )
    freelancer = fl_result.scalars().first()
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer profile not found")

    meeting_link = None
    google_event_id = None
    room_id = None

    if req.use_native_video:
        # ── Native branded video room (LiveKit) ──────────────────────────────
        from app.core.plan_gate import is_paid_plan_active
        from app.modules.meetings import livekit_client
        from app.modules.meetings import service as meetings_service

        if not is_paid_plan_active(current_user):
            raise HTTPException(
                status_code=402,
                detail="Branded in-app video rooms are a Pro / Enterprise feature.",
            )
        if not livekit_client.is_configured():
            raise HTTPException(
                status_code=503,
                detail="Video is not configured for this workspace yet.",
            )
        try:
            booking = await meetings_service.create_room(
                db,
                host=current_user,
                title=req.title,
                guest_name=req.guest_name,
                guest_email=req.guest_email,
                lead_id=req.lead_id,
                duration_minutes=req.duration_minutes,
            )
        except meetings_service.LeadNotFound:
            raise HTTPException(status_code=404, detail="Lead not found.")
        meeting_link = booking.meeting_link
        room_id = booking.room_id
    else:
        # ── External provider (Google Meet, or the profile's permanent link) ──
        if freelancer.google_calendar_credentials:
            try:
                event = await create_google_meet_event(
                    creds_data=freelancer.google_calendar_credentials,
                    summary=req.title,
                    description=req.description or "Instant meeting generated via Cold Scout.",
                    start_time=start_time,
                    end_time=end_time,
                    attendee_email=req.guest_email
                )
                meeting_link = event.get('meet_link')
                google_event_id = event.get('event_id')
            except Exception as e:
                import logging
                logging.error(f"Failed to create Google Meet event for instant meeting: {e}")

        # Fallback to permanent meeting link from profile if still None
        if not meeting_link:
            meeting_link = getattr(freelancer, "meeting_link", None)

        booking = Booking(
            freelancer_id=current_user.id,
            guest_name=req.guest_name,
            guest_email=req.guest_email,
            guest_notes=req.description,
            start_time=start_time,
            end_time=end_time,
            status="approved",
            booking_type="instant",
            meeting_link=meeting_link,
            google_event_id=google_event_id
        )
        db.add(booking)
        await db.commit()
        await db.refresh(booking)

    # Send Notifications
    from_name = current_user.full_name
    if not from_name and getattr(current_user, 'profile', None):
        from_name = current_user.profile.username
    if not from_name:
        from_name = current_user.email or "Cold Scout"
    
    # Resolve timezone for display
    import zoneinfo
    fl_tz_name = (freelancer.scheduling_preferences or {}).get("timezone", "UTC")
    try:
        fl_tz = zoneinfo.ZoneInfo(fl_tz_name)
    except Exception:
        fl_tz = timezone.utc
        fl_tz_name = "UTC"

    display_time = start_time.astimezone(fl_tz)
    time_str = display_time.strftime('%b %d, %I:%M %p')
    
    # Resolve explicit timezone label
    tz_label = "UTC" if fl_tz_name == "UTC" else ("IST" if ("Kolkata" in fl_tz_name or "India" in fl_tz_name) else (display_time.strftime('%Z') or fl_tz_name))
    time_str += f" {tz_label}"

    # Guest Notification
    guest_html = f"<p>Hi {req.guest_name},</p><p><strong>{from_name}</strong> has generated an instant meeting with you.</p>"
    guest_html += f"<ul><li><strong>Title:</strong> {req.title}</li><li><strong>Time:</strong> {time_str}</li>"
    
    if meeting_link:
        guest_html += f"<li><strong>Meeting Link:</strong> <a href='{meeting_link}'>{meeting_link}</a></li>"
    
    if req.description:
        guest_html += f"</ul><p><strong>Description:</strong><br>{req.description.replace(chr(10), '<br>')}</p>"
    else:
        guest_html += "</ul>"
        
    try:
        await send_email(
            to_email=req.guest_email,
            subject=f"Meeting Invite: {req.title}",
            html_content=guest_html,
            from_name=from_name
        )
        
        # Freelancer Notification
        fl_html = f"<p>Hi {current_user.full_name or 'there'},</p><p>You have generated an instant meeting with <strong>{req.guest_name}</strong>.</p>"
        fl_html += f"<ul><li><strong>Title:</strong> {req.title}</li><li><strong>Time:</strong> {time_str}</li>"
        
        if meeting_link:
            fl_html += f"<li><strong>Meeting Link:</strong> <a href='{meeting_link}'>{meeting_link}</a></li>"
            
        fl_html += "</ul>"
            
        await send_email(
            to_email=current_user.email,
            subject=f"Instant Meeting Created: {req.title}",
            html_content=fl_html,
            from_name="Cold Scout"
        )
    except Exception as e:
        import logging
        logging.error(f"Failed to send instant meeting emails: {e}")

    return {
        "status": "success",
        "booking_id": booking.id,
        "meeting_link": meeting_link,
        "room_id": room_id,
        "start_time": start_time.isoformat()
    }

@router.get("/")
async def list_bookings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all bookings for the logged-in freelancer."""
    result = await db.execute(
        select(Booking).where(Booking.freelancer_id == current_user.id).order_by(Booking.start_time.desc())
    )
    bookings = result.scalars().all()
    return {"bookings": bookings}

@router.post("/{booking_id}/approve")
async def approve_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Approve a pending booking."""
    result = await db.execute(
        select(Booking).where(Booking.id == booking_id, Booking.freelancer_id == current_user.id)
    )
    booking = result.scalars().first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status != 'pending':
        raise HTTPException(status_code=400, detail=f"Cannot approve a {booking.status} booking")

    # If Google Calendar is connected, create the event now
    fl_result = await db.execute(
        select(FreelancerProfile).where(FreelancerProfile.user_id == current_user.id)
    )
    freelancer = fl_result.scalars().first()
    
    # Mint the meeting link on approval. Native branded /meet room takes
    # precedence when the freelancer opted in (meeting_provider == 'native') and
    # can host it (paid plan + LiveKit configured); otherwise Google Meet when the
    # calendar is connected. Native selection degrades silently to Google Meet.
    minted_native = False
    want_native = bool(freelancer) and (getattr(freelancer, "meeting_provider", None) or "").lower() == "native"
    if want_native and booking.provider != "livekit":
        from app.core.plan_gate import is_paid_plan_active
        from app.modules.meetings import livekit_client
        if is_paid_plan_active(current_user) and livekit_client.is_configured():
            from app.modules.meetings import service as meetings_service
            await meetings_service.assign_native_room_to_booking(
                db, booking,
                match_lead_email=booking.guest_email,
                freelancer_id=current_user.id,
            )
            minted_native = True

    if not minted_native and freelancer and freelancer.google_calendar_credentials:
        try:
            event = await create_google_meet_event(
                creds_data=freelancer.google_calendar_credentials,
                summary=f"Meeting with {booking.guest_name}",
                description=booking.guest_notes or "",
                start_time=booking.start_time,
                end_time=booking.end_time,
                attendee_email=booking.guest_email
            )
            booking.meeting_link = event.get('meet_link')
            booking.google_event_id = event.get('event_id')
        except Exception as e:
            import logging
            logging.error(f"Failed to create Google Meet event during approval: {e}")

    booking.status = 'approved'
    await db.commit()
    
    # TODO: Send email notification
    
    return {"status": "success", "booking_status": booking.status, "meeting_link": booking.meeting_link}

@router.post("/{booking_id}/reject")
async def reject_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reject a pending booking."""
    result = await db.execute(
        select(Booking).where(Booking.id == booking_id, Booking.freelancer_id == current_user.id)
    )
    booking = result.scalars().first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status != 'pending':
        raise HTTPException(status_code=400, detail=f"Cannot reject a {booking.status} booking")

    booking.status = 'rejected'
    await db.commit()
    
    # TODO: Send email notification
    
    return {"status": "success", "booking_status": booking.status}

@router.post("/{booking_id}/cancel")
async def cancel_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Cancel an approved booking."""
    result = await db.execute(
        select(Booking).where(Booking.id == booking_id, Booking.freelancer_id == current_user.id)
    )
    booking = result.scalars().first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status not in ['pending', 'approved']:
        raise HTTPException(status_code=400, detail=f"Cannot cancel a {booking.status} booking")

    booking.status = 'cancelled'
    
    # Note: we are not deleting from Google Calendar here for simplicity, but it should be done in production.
    
    await db.commit()
    
    # Send email notification — escape every interpolated guest-controlled
    # field before HTML assembly. ``booking.guest_name`` was supplied by
    # an unauthenticated booking caller and is persisted; without escaping
    # here, a malicious payload from /book/{username} can resurface as
    # injected HTML in the cancellation email sent back to the same guest.
    if booking.booking_type != 'manual_block':
        try:
            start_str = booking.start_time.strftime('%b %d, %H:%M')
            safe_guest_name = html.escape(booking.guest_name or "")
            safe_fl_name = html.escape(
                getattr(current_user, 'first_name', None)
                or getattr(current_user, 'full_name', None)
                or 'your freelancer'
            )
            safe_start = html.escape(start_str)
            body_html = (
                f"<p>Hi {safe_guest_name},</p>"
                f"<p>Your meeting with {safe_fl_name} on {safe_start} has been cancelled.<br>"
                f"If you have any questions, please reach out directly.</p>"
            )
            await send_email(
                to_email=booking.guest_email,
                subject=f"Meeting Cancelled",
                html_content=body_html,
            )
        except Exception as e:
            import logging
            logging.error(f"Failed to send cancellation email: {e}")
            
    return {"status": "success", "booking_status": booking.status}


# ── Event Types CRUD ──────────────────────────────────────────────────────────

class EventTypeCreate(BaseModel):
    title: str
    slug: str
    duration_minutes: int = 30
    description: str | None = None
    color: str | None = "#ffffff"

class EventTypeUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    duration_minutes: int | None = None
    description: str | None = None
    color: str | None = None
    is_active: bool | None = None


@router.get("/event-types")
async def list_event_types(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all event types for the logged-in freelancer."""
    from app.models.event_type import EventType

    result = await db.execute(
        select(EventType)
        .where(EventType.freelancer_id == current_user.id)
        .order_by(EventType.created_at.asc())
    )
    event_types = result.scalars().all()

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
                "created_at": et.created_at.isoformat() if et.created_at else None,
            }
            for et in event_types
        ]
    }


@router.post("/event-types")
async def create_event_type(
    req: EventTypeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new event type for the logged-in freelancer."""
    from app.models.event_type import EventType
    import re

    # Sanitise slug
    slug = re.sub(r"[^a-z0-9-]", "", req.slug.lower().strip().replace(" ", "-"))
    if not slug:
        raise HTTPException(status_code=400, detail="Invalid slug")

    # Ensure slug uniqueness per freelancer
    existing = await db.execute(
        select(EventType).where(
            EventType.freelancer_id == current_user.id,
            EventType.slug == slug,
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="An event type with this slug already exists")

    et = EventType(
        freelancer_id=current_user.id,
        title=req.title,
        slug=slug,
        duration_minutes=max(5, min(req.duration_minutes, 480)),  # clamp 5-480 min
        description=req.description,
        color=req.color or "#ffffff",
    )
    db.add(et)
    await db.commit()
    await db.refresh(et)

    return {"status": "success", "event_type_id": et.id, "slug": et.slug}


@router.put("/event-types/{event_type_id}")
async def update_event_type(
    event_type_id: int,
    req: EventTypeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing event type."""
    from app.models.event_type import EventType

    result = await db.execute(
        select(EventType).where(
            EventType.id == event_type_id,
            EventType.freelancer_id == current_user.id,
        )
    )
    et = result.scalars().first()
    if not et:
        raise HTTPException(status_code=404, detail="Event type not found")

    if req.title is not None:
        et.title = req.title
    if req.slug is not None:
        import re
        et.slug = re.sub(r"[^a-z0-9-]", "", req.slug.lower().strip().replace(" ", "-"))
    if req.duration_minutes is not None:
        et.duration_minutes = max(5, min(req.duration_minutes, 480))
    if req.description is not None:
        et.description = req.description
    if req.color is not None:
        et.color = req.color
    if req.is_active is not None:
        et.is_active = req.is_active

    await db.commit()
    return {"status": "success"}


@router.delete("/event-types/{event_type_id}")
async def delete_event_type(
    event_type_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an event type."""
    from app.models.event_type import EventType

    result = await db.execute(
        select(EventType).where(
            EventType.id == event_type_id,
            EventType.freelancer_id == current_user.id,
        )
    )
    et = result.scalars().first()
    if not et:
        raise HTTPException(status_code=404, detail="Event type not found")

    await db.delete(et)
    await db.commit()
    return {"status": "success"}
