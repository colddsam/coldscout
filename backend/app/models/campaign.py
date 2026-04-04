"""
AI Lead Generation System - Campaign and Outreach Models

This module handles the orchestration of outreach efforts. It links leads
to specific campaigns and tracks the detailed delivery state of every 
individual email sent by the system.
"""
import uuid
from sqlalchemy import Column, String, Integer, DateTime, Boolean, Date, ARRAY, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models import Base

class Campaign(Base):
    """
    Core model representing an outreach campaign.
    Aggregates statistical metrics and binds email dispatches.
    """
    __tablename__ = "campaigns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    campaign_date = Column(Date, nullable=False)
    status = Column(String(50), default="pending")

    total_leads = Column(Integer, default=0)
    emails_sent = Column(Integer, default=0)
    emails_opened = Column(Integer, default=0)
    links_clicked = Column(Integer, default=0)
    replies_received = Column(Integer, default=0)

    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    outreach = relationship("EmailOutreach", back_populates="campaign", cascade="all, delete-orphan")


class EmailOutreach(Base):
    """
    Model representing an individualized email queued or dispatched to a lead.
    Tracks delivery status and engagement metadata.
    """
    __tablename__ = "email_outreach"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id = Column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"))

    to_email = Column(String(255), nullable=False)
    subject = Column(Text, nullable=False)
    body_html = Column(Text, nullable=True)
    tracking_token = Column(String(255), unique=True, index=True, nullable=False)

    ai_generated = Column(Boolean, default=True)
    has_attachment = Column(Boolean, default=False)
    attachment_names = Column(JSON, nullable=True)

    status = Column(String(50), default="queued")

    sent_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    bounce_reason = Column(Text, nullable=True)
    brevo_message_id = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    lead = relationship("Lead", back_populates="outreach")
    campaign = relationship("Campaign", back_populates="outreach")
    events = relationship("EmailEvent", back_populates="outreach", cascade="all, delete-orphan")
