"""
In-app Notification + Web Push / FCM REST API.

Strict per-user ownership
-------------------------
Every endpoint reads / writes / deletes ONLY ``current_user``'s rows. There
is no admin-broadcast endpoint here on purpose: cross-user announcements
must use the dedicated ``events.system_message`` helper inside the backend
so each freelancer's row is created independently and the per-user filter
is enforced by construction.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_superuser, get_current_user
from app.config import get_settings
from app.core.database import get_db
from app.models.notification import Notification
from app.models.push_subscription import (
    PLATFORM_ANDROID,
    PLATFORM_WEB,
    PushSubscription,
)
from app.models.user import User
from app.modules.notifications.push_dispatcher import (
    NotificationPayload,
    get_vapid_public_key,
    is_fcm_configured,
    is_webpush_configured,
    notify_user,
)


router = APIRouter(prefix="/notifications")


# ── Schemas ───────────────────────────────────────────────────────────────────


class WebPushKeys(BaseModel):
    p256dh: str = Field(..., min_length=1, max_length=512)
    auth: str = Field(..., min_length=1, max_length=512)


class SubscribeRequest(BaseModel):
    """Web Push subscription returned by the browser's ``PushManager``."""

    platform: str = Field("web", pattern=r"^(web|android)$")
    endpoint: str = Field(..., min_length=10, max_length=2048)
    keys: Optional[WebPushKeys] = None
    user_agent: Optional[str] = Field(None, max_length=512)
    label: Optional[str] = Field(None, max_length=120)


class SubscriptionRead(BaseModel):
    id: int
    platform: str
    endpoint_preview: str
    label: Optional[str]
    user_agent: Optional[str]
    created_at: datetime
    last_used_at: datetime


class NotificationRead(BaseModel):
    id: int
    kind: str
    title: str
    body: Optional[str]
    url: Optional[str]
    icon: Optional[str]
    payload: Optional[dict[str, Any]]
    group_key: Optional[str]
    created_at: datetime
    read_at: Optional[datetime]


class NotificationFeed(BaseModel):
    items: list[NotificationRead]
    unread_count: int
    server_time: datetime


class ConfigRead(BaseModel):
    vapid_public_key: str
    web_push_enabled: bool
    fcm_enabled: bool


class TestNotificationRequest(BaseModel):
    title: str = Field("Test from Cold Scout", max_length=200)
    body: str = Field("If you can see this, push is wired up.", max_length=500)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _serialize_subscription(sub: PushSubscription) -> SubscriptionRead:
    # Never echo the full endpoint / token back to the client — even though
    # they posted it themselves, treating it as a secret minimises leak risk
    # if the response is logged or proxied.
    preview = sub.endpoint
    if len(preview) > 28:
        preview = f"{preview[:18]}…{preview[-8:]}"
    return SubscriptionRead(
        id=sub.id,
        platform=sub.platform,
        endpoint_preview=preview,
        label=sub.label,
        user_agent=sub.user_agent,
        created_at=sub.created_at,
        last_used_at=sub.last_used_at,
    )


def _serialize_notification(row: Notification) -> NotificationRead:
    return NotificationRead(
        id=row.id,
        kind=row.kind,
        title=row.title,
        body=row.body,
        url=row.url,
        icon=row.icon,
        payload=row.payload if isinstance(row.payload, dict) else None,
        group_key=row.group_key,
        created_at=row.created_at,
        read_at=row.read_at,
    )


# ── Public config (no per-user data) ──────────────────────────────────────────


@router.get("/config", response_model=ConfigRead)
async def get_notifications_config(
    _user: User = Depends(get_current_user),
):
    """Return the public bits the frontend needs to subscribe.

    Authenticated only — VAPID public key is technically safe to expose, but
    gating it behind auth keeps this endpoint quiet for crawlers / bots.
    """
    return ConfigRead(
        vapid_public_key=get_vapid_public_key(),
        web_push_enabled=is_webpush_configured(),
        fcm_enabled=is_fcm_configured(),
    )


# ── Subscription management ───────────────────────────────────────────────────


