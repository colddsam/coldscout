"""
Push Subscription Model.

Stores everything we need to deliver an OS-level push notification to one of
a user's devices, regardless of platform:

* **Web / iOS PWA** — Web Push subscription returned by the Service Worker.
  Identified by ``endpoint`` (a URL on the browser vendor's push service)
  plus the ``p256dh`` + ``auth`` keys used to encrypt payloads.
* **Native Android (Capacitor)** — Firebase Cloud Messaging device token.
  We store the FCM token in the ``endpoint`` column for uniformity (with
  ``p256dh`` / ``auth`` left NULL) so a single dispatcher can fan out across
  all subscriptions for a user.

Strict per-user ownership
-------------------------
Every subscription is scoped to ``user_id``. The dispatcher only looks up
subscriptions for the user being notified, so a stage-finished notification
for user A cannot land on user B's device — even if both are signed in on
the same browser at different times.

Cleanup
-------
When a push send fails with a permanent error (HTTP 410 Gone for Web Push,
``UNREGISTERED`` for FCM) the row is deleted by the dispatcher. That keeps
the table from growing unbounded as users uninstall PWAs or revoke notif
permissions.
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.models.base import Base


# Allowed values for the ``platform`` column. ``web`` covers both desktop
# browsers and the iOS PWA (both deliver via the Web Push protocol — Apple
# routes through APNs internally so we don't need any APNs credentials).
PLATFORM_WEB = "web"
PLATFORM_ANDROID = "android"


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    __table_args__ = (
        # A device can only have one active subscription at a time. Browsers
        # may change the endpoint when keys rotate; the upsert layer handles
        # that by deleting any prior row for the same user with a different
        # endpoint when re-registering.
        UniqueConstraint("user_id", "endpoint", name="uq_push_user_endpoint"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    platform = Column(String(16), nullable=False, default=PLATFORM_WEB)

    # Web Push: subscription endpoint URL.
    # FCM:      device registration token.
    endpoint = Column(String, nullable=False)

    # Web Push only — payload encryption keys. NULL for FCM rows.
    p256dh = Column(String, nullable=True)
    auth = Column(String, nullable=True)

    # Informational. Used for the "Devices" list in the user's settings so they
    # can see which browsers / phones are currently subscribed.
    user_agent = Column(String(512), nullable=True)
    label = Column(String(120), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), server_default=func.now())
