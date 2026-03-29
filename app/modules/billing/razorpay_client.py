"""
Razorpay Client Wrapper.

Provides async-safe wrappers around the synchronous Razorpay Python SDK.
All SDK calls are offloaded to a thread pool via asyncio.to_thread so they
do not block the FastAPI event loop.

Plan amounts (in paise, INR smallest unit):
  Pro:        ₹2,500  →  250_000 paise
  Enterprise: ₹8,500  →  850_000 paise
"""

import asyncio
import hmac
import hashlib
import uuid
from typing import Dict, Any

import razorpay
from loguru import logger

from app.config import get_settings


# ── Plan pricing (paise) ───────────────────────────────────────────────────────

PLAN_AMOUNTS: Dict[str, int] = {
    "pro": 250_000,        # ₹2,500 × 100
    "enterprise": 850_000, # ₹8,500 × 100
}

PLAN_CURRENCY = "INR"


# ── Client factory ─────────────────────────────────────────────────────────────

def _get_client() -> razorpay.Client:
    """
    Instantiates a Razorpay client using credentials from settings.
    Called fresh per request (not cached) so key rotation takes effect immediately.
    """
    settings = get_settings()
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


# ── Order creation ─────────────────────────────────────────────────────────────

async def create_order(plan: str, user_id: int) -> Dict[str, Any]:
    """
    Creates a Razorpay order for the given plan and user.

    Args:
        plan: 'pro' | 'enterprise'
        user_id: Internal user ID (used as part of receipt string for traceability).

    Returns:
        Razorpay order dict containing 'id', 'amount', 'currency', etc.

    Raises:
        ValueError: If the plan is not recognised or Razorpay keys are not configured.
        Exception: Propagates Razorpay API errors.
    """
    amount = PLAN_AMOUNTS.get(plan)
    if amount is None:
        raise ValueError(f"Unknown plan: {plan}")

    settings = get_settings()
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise ValueError("Razorpay API keys are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.")

    receipt = f"rcpt_{user_id}_{plan}_{uuid.uuid4().hex[:8]}"

    order_data = {
        "amount": amount,
        "currency": PLAN_CURRENCY,
        "receipt": receipt,
        "notes": {
            "user_id": str(user_id),
            "plan": plan,
        },
    }

    client = _get_client()
    order = await asyncio.to_thread(lambda: client.order.create(data=order_data))
    logger.info(f"Razorpay order created: {order.get('id')} for user {user_id} plan={plan}")
    return order


# ── Signature verification ─────────────────────────────────────────────────────

def verify_payment_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """
    Verifies the Razorpay payment signature.

    Razorpay signs the response as HMAC-SHA256 of '{order_id}|{payment_id}'
    using the API key secret. This must be verified server-side before
    activating any subscription.

    Returns:
        True if the signature is valid, False otherwise.
    """
    settings = get_settings()
    if not settings.RAZORPAY_KEY_SECRET:
        logger.error("RAZORPAY_KEY_SECRET not configured — cannot verify payment signature.")
        return False

    message = f"{order_id}|{payment_id}"
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


def verify_webhook_signature(payload_bytes: bytes, razorpay_signature: str) -> bool:
    """
    Verifies the Razorpay webhook event signature.

    Razorpay signs webhook payloads as HMAC-SHA256 of the raw request body
    using the Webhook Secret configured in the Razorpay dashboard.

    Args:
        payload_bytes: Raw (un-decoded) request body bytes.
        razorpay_signature: Value of the 'X-Razorpay-Signature' header.

    Returns:
        True if the signature matches, False otherwise.
    """
    settings = get_settings()
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        # No secret configured — accept all (not recommended for production).
        logger.warning("RAZORPAY_WEBHOOK_SECRET not set — webhook running in open mode.")
        return True

    expected = hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, razorpay_signature)
