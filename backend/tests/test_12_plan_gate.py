"""
Tests for the paid-plan gate that blocks free-tier users from running
pipeline jobs.

Covers every branch of the predicate:

* superuser bypass (regardless of plan/expiry)
* free plan rejected
* pro/enterprise with future expiry accepted
* pro/enterprise with past expiry rejected (real-time, no waiting on
  the nightly downgrade)
* pro/enterprise with NULL expiry accepted (grandfathered accounts)
* DB lookup failure for an unknown user_id rejected and cached

Plus the SQL predicate end-to-end against a temp SQLite DB so the
dispatcher's freelancer filter behaves the same as the per-user gate.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core import plan_gate
from app.core.plan_gate import (
    PAID_PLANS,
    invalidate_plan_cache,
    is_paid_plan_active,
    is_user_id_paid_plan_active,
    paid_plan_sql_predicate,
)
from app.models.user import User


def _user(**kw) -> User:
    """Build an in-memory User with sensible defaults — no DB I/O."""
    defaults = dict(
        id=1,
        email="x@example.com",
        role="freelancer",
        is_active=True,
        is_superuser=False,
        plan="free",
        plan_expires_at=None,
    )
    defaults.update(kw)
    u = User()
    for k, v in defaults.items():
        setattr(u, k, v)
    return u


# ── Sync predicate (already-loaded User) ────────────────────────────────────


def test_superuser_always_paid():
    assert is_paid_plan_active(_user(is_superuser=True, plan="free")) is True


def test_free_plan_rejected():
    assert is_paid_plan_active(_user(plan="free")) is False


def test_pro_with_future_expiry_accepted():
    future = datetime.now(timezone.utc) + timedelta(days=10)
    assert is_paid_plan_active(_user(plan="pro", plan_expires_at=future)) is True


def test_pro_with_past_expiry_rejected():
    """Real-time check — no waiting for the 02:00 IST downgrade sweep."""
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    assert is_paid_plan_active(_user(plan="pro", plan_expires_at=past)) is False


def test_enterprise_null_expiry_accepted():
    """Grandfathered accounts upgraded before billing webhook existed."""
    assert is_paid_plan_active(_user(plan="enterprise", plan_expires_at=None)) is True


def test_null_plan_rejected():
    """Sanity: a NULL plan column never grants access."""
    u = _user(plan="free")
    u.plan = None  # type: ignore[assignment]
    assert is_paid_plan_active(u) is False


def test_unknown_plan_rejected():
    """A typo in the plan column ('Pro', 'PRO', 'trial') must not slip through."""
    assert is_paid_plan_active(_user(plan="trial")) is False
    # Case-insensitive match (the helper lowercases) — 'PRO' is fine.
    assert is_paid_plan_active(_user(plan="PRO", plan_expires_at=None)) is True


def test_paid_plans_constant_locked_down():
    """If someone broadens PAID_PLANS this test forces a deliberate review."""
    assert PAID_PLANS == frozenset({"pro", "enterprise"})


# ── Cache invalidation ──────────────────────────────────────────────────────


def test_invalidate_plan_cache_clears_specific_user():
    plan_gate._plan_cache.update({1: (True, 0.0), 2: (False, 0.0)})
    invalidate_plan_cache(1)
    assert 1 not in plan_gate._plan_cache
    assert 2 in plan_gate._plan_cache


def test_invalidate_plan_cache_clears_all():
    plan_gate._plan_cache.update({1: (True, 0.0), 2: (False, 0.0)})
    invalidate_plan_cache(None)
    assert plan_gate._plan_cache == {}


# ── SQL predicate (real DB roundtrip via sqlite test fixture) ───────────────


@pytest.mark.asyncio
async def test_sql_predicate_filters_free_users(db_session):
    """``get_active_freelancers`` uses this predicate; verify it matches the
    sync helper for every combination."""
    now = datetime.now(timezone.utc)
    future = now + timedelta(days=30)
    past = now - timedelta(minutes=5)

    users = [
        User(id=10, email="free@x.com", role="freelancer", is_active=True,
             is_superuser=False, plan="free", plan_expires_at=None),
        User(id=11, email="pro@x.com", role="freelancer", is_active=True,
             is_superuser=False, plan="pro", plan_expires_at=future),
        User(id=12, email="expired@x.com", role="freelancer", is_active=True,
             is_superuser=False, plan="pro", plan_expires_at=past),
        User(id=13, email="grandfathered@x.com", role="freelancer", is_active=True,
             is_superuser=False, plan="enterprise", plan_expires_at=None),
        User(id=14, email="admin@x.com", role="freelancer", is_active=True,
             is_superuser=True, plan="free", plan_expires_at=None),
    ]
    for u in users:
        db_session.add(u)
    await db_session.commit()

    res = await db_session.execute(
        select(User.id).where(paid_plan_sql_predicate()).order_by(User.id)
    )
    allowed = [r[0] for r in res.all()]

    # Free + expired must be excluded; pro/enterprise/superuser pass.
    assert allowed == [11, 13, 14]


# ── Async DB lookup with cache ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_async_lookup_caches_and_invalidates(db_session, monkeypatch):
    """End-to-end: ``is_user_id_paid_plan_active`` reads, caches, and the
    cache invalidator forces a re-read after a plan change."""
    invalidate_plan_cache(None)  # clean slate

    # Patch get_session_maker so the helper uses the test sessionmaker.
    from app.core import database
    monkeypatch.setattr(
        "app.core.plan_gate.get_session_maker"
        if False else "app.core.database.get_session_maker",
        lambda: database._async_session_maker,
    )

    user = User(
        id=99, email="upgrade@x.com", role="freelancer", is_active=True,
        is_superuser=False, plan="free", plan_expires_at=None,
    )
    db_session.add(user)
    await db_session.commit()

    # Free → False, then cached.
    assert await is_user_id_paid_plan_active(99) is False
    assert 99 in plan_gate._plan_cache

    # Simulate upgrade in the DB.
    user.plan = "pro"
    user.plan_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    await db_session.commit()

    # Without invalidation we still read the stale cached False.
    assert await is_user_id_paid_plan_active(99) is False

    # After invalidation we see the upgrade immediately.
    invalidate_plan_cache(99)
    assert await is_user_id_paid_plan_active(99) is True


@pytest.mark.asyncio
async def test_unknown_user_id_rejected_and_cached(db_session, monkeypatch):
    """Stale user_ids (deleted account, fake input) never grant access."""
    invalidate_plan_cache(None)
    from app.core import database
    monkeypatch.setattr(
        "app.core.database.get_session_maker",
        lambda: database._async_session_maker,
    )

    assert await is_user_id_paid_plan_active(424242) is False
    # Cached so a brute-force probe doesn't hammer the DB.
    assert plan_gate._plan_cache.get(424242) == (False, plan_gate._plan_cache[424242][1])
