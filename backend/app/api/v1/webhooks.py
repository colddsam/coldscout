"""
External Webhook Listener Module.

Exposes POST endpoints for delivery telemetry from third-party SMTP gateways.
Currently handles Brevo (formerly Sendinblue) event notifications.

Security:
  When BREVO_WEBHOOK_SECRET is configured in the environment, every inbound
  request must carry a matching 'X-Brevo-Secret' header.  Requests that fail
  this check are rejected with HTTP 403 before any database work is performed.
  Without a configured secret, the endpoint operates in open mode (acceptable
  for local development; not recommended in production).
"""

import hmac
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.campaign import EmailOutreach
from app.models.subscription import PaymentOrder, Subscription
from app.models.user import User
from app.modules.billing.razorpay_client import verify_webhook_signature

logger = logging.getLogger(__name__)
router = APIRouter()


def _is_production() -> bool:
    """Cheap predicate for "are we in prod"; checks APP_ENV case-insensitively."""
    return (get_settings().APP_ENV or "").lower() in {"production", "prod"}


def _verify_brevo_secret(provided: str | None) -> None:
    """
    Validates the shared secret sent by Brevo against the configured value.

    Uses ``hmac.compare_digest`` for a constant-time comparison to prevent
    timing-based secret enumeration attacks.

    In production we REFUSE to accept webhooks when no secret is configured —
    silently degrading to "open mode" in prod was a footgun that defeated
    the integrity guarantee the secret is supposed to provide. Locally
    (APP_ENV=development) we keep the open-mode convenience for testing.

    Args:
        provided: The value of the ``X-Brevo-Secret`` request header, or None
                  if the header was absent.

    Raises:
        HTTPException 503: If running in production with no secret configured.
        HTTPException 403: If the configured secret doesn't match.
    """
    expected = get_settings().BREVO_WEBHOOK_SECRET
    if not expected:
        if _is_production():
            logger.error(
                "Brevo webhook rejected: BREVO_WEBHOOK_SECRET is required in production."
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Webhook endpoint not configured.",
            )
        # No secret configured — webhook runs in open mode (dev/local use only).
        return

    if not provided or not hmac.compare_digest(provided, expected):
        logger.warning(
            "Brevo webhook request rejected: missing or invalid X-Brevo-Secret header."
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid webhook secret.",
        )


@router.post("/webhooks/brevo")
@limiter.limit("120/minute")
async def brevo_webhook(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    x_brevo_secret: str | None = Header(default=None),
) -> dict:
    """
    Parses delivery telemetry from the Brevo SMTP gateway webhook.

    Translates ``delivered``, ``bounced``, and related event types into local
    ``EmailOutreach`` status updates so the dashboard reflects accurate delivery
    state without polling the Brevo API.

    Request Headers:
        X-Brevo-Secret: Shared secret for request authentication (see BREVO_WEBHOOK_SECRET).

    Request Body (JSON):
        event (str):       Brevo event type (e.g. "delivered", "hard_bounce").
        email (str):       Recipient email address.
        message-id (str):  Brevo message identifier used to locate the local record.
        reason (str):      Optional bounce reason string.

    Returns:
        {"status": "ok"} on successful processing.
    """
    # Authenticate the request before touching the database.
    _verify_brevo_secret(x_brevo_secret)

    try:
        payload = await request.json()
        event = payload.get("event")
        email = payload.get("email")
        message_id = payload.get("message-id")

        # Don't log the recipient email — it's lead PII. Logging the event
        # type + truncated message_id is enough for ops correlation.
        logger.info("Received Brevo webhook: event=%s msg=%s", event, (message_id or "")[:16])
        _ = response  # slowapi header injection

        if event == "delivered" and message_id:
            try:
                stmt = (
                    update(EmailOutreach)
                    .where(EmailOutreach.brevo_message_id == message_id)
                    .values(status="delivered")
                )
                await db.execute(stmt)
                await db.commit()
            except Exception as e:
                await db.rollback()
                logger.error("Brevo webhook DB transaction failed (delivered): %s", e)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database transaction failed.",
                )

        elif (
            event in ["bounced", "hard_bounce", "soft_bounce", "spam", "blocked"]
            and message_id
        ):
            try:
                stmt = (
                    update(EmailOutreach)
                    .where(EmailOutreach.brevo_message_id == message_id)
                    .values(status="bounced", bounce_reason=payload.get("reason", event))
                )
                await db.execute(stmt)
                await db.commit()
            except Exception as e:
                await db.rollback()
                logger.error("Brevo webhook DB transaction failed (bounce): %s", e)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database transaction failed.",
                )

        return {"status": "ok"}

    except HTTPException:
        raise  # Re-raise auth errors and DB errors unchanged
    except Exception as e:
        logger.error("Error processing Brevo webhook: %s", e)
        return {"status": "error"}


# ── Razorpay Webhook ───────────────────────────────────────────────────────────

