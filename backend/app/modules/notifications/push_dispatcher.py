"""
Cross-platform push dispatcher.

Single funnel for delivering live, OS-level notifications to a Cold Scout
user across every device they've subscribed (browser, installed PWA on
iOS / Android, native Capacitor Android shell). Always also writes the
notification to the per-user in-app feed (``notifications`` table) so the
bell-icon center has a permanent record even if the OS push fails.

Design contract
---------------

1. **Per-user only.** Every public function takes a ``user_id`` and looks
   up ONLY that user's subscriptions. The rest of the codebase cannot
   accidentally cross-post notifications between users.
2. **Graceful degradation.** Missing VAPID config or missing Firebase
   service-account just disables that transport — nothing raises. The
   in-app feed write always runs.
3. **Self-healing.** Permanent push failures (HTTP 410 Gone for Web Push,
   ``UNREGISTERED`` for FCM) delete the offending subscription so the
   table doesn't bloat with dead endpoints.
4. **Async-safe.** All DB I/O uses the async session; HTTP calls to the
   push services run inside ``run_in_executor`` so they don't block the
   event loop (``pywebpush`` is blocking).
"""
from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from loguru import logger
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.notification import Notification
from app.models.push_subscription import (
    PLATFORM_ANDROID,
    PLATFORM_WEB,
    PushSubscription,
)


# ── Lazy imports ──────────────────────────────────────────────────────────────
# Both pywebpush and firebase-admin are heavy (cryptography, gRPC). Importing
# them at module load adds noticeable startup time and crashes if optional
# requirements aren't installed in some deploy contexts (e.g. tests). We import
# inside the helpers so a missing package only affects the transport that
# actually needs it.


def _load_pywebpush():
    try:
        from pywebpush import WebPushException, webpush  # type: ignore

        return webpush, WebPushException
    except Exception as e:  # pragma: no cover - exercised only when missing
        logger.warning(f"pywebpush import failed; Web Push disabled: {e}")
        return None, None


_FCM_INITIALIZED = False
_FCM_APP = None


def _load_fcm():
    """Initialize ``firebase-admin`` once per process; return the messaging module."""
    global _FCM_INITIALIZED, _FCM_APP
    settings = get_settings()
    raw = (settings.FCM_SERVICE_ACCOUNT_JSON or "").strip()
    if not raw:
        return None  # FCM disabled — silent no-op.
    try:
        import firebase_admin  # type: ignore
        from firebase_admin import credentials, messaging  # type: ignore
    except Exception as e:  # pragma: no cover
        logger.warning(f"firebase-admin import failed; FCM disabled: {e}")
        return None

    if not _FCM_INITIALIZED:
        try:
            if raw.startswith("{"):
                # Inline JSON content (preferred for env-only deploys).
                cred = credentials.Certificate(json.loads(raw))
            elif os.path.isfile(raw):
                cred = credentials.Certificate(raw)
            else:
                logger.warning(
                    "FCM_SERVICE_ACCOUNT_JSON is set but is neither valid JSON "
                    "nor an existing file path; disabling FCM."
                )
                return None
            _FCM_APP = firebase_admin.initialize_app(
                cred,
                options={"projectId": settings.FCM_PROJECT_ID or None},
                name="coldscout-push",
            )
            _FCM_INITIALIZED = True
            logger.info("FCM (firebase-admin) initialized for push notifications.")
        except ValueError:
            # ``initialize_app`` raises ValueError if an app with this name
            # already exists — happens during hot reload.
            _FCM_APP = firebase_admin.get_app("coldscout-push")
            _FCM_INITIALIZED = True
        except Exception as e:
            logger.error(f"FCM initialization failed; disabling: {e}")
            return None
    return messaging


# ── Public API ────────────────────────────────────────────────────────────────


