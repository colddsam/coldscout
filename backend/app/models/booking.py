"""
Booking Database Model.

Tracks native scheduling appointments and links between clients and freelancers.
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
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

    # Relationships
    freelancer = relationship("User", backref="bookings")
    event_type = relationship("EventType", backref="bookings")
