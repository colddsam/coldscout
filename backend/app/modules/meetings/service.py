"""
Business logic for native in-app video meetings.

Pure DB/orchestration helpers (no FastAPI types) so they can be reused by the
API router, the LiveKit webhook handler, and tests. All functions are async
and take an ``AsyncSession``.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.booking import Booking
from app.models.lead import Lead
from app.models.profile import FreelancerProfile, UserProfile
from app.models.user import User


class LeadNotFound(Exception):
    """Raised when a requested lead link can't be resolved for the host."""


# Lead statuses we must NOT regress when applying the 'interviewed' milestone.
# 'interviewed' itself is included so the promotion is idempotent.
_DO_NOT_REGRESS = {"interviewed", "replied", "closed", "unsubscribed", "bounced"}


def generate_room_id() -> str:
    return uuid.uuid4().hex


def meeting_join_url(room_id: str) -> str:
    base = (get_settings().FRONTEND_DOMAIN or "").rstrip("/")
    return f"{base}/meet/{room_id}"


def is_room_joinable(booking: Booking) -> bool:
    """A room is joinable unless it has been completed or its booking cancelled."""
    if booking.meeting_status == "completed":
        return False
    if (booking.status or "").lower() in {"cancelled", "canceled", "rejected"}:
        return False
    return True


async def get_room(db: AsyncSession, room_id: str) -> Optional[Booking]:
    res = await db.execute(select(Booking).where(Booking.room_id == room_id))
    return res.scalars().first()


async def create_room(
    db: AsyncSession,
    *,
    host: User,
    title: str,
    guest_name: Optional[str] = None,
    guest_email: Optional[str] = None,
    lead_id: Optional[uuid.UUID] = None,
    duration_minutes: int = 30,
) -> Booking:
    """Create a *planned* native-video Booking with a fresh ``room_id``.

    When ``lead_id`` is given it must belong to ``host`` (tenant isolation);
    guest name/email default from the lead when omitted.
    """
    now = datetime.now(timezone.utc)

    resolved_lead: Optional[Lead] = None
    if lead_id is not None:
        res = await db.execute(
            select(Lead).where(Lead.id == lead_id, Lead.user_id == host.id)
        )
        resolved_lead = res.scalars().first()
        if resolved_lead is None:
            raise LeadNotFound(str(lead_id))
        guest_name = guest_name or resolved_lead.business_name
        guest_email = guest_email or resolved_lead.email

    room_id = generate_room_id()
    booking = Booking(
        freelancer_id=host.id,
        guest_name=(guest_name or "Guest")[:200],
        guest_email=(guest_email or host.email or "guest@coldscout.local")[:255],
        guest_notes=None,
        start_time=now,
        end_time=now + timedelta(minutes=max(5, int(duration_minutes))),
        status="approved",
        booking_type="instant",
        provider="livekit",
        meeting_status="planned",
        room_id=room_id,
        lead_id=resolved_lead.id if resolved_lead else None,
        event_type_title=(title or "Strategy Call")[:200],
        meeting_link=meeting_join_url(room_id),
    )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)
    return booking


async def assign_native_room_to_booking(
    db: AsyncSession,
    booking: Booking,
    *,
    match_lead_email: Optional[str] = None,
    freelancer_id: Optional[int] = None,
) -> str:
    """Stamp native-video fields onto an *existing* booking row (no commit).

    Used by the public booking + approval flows to turn a scheduled booking into
    a branded /meet room while preserving the row's own start/end times (so it
    can't reuse :func:`create_room`, which builds an instant row). Generates a
    fresh, unique ``room_id`` and, best-effort, links a CRM lead matching
    ``match_lead_email`` for the host so the in-call sidebar + 'interviewed'
    auto-advance light up. The caller is responsible for committing.
    """
    room_id = generate_room_id()
    booking.room_id = room_id
    booking.provider = "livekit"
    booking.meeting_status = "planned"
    booking.meeting_link = meeting_join_url(room_id)

    if booking.lead_id is None and match_lead_email and freelancer_id is not None:
        res = await db.execute(
            select(Lead).where(
                Lead.user_id == freelancer_id,
                Lead.email == match_lead_email,
            )
        )
        lead = res.scalars().first()
        if lead is not None:
            booking.lead_id = lead.id

    return room_id