@dataclass(slots=True)
class NotificationPayload:
    """Stable contract for all sites that emit a notification.

    Keep it small and serialisable — the same dict is JSON-encoded and shipped
    to both the Web Push service worker and the FCM data payload.
    """

    title: str
    body: Optional[str] = None
    kind: str = "system"
    url: Optional[str] = None
    icon: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    group_key: Optional[str] = None

    def to_feed_kwargs(self) -> dict[str, Any]:
        return dict(
            kind=self.kind,
            title=self.title,
            body=self.body,
            url=self.url,
            icon=self.icon,
            payload=self.payload,
            group_key=self.group_key,
        )

    def to_push_dict(self, *, notification_id: int) -> dict[str, Any]:
        """Wire format the Service Worker / Capacitor handler reads."""
        return {
            "id": notification_id,
            "kind": self.kind,
            "title": self.title,
            "body": self.body or "",
            "url": self.url or "/",
            "icon": self.icon or "/web-app-manifest-192x192.png",
            "payload": self.payload or {},
            "group_key": self.group_key,
            "ts": datetime.now(timezone.utc).isoformat(),
        }


async def notify_user(
    db: AsyncSession,
    user_id: int,
    notification: NotificationPayload,
) -> Notification:
    """Persist + push a notification to one user.

    Always returns the persisted ``Notification`` row so callers can echo the
    ID back to the client (used by the live feed for instant local rendering).
    Never raises on transport failure — push errors are logged and the
    in-app feed is the source of truth.
    """
    if not user_id:
        raise ValueError("notify_user requires a non-zero user_id")

    # 1. Optional dedupe-by-group: replace any prior in-flight row sharing
    #    the group_key for the same user. This keeps "stage running"
    #    notifications from piling up — one card per stage, mutating in place.
    if notification.group_key:
        await db.execute(
            delete(Notification)
            .where(Notification.user_id == user_id)
            .where(Notification.group_key == notification.group_key)
            .where(Notification.read_at.is_(None))
        )

    row = Notification(user_id=user_id, **notification.to_feed_kwargs())
    db.add(row)
    await db.commit()
    await db.refresh(row)

    # 2. Fan-out to OS-level push subscribers (best-effort).
    try:
        await _dispatch_push(db, user_id=user_id, payload=notification.to_push_dict(notification_id=row.id))
    except Exception as e:  # pragma: no cover — defensive only
        logger.warning(f"notify_user: push fan-out failed for user={user_id}: {e}")

    return row


async def notify_users(
    db: AsyncSession,
    user_ids: Iterable[int],
    notification: NotificationPayload,
) -> None:
    """Multi-recipient convenience wrapper. Each user gets their OWN feed row.

    NEVER use this to announce something cross-user that includes another
    user's data in ``payload``. Each notification is persisted per-user so a
    leaky payload here would cross the isolation boundary.
    """
    seen: set[int] = set()
    for uid in user_ids:
        if not uid or uid in seen:
            continue
        seen.add(uid)
        try:
            await notify_user(db, uid, notification)
        except Exception as e:
            logger.warning(f"notify_users: failed for user={uid}: {e}")


# ── Internal: push transport ──────────────────────────────────────────────────


async def _dispatch_push(
    db: AsyncSession,
    *,
    user_id: int,
    payload: dict[str, Any],
) -> None:
    """Send the same payload to every active subscription of one user."""
    res = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )
    subs = res.scalars().all()
    if not subs:
        return

    payload_json = json.dumps(payload, separators=(",", ":"))
    settings = get_settings()
    web_enabled = bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)
    fcm_messaging = _load_fcm()

    # Run blocking push calls in a thread executor so the API event loop stays
    # responsive while a sluggish vendor (e.g. mozilla autopush) hangs.
    loop = asyncio.get_running_loop()

    dead_ids: list[int] = []
    for sub in subs:
        try:
            if sub.platform == PLATFORM_ANDROID and fcm_messaging is not None:
                ok = await loop.run_in_executor(
                    None, _send_fcm, fcm_messaging, sub.endpoint, payload, payload_json
                )
            elif sub.platform == PLATFORM_WEB and web_enabled:
                ok = await loop.run_in_executor(
                    None, _send_webpush, sub, payload_json, settings
                )
            else:
                continue
        except _PermanentPushError:
            dead_ids.append(sub.id)
            continue
        except Exception as e:
            logger.warning(
                f"push dispatch failed (user={user_id}, sub={sub.id}, platform={sub.platform}): {e}"
            )
            continue
        if ok is False:
            dead_ids.append(sub.id)

    if dead_ids:
        await db.execute(
            delete(PushSubscription).where(PushSubscription.id.in_(dead_ids))
        )
        await db.commit()
        logger.info(
            f"Pruned {len(dead_ids)} dead push subscription(s) for user={user_id}"
        )


