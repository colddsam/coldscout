"""
Paid-plan gating for pipeline + AI-spending endpoints.

Single source of truth for "is this freelancer entitled to run the
lead-generation pipeline?". Centralising the rule here means:

* The scheduled dispatcher (``dispatch_stage_for_all_freelancers``),
  per-user gate (``is_freelancer_pipeline_active``), manual stage trigger
  (``POST /api/v1/pipeline/trigger``), single-lead "Send Now"
  (``POST /api/v1/leads/{id}/trigger-outreach``), and per-lead WhatsApp
  builder (``POST /api/v1/leads/{id}/whatsapp-message``) all enforce the
  same predicate. A free user can never slip through one of them.
* The rule has a single test surface — if the product later adds a trial
  or grandfathered tier, only this file changes.

The predicate
-------------
A user is paid-active iff **any** of:

1. They are a superuser (operators bypass billing).
2. ``user.plan`` ∈ ``{'pro', 'enterprise'}`` AND
   (``user.plan_expires_at`` IS NULL OR ``user.plan_expires_at`` > now()).

The expiry check is in real time (UTC). The nightly
``check_subscription_expiry`` job in ``billing_tasks.py`` is the
eventual-consistency cleaner; this predicate doesn't depend on it, so a
plan that expired five minutes ago is already locked out without waiting
for 02:00 IST.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from fastapi import Depends, HTTPException, status
from loguru import logger
from sqlalchemy import or_, select
from sqlalchemy.sql import ColumnElement

from app.api.deps import get_current_user
from app.models.user import User

if TYPE_CHECKING:
    from sqlalchemy.sql import Select


PAID_PLANS = frozenset({"pro", "enterprise"})

# Cache freelancer→bool entitlement for a short window so the per-stage
# gate doesn't hammer the DB inside a tight dispatch loop. 30 s mirrors
# the existing ``JobManager._FREELANCER_TTL`` so a manual upgrade /
# downgrade propagates inside the same operator-perceptible window as
# every other freelancer config flag.
_PLAN_TTL_SECONDS = 30.0
_plan_cache: dict[int, tuple[bool, float]] = {}


# ── Synchronous predicate on an already-loaded User instance ────────────────


def is_paid_plan_active(user: User) -> bool:
    """Returns True iff the user has an unexpired paid plan (or is a superuser).

    Use this when the caller already has a hydrated ``User`` (e.g. the
    ``current_user`` injected by FastAPI). Constant-time, no I/O.
    """
    if user.is_superuser:
        return True
    plan = (user.plan or "").lower()
    if plan not in PAID_PLANS:
        return False
    expires_at = user.plan_expires_at
    if expires_at is None:
        # Historical accounts upgraded manually pre-billing-webhook have
        # NULL expiry. Treat NULL as "no expiry recorded → still paid".
        return True
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at > datetime.now(timezone.utc)


# ── Async DB lookup with short TTL cache ────────────────────────────────────


async def is_user_id_paid_plan_active(user_id: int) -> bool:
    """Returns True iff ``user_id`` currently has an active paid plan.

    Used by the per-user pipeline gate (``is_freelancer_pipeline_active``)
    which only has the user_id in hand. Reads ``users.plan`` +
    ``plan_expires_at`` + ``is_superuser`` in one query.

    Defaults to ``False`` (locked out) when the DB lookup fails — this is
    the safe direction: a free user briefly seeing "blocked" beats a paid
    user briefly seeing a pipeline run charged to their tenant.
    """
    now = time.monotonic()
    cached = _plan_cache.get(user_id)
    if cached and (now - cached[1]) < _PLAN_TTL_SECONDS:
        return cached[0]

    # Imported here to keep this module importable from anywhere without
    # eager engine creation at process boot.
    from app.core.database import get_session_maker

    try:
        async with get_session_maker()() as db:
            row = await db.execute(
                select(User.is_superuser, User.plan, User.plan_expires_at)
                .where(User.id == user_id)
            )
            data = row.first()
    except Exception as e:
        # DB blip — fail closed. Don't cache the failure so the next
        # tick gets a fresh attempt.
        logger.warning(f"Plan gate lookup failed for user {user_id}: {e}")
        return False

    if data is None:
        # Unknown user_id — never a paid plan. Cache so repeated lookups
        # for the same stale id don't keep hitting the DB.
        _plan_cache[user_id] = (False, now)
        return False

    is_super, plan_value, expires_at = data
    if is_super:
        result = True
    else:
        plan_normalised = (plan_value or "").lower()
        if plan_normalised not in PAID_PLANS:
            result = False
        elif expires_at is None:
            result = True
        else:
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            result = expires_at > datetime.now(timezone.utc)

    _plan_cache[user_id] = (result, now)
    return result


def invalidate_plan_cache(user_id: int | None = None) -> None:
    """Drop cached entitlement so the next gate call re-reads the DB.

    Called from the billing webhook after a successful payment / refund /
    downgrade so the pipeline state mirrors reality without waiting for
    the 30 s TTL.
    """
    if user_id is None:
        _plan_cache.clear()
    else:
        _plan_cache.pop(user_id, None)


# ── SQL filter helpers ──────────────────────────────────────────────────────


def paid_plan_sql_predicate() -> ColumnElement[bool]:
    """SQL boolean expression: 'this users row currently has a paid plan'.

    Used by ``get_active_freelancers`` to filter the freelancer list in
    one query rather than calling ``is_user_id_paid_plan_active`` once
    per user (which would be N queries on every scheduler tick).

    Returns a bare SQLAlchemy expression; callers AND-combine it with
    their own predicates.
    """
    return or_(
        User.is_superuser.is_(True),
        # NB: ``User.plan_expires_at > func.now()`` uses the DB's clock,
        # which is the right reference for UTC timestamps stored
        # server-side. Postgres compares timezone-aware values correctly.
        (User.plan.in_(tuple(PAID_PLANS)))
        & (
            (User.plan_expires_at.is_(None))
            | (User.plan_expires_at > datetime.now(timezone.utc))
        ),
    )


# ── FastAPI dependency ──────────────────────────────────────────────────────


def require_paid_plan_for_pipeline(
    current_user: User = Depends(get_current_user),
) -> User:
    """FastAPI dependency that 402s if the caller can't run pipeline jobs.

    Use on every endpoint that enqueues background AI / outreach work
    (stage triggers, per-lead send-now, WhatsApp builder, etc.) so free
    users see a clear paywall message instead of a silent enqueue that
    then gets refused by the per-stage gate one layer deeper.
    """
    if not is_paid_plan_active(current_user):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "The lead-generation pipeline is a Pro / Enterprise feature. "
                "Upgrade your plan to run discovery, qualification, "
                "personalization, outreach, follow-ups, and per-lead sends."
            ),
        )
    return current_user
