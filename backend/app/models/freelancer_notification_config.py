"""
Per-Freelancer Notification Preferences Model.

Strict per-user isolation: every row belongs to exactly one ``user_id`` and
governs only that user's stage-event notifications. The lookup helper
filters by user, so user A's preference can never silence user B's feed.

Semantics:
- Missing row     → default ENABLED (opt-out model — notifications on by default).
- ``enabled=False`` → no in-app feed row is written and no push is sent for
                       stage events on this ``job_id`` for this user. Other
                       freelancers' notifications are unaffected.
- Non-stage events (system messages, app updates) bypass this gate entirely.
"""
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.models.base import Base


class FreelancerNotificationConfig(Base):
    __tablename__ = "freelancer_notification_configs"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "job_id",
            name="uq_freelancer_notif_user_job",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_id = Column(String(64), nullable=False, index=True)
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
