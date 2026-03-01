"""
Core lead and geographic targeting database models.
Defines schemas for discovered local businesses, search constraints,
and the lead lifecycle footprint.
"""
from datetime import datetime
import uuid
from sqlalchemy import Column, String, Integer, Float, Boolean, JSON, DateTime, ARRAY, ForeignKey, Text
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

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    city = Column(String(100), nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

class Lead(Base):
    """
    Primary model for a discovered local business prospect.
    Tracks profile properties, qualification metrics, and lifecycle timestamps.
    """
    __tablename__ = "leads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    place_id = Column(String(255), unique=True, index=True, nullable=False)
    business_name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)
    address = Column(String, nullable=True)
    city = Column(String(100), nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    website_url = Column(String, nullable=True)
    google_maps_url = Column(String, nullable=True)
    rating = Column(Float, nullable=True)
    review_count = Column(Integer, nullable=True)

    qualification_score = Column(Integer, default=0)
    has_website = Column(Boolean, default=False)
    has_social_media = Column(Boolean, default=False)
    web_presence_notes = Column(String, nullable=True)

    status = Column(String(50), default="discovered", index=True)

    discovered_at = Column(DateTime(timezone=True), default=func.now(), index=True)
    qualified_at = Column(DateTime(timezone=True), nullable=True)
    email_sent_at = Column(DateTime(timezone=True), nullable=True)
    first_opened_at = Column(DateTime(timezone=True), nullable=True, comment="Timestamp of first email open.")
    first_clicked_at = Column(DateTime(timezone=True), nullable=True, comment="Timestamp of first link click.")
    first_replied_at = Column(DateTime(timezone=True), nullable=True)

    raw_places_data = Column(JSON, nullable=True, comment="Raw external API payload for discovery fallback.")
    notes = Column(Text, nullable=True, comment="Custom context or remarks about the lead.")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    outreach = relationship("EmailOutreach", back_populates="lead", cascade="all, delete-orphan")
    events = relationship("EmailEvent", back_populates="lead", cascade="all, delete-orphan")
    social_networks = relationship("LeadSocialNetwork", back_populates="lead", cascade="all, delete-orphan")

class LeadSocialNetwork(Base):
    """
    Stores individual social media profiles for a lead.
    """
    __tablename__ = "lead_social_networks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id = Column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    platform_name = Column(String(50), nullable=False, index=True) # e.g. facebook, instagram, linkedin, twitter
    profile_url = Column(String, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    lead = relationship("Lead", back_populates="social_networks")
