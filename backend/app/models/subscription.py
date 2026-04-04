"""
Billing & Subscription Models.

Tracks Razorpay payment orders and active user subscriptions.
The Subscription record is the authoritative source for plan status and expiry.
PaymentOrder records every Razorpay order lifecycle (created → paid/failed).
"""

import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class Subscription(Base):
    """
    Tracks the active subscription for a user.

    One subscription per user (upserted on each successful payment).
    The plan field here mirrors user.plan and is the source of truth for
    billing metadata (expiry dates, cancellation time, etc.).
    """
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    """Each user has at most one active subscription record (upsert pattern)."""

    plan = Column(String, nullable=False)
    """Current plan tier: 'pro' | 'enterprise'."""

    status = Column(String, default="active", nullable=False)
    """Lifecycle status: 'active' | 'expired' | 'cancelled'."""

    current_period_start = Column(DateTime(timezone=True), nullable=True)
    """UTC datetime when the current billing period started."""

    current_period_end = Column(DateTime(timezone=True), nullable=True)
    """UTC datetime when the current billing period ends (plan expires)."""

    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    """UTC datetime when the user requested cancellation, if applicable."""

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class PaymentOrder(Base):
    """
    Records every Razorpay order and its payment outcome.

    Created when the user initiates checkout. Updated to 'paid' after
    signature verification or 'failed' on webhook failure events.
    """
    __tablename__ = "payment_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)

    razorpay_order_id = Column(String, unique=True, index=True, nullable=False)
    """Razorpay Order ID (e.g. 'order_xxx'). Returned by Razorpay on order creation."""

    razorpay_payment_id = Column(String, nullable=True)
    """Razorpay Payment ID (e.g. 'pay_xxx'). Set after successful payment capture."""

    razorpay_signature = Column(String, nullable=True)
    """HMAC-SHA256 signature string used to verify payment authenticity."""

    plan = Column(String, nullable=False)
    """Plan being purchased: 'pro' | 'enterprise'."""

    amount = Column(Integer, nullable=False)
    """Order amount in the smallest currency unit (paise for INR)."""

    currency = Column(String, default="INR", nullable=False)
    """ISO 4217 currency code. Razorpay requires INR for domestic payments."""

    status = Column(String, default="created", nullable=False)
    """Order status: 'created' | 'paid' | 'failed'."""

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