async def mark_started(db: AsyncSession, booking: Booking) -> None:
    """Flip a planned room to active and stamp the start time (idempotent).

    Called when the host token is issued (host opening the room ≈ meeting
    start). The LiveKit ``participant_joined`` webhook refines this with the
    real time when configured (it only ever moves the start *earlier*).
    """
    changed = False
    if booking.meeting_status == "planned":
        booking.meeting_status = "active"
        changed = True
    if booking.actual_start_at is None:
        booking.actual_start_at = datetime.now(timezone.utc)
        changed = True
    if changed:
        await db.commit()


async def record_participant_joined(db: AsyncSession, booking: Booking, *, at: datetime) -> None:
    """Webhook path: mark active + keep the earliest known start time."""
    changed = False
    if booking.meeting_status == "planned":
        booking.meeting_status = "active"
        changed = True
    if booking.actual_start_at is None or at < booking.actual_start_at:
        booking.actual_start_at = at
        changed = True
    if changed:
        await db.commit()


async def complete_meeting(
    db: AsyncSession,
    booking: Booking,
    *,
    ended_at: Optional[datetime] = None,
) -> tuple[bool, Optional[int]]:
    """Mark the room completed, compute duration, and apply the interview rule.

    Idempotent: if already completed, returns the recorded outcome without
    re-promoting the lead. Returns ``(lead_promoted, duration_seconds)``.
    """
    settings = get_settings()
    ended_at = ended_at or datetime.now(timezone.utc)

    already_completed = booking.meeting_status == "completed"

    if booking.actual_end_at is None:
        booking.actual_end_at = ended_at
    if booking.meeting_status != "completed":
        booking.meeting_status = "completed"

    duration = booking.meeting_duration_seconds
    if duration is None and booking.actual_start_at is not None:
        start = booking.actual_start_at
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        end = booking.actual_end_at
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        duration = max(0, int((end - start).total_seconds()))
        booking.meeting_duration_seconds = duration

    lead_promoted = False
    threshold = settings.MEETING_INTERVIEW_THRESHOLD_SECONDS
    if (
        not already_completed
        and booking.lead_id is not None
        and duration is not None
        and duration >= threshold
    ):
        lead_promoted = await _promote_lead_to_interviewed(db, booking)

    await db.commit()
    return lead_promoted, duration


async def _promote_lead_to_interviewed(db: AsyncSession, booking: Booking) -> bool:
    """Advance the linked lead to 'interviewed' unless it's already at/ahead.

    Fires a per-host in-app notification. Returns True if the status changed.
    """
    res = await db.execute(select(Lead).where(Lead.id == booking.lead_id))
    lead = res.scalars().first()
    if lead is None:
        return False
    if (lead.status or "").lower() in _DO_NOT_REGRESS:
        return False

    lead.status = "interviewed"
    # Note: commit is performed by the caller (complete_meeting) so the
    # status change and the booking completion land in one transaction.

    try:
        from app.modules.notifications.events import system_message

        await system_message(
            db,
            user_id=booking.freelancer_id,
            title="Lead interviewed",
            body=f"{lead.business_name} passed the {get_settings().MEETING_INTERVIEW_THRESHOLD_SECONDS // 60}-minute "
            f"meeting threshold and was moved to 'Interviewed'.",
            url=f"/leads/{lead.id}",
        )
    except Exception as e:  # notifications must never block the status update
        logger.warning(f"meetings: interview notification failed for lead {lead.id}: {e}")

    return True


async def save_host_notes(db: AsyncSession, booking: Booking, notes: str) -> bool:
    """Persist host notes on the booking and mirror into the lead when linked.

    Returns whether the notes were mirrored to a lead profile.
    """
    booking.host_notes = notes
    mirrored = False
    if booking.lead_id is not None:
        res = await db.execute(select(Lead).where(Lead.id == booking.lead_id))
        lead = res.scalars().first()
        if lead is not None:
            lead.notes = notes
            mirrored = True
    await db.commit()
    return mirrored


