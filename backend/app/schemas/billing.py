"""
Billing & Payment Pydantic Schemas.

Request/response models for the billing API endpoints.
"""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, field_validator


# ── Request schemas ────────────────────────────────────────────────────────────

class CreateOrderRequest(BaseModel):
    """Body for POST /billing/create-order."""
    plan: str

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, v: str) -> str:
        if v not in ("pro", "enterprise"):
            raise ValueError("plan must be 'pro' or 'enterprise'")
        return v


class VerifyPaymentRequest(BaseModel):
    """Body for POST /billing/verify-payment. All three fields come from Razorpay handler callback."""
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan: str

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, v: str) -> str:
        if v not in ("pro", "enterprise"):
            raise ValueError("plan must be 'pro' or 'enterprise'")
        return v


class CancelSubscriptionRequest(BaseModel):
    """Optional body for POST /billing/cancel. reason is for audit purposes only."""
    reason: Optional[str] = None


# ── Response schemas ───────────────────────────────────────────────────────────

class CreateOrderResponse(BaseModel):
    """Returned by POST /billing/create-order. Frontend passes these directly to Razorpay checkout."""
    order_id: str
    amount: int
    """Amount in paise (INR smallest unit). E.g. 10000 = ₹100."""
    currency: str
    key_id: str
    """Razorpay publishable key — safe to expose to the frontend."""


class VerifyPaymentResponse(BaseModel):
    """Returned by POST /billing/verify-payment after successful verification."""
    success: bool
    plan: str
    plan_expires_at: datetime
    message: str


class SubscriptionResponse(BaseModel):
    """Returned by GET /billing/subscription."""
    has_subscription: bool
    plan: str
    """Current active plan: 'free' | 'pro' | 'enterprise'."""
    status: Optional[str] = None
    """Subscription status: 'active' | 'expired' | 'cancelled'. None if no paid subscription."""
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None


class PaymentTransactionResponse(BaseModel):
    """Single transaction record for GET /billing/transactions."""
    id: str
    plan: str
    amount: int
    currency: str
    status: str
    razorpay_order_id: str
    razorpay_payment_id: Optional[str] = None
    created_at: datetime
