"""
In-app Notification Feed Model.

One row per notification shown in the bell-icon feed and (when a push
subscription exists) sent OS-side via Web Push / FCM.

Strict per-user ownership
-------------------------
Every row is scoped to a single ``user_id``. The API endpoints filter on
``current_user.id`` so a notification raised for user A is never readable
or markable-read by user B — even if B is a superuser.

Live + system-driven
--------------------
The dispatcher writes here from two distinct call sites:

* **Pipeline / job events** — stage start, progress, finish, failure
  (manual triggers and APScheduler-driven runs both go through the same
  events module so the UX is identical).
* **System / app updates** — when a new mobile build is published or the
  operator sends an announcement.

``group_key`` is used so the UI can collapse the "stage running" + "stage
finished" pair into a single live banner card that mutates in place.
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Index,
    JSON,
)
from sqlalchemy.sql import func

from app.models.base import Base


# Notification ``kind`` values. Add new kinds here so the frontend mapping
# stays in sync — these strings appear in the API response and the UI maps
# them to icons / colors.
KIND_STAGE_STARTED = "stage_started"
KIND_STAGE_PROGRESS = "stage_progress"
KIND_STAGE_FINISHED = "stage_finished"
KIND_STAGE_FAILED = "stage_failed"
KIND_APP_UPDATE = "app_update"
KIND_SYSTEM = "system"

ALL_KINDS = (
    KIND_STAGE_STARTED,
    KIND_STAGE_PROGRESS,
    KIND_STAGE_FINISHED,
    KIND_STAGE_FAILED,
    KIND_APP_UPDATE,
    KIND_SYSTEM,
)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        # Hot path: ``WHERE user_id = ? ORDER BY created_at DESC``. Composite
        # index makes the bell-feed query O(log n) per user without sorting.
        Index("ix_notifications_user_created", "user_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    kind = Column(String(32), nullable=False, default=KIND_SYSTEM)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=True)

    # Optional click-through URL inside the SPA (e.g. ``/pipeline``).
    url = Column(String(500), nullable=True)
    icon = Column(String(500), nullable=True)

    # Free-form context (stage name, lead counts, version string …) — the
    # frontend renders structured details from this.
    payload = Column(JSON, nullable=True)

    # Used to dedupe / replace within the live feed. Two notifications sharing
    # the same ``group_key`` for the same user are treated as the same "card"
    # — the newer one supersedes the older.
    group_key = Column(String(120), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    read_at = Column(DateTime(timezone=True), nullable=True)
