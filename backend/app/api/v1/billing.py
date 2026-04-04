"""
Billing API Router.

Handles all payment and subscription management operations via Razorpay.

Flow:
  1. POST /billing/create-order  → creates a Razorpay order, returns order_id + key_id to frontend
  2. Frontend opens Razorpay checkout modal → user pays
  3. POST /billing/verify-payment → verifies HMAC signature, activates plan (upserts subscription)
  4. GET  /billing/subscription   → returns current subscription status
  5. GET  /billing/transactions   → returns paginated payment history
  6. POST /billing/cancel         → marks subscription as cancelled (access until period_end)

All routes are added to the private_router (require X-API-Key) and further
require a valid Bearer token via get_current_user (Supabase or legacy JWT).
"""

from datetime import datetime, timezone, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.config import get_settings
from app.models.subscription import PaymentOrder, Subscription
from app.models.user import User
from app.modules.billing.razorpay_client import (
    PLAN_AMOUNTS,
    PLAN_CURRENCY,
    create_order,
    verify_payment_signature,
)
from app.schemas.billing import (
    CancelSubscriptionRequest,
    CreateOrderRequest,
    CreateOrderResponse,
    PaymentTransactionResponse,
    SubscriptionResponse,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
)

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post(
    "/billing/create-order",
    response_model=CreateOrderResponse,
    summary="Create a Razorpay payment order",
)
async def create_payment_order(
    body: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CreateOrderResponse:
    """
    Creates a Razorpay order for the requested plan.

    The frontend uses the returned order_id + key_id to open the Razorpay
    checkout modal. The order record is persisted with status='created'.

    Returns:
        order_id, amount (paise), currency, and the publishable key_id.
    """
    settings = get_settings()

    if not settings.RAZORPAY_KEY_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway is not configured.",
        )

    # Block superusers from accidentally placing real orders
    if current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser accounts cannot purchase plans.",
        )

    try:
        rzp_order = await create_order(plan=body.plan, user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error(f"Razorpay order creation failed for user {current_user.id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment gateway error. Please try again.",
        )

    # Persist the order record
    order_record = PaymentOrder(
        user_id=current_user.id,
        razorpay_order_id=rzp_order["id"],
        plan=body.plan,
        amount=PLAN_AMOUNTS[body.plan],
        currency=PLAN_CURRENCY,
        status="created",
    )
    db.add(order_record)
    await db.commit()

    return CreateOrderResponse(
        order_id=rzp_order["id"],
        amount=PLAN_AMOUNTS[body.plan],
        currency=PLAN_CURRENCY,
        key_id=settings.RAZORPAY_KEY_ID,
    )


@router.post(
    "/billing/verify-payment",
    response_model=VerifyPaymentResponse,
    summary="Verify Razorpay payment and activate subscription",
)
async def verify_payment(
    body: VerifyPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VerifyPaymentResponse:
    """
    Verifies the Razorpay payment signature and activates the user's subscription.

    This is called immediately after the Razorpay checkout modal fires the success
    handler. On valid signature:
      - PaymentOrder status set to 'paid'
      - Subscription upserted (30-day period from now)
      - user.plan and user.plan_expires_at updated

    Raises:
        400 — order not found or belongs to a different user
        402 — invalid payment signature (potential tampering)
    """
    # Locate the PaymentOrder created by create-order
    result = await db.execute(
        select(PaymentOrder).where(
            PaymentOrder.razorpay_order_id == body.razorpay_order_id,
            PaymentOrder.user_id == current_user.id,
        )
    )
    order = result.scalars().first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order not found or does not belong to this account.",
        )

    if order.status == "paid":
        # Idempotent — already activated (e.g. double-submit or browser retry)
        result2 = await db.execute(
            select(Subscription).where(Subscription.user_id == current_user.id)
        )
        sub = result2.scalars().first()
        expires_at = sub.current_period_end if sub else _now_utc() + timedelta(days=30)
        return VerifyPaymentResponse(
            success=True,
            plan=order.plan,
            plan_expires_at=expires_at,
            message="Subscription already active.",
        )

    # Cryptographic signature verification
    if not verify_payment_signature(
        order_id=body.razorpay_order_id,
        payment_id=body.razorpay_payment_id,
        signature=body.razorpay_signature,
    ):
        logger.warning(
            f"Invalid Razorpay signature for order {body.razorpay_order_id} user {current_user.id}"
        )
        # Mark order as failed
        order.status = "failed"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Payment verification failed. Please contact support.",
        )

    now = _now_utc()
    period_end = now + timedelta(days=30)

    # Update PaymentOrder
    order.razorpay_payment_id = body.razorpay_payment_id
    order.razorpay_signature = body.razorpay_signature
    order.status = "paid"

    # Upsert Subscription
    result2 = await db.execute(
        select(Subscription).where(Subscription.user_id == current_user.id)
    )
    sub = result2.scalars().first()

    if sub:
        sub.plan = body.plan
        sub.status = "active"
        sub.current_period_start = now
        sub.current_period_end = period_end
        sub.cancelled_at = None
        sub.updated_at = now
    else:
        sub = Subscription(
            user_id=current_user.id,
            plan=body.plan,
            status="active",
            current_period_start=now,
            current_period_end=period_end,
        )
        db.add(sub)

    # Update user.plan and plan_expires_at
    current_user.plan = body.plan
    current_user.plan_expires_at = period_end

    await db.commit()

    logger.info(
        f"Subscription activated: user={current_user.email} plan={body.plan} expires={period_end}"
    )

    return VerifyPaymentResponse(
        success=True,
        plan=body.plan,
        plan_expires_at=period_end,
        message=f"Successfully subscribed to the {body.plan.title()} plan!",
    )


