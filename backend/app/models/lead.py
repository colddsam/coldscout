"""
AI Lead Generation System - Lead and Geographic Models

This module defines the data structures for managing the entire lead lifecycle.
From initial discovery via Google Places to AI-driven qualification and 
final outreach engagement.

Key Models:
1. SearchHistory: Prevents redundant API costs by tracking geographic/category coverage.
2. Lead: The central entity representing a business prospect.
3. LeadSocialNetwork: Stores multi-channel contact signals discovered during scraping.
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean, Column, DateTime, Float,
    ForeignKey, Integer, JSON, String, Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models import Base


class SearchHistory(Base):
    """
    Archives discovery parameters to enforce deduplication
    and prevent redundant API queries within cooling periods.
    """
    __tablename__ = "search_history"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    city       = Column(String(100), nullable=False, index=True)
    category   = Column(String(100), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class Lead(Base):
    """
    Primary model for a discovered local business prospect.
    Tracks profile properties, qualification metrics, and lifecycle timestamps.

    ── Status lifecycle ──────────────────────────────────────────────────────
    discovered
      → qualified        score >= 50, has email  → automated email sequence
      → phone_qualified  score >= 50, phone only → manual call / WhatsApp alert
      → rejected         score < 50 or no contact
    qualified / phone_qualified
      → queued_for_send  (personalization complete, email queued)
    queued_for_send
      → email_sent
    email_sent
      → opened → clicked → replied
    (any active stage can become bounced or unsubscribed)
    """
    __tablename__ = "leads"

    # Identity Fields
    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    place_id       = Column(String(255), unique=True, index=True, nullable=False)
    business_name  = Column(String(255), nullable=False)
    category       = Column(String(100), nullable=True)
    address        = Column(String, nullable=True)
    city           = Column(String(100), nullable=True)
    phone          = Column(String(50), nullable=True)
    email          = Column(String(255), nullable=True)
    website_url    = Column(String, nullable=True)
    google_maps_url = Column(String, nullable=True)
    rating         = Column(Float, nullable=True)
    review_count   = Column(Integer, nullable=True)
    state          = Column(String(100), nullable=True)

    # Multi-Channel Attribution (SAFE: nullable, defaults to legacy channel)
    source_channel     = Column(
        String(50), default="google_places", nullable=True,
        comment="google_places | threads | manual"
    )
    threads_profile_id = Column(
        UUID(as_uuid=True), nullable=True,
        comment="FK to threads_profiles — set when lead originates from Threads."
    )

    # Qualification Metrics
    ai_score            = Column(Integer, default=0)
    has_website         = Column(Boolean, default=False)
    has_social_media    = Column(Boolean, default=False)
    qualification_notes = Column(String, nullable=True)
    competitor_intel    = Column(Text, nullable=True)

    lead_tier = Column(String(2), nullable=True)

    # Website Quality Signals
    website_title        = Column(String(255), nullable=True)
    website_copyright_year = Column(Integer, nullable=True)
    is_mobile_responsive = Column(Boolean, nullable=True)
    has_online_booking   = Column(Boolean, nullable=True)
    has_ecommerce        = Column(Boolean, nullable=True)

    # Status Lifecycle Constraints
    status = Column(String(50), default="discovered", index=True)

    # Lifecycle Timestamps
    discovered_at  = Column(
        DateTime(timezone=True), default=func.now(), nullable=False, index=True
    )
    qualified_at   = Column(DateTime(timezone=True), nullable=True)
    email_sent_at  = Column(DateTime(timezone=True), nullable=True)
    first_opened_at = Column(
        DateTime(timezone=True), nullable=True,
        comment="Timestamp of first email open pixel hit."
    )
    first_clicked_at = Column(
        DateTime(timezone=True), nullable=True,
        comment="Timestamp of first tracked link click."
    )
    first_replied_at = Column(DateTime(timezone=True), nullable=True)

    # Follow-up Sequence Tracking
    followup_count           = Column(Integer, default=0)
    follow_up_stage          = Column(Integer, default=0)
    next_followup_at         = Column(DateTime(timezone=True), nullable=True)
    followup_sequence_active = Column(Boolean, default=True)

    # Reply Intelligence
    reply_classification  = Column(String(50), nullable=True)
    reply_confidence      = Column(Float, nullable=True)
    reply_key_signal      = Column(Text, nullable=True)
    suggested_reply_draft = Column(Text, nullable=True)

    # Metadata
    raw_places_data = Column(
        JSON, nullable=True,
        comment="Raw Google Places API payload for discovery fallback."
    )
    notes = Column(
        Text, nullable=True,
        comment="Custom context or manual remarks about the lead."
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    outreach = relationship(
        "EmailOutreach", back_populates="lead", cascade="all, delete-orphan"
    )
    events = relationship(
        "EmailEvent", back_populates="lead", cascade="all, delete-orphan"
    )
    social_networks = relationship(
        "LeadSocialNetwork", back_populates="lead", cascade="all, delete-orphan"
    )


class LeadSocialNetwork(Base):
    """
    Stores individual social media profiles found during qualification.
    At most one entry per platform per lead (enforced in social_checker.py).
    """
    __tablename__ = "lead_social_networks"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id     = Column(
        UUID(as_uuid=True),
        ForeignKey("leads.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # platform values: facebook | instagram | linkedin | twitter |
    #                  youtube | tiktok | pinterest
    platform = Column(String(50), nullable=False, index=True)
    url      = Column(String, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    lead = relationship("Lead", back_populates="social_networks")