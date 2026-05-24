"""
Tests for the audit log subsystem.

Three concerns covered:

1. **Writer** — ``record_admin_action`` persists exactly one row with
   the expected fields, masks nothing, and never raises (fail-open).

2. **Wiring** — every mutator in ``admin_users`` produces one audit
   row per successful change and zero rows for no-op / rejected
   requests.

3. **Reader access scoping** — the security boundary.

   * A superuser sees everything; filters honoured as supplied.
   * A non-superuser only sees rows where ``target_user_id`` matches
     their own id; their filter params are silently overridden so
     they cannot probe another user's history.
   * Actor identity is masked for non-superusers (shown as
     ``"Administrator"``, no id, no IP / UA leakage).
   * Unauthorised access to a specific row returns 404, not 403, so
     row existence is not leaked.
"""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.v1.admin_users import (
    ChangeActiveRequest,
    ChangePlanRequest,
    ChangeRoleRequest,
    ChangeSuperuserRequest,
    change_active,
    change_plan,
    change_role,
    change_superuser,
)
from app.api.v1.audit_logs import (
    get_audit_log,
    list_actions,
    list_audit_logs,
)
from app.core import plan_gate
from app.core.audit_log import (
    ALLOWED_ACTIONS,
    record_admin_action,
)
from app.models.admin_audit_log import AdminAuditLog
from app.models.user import User


# ── Fixtures ──────────────────────────────────────────────────────────────


def _seed_user(
    db_session,
    *,
    id: int,
    email: str,
    role: str = "freelancer",
    plan: str = "free",
    is_active: bool = True,
    is_superuser: bool = False,
) -> User:
    u = User(
        id=id,
        email=email,
        role=role,
        plan=plan,
        is_active=is_active,
        is_superuser=is_superuser,
    )
    db_session.add(u)
    return u


@pytest.fixture(autouse=True)
def _wire_session_makers(monkeypatch, db_session):
    """Force every admin + audit handler + writer to use the test DB."""
    from app.core import database
    monkeypatch.setattr(
        "app.api.v1.admin_users.get_session_maker",
        lambda: database._async_session_maker,
    )
    monkeypatch.setattr(
        "app.api.v1.audit_logs.get_session_maker",
        lambda: database._async_session_maker,
    )
    monkeypatch.setattr(
        "app.core.audit_log.get_session_maker",
        lambda: database._async_session_maker,
    )
    plan_gate.invalidate_plan_cache(None)
    yield


async def _count_logs(db_session) -> int:
    return (await db_session.scalar(select(AdminAuditLog).with_only_columns(AdminAuditLog.id))) is not None and (
        await db_session.scalar(
            select(__import__("sqlalchemy").func.count(AdminAuditLog.id))
        )
    ) or 0


async def _all_logs(db_session) -> list[AdminAuditLog]:
    return (
        await db_session.execute(select(AdminAuditLog).order_by(AdminAuditLog.id))
    ).scalars().all()


# ── Writer ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_writer_persists_row_with_all_fields(db_session):
    actor = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    target = _seed_user(db_session, id=2, email="bob@x.com")
    await db_session.commit()

    await record_admin_action(
        action="plan_change",
        actor=actor,
        target=target,
        old_value="free",
        new_value="pro",
        metadata={"expires_at": "2026-06-01T00:00:00+00:00"},
    )

    rows = await _all_logs(db_session)
    assert len(rows) == 1
    row = rows[0]
    assert row.action == "plan_change"
    assert row.actor_user_id == actor.id
    assert row.actor_email == actor.email
    assert row.target_user_id == target.id
    assert row.target_email == target.email
    assert row.old_value == "free"
    assert row.new_value == "pro"
    assert row.metadata_json == {"expires_at": "2026-06-01T00:00:00+00:00"}
    assert row.created_at is not None


@pytest.mark.asyncio
async def test_writer_never_raises_on_db_error(db_session, monkeypatch):
    """Audit failures must never roll back the calling mutation."""
    actor = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    target = _seed_user(db_session, id=2, email="t@x.com")
    await db_session.commit()

    class _Boom:
        def __call__(self):
            raise RuntimeError("DB down")

    monkeypatch.setattr("app.core.audit_log.get_session_maker", _Boom())
    # Should not raise.
    await record_admin_action(
        action="plan_change", actor=actor, target=target,
        old_value="free", new_value="pro",
    )


