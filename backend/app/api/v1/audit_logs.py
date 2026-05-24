"""
Audit Log read API.

Two visibility tiers, enforced in SQL so a bug in the handler cannot
leak rows across the boundary:

* **Superuser** — sees every row. Can filter by ``target_user_id``,
  ``actor_user_id``, ``action``, and a date range. Receives the full
  actor identity (email + id).
* **Authenticated non-superuser** — sees ONLY rows where
  ``target_user_id == current_user.id``. Any ``actor_user_id`` /
  ``target_user_id`` filter passed by a non-superuser is **ignored**
  (not 403'd — the filter just collapses to the per-user scope) so
  the caller can't probe whether another user has any audit history.
  The actor's email and id are **masked** before serialisation; the
  caller learns "an administrator changed your plan", not which one.

  Why masking matters: an authenticated user knowing exactly which
  operator suspended them creates a harassment vector and leaks
  operational reconnaissance ("admin X is the one who handles
  refunds"). Replacing the identifier with "Administrator" preserves
  the user's right to know *what* happened to their account without
  exposing internal personnel.

* **Anonymous** — 403 via the standard API key gate; never reaches
  this module.

Unauthorised access to a specific row returns **404, not 403**, so
the existence of the row is not leaked across the boundary.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, func, select

from app.api.deps import get_current_user
from app.core.database import get_session_maker
from app.core.audit_log import ALLOWED_ACTIONS
from app.models.admin_audit_log import AdminAuditLog
from app.models.user import User


router = APIRouter(prefix="/audit-logs")


ActionLiteral = Literal["plan_change", "role_change", "active_change", "superuser_change"]


# ── Schemas ────────────────────────────────────────────────────────────────


class AuditLogOut(BaseModel):
    id: int
    action: str
    actor_user_id: Optional[int]
    actor_email: Optional[str]
    target_user_id: Optional[int]
    target_email: Optional[str]
    old_value: Optional[str]
    new_value: Optional[str]
    metadata: Optional[dict]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime


class AuditLogListOut(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    limit: int


# ── Serialiser with actor masking ──────────────────────────────────────────


def _serialize(row: AdminAuditLog, *, mask_actor: bool) -> AuditLogOut:
    return AuditLogOut(
        id=row.id,
        action=row.action,
        actor_user_id=None if mask_actor else row.actor_user_id,
        actor_email="Administrator" if mask_actor else row.actor_email,
        target_user_id=row.target_user_id,
        target_email=row.target_email,
        old_value=row.old_value,
        new_value=row.new_value,
        metadata=row.metadata_json,
        # IP / UA are operational forensics — never reveal them to a
        # non-superuser even for their own log entries.
        ip_address=None if mask_actor else row.ip_address,
        user_agent=None if mask_actor else row.user_agent,
        created_at=row.created_at,
    )


# ── List ───────────────────────────────────────────────────────────────────


@router.get("", response_model=AuditLogListOut)
async def list_audit_logs(
    action: Optional[ActionLiteral] = None,
    target_user_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    page: int = 1,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
) -> AuditLogListOut:
    """Paginated audit log.

    Scoping precedence:
      * Superuser → all rows, filters honoured as supplied.
      * Otherwise → ``WHERE target_user_id = current_user.id``. Caller's
        own ``target_user_id`` / ``actor_user_id`` filters are silently
        discarded (the user is locked to their own scope).
    """
    is_super = bool(current_user.is_superuser)

    # Same range guard as admin_users — the function is callable
    # directly (tests, internal helpers) without FastAPI's Query()
    # validators in front of it.
    page = max(1, int(page))
    limit = max(1, min(200, int(limit)))

    conds = []
    if is_super:
        if target_user_id is not None:
            conds.append(AdminAuditLog.target_user_id == target_user_id)
        if actor_user_id is not None:
            conds.append(AdminAuditLog.actor_user_id == actor_user_id)
    else:
        # Hard-lock to the caller's own scope. Filters passed by a
        # non-superuser are ignored — see module docstring for why.
        conds.append(AdminAuditLog.target_user_id == current_user.id)

    if action is not None:
        conds.append(AdminAuditLog.action == action)
    if since is not None:
        conds.append(AdminAuditLog.created_at >= since)
    if until is not None:
        conds.append(AdminAuditLog.created_at <= until)

    base = select(AdminAuditLog)
    if conds:
        base = base.where(and_(*conds))

    async with get_session_maker()() as db:
        total = (
            await db.scalar(select(func.count()).select_from(base.subquery()))
        ) or 0
        rows = (
            await db.execute(
                base.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        ).scalars().all()

    return AuditLogListOut(
        items=[_serialize(r, mask_actor=not is_super) for r in rows],
        total=total,
        page=page,
        limit=limit,
    )


# ── Get one ────────────────────────────────────────────────────────────────


@router.get("/{log_id}", response_model=AuditLogOut)
async def get_audit_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
) -> AuditLogOut:
    """Single audit row.

    Non-superuser callers get 404 (NOT 403) for any row that isn't
    targeting them. 404 hides the row's existence — 403 would confirm
    that a log with that id exists, leaking information across the
    boundary.
    """
    async with get_session_maker()() as db:
        row = (
            await db.execute(select(AdminAuditLog).where(AdminAuditLog.id == log_id))
        ).scalars().first()

    if row is None:
        raise HTTPException(status_code=404, detail="Audit log not found")

    if not current_user.is_superuser and row.target_user_id != current_user.id:
        # Pretend the row doesn't exist — same 404 a real miss would
        # produce. No timing side-channel.
        raise HTTPException(status_code=404, detail="Audit log not found")

    return _serialize(row, mask_actor=not bool(current_user.is_superuser))


# ── Allowed action enum (exposed for FE filter validation) ────────────────


@router.get("/meta/actions", response_model=list[str])
async def list_actions() -> list[str]:
    """Allowed values for the ``action`` filter. Drives the FE filter
    dropdown so it never drifts from the backend's vocabulary."""
    return sorted(ALLOWED_ACTIONS)