@router.get(
    "/billing/subscription",
    response_model=SubscriptionResponse,
    summary="Get current subscription details",
)
async def get_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionResponse:
    """
    Returns the authenticated user's current subscription status.

    If the user is on the free plan (no subscription record), returns
    has_subscription=False with plan='free'.
    """
    result = await db.execute(
        select(Subscription).where(Subscription.user_id == current_user.id)
    )
    sub = result.scalars().first()

    if not sub:
        return SubscriptionResponse(
            has_subscription=False,
            plan="free",
        )

    return SubscriptionResponse(
        has_subscription=True,
        plan=sub.plan,
        status=sub.status,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        cancelled_at=sub.cancelled_at,
    )


@router.get(
    "/billing/transactions",
    response_model=List[PaymentTransactionResponse],
    summary="List payment transaction history",
)
async def list_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[PaymentTransactionResponse]:
    """
    Returns the authenticated user's payment transaction history,
    ordered by most recent first.
    """
    result = await db.execute(
        select(PaymentOrder)
        .where(PaymentOrder.user_id == current_user.id)
        .order_by(PaymentOrder.created_at.desc())
        .limit(50)
    )
    orders = result.scalars().all()

    return [
        PaymentTransactionResponse(
            id=str(o.id),
            plan=o.plan,
            amount=o.amount,
            currency=o.currency,
            status=o.status,
            razorpay_order_id=o.razorpay_order_id,
            razorpay_payment_id=o.razorpay_payment_id,
            created_at=o.created_at,
        )
        for o in orders
    ]


@router.post(
    "/billing/cancel",
    response_model=SubscriptionResponse,
    summary="Cancel subscription at period end",
)
async def cancel_subscription(
    body: CancelSubscriptionRequest = CancelSubscriptionRequest(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionResponse:
    """
    Marks the user's subscription as cancelled.

    The user retains access until current_period_end. On the next daily
    expiry check, the scheduler will downgrade them to the free plan.
    The subscription is NOT immediately terminated.
    """
    result = await db.execute(
        select(Subscription).where(Subscription.user_id == current_user.id)
    )
    sub = result.scalars().first()

    if not sub or sub.status != "active":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active subscription found.",
        )

    now = _now_utc()
    sub.status = "cancelled"
    sub.cancelled_at = now
    sub.updated_at = now

    await db.commit()
    await db.refresh(sub)

    logger.info(
        f"Subscription cancelled: user={current_user.email} "
        f"reason='{body.reason}' access_until={sub.current_period_end}"
    )

    return SubscriptionResponse(
        has_subscription=True,
        plan=sub.plan,
        status=sub.status,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        cancelled_at=sub.cancelled_at,
    )