@router.post("/webhooks/razorpay")
@limiter.limit("120/minute")
async def razorpay_webhook(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    x_razorpay_signature: str | None = Header(default=None),
) -> dict:
    """
    Processes inbound Razorpay webhook events.

    Handles:
      - payment.captured  → mark order paid + activate subscription (fallback for missed verify calls)
      - payment.failed    → mark order failed

    Signature Verification:
      Razorpay signs the raw request body with HMAC-SHA256 using the Webhook Secret.
      The signature is sent in the 'X-Razorpay-Signature' header.

      When RAZORPAY_WEBHOOK_SECRET is configured in the environment:
        - Requests WITHOUT the X-Razorpay-Signature header are rejected (HTTP 403).
        - Requests WITH an invalid signature are rejected (HTTP 403).
        - Only requests with a valid signature proceed to database work.

      When RAZORPAY_WEBHOOK_SECRET is NOT configured (development mode):
        - All requests are accepted without signature verification (open mode).
        - A warning is emitted to the logs on every call in this state.

    Returns:
        {"status": "ok"} on success or {"status": "ignored"} for unhandled events.
    """
    _ = response  # slowapi header injection
    raw_body = await request.body()
    settings = get_settings()

    # Enforce signature verification when a webhook secret is configured.
    #
    # Security note: The old conditional `if x_razorpay_signature and not verify(...)` had
    # a gap — it would silently accept requests that omitted the signature header entirely,
    # even when a secret was configured. The corrected logic requires the header to be
    # present whenever a secret is set, preventing unauthenticated spoofing.
    if settings.RAZORPAY_WEBHOOK_SECRET:
        if not x_razorpay_signature:
            logger.warning(
                "Razorpay webhook rejected: X-Razorpay-Signature header is missing "
                "and RAZORPAY_WEBHOOK_SECRET is configured."
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Missing webhook signature.",
            )
        if not verify_webhook_signature(raw_body, x_razorpay_signature):
            logger.warning("Razorpay webhook rejected: invalid X-Razorpay-Signature.")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid webhook signature.",
            )
    else:
        # In production we refuse to accept Razorpay webhooks when no
        # secret is configured — silently degrading to open mode for a
        # billing endpoint is unacceptable.
        if _is_production():
            logger.error(
                "Razorpay webhook rejected: RAZORPAY_WEBHOOK_SECRET is required in production."
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Webhook endpoint not configured.",
            )
        # Local/dev mode: keep open-mode for convenience but warn loudly.
        logger.warning(
            "Razorpay webhook received in open mode (RAZORPAY_WEBHOOK_SECRET not set). "
            "Configure the secret in production to prevent spoofed events."
        )

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    event = payload.get("event", "")
    entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    razorpay_order_id = entity.get("order_id")

    logger.info("Razorpay webhook received: event=%s order_id=%s", event, razorpay_order_id)

    if not razorpay_order_id:
        return {"status": "ignored", "reason": "no order_id in payload"}

    if event == "payment.captured":
        try:
            # Locate order
            result = await db.execute(
                select(PaymentOrder).where(PaymentOrder.razorpay_order_id == razorpay_order_id)
            )
            order = result.scalars().first()

            if not order:
                logger.warning("Razorpay webhook: order %s not found in DB.", razorpay_order_id)
                return {"status": "ignored", "reason": "order not found"}

            if order.status == "paid":
                return {"status": "ok", "reason": "already processed"}

            # Update order
            order.razorpay_payment_id = entity.get("id")
            order.status = "paid"

            now = datetime.now(timezone.utc)
            period_end = now + timedelta(days=30)

            # Upsert subscription
            result2 = await db.execute(
                select(Subscription).where(Subscription.user_id == order.user_id)
            )
            sub = result2.scalars().first()

            if sub:
                sub.plan = order.plan
                sub.status = "active"
                sub.current_period_start = now
                sub.current_period_end = period_end
                sub.cancelled_at = None
                sub.updated_at = now
            else:
                sub = Subscription(
                    user_id=order.user_id,
                    plan=order.plan,
                    status="active",
                    current_period_start=now,
                    current_period_end=period_end,
                )
                db.add(sub)

            # Update user.plan
            await db.execute(
                update(User)
                .where(User.id == order.user_id)
                .values(plan=order.plan, plan_expires_at=period_end)
            )

            await db.commit()
            logger.info("Razorpay payment.captured: activated plan=%s for user_id=%s", order.plan, order.user_id)
            return {"status": "ok"}

        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.error("Razorpay webhook DB transaction failed (payment.captured): %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database transaction failed.",
            )

    elif event == "payment.failed":
        try:
            await db.execute(
                update(PaymentOrder)
                .where(PaymentOrder.razorpay_order_id == razorpay_order_id)
                .values(status="failed")
            )
            await db.commit()
            logger.info("Razorpay payment.failed: order %s marked failed.", razorpay_order_id)
            return {"status": "ok"}
        except Exception as e:
            await db.rollback()
            logger.error("Razorpay webhook DB transaction failed (payment.failed): %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database transaction failed.",
            )

    return {"status": "ignored", "reason": f"unhandled event: {event}"}
