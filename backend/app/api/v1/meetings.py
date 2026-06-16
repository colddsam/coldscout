"""
Native In-App Video Meeting Endpoints (branded LiveKit rooms).

Three routers, mirroring the Threads module's public/private split:

* ``public_router``  (prefix /meetings) — no X-API-Key:
    GET  /config                       — client bootstrap (enabled + url)
    GET  /{room_id}/branding           — white-label + waiting-room teaser
    POST /{room_id}/guest-token        — guest LiveKit join token (rate-limited)
* ``webhook_router`` (prefix /webhooks) — no X-API-Key, signature-verified:
    POST /livekit                      — LiveKit room/participant/egress events
* ``router``         (prefix /meetings) — X-API-Key + auth, Pro/Enterprise:
    POST /rooms                        — create a branded room (host)
    POST /{room_id}/host-token         — host LiveKit join token (owner)
    GET  /{room_id}/crm                — in-call CRM sidebar (owner)
    PATCH /{room_id}/notes             — autosave host notes (owner)
    POST /{room_id}/end                — webhook-independent completion (owner)

The webhook + guest endpoints are public because LiveKit's servers and
unauthenticated leads can't send the frontend X-API-Key. Host endpoints are
gated to an active paid plan via :func:`app.core.plan_gate.is_paid_plan_active`
(superuser bypass) and additionally ownership-checked.

NOTE: this module intentionally does NOT use ``from __future__ import
annotations`` — FastAPI + slowapi resolve route body-model annotations at
import time against the function's real (non-stringified) types.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import get_settings
from app.core.database import get_db
from app.core.plan_gate import is_paid_plan_active
from app.core.rate_limit import limiter
from app.models.user import User
from app.modules.meetings import livekit_client, service, transcription
from app.schemas.meeting import (
    CreateRoomRequest,
    CreateRoomResponse,
    EndMeetingResponse,
    GuestTokenRequest,
    GuestTokenResponse,
    HostTokenResponse,
    MeetingBrandingResponse,
    MeetingConfigResponse,
    MeetingCrmResponse,
    SaveNotesRequest,
    SaveNotesResponse,
)

settings = get_settings()

public_router = APIRouter(prefix="/meetings", tags=["meetings"])
webhook_router = APIRouter(prefix="/webhooks", tags=["meetings"])
router = APIRouter(prefix="/meetings", tags=["meetings"])


# ── Shared helpers ──────────────────────────────────────────────────────────


def require_paid_plan_for_meetings(
    current_user: User = Depends(get_current_user),
) -> User:
    """402 unless the caller can host branded video rooms (Pro/Enterprise/superuser)."""
    if not is_paid_plan_active(current_user):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Branded in-app video rooms are a Pro / Enterprise feature. "
                "Upgrade your plan to host native meetings with the live CRM sidebar."
            ),
        )
    return current_user


def _ensure_configured() -> None:
    if not livekit_client.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Video is not configured for this workspace yet.",
        )


async def _get_native_room_or_404(db: AsyncSession, room_id: str):
    booking = await service.get_room(db, room_id)
    if not booking or booking.provider != "livekit":
        raise HTTPException(status_code=404, detail="Meeting room not found.")
    return booking


def _require_owner(booking, current_user: User) -> None:
    if booking.freelancer_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="You do not host this meeting.")


# ── Public ──────────────────────────────────────────────────────────────────


@public_router.get("/config", response_model=MeetingConfigResponse)
async def meeting_config() -> MeetingConfigResponse:
    """Tell the SPA whether native video is live and which LiveKit URL to use."""
    return MeetingConfigResponse(
        enabled=livekit_client.is_configured(),
        livekit_url=livekit_client.livekit_url(),
    )


@public_router.get("/{room_id}/branding", response_model=MeetingBrandingResponse)
async def meeting_branding(
    room_id: str,
    db: AsyncSession = Depends(get_db),
) -> MeetingBrandingResponse:
    """White-label theme + waiting-room teaser. Public-safe (no guest PII)."""
    booking = await _get_native_room_or_404(db, room_id)
    return MeetingBrandingResponse(**(await service.get_branding(db, booking)))


@public_router.post("/{room_id}/guest-token", response_model=GuestTokenResponse)
@limiter.limit("10/minute")
async def meeting_guest_token(
    request: Request,
    response: Response,
    room_id: str,
    req: GuestTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> GuestTokenResponse:
    """Issue a scoped guest join token. No auth — leads join via the public link."""
    _ = (request, response)  # injected for slowapi
    _ensure_configured()
    booking = await _get_native_room_or_404(db, room_id)
    if not service.is_room_joinable(booking):
        raise HTTPException(status_code=409, detail="This meeting has ended.")

    identity = f"guest-{uuid.uuid4().hex[:12]}"
    try:
        token = livekit_client.create_token(
            room=room_id,
            identity=identity,
            name=req.guest_name.strip()[:120] or "Guest",
            role="guest",
            ttl_minutes=settings.MEETING_GUEST_TOKEN_TTL_MINUTES,
            metadata={"guest_email": req.guest_email or ""},
        )
    except livekit_client.LiveKitNotConfigured:
        _ensure_configured()
        raise
    return GuestTokenResponse(
        room_id=room_id,
        token=token,
        livekit_url=livekit_client.livekit_url(),
        identity=identity,
    )


# ── Webhook ─────────────────────────────────────────────────────────────────


def _event_dt(event) -> datetime:
    ts = getattr(event, "created_at", None)
    if ts:
        try:
            return datetime.fromtimestamp(int(ts), tz=timezone.utc)
        except Exception:
            pass
    return datetime.now(timezone.utc)


def _extract_recording_url(event) -> Optional[str]:
    egress = getattr(event, "egress_info", None)
    if not egress:
        return None
    for r in (getattr(egress, "file_results", None) or []):
        loc = getattr(r, "location", None) or getattr(r, "filename", None)
        if loc:
            return loc
    f = getattr(egress, "file", None)
    if f:
        return getattr(f, "location", None) or getattr(f, "filename", None)
    return None


@webhook_router.post("/livekit")
async def livekit_webhook(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Authoritative room lifecycle from LiveKit (signature-verified).

    Handles participant_joined (→ active + start), room_finished (→ completed +
    5-min interview rule), and egress_ended (→ recording URL + optional
    transcription). Unknown events are acknowledged and ignored. Idempotent.
    """
    if not livekit_client.is_configured():
        # Can't verify without keys; surface the misconfiguration rather than
        # silently accepting spoofed events.
        raise HTTPException(status_code=503, detail="LiveKit not configured.")

    raw = await request.body()
    try:
        event = livekit_client.verify_webhook(raw.decode("utf-8"), authorization)
    except Exception as e:
        logger.warning(f"LiveKit webhook rejected: {e}")
        raise HTTPException(status_code=403, detail="Invalid webhook signature.")

    kind = getattr(event, "event", None)
    room_name = getattr(getattr(event, "room", None), "name", None)
    if not room_name:
        return {"status": "ignored", "reason": "no room"}

    booking = await service.get_room(db, room_name)
    if not booking:
        return {"status": "ignored", "reason": "unknown room"}

    try:
        if kind in ("participant_joined", "room_started"):
            await service.record_participant_joined(db, booking, at=_event_dt(event))

        elif kind == "egress_ended":
            url = _extract_recording_url(event)
            if url:
                booking.recording_url = url
                await db.commit()
                if booking.meeting_status == "completed":
                    await _maybe_transcribe(db, booking)

        elif kind == "room_finished":
            await service.complete_meeting(db, booking, ended_at=_event_dt(event))
            await _maybe_transcribe(db, booking)
    except Exception as e:
        logger.error(f"LiveKit webhook processing failed (event={kind}, room={room_name}): {e}")
        # Acknowledge to avoid LiveKit retry storms; the /end fallback still works.
        return {"status": "error"}

    return {"status": "ok"}


