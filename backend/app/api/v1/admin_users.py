"""
Superuser-only User Administration API.

Endpoints for a platform operator to list every account and mutate the
three high-leverage fields (``plan``, ``role``, ``is_active``) plus the
``is_superuser`` flag.

Security model
--------------
Every route in this module is wrapped with ``get_current_active_superuser``
at the dependency level, so the API key + JWT must both resolve to a
superuser. Non-superuser callers get a 403 before any handler body
executes.

Safety rails enforced on every mutating route
---------------------------------------------
* **Self-lock** — a superuser cannot demote, deactivate, or strip their
  own privileges in a single request. Without this guard, a typo could
  permanently lock the operator out of the platform.
* **Last-admin protection** — the system always retains at least one
  active superuser. Attempting to demote or deactivate the last one
  returns 409.
* **Plan-gate cache invalidation** — every plan / role / active change
  invalidates the per-user entitlement cache in ``app.core.plan_gate``
  so the pipeline locks down (or unlocks) within milliseconds, not the
  30 s TTL.
* **Subscription sync** — downgrading to ``free`` marks the matching
  ``subscriptions`` row as ``cancelled`` so the billing dashboard
  reflects the change. Upgrading to ``pro``/``enterprise`` upserts an
  active row with a 30-day expiry. (Manual operator upgrades don't
  generate a Razorpay order — the ``Subscription`` row is the only
  audit trail for these.)
* **Role-flip side-effects** — promoting a user to ``freelancer``
  ensures their ``FreelancerPipelineConfig`` row exists so the
  scheduler can pick them up.
* **Audit logging** — every mutation writes a structured loguru entry
  with actor, target, and diff so the action is traceable.

Why no separate audit_log table
-------------------------------
A dedicated table is a bigger commitment (migration, retention policy,
admin UI). loguru records are sufficient for the typical "who changed
what" question and inherit the existing log shipping. If accountability
ever needs to be queryable from the app, promote this to a real table
later — the call sites already produce structured records.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select

from app.api.deps import get_current_active_superuser
from app.core.audit_log import record_admin_action
from app.core.database import get_session_maker
from app.core.job_manager import job_manager
from app.core.plan_gate import PAID_PLANS, invalidate_plan_cache
from app.models.subscription import Subscription
from app.models.user import User


router = APIRouter(prefix="/admin/users", dependencies=[Depends(get_current_active_superuser)])


# ── Schemas ────────────────────────────────────────────────────────────────

PlanLiteral = Literal["free", "pro", "enterprise"]
RoleLiteral = Literal["client", "freelancer"]


class AdminUserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    plan: str
    plan_expires_at: Optional[datetime] = None
    is_active: bool
    is_superuser: bool
    auth_provider: Optional[str] = None
    avatar_url: Optional[str] = None
    supabase_uid: Optional[str] = None
    # Effective entitlement — what the plan-gate would currently
    # return. Computed server-side so the UI shows a single source of
    # truth instead of duplicating the rule in JS.
    paid_plan_active: bool


class AdminUserListOut(BaseModel):
    items: list[AdminUserOut]
    total: int
    page: int
    limit: int


class ChangePlanRequest(BaseModel):
    plan: PlanLiteral
    # Optional override; defaults to ``now + 30 days`` for paid plans
    # and NULL for free. Useful when an operator wants to gift a 90-day
    # comp or extend an existing paid period.
    expires_at: Optional[datetime] = Field(
        default=None,
        description="UTC expiry. Ignored for free plan (forced to NULL).",
    )


class ChangeRoleRequest(BaseModel):
    role: RoleLiteral


class ChangeActiveRequest(BaseModel):
    is_active: bool


class ChangeSuperuserRequest(BaseModel):
    is_superuser: bool


# ── Helpers ────────────────────────────────────────────────────────────────


def _to_out(u: User) -> AdminUserOut:
    """Serialise a User row + compute the effective paid-plan flag."""
    plan = (u.plan or "free").lower()
    expires_at = u.plan_expires_at
    if u.is_superuser:
        paid_active = True
    elif plan not in PAID_PLANS:
        paid_active = False
    elif expires_at is None:
        paid_active = True
    else:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        paid_active = expires_at > datetime.now(timezone.utc)

    return AdminUserOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=u.role or "freelancer",
        plan=plan,
        plan_expires_at=u.plan_expires_at,
        is_active=bool(u.is_active),
        is_superuser=bool(u.is_superuser),
        auth_provider=u.auth_provider,
        avatar_url=u.avatar_url,
        supabase_uid=u.supabase_uid,
        paid_plan_active=paid_active,
    )


async def _load_target(db, user_id: int) -> User:
    """Fetch the target row or 404. Centralised so every mutator handler
    fails the same way for missing ids."""
    res = await db.execute(select(User).where(User.id == user_id))
    target = res.scalars().first()
    if target is None:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    return target


async def _count_active_superusers(db) -> int:
    """How many active superusers does the platform still have?
    Used by the last-admin guard so an operator can never demote /
    deactivate the only remaining root account."""
    return (
        await db.scalar(
            select(func.count(User.id)).where(
                User.is_superuser == True,  # noqa: E712
                User.is_active == True,  # noqa: E712
            )
        )
    ) or 0


def _forbid_self_mutation(current: User, target: User, what: str) -> None:
    """Block a superuser from editing their own ``plan`` / ``role`` /
    ``is_active`` / ``is_superuser``. The user can still adjust their
    own profile via the regular ``/profile/me`` endpoints — what this
    blocks is administrative actions that could lock the platform out.

    A *second* superuser can perform the action on this user; the goal
    is to prevent a single accidental click from a logged-in admin
    nuking their own access.
    """
    if current.id == target.id:
        raise HTTPException(
            status_code=409,
            detail=(
                f"You cannot change your own {what}. Ask another superuser "
                "to make this change, or use the appropriate self-service "
                "endpoint."
            ),
        )


async def _sync_subscription_for_plan_change(
    db, target: User, new_plan: str, new_expires_at: Optional[datetime]
) -> None:
    """Keep the ``subscriptions`` table consistent with an operator
    plan change so the user's billing page tells the truth.

    ``free``  → mark any existing row as ``cancelled``/expired at ``now``.
    ``pro``/``enterprise`` → upsert an ``active`` row with the new period.
    """
    res = await db.execute(select(Subscription).where(Subscription.user_id == target.id))
    sub = res.scalars().first()
    now = datetime.now(timezone.utc)

    if new_plan == "free":
        if sub:
            sub.status = "expired"
            sub.cancelled_at = sub.cancelled_at or now
            sub.updated_at = now
        return

    # Paid plan — upsert
    if sub is None:
        sub = Subscription(
            user_id=target.id,
            plan=new_plan,
            status="active",
            current_period_start=now,
            current_period_end=new_expires_at,
        )
        db.add(sub)
    else:
        sub.plan = new_plan
        sub.status = "active"
        sub.current_period_start = sub.current_period_start or now
        sub.current_period_end = new_expires_at
        sub.cancelled_at = None
        sub.updated_at = now


# ── Read routes ────────────────────────────────────────────────────────────


@router.get("", response_model=AdminUserListOut)
async def list_users(
    q: Optional[str] = None,
    role: Optional[RoleLiteral] = None,
    plan: Optional[PlanLiteral] = None,
    is_active: Optional[bool] = None,
    is_superuser: Optional[bool] = None,
    page: int = 1,
    limit: int = 50,
) -> AdminUserListOut:
    """Paginated list with optional filters.

    Server-side filtering keeps the wire small even on accounts with
    thousands of users. The ``q`` search is case-insensitive across
    ``email`` and ``full_name``.
    """
    # Range validation — duplicated here so the function can be called
    # directly (tests, internal callers) without FastAPI's Query()
    # validators in front of it.
    page = max(1, int(page))
    limit = max(1, min(200, int(limit)))

    async with get_session_maker()() as db:
        base = select(User)
        conds = []
        if q:
            like = f"%{q.lower()}%"
            conds.append(
                or_(
                    func.lower(User.email).like(like),
                    func.lower(func.coalesce(User.full_name, "")).like(like),
                )
            )
        if role is not None:
            conds.append(User.role == role)
        if plan is not None:
            conds.append(User.plan == plan)
        if is_active is not None:
            conds.append(User.is_active == is_active)
        if is_superuser is not None:
            conds.append(User.is_superuser == is_superuser)
        if conds:
            base = base.where(and_(*conds))

        total = (
            await db.scalar(select(func.count()).select_from(base.subquery()))
        ) or 0

        rows = (
            await db.execute(
                base.order_by(User.id.asc()).offset((page - 1) * limit).limit(limit)
            )
        ).scalars().all()

        return AdminUserListOut(
            items=[_to_out(u) for u in rows],
            total=total,
            page=page,
            limit=limit,
        )


@router.get("/{user_id}", response_model=AdminUserOut)
async def get_user(user_id: int) -> AdminUserOut:
    async with get_session_maker()() as db:
        u = await _load_target(db, user_id)
        return _to_out(u)


# ── Mutating routes ────────────────────────────────────────────────────────


@router.patch("/{user_id}/plan", response_model=AdminUserOut)
async def change_plan(
    user_id: int,
    body: ChangePlanRequest = Body(...),
    request: Request = None,  # type: ignore[assignment]
    current: User = Depends(get_current_active_superuser),
) -> AdminUserOut:
    """Set the target's ``plan`` (and ``plan_expires_at``).

    ``free``  → ``plan_expires_at`` is forced to NULL and the matching
                subscription is marked expired.
    ``pro``/``enterprise`` → ``plan_expires_at`` defaults to ``now+30d``
                              if the caller doesn't specify, or honours
                              the requested ``expires_at`` (must be in
                              the future).

    Side-effects:
      * ``subscriptions`` row upsert / cancellation.
      * ``invalidate_plan_cache(target.id)`` so the pipeline gates
        re-read on the next call.
    """
    new_plan = body.plan

    async with get_session_maker()() as db:
        target = await _load_target(db, user_id)
        # Self-check against the freshly-loaded row.
        _forbid_self_mutation(current, target, "plan")

        if new_plan == "free":
            new_expires = None
        else:
            new_expires = body.expires_at or (datetime.now(timezone.utc) + timedelta(days=30))
            if new_expires.tzinfo is None:
                new_expires = new_expires.replace(tzinfo=timezone.utc)
            if new_expires <= datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=422,
                    detail="expires_at must be in the future for paid plans",
                )

        old_plan = (target.plan or "free").lower()
        target.plan = new_plan
        target.plan_expires_at = new_expires

        await _sync_subscription_for_plan_change(db, target, new_plan, new_expires)
        await db.commit()
        await db.refresh(target)

    invalidate_plan_cache(target.id)
    await record_admin_action(
        action="plan_change",
        actor=current,
        target=target,
        old_value=old_plan,
        new_value=new_plan,
        metadata={"expires_at": new_expires.isoformat() if new_expires else None},
        request=request,
    )
    return _to_out(target)


@router.patch("/{user_id}/role", response_model=AdminUserOut)
async def change_role(
    user_id: int,
    body: ChangeRoleRequest = Body(...),
    request: Request = None,  # type: ignore[assignment]
    current: User = Depends(get_current_active_superuser),
) -> AdminUserOut:
    """Flip ``role`` between ``freelancer`` and ``client``.

    Promoting to ``freelancer`` ensures a ``FreelancerPipelineConfig``
    row exists so the scheduler can pick the user up (subject to plan
    gate). Demoting to ``client`` doesn't delete the row — that would
    lose the freelancer's HOLD state if they ever get promoted back.
    """
    async with get_session_maker()() as db:
        target = await _load_target(db, user_id)
        _forbid_self_mutation(current, target, "role")

        old_role = target.role or "freelancer"
        if old_role == body.role:
            # No-op; return current state without a redundant write.
            return _to_out(target)

        target.role = body.role
        await db.commit()
        await db.refresh(target)

        # When promoting to freelancer, make sure the pipeline config
        # exists so the scheduler can find them. Wrapped in try so an
        # ensure-config failure doesn't roll back the role change —
        # the next scheduler tick would lazily create the row anyway.
        if body.role == "freelancer":
            try:
                await job_manager.ensure_freelancer_config(target.id)
            except Exception as e:
                logger.warning(
                    f"ensure_freelancer_config failed for user {target.id} "
                    f"during role promotion: {e}"
                )

    # Plan-gate cache is keyed on user_id and reads is_superuser + plan,
    # so a role flip doesn't directly invalidate it. But invalidate
    # anyway as a belt-and-braces measure — the next gate call refreshes
    # cheaply.
    invalidate_plan_cache(target.id)
    await record_admin_action(
        action="role_change",
        actor=current,
        target=target,
        old_value=old_role,
        new_value=body.role,
        request=request,
    )
    return _to_out(target)


@router.patch("/{user_id}/active", response_model=AdminUserOut)
async def change_active(
    user_id: int,
    body: ChangeActiveRequest = Body(...),
    request: Request = None,  # type: ignore[assignment]
    current: User = Depends(get_current_active_superuser),
) -> AdminUserOut:
    """Soft-suspend or restore an account.

    Deactivated users are rejected at the auth layer
    (``get_current_user``) so all their tokens stop working
    immediately. The pipeline dispatcher also filters them out
    (``get_active_freelancers`` requires ``is_active=TRUE``).

    Guards:
      * Cannot deactivate self.
      * Cannot deactivate the last remaining active superuser.
    """
    async with get_session_maker()() as db:
        target = await _load_target(db, user_id)

        if not body.is_active:
            _forbid_self_mutation(current, target, "active status")
            if target.is_superuser:
                remaining = await _count_active_superusers(db)
                # If this user is currently counted as active, deactivating
                # would drop the total by 1. Block when that would zero it.
                if target.is_active and remaining <= 1:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Cannot deactivate the last active superuser. "
                            "Promote another account first."
                        ),
                    )

        if target.is_active == body.is_active:
            return _to_out(target)

        old_state = target.is_active
        target.is_active = body.is_active
        await db.commit()
        await db.refresh(target)

    invalidate_plan_cache(target.id)
    await record_admin_action(
        action="active_change",
        actor=current,
        target=target,
        old_value=old_state,
        new_value=body.is_active,
        request=request,
    )
    return _to_out(target)


@router.patch("/{user_id}/superuser", response_model=AdminUserOut)
async def change_superuser(
    user_id: int,
    body: ChangeSuperuserRequest = Body(...),
    request: Request = None,  # type: ignore[assignment]
    current: User = Depends(get_current_active_superuser),
) -> AdminUserOut:
    """Grant or revoke the superuser flag.

    Guards:
      * Cannot revoke own superuser flag.
      * Cannot revoke the flag from the last remaining active
        superuser.
    """
    async with get_session_maker()() as db:
        target = await _load_target(db, user_id)

        if not body.is_superuser:
            _forbid_self_mutation(current, target, "superuser status")
            if target.is_superuser:
                remaining = await _count_active_superusers(db)
                if remaining <= 1:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Cannot revoke the last active superuser. "
                            "Promote another account first."
                        ),
                    )

        if bool(target.is_superuser) == bool(body.is_superuser):
            return _to_out(target)

        old_state = target.is_superuser
        target.is_superuser = body.is_superuser
        await db.commit()
        await db.refresh(target)

    invalidate_plan_cache(target.id)
    await record_admin_action(
        action="superuser_change",
        actor=current,
        target=target,
        old_value=bool(old_state),
        new_value=bool(body.is_superuser),
        request=request,
    )
    return _to_out(target)


