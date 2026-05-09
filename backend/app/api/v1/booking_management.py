"""
Private Booking Management Endpoints.

Allows freelancers to view, approve, reject, or cancel their bookings.
"""

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
from pydantic import BaseModel
from datetime import datetime, timezone

router = APIRouter(prefix="/bookings", tags=["booking-management"])

class ManualBlockRequest(BaseModel):
    title: str
    start_time: datetime
    end_time: datetime

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
    
    if freelancer and freelancer.google_calendar_credentials:
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
    
    # Send email notification
    if booking.booking_type != 'manual_block':
        try:
            start_str = booking.start_time.strftime('%b %d, %H:%M')
            body = f"Hi {booking.guest_name},\n\nYour meeting with {current_user.first_name or 'your freelancer'} on {start_str} has been cancelled.\nIf you have any questions, please reach out directly."
            await send_email(
                to_email=booking.guest_email,
                subject=f"Meeting Cancelled",
                html_content=f"<p>{body.replace(chr(10), '<br>')}</p>"
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