async def _maybe_transcribe(db: AsyncSession, booking) -> None:
    """Best-effort post-call transcription; never raises into the caller."""
    if not transcription.is_transcription_configured() or not booking.recording_url:
        return
    try:
        await transcription.process_booking(db, booking)
    except Exception as e:
        logger.warning(f"meetings: transcription failed for room {booking.room_id}: {e}")


# ── Private (host) ──────────────────────────────────────────────────────────


@router.post("/rooms", response_model=CreateRoomResponse)
async def create_meeting_room(
    req: CreateRoomRequest,
    current_user: User = Depends(require_paid_plan_for_meetings),
    db: AsyncSession = Depends(get_db),
) -> CreateRoomResponse:
    """Create a branded native room (optionally linked to a CRM lead)."""
    _ensure_configured()
    try:
        booking = await service.create_room(
            db,
            host=current_user,
            title=req.title,
            guest_name=req.guest_name,
            guest_email=req.guest_email,
            lead_id=req.lead_id,
            duration_minutes=req.duration_minutes,
        )
    except service.LeadNotFound:
        raise HTTPException(status_code=404, detail="Lead not found.")

    return CreateRoomResponse(
        room_id=booking.room_id,
        booking_id=booking.id,
        join_url=service.meeting_join_url(booking.room_id),
        livekit_url=livekit_client.livekit_url(),
    )