# ── Read models (branding + CRM) ────────────────────────────────────────────


def _audit_headline(lead: Lead) -> str:
    """Build a short, public-safe waiting-room teaser from the lead's signals."""
    if lead.has_website is False:
        return "No website detected — see what a custom one could look like for your business."
    gaps = []
    if lead.is_mobile_responsive is False:
        gaps.append("not mobile-friendly")
    if lead.has_online_booking is False:
        gaps.append("no online booking")
    if lead.has_ecommerce is False:
        gaps.append("no online store")
    if gaps:
        return "Your online presence review flagged: " + ", ".join(gaps) + "."
    return "We've prepared a custom review of your online presence."


async def get_branding(db: AsyncSession, booking: Booking) -> dict[str, Any]:
    """Public-safe branding + waiting-room payload (no PII beyond host name)."""
    host_res = await db.execute(select(User).where(User.id == booking.freelancer_id))
    host = host_res.scalars().first()
    fl_res = await db.execute(
        select(FreelancerProfile).where(FreelancerProfile.user_id == booking.freelancer_id)
    )
    fl = fl_res.scalars().first()
    up_res = await db.execute(
        select(UserProfile).where(UserProfile.user_id == booking.freelancer_id)
    )
    up = up_res.scalars().first()

    host_name = (
        (host.full_name if host else None)
        or (up.username if up else None)
        or "Your host"
    )

    teaser = None
    if booking.lead_id is not None:
        lead_res = await db.execute(select(Lead).where(Lead.id == booking.lead_id))
        lead = lead_res.scalars().first()
        if lead is not None:
            teaser = {
                "business_name": lead.business_name,
                "has_website": lead.has_website,
                "website_score_tier": lead.lead_tier,
                "headline": _audit_headline(lead),
            }

    return {
        "room_id": booking.room_id,
        "title": booking.event_type_title or "Strategy Call",
        "status": booking.meeting_status,
        "host_name": host_name,
        "agency_name": (host.full_name if host else None),
        "agency_logo_url": (up.profile_photo_url if up else None),
        "agency_primary_color": (fl.agency_primary_color if fl else None),
        "audit_teaser": teaser,
    }


async def get_crm(db: AsyncSession, booking: Booking) -> dict[str, Any]:
    """Full in-call sidebar payload. Caller must enforce host ownership."""
    data: dict[str, Any] = {
        "room_id": booking.room_id,
        "has_lead": booking.lead_id is not None,
        "lead_id": booking.lead_id,
        "guest_name": booking.guest_name,
        "guest_email": booking.guest_email,
        # Preload the editor with the host's saved notes (falls back to the
        # lead's existing notes below so the host extends rather than clobbers).
        "notes": booking.host_notes,
        "outreach_history": [],
    }
    if booking.lead_id is None:
        return data

    lead_res = await db.execute(select(Lead).where(Lead.id == booking.lead_id))
    lead = lead_res.scalars().first()
    if lead is None:
        return data

    data.update(
        {
            "business_name": lead.business_name,
            "category": lead.category,
            "city": lead.city,
            "phone": lead.phone,
            "email": lead.email,
            "website_url": lead.website_url,
            "ai_score": lead.ai_score,
            "lead_tier": lead.lead_tier,
            "status": lead.status,
            "qualification_notes": lead.qualification_notes,
            "competitor_intel": lead.competitor_intel,
            "has_website": lead.has_website,
            "is_mobile_responsive": lead.is_mobile_responsive,
            "has_online_booking": lead.has_online_booking,
            "has_ecommerce": lead.has_ecommerce,
            "notes": booking.host_notes if booking.host_notes is not None else lead.notes,
        }
    )

    from app.models.campaign import EmailOutreach

    out_res = await db.execute(
        select(EmailOutreach)
        .where(EmailOutreach.lead_id == lead.id)
        .order_by(EmailOutreach.created_at.desc())
        .limit(10)
    )
    data["outreach_history"] = [
        {"subject": o.subject, "sent_at": o.sent_at, "status": o.status}
        for o in out_res.scalars().all()
    ]
    return data