@pytest.mark.asyncio
async def test_writer_renders_bool_as_lowercase(db_session):
    actor = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    target = _seed_user(db_session, id=2, email="t@x.com")
    await db_session.commit()

    await record_admin_action(
        action="active_change", actor=actor, target=target,
        old_value=True, new_value=False,
    )
    rows = await _all_logs(db_session)
    assert rows[-1].old_value == "true"
    assert rows[-1].new_value == "false"


@pytest.mark.asyncio
async def test_meta_endpoint_returns_allowed_actions():
    """The FE filter dropdown reads from this endpoint."""
    out = await list_actions()
    assert set(out) == ALLOWED_ACTIONS


# ── Mutator integration: one log per successful change, zero on no-op ─────


@pytest.mark.asyncio
async def test_plan_change_writes_one_audit_row(db_session):
    actor = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    target = _seed_user(db_session, id=2, email="t@x.com", plan="free")
    await db_session.commit()

    await change_plan(target.id, ChangePlanRequest(plan="pro"), current=actor)

    logs = await _all_logs(db_session)
    assert len(logs) == 1
    assert logs[0].action == "plan_change"
    assert logs[0].new_value == "pro"
    assert logs[0].old_value == "free"


@pytest.mark.asyncio
async def test_role_noop_writes_no_audit_row(db_session):
    """No state change → no audit row. Prevents log spam from idempotent calls."""
    actor = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    target = _seed_user(db_session, id=2, email="t@x.com", role="freelancer")
    await db_session.commit()

    await change_role(target.id, ChangeRoleRequest(role="freelancer"), current=actor)

    logs = await _all_logs(db_session)
    assert len(logs) == 0


@pytest.mark.asyncio
async def test_active_noop_writes_no_audit_row(db_session):
    actor = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    target = _seed_user(db_session, id=2, email="t@x.com", is_active=True)
    await db_session.commit()

    await change_active(target.id, ChangeActiveRequest(is_active=True), current=actor)

    logs = await _all_logs(db_session)
    assert len(logs) == 0


@pytest.mark.asyncio
async def test_each_mutator_emits_correct_action_name(db_session):
    actor = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    target = _seed_user(
        db_session, id=2, email="t@x.com", plan="free", role="freelancer",
        is_active=True, is_superuser=False,
    )
    await db_session.commit()

    await change_plan(target.id, ChangePlanRequest(plan="pro"), current=actor)
    await change_role(target.id, ChangeRoleRequest(role="client"), current=actor)
    await change_active(target.id, ChangeActiveRequest(is_active=False), current=actor)
    await change_superuser(target.id, ChangeSuperuserRequest(is_superuser=True), current=actor)

    actions = [r.action for r in await _all_logs(db_session)]
    assert actions == ["plan_change", "role_change", "active_change", "superuser_change"]


@pytest.mark.asyncio
async def test_failed_mutation_writes_no_audit_row(db_session):
    """Self-lock rejection must not produce an audit row — the action
    never actually happened."""
    actor = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    await db_session.commit()

    with pytest.raises(HTTPException):
        await change_plan(actor.id, ChangePlanRequest(plan="free"), current=actor)

    logs = await _all_logs(db_session)
    assert len(logs) == 0


# ── Reader access scoping (the security boundary) ─────────────────────────


@pytest.mark.asyncio
async def test_superuser_sees_all_rows(db_session):
    admin = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    bob = _seed_user(db_session, id=2, email="bob@x.com")
    alice = _seed_user(db_session, id=3, email="alice@x.com")
    await db_session.commit()

    await change_plan(bob.id, ChangePlanRequest(plan="pro"), current=admin)
    await change_plan(alice.id, ChangePlanRequest(plan="enterprise"), current=admin)

    out = await list_audit_logs(current_user=admin)
    targets = {row.target_user_id for row in out.items}
    assert targets == {bob.id, alice.id}
    # Actor identity preserved for superuser.
    assert all(row.actor_email == admin.email for row in out.items)


@pytest.mark.asyncio
async def test_non_superuser_sees_only_own_target_rows(db_session):
    """Hard isolation: a freelancer can only see logs whose target is themself."""
    admin = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    bob = _seed_user(db_session, id=2, email="bob@x.com")
    alice = _seed_user(db_session, id=3, email="alice@x.com")
    await db_session.commit()

    await change_plan(bob.id, ChangePlanRequest(plan="pro"), current=admin)
    await change_plan(alice.id, ChangePlanRequest(plan="enterprise"), current=admin)

    out = await list_audit_logs(current_user=bob)
    assert {row.target_user_id for row in out.items} == {bob.id}
    assert out.total == 1