@router.get("/subscriptions", response_model=list[SubscriptionRead])
async def list_my_subscriptions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List every device this user has subscribed for push notifications."""
    res = await db.execute(
        select(PushSubscription)
        .where(PushSubscription.user_id == current_user.id)
        .order_by(desc(PushSubscription.last_used_at))
    )
    return [_serialize_subscription(s) for s in res.scalars().all()]


@router.post("/subscribe", response_model=SubscriptionRead, status_code=201)
async def subscribe(
    payload: SubscribeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register a Web Push subscription or FCM token for the current user.

    Idempotent: re-posting the same endpoint upserts the row instead of
    erroring. This is safe because the unique key is ``(user_id, endpoint)``.
    """
    if payload.platform == PLATFORM_WEB:
        if not is_webpush_configured():
            raise HTTPException(
                status_code=503,
                detail=(
                    "Web Push is not configured on the server. Ask the operator "
                    "to set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY."
                ),
            )
        if not payload.keys:
            raise HTTPException(
                status_code=422,
                detail="Web Push subscriptions require ``keys.p256dh`` and ``keys.auth``.",
            )
    elif payload.platform == PLATFORM_ANDROID:
        if not is_fcm_configured():
            raise HTTPException(
                status_code=503,
                detail=(
                    "FCM is not configured on the server. Ask the operator to "
                    "set FCM_SERVICE_ACCOUNT_JSON."
                ),
            )
    else:  # pragma: no cover - validated by Pydantic
        raise HTTPException(status_code=422, detail="Unknown platform")

    user_agent = payload.user_agent or request.headers.get("user-agent", "")[:512] or None

    # Upsert by (user_id, endpoint).
    res = await db.execute(
        select(PushSubscription)
        .where(PushSubscription.user_id == current_user.id)
        .where(PushSubscription.endpoint == payload.endpoint)
    )
    sub = res.scalars().first()
    if sub is None:
        sub = PushSubscription(
            user_id=current_user.id,
            platform=payload.platform,
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh if payload.keys else None,
            auth=payload.keys.auth if payload.keys else None,
            user_agent=user_agent,
            label=payload.label,
        )
        db.add(sub)
    else:
        sub.platform = payload.platform
        sub.p256dh = payload.keys.p256dh if payload.keys else None
        sub.auth = payload.keys.auth if payload.keys else None
        sub.user_agent = user_agent
        sub.label = payload.label
        sub.last_used_at = func.now()  # type: ignore[assignment]

    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        logger.warning(f"Push subscribe IntegrityError for user={current_user.id}: {e}")
        raise HTTPException(status_code=409, detail="Subscription conflict, retry.")
    await db.refresh(sub)
    return _serialize_subscription(sub)


