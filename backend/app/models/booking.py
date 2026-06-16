"""
Booking Database Model.

Tracks native scheduling appointments and links between clients and freelancers.
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base

class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    freelancer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    guest_name = Column(String(200), nullable=False)
    guest_email = Column(String(255), nullable=False, index=True)
    guest_notes = Column(Text, nullable=True)
    
    start_time = Column(DateTime(timezone=True), nullable=False, index=True)
    end_time = Column(DateTime(timezone=True), nullable=False, index=True)
    
    status = Column(String(50), default="pending", nullable=False)
    """One of: pending, confirmed, rejected, canceled, completed."""
    
    booking_type = Column(String(50), default="standard", nullable=False)
    """One of: standard, custom_link, instant, custom_request, manual_block."""
    
    proposed_times = Column(String(500), nullable=True)
    """Stores text of proposed times for custom requests."""
    
    reminders_sent = Column(JSON, nullable=True)
    """JSON array tracking sent reminders e.g., ['24h', '1h']"""
    
    meeting_link = Column(String(1000), nullable=True)
    """Google Meet, Zoom, or other provided link."""
    
    google_event_id = Column(String(255), nullable=True)
    """ID of the event in Google Calendar, if synced."""
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    event_type_id = Column(Integer, ForeignKey("event_types.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type_title = Column(String(200), nullable=True)
    """Denormalized title for historical reference."""

    # ── Native In-App Video (LiveKit branded meeting rooms) ─────────────────────
    room_id = Column(String(64), nullable=True, unique=True, index=True)
    """UUID for the native /meet/{room_id} room. NULL for external (Google Meet) bookings."""

    provider = Column(String(20), nullable=True)
    """Conferencing provider for this booking: 'livekit' (native) or NULL/'google' (external)."""

    meeting_status = Column(String(20), default="planned", nullable=False, server_default="planned")
    """Live room lifecycle, distinct from approval ``status``: planned | active | completed."""

    lead_id = Column(
        UUID(as_uuid=True),
        ForeignKey("leads.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    """Optional link to the CRM lead, powering the in-call sidebar + 'Interviewed' auto-advance."""

    host_notes = Column(Text, nullable=True)
    """Notes the host takes during the call. Mirrored into ``lead.notes`` when a lead is linked."""

    actual_start_at = Column(DateTime(timezone=True), nullable=True)
    """When the first participant actually joined (set by webhook or the /end fallback)."""

    actual_end_at = Column(DateTime(timezone=True), nullable=True)
    """When the room finished (set by ``room_finished`` webhook or the /end fallback)."""

    meeting_duration_seconds = Column(Integer, nullable=True)
    """Computed actual_end_at - actual_start_at; drives the 5-minute 'Interviewed' rule."""

    recording_url = Column(String(1000), nullable=True)
    """Egress recording URL, if recording is configured and completed."""

    transcript = Column(Text, nullable=True)
    """Raw transcript text, populated only when transcription is configured."""

    meeting_summary = Column(Text, nullable=True)
    """AI-generated meeting summary (Groq), populated post-call when a transcript exists."""

    next_steps = Column(JSON, nullable=True)
    """AI-generated 'Next Steps' checklist (JSON array of strings)."""

    # Relationships
    freelancer = relationship("User", backref="bookings")
    event_type = relationship("EventType", backref="bookings")
    lead = relationship("Lead", foreign_keys=[lead_id], lazy="select")