@pytest.mark.asyncio
async def test_non_superuser_filter_injection_is_silently_dropped(db_session):
    """If a freelancer passes ``target_user_id=<other>``, the handler
    must ignore it — they only ever see their own scope."""
    admin = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    bob = _seed_user(db_session, id=2, email="bob@x.com")
    alice = _seed_user(db_session, id=3, email="alice@x.com")
    await db_session.commit()

    await change_plan(alice.id, ChangePlanRequest(plan="pro"), current=admin)

    # Bob tries to peek at Alice's logs — must collapse to bob's empty scope.
    out = await list_audit_logs(
        target_user_id=alice.id,
        actor_user_id=admin.id,
        current_user=bob,
    )
    assert out.total == 0
    assert out.items == []


@pytest.mark.asyncio
async def test_actor_masked_for_non_superuser(db_session):
    admin = _seed_user(db_session, id=1, email="secret-admin@x.com", is_superuser=True)
    bob = _seed_user(db_session, id=2, email="bob@x.com")
    await db_session.commit()

    await change_plan(bob.id, ChangePlanRequest(plan="pro"), current=admin)

    out = await list_audit_logs(current_user=bob)
    assert len(out.items) == 1
    row = out.items[0]
    # Mask in effect — Bob never learns which admin acted.
    assert row.actor_email == "Administrator"
    assert row.actor_user_id is None
    assert row.ip_address is None
    assert row.user_agent is None


@pytest.mark.asyncio
async def test_get_one_returns_404_for_cross_user(db_session):
    """Existence of another user's log row must NOT be leaked via 403."""
    admin = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    bob = _seed_user(db_session, id=2, email="bob@x.com")
    alice = _seed_user(db_session, id=3, email="alice@x.com")
    await db_session.commit()

    await change_plan(alice.id, ChangePlanRequest(plan="pro"), current=admin)
    rows = await _all_logs(db_session)
    alice_log_id = rows[-1].id

    # Bob tries to GET Alice's log by id — must 404, not 403.
    with pytest.raises(HTTPException) as exc:
        await get_audit_log(alice_log_id, current_user=bob)
    assert exc.value.status_code == 404

    # Same row, fetched as Alice — visible.
    out = await get_audit_log(alice_log_id, current_user=alice)
    assert out.id == alice_log_id
    # Alice sees her own log but actor still masked (she's not super).
    assert out.actor_email == "Administrator"


@pytest.mark.asyncio
async def test_action_filter_works_for_both_tiers(db_session):
    admin = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    bob = _seed_user(db_session, id=2, email="bob@x.com")
    await db_session.commit()

    await change_plan(bob.id, ChangePlanRequest(plan="pro"), current=admin)
    await change_role(bob.id, ChangeRoleRequest(role="client"), current=admin)
    await change_role(bob.id, ChangeRoleRequest(role="freelancer"), current=admin)

    # Superuser filters
    out_admin = await list_audit_logs(action="plan_change", current_user=admin)
    assert {r.action for r in out_admin.items} == {"plan_change"}
    assert out_admin.total == 1

    # Non-superuser filters work too within their scope
    out_bob = await list_audit_logs(action="role_change", current_user=bob)
    assert {r.action for r in out_bob.items} == {"role_change"}
    assert out_bob.total == 2


@pytest.mark.asyncio
async def test_pagination(db_session):
    admin = _seed_user(db_session, id=1, email="root@x.com", is_superuser=True)
    bob = _seed_user(db_session, id=2, email="bob@x.com", plan="free")
    await db_session.commit()

    # Generate 5 audit rows (flip plan back and forth).
    for i, p in enumerate(["pro", "free", "enterprise", "free", "pro"]):
        await change_plan(bob.id, ChangePlanRequest(plan=p), current=admin)

    page1 = await list_audit_logs(limit=2, page=1, current_user=admin)
    page2 = await list_audit_logs(limit=2, page=2, current_user=admin)
    page3 = await list_audit_logs(limit=2, page=3, current_user=admin)

    assert page1.total == page2.total == page3.total == 5
    assert len(page1.items) == 2
    assert len(page2.items) == 2
    assert len(page3.items) == 1
    # No overlap across pages.
    seen = {r.id for r in page1.items} | {r.id for r in page2.items} | {r.id for r in page3.items}
    assert len(seen) == 5