@router.delete("/subscribe", status_code=204)
async def unsubscribe_by_endpoint(
    endpoint: str = Query(..., min_length=10, max_length=2048),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a single subscription by endpoint URL / FCM token.

    Used by the Service Worker on ``pushsubscriptionchange`` and by the
    "Disable on this device" button.
    """
    await db.execute(
        delete(PushSubscription)
        .where(PushSubscription.user_id == current_user.id)
        .where(PushSubscription.endpoint == endpoint)
    )
    await db.commit()
    return None


@router.delete("/subscriptions/{sub_id}", status_code=204)
async def delete_subscription(
    sub_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete one of the user's subscriptions by row id (settings page)."""
    res = await db.execute(
        delete(PushSubscription)
        .where(PushSubscription.id == sub_id)
        .where(PushSubscription.user_id == current_user.id)
    )
    await db.commit()
    if (res.rowcount or 0) == 0:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return None


# ── Notification feed ─────────────────────────────────────────────────────────


@router.get("", response_model=NotificationFeed)
async def list_notifications(
    limit: int = Query(30, ge=1, le=200),
    only_unread: bool = Query(False),
    since_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the calling user's notification feed, newest-first.

    ``since_id`` enables incremental polling: pass the largest id you've
    seen and only newer rows come back.
    """
    stmt = select(Notification).where(Notification.user_id == current_user.id)
    if only_unread:
        stmt = stmt.where(Notification.read_at.is_(None))
    if since_id is not None:
        stmt = stmt.where(Notification.id > since_id)
    stmt = stmt.order_by(desc(Notification.created_at)).limit(limit)
    res = await db.execute(stmt)
    rows = res.scalars().all()

    unread_res = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == current_user.id)
        .where(Notification.read_at.is_(None))
    )
    unread = int(unread_res.scalar() or 0)

    return NotificationFeed(
        items=[_serialize_notification(r) for r in rows],
        unread_count=unread,
        server_time=datetime.utcnow(),
    )


@router.post("/{notification_id}/read", status_code=204)
async def mark_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        update(Notification)
        .where(Notification.id == notification_id)
        .where(Notification.user_id == current_user.id)
        .where(Notification.read_at.is_(None))
        .values(read_at=func.now())
    )
    await db.commit()
    if (res.rowcount or 0) == 0:
        # Either already read or doesn't exist for this user — both are 404.
        # We don't distinguish to avoid leaking the existence of other users'
        # notification ids via a different status code.
        raise HTTPException(status_code=404, detail="Notification not found")
    return None


@router.post("/read-all", status_code=204)
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id)
        .where(Notification.read_at.is_(None))
        .values(read_at=func.now())
    )
    await db.commit()
    return None


@router.delete("/{notification_id}", status_code=204)
async def delete_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        delete(Notification)
        .where(Notification.id == notification_id)
        .where(Notification.user_id == current_user.id)
    )
    await db.commit()
    if (res.rowcount or 0) == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return None


@router.delete("", status_code=204)
async def clear_all(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Wipe the calling user's entire feed."""
    await db.execute(
        delete(Notification).where(Notification.user_id == current_user.id)
    )
    await db.commit()
    return None


# ── Test / utility ────────────────────────────────────────────────────────────


class DeviceSummary(BaseModel):
    id: int
    platform: str
    label: Optional[str]
    last_used_at: datetime


class PushDebugStatus(BaseModel):
    """Operator-facing health snapshot for the push subsystem."""

    web_push_enabled: bool
    vapid_public_key_preview: str
    vapid_subject: str
    fcm_enabled: bool
    fcm_project_id: str
    caller_user_id: int
    caller_email: str
    caller_subscriptions: list[DeviceSummary]
    caller_subscription_counts: dict[str, int]


@router.get("/debug/push-status", response_model=PushDebugStatus)
async def push_debug_status(
    current_user: User = Depends(get_current_active_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Operator-only health check for push notification wiring.

    Returns transport configuration plus the caller's own subscribed
    devices so you can verify, in one HTTP call:
      * The server has VAPID keys and is willing to send Web Push.
      * The server has Firebase credentials and is willing to send FCM.
      * Your current device actually registered (it appears in the list).

    Restricted to superusers because the response previews the VAPID
    public key — harmless on its own but no reason to expose it broadly.
    """
    settings = get_settings()
    pub = get_vapid_public_key()
    pub_preview = (pub[:14] + "…" + pub[-6:]) if len(pub) > 24 else pub

    res = await db.execute(
        select(PushSubscription)
        .where(PushSubscription.user_id == current_user.id)
        .order_by(desc(PushSubscription.last_used_at))
    )
    subs = res.scalars().all()
    counts: dict[str, int] = {}
    for s in subs:
        counts[s.platform] = counts.get(s.platform, 0) + 1

    return PushDebugStatus(
        web_push_enabled=is_webpush_configured(),
        vapid_public_key_preview=pub_preview,
        vapid_subject=settings.VAPID_SUBJECT or "",
        fcm_enabled=is_fcm_configured(),
        fcm_project_id=settings.FCM_PROJECT_ID or "",
        caller_user_id=current_user.id,
        caller_email=current_user.email,
        caller_subscriptions=[
            DeviceSummary(
                id=s.id,
                platform=s.platform,
                label=s.label,
                last_used_at=s.last_used_at,
            )
            for s in subs
        ],
        caller_subscription_counts=counts,
    )


@router.post("/test", response_model=NotificationRead)
async def send_test_notification(
    payload: TestNotificationRequest = Body(default_factory=TestNotificationRequest),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a notification to the calling user only — useful from the Settings
    page so the user can confirm push is set up correctly without waiting
    for a real pipeline event."""
    row = await notify_user(
        db,
        current_user.id,
        NotificationPayload(
            kind="system",
            title=payload.title,
            body=payload.body,
            url="/settings/notifications",
        ),
    )
    return _serialize_notification(row)