@router.post("/{room_id}/host-token", response_model=HostTokenResponse)
async def meeting_host_token(
    room_id: str,
    current_user: User = Depends(require_paid_plan_for_meetings),
    db: AsyncSession = Depends(get_db),
) -> HostTokenResponse:
    """Issue a host (room-admin) token and stamp the room as started."""
    _ensure_configured()
    booking = await _get_native_room_or_404(db, room_id)
    _require_owner(booking, current_user)
    if not service.is_room_joinable(booking):
        raise HTTPException(status_code=409, detail="This meeting has ended.")

    await service.mark_started(db, booking)
    identity = f"host-{current_user.id}"
    token = livekit_client.create_token(
        room=room_id,
        identity=identity,
        name=current_user.full_name or "Host",
        role="host",
        ttl_minutes=settings.MEETING_HOST_TOKEN_TTL_MINUTES,
    )
    return HostTokenResponse(
        room_id=room_id,
        token=token,
        livekit_url=livekit_client.livekit_url(),
        identity=identity,
    )


@router.get("/{room_id}/crm", response_model=MeetingCrmResponse)
async def meeting_crm(
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingCrmResponse:
    """Full in-call CRM sidebar payload. Owner only (read allowed even if plan lapsed mid-call)."""
    booking = await _get_native_room_or_404(db, room_id)
    _require_owner(booking, current_user)
    return MeetingCrmResponse(**(await service.get_crm(db, booking)))


@router.patch("/{room_id}/notes", response_model=SaveNotesResponse)
async def meeting_notes(
    room_id: str,
    req: SaveNotesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SaveNotesResponse:
    """Autosave host notes; mirror into the linked lead's profile."""
    booking = await _get_native_room_or_404(db, room_id)
    _require_owner(booking, current_user)
    mirrored = await service.save_host_notes(db, booking, req.notes)
    return SaveNotesResponse(room_id=room_id, saved=True, mirrored_to_lead=mirrored)


@router.post("/{room_id}/end", response_model=EndMeetingResponse)
async def meeting_end(
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EndMeetingResponse:
    """Webhook-independent completion: mark done + apply the 5-minute rule."""
    booking = await _get_native_room_or_404(db, room_id)
    _require_owner(booking, current_user)
    promoted, duration = await service.complete_meeting(db, booking)
    await _maybe_transcribe(db, booking)
    return EndMeetingResponse(
        room_id=room_id,
        meeting_status=booking.meeting_status,
        duration_seconds=duration,
        lead_promoted=promoted,
    )
