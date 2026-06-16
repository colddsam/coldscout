"""
Pydantic schemas for the native in-app video meeting feature
(branded LiveKit rooms served at /meet/{room_id}).

Public-facing payloads (branding, guest-token) deliberately expose only
non-sensitive data. CRM payloads are returned exclusively to the
authenticated, booking-owning host.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class MeetingConfigResponse(BaseModel):
    """Public client bootstrap — tells the SPA whether video is live and where."""
    enabled: bool
    livekit_url: str = ""


class CreateRoomRequest(BaseModel):
    title: str = Field("Strategy Call", min_length=1, max_length=200)
    guest_name: Optional[str] = Field(None, max_length=120)
    guest_email: Optional[EmailStr] = None
    lead_id: Optional[UUID] = None
    duration_minutes: int = Field(30, ge=5, le=480)


class CreateRoomResponse(BaseModel):
    room_id: str
    booking_id: int
    join_url: str
    livekit_url: str


class HostTokenResponse(BaseModel):
    room_id: str
    token: str
    livekit_url: str
    identity: str


class GuestTokenRequest(BaseModel):
    guest_name: str = Field(..., min_length=1, max_length=120)
    guest_email: Optional[EmailStr] = None


class GuestTokenResponse(BaseModel):
    room_id: str
    token: str
    livekit_url: str
    identity: str


class AuditTeaser(BaseModel):
    """Public-safe waiting-room teaser derived from the linked lead."""
    business_name: Optional[str] = None
    has_website: Optional[bool] = None
    website_score_tier: Optional[str] = None
    headline: Optional[str] = None


class MeetingBrandingResponse(BaseModel):
    """White-label + waiting-room data. Safe for unauthenticated guests."""
    room_id: str
    title: str
    status: str
    host_name: str
    agency_name: Optional[str] = None
    agency_logo_url: Optional[str] = None
    agency_primary_color: Optional[str] = None
    audit_teaser: Optional[AuditTeaser] = None


class OutreachHistoryItem(BaseModel):
    subject: Optional[str] = None
    sent_at: Optional[datetime] = None
    status: Optional[str] = None


class MeetingCrmResponse(BaseModel):
    """Full in-call sidebar data. Host-owner only."""
    room_id: str
    has_lead: bool
    lead_id: Optional[UUID] = None
    business_name: Optional[str] = None
    category: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website_url: Optional[str] = None
    ai_score: Optional[int] = None
    lead_tier: Optional[str] = None
    status: Optional[str] = None
    qualification_notes: Optional[str] = None
    competitor_intel: Optional[str] = None
    has_website: Optional[bool] = None
    is_mobile_responsive: Optional[bool] = None
    has_online_booking: Optional[bool] = None
    has_ecommerce: Optional[bool] = None
    notes: Optional[str] = None
    guest_name: Optional[str] = None
    guest_email: Optional[str] = None
    outreach_history: List[OutreachHistoryItem] = []


class SaveNotesRequest(BaseModel):
    notes: str = Field("", max_length=20000)


class SaveNotesResponse(BaseModel):
    room_id: str
    saved: bool = True
    mirrored_to_lead: bool = False


class EndMeetingResponse(BaseModel):
    room_id: str
    meeting_status: str
    duration_seconds: Optional[int] = None
    lead_promoted: bool = False