class _PermanentPushError(Exception):
    """Raised when the push service confirms the subscription will never work
    again (HTTP 404/410 for Web Push, ``UNREGISTERED`` for FCM). The caller
    deletes the subscription row when it sees this."""


def _send_webpush(sub: PushSubscription, payload_json: str, settings) -> bool:
    """Send one Web Push notification. Returns False on permanent failure."""
    webpush, WebPushException = _load_pywebpush()
    if webpush is None:
        return True  # silently skip when library is absent
    sub_info = {
        "endpoint": sub.endpoint,
        "keys": {"p256dh": sub.p256dh or "", "auth": sub.auth or ""},
    }
    try:
        webpush(
            subscription_info=sub_info,
            data=payload_json,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT or "mailto:admin@example.com"},
            ttl=600,
        )
        return True
    except WebPushException as e:  # type: ignore
        status_code = getattr(getattr(e, "response", None), "status_code", None)
        if status_code in (404, 410):
            raise _PermanentPushError(str(e)) from e
        logger.warning(f"WebPush transient failure: {e}")
        return True
    except Exception as e:
        logger.warning(f"WebPush unexpected failure: {e}")
        return True


def _send_fcm(messaging, token: str, payload: dict[str, Any], payload_json: str) -> bool:
    """Send one FCM message. Returns False on permanent failure."""
    try:
        message = messaging.Message(
            token=token,
            # ``data`` is what Capacitor's PushNotifications plugin surfaces in
            # the foreground; ``notification`` is what the OS shade renders
            # when the app is closed. Send both so behaviour is identical
            # whether the app is killed, backgrounded, or foregrounded.
            notification=messaging.Notification(
                title=payload.get("title") or "Cold Scout",
                body=payload.get("body") or "",
            ),
            data={
                "payload": payload_json,
                "url": payload.get("url") or "/",
                "kind": payload.get("kind") or "system",
            },
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    icon="ic_stat_notification",
                    color="#000000",
                    channel_id="coldscout_default",
                ),
            ),
        )
        messaging.send(message, app=_FCM_APP)
        return True
    except Exception as e:
        # firebase-admin raises ``UnregisteredError`` (subclass of FirebaseError)
        # when the token has been invalidated. We can't import the exception
        # type without coupling to the package, so fall back to string check.
        msg = str(e)
        if "UNREGISTERED" in msg.upper() or "NOT_FOUND" in msg.upper():
            raise _PermanentPushError(msg) from e
        logger.warning(f"FCM send failure (token={token[:12]}…): {e}")
        return True


# ── Settings introspection helpers ────────────────────────────────────────────


def is_webpush_configured() -> bool:
    """``True`` iff the operator has set up VAPID and Web Push will fire."""
    s = get_settings()
    return bool(s.VAPID_PUBLIC_KEY and s.VAPID_PRIVATE_KEY)


def is_fcm_configured() -> bool:
    """``True`` iff Firebase service-account JSON is present."""
    return bool((get_settings().FCM_SERVICE_ACCOUNT_JSON or "").strip())


def get_vapid_public_key() -> str:
    """Public key handed to the browser to subscribe. Empty when disabled."""
    return get_settings().VAPID_PUBLIC_KEY or ""
