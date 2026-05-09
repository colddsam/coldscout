"""
Event Type Database Model.

Defines reusable meeting templates (Event Types) that freelancers create
to offer different booking durations and descriptions on their public
scheduling page.  Each event type produces a unique slug that becomes
part of the public booking URL:  /book/{username}/{slug}

When a freelancer has no custom event types, a virtual "30 Minute Meeting"
default is synthesised at the API layer so leads always have something to book.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base


class EventType(Base):
    __tablename__ = "event_types"

    id = Column(Integer, primary_key=True, index=True)
    freelancer_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title = Column(String(200), nullable=False)
    """Display name, e.g. '15 Min Discovery Call'."""

    slug = Column(String(100), nullable=False, index=True)
    """URL-safe identifier, e.g. '15-min-discovery'. Unique per freelancer."""

    duration_minutes = Column(Integer, nullable=False, default=30)
    """Duration of this event type in minutes."""

    description = Column(Text, nullable=True)
    """Short description shown on the public booking page."""

    color = Column(String(20), nullable=True, default="#ffffff")
    """Accent colour used in the dashboard card (hex)."""

    is_active = Column(Boolean, default=True, nullable=False)
    """Inactive event types are hidden from the public booking page."""

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    freelancer = relationship("User", backref="event_types")
