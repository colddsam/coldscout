"""
Audit-log writer.

Single entry point for recording superuser actions to the
``admin_audit_logs`` table. The recorder is **fail-open** by design —
audit logging is observability, not correctness. If the DB write
fails (Postgres blip, schema drift, etc.) the calling mutation
already committed and must not be rolled back; we drop a loguru
warning instead so the action still surfaces somewhere.

Each call also emits a structured ``logger.info`` line so the
existing log-shipping pipeline keeps producing audit records even if
the DB row is missing.

The recorder opens its own short-lived session rather than reusing
the caller's session. This makes the writer safe to call from any
async context (handler, background task, even from inside a session
that has already committed and been closed) without leaking session
state or accidentally enlisting the audit row in someone else's
transaction.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import Request
from loguru import logger

from app.core.database import get_session_maker
from app.models.admin_audit_log import AdminAuditLog
from app.models.user import User


# ── Action vocabulary ─────────────────────────────────────────────────────

# Keep this list in sync with the AdminAction Literal type below and the
# audit_logs API's filter validator. If you add an action here, add a
# matching mutator in admin_users.py and surface it in the FE filter.
ALLOWED_ACTIONS = frozenset({
    "plan_change",
    "role_change",
    "active_change",
    "superuser_change",
})


def _safe_str(value: Any) -> Optional[str]:
    """Render an arbitrary value to a short, human-friendly string.

    Scalars stringified directly; non-scalars JSON-encoded. Bool is
    forced to ``"true"`` / ``"false"`` (lowercased) so a downstream
    grep matches cleanly.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float, str)):
        return str(value)
    try:
        return json.dumps(value, default=str)
    except (TypeError, ValueError):
        return repr(value)[:255]


def _client_context(request: Optional[Request]) -> tuple[Optional[str], Optional[str]]:
    """Pull (IP, user-agent) from a FastAPI Request if one was provided.

    These columns are nullable — when the audit writer is called from a
    background task that has no request, both stay NULL and the row is
    still valid.

    IP resolution honours ``X-Forwarded-For`` (left-most, first hop) so
    deployments behind a proxy / load balancer record the actual client
    IP instead of the proxy. Falls back to ``request.client.host``.
    """
    if request is None:
        return None, None
    ip: Optional[str] = None
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # ``X-Forwarded-For: client, proxy1, proxy2`` — first hop is the
        # client. Trim aggressively in case the header is bogus.
        ip = xff.split(",")[0].strip()[:64]
    elif request.client is not None:
        ip = request.client.host[:64]
    ua = request.headers.get("user-agent")
    if ua:
        ua = ua[:512]
    return ip, ua


async def record_admin_action(
    *,
    action: str,
    actor: User,
    target: User,
    old_value: Any = None,
    new_value: Any = None,
    metadata: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
) -> None:
    """Append a row to ``admin_audit_logs``.

    Args:
        action: One of ``ALLOWED_ACTIONS``. An unknown action is logged
                as a warning and the row is still written (we'd rather
                have an unknown action recorded than swallow it).
        actor:  The User who performed the action. Required — we don't
                accept anonymous audit rows.
        target: The User whose record was changed. Required.
        old_value / new_value: The before/after values for the field
                that changed (e.g. ``"free"`` → ``"pro"``). Stringified
                to a stable representation.
        metadata: Free-form dict for action-specific context (e.g.
                ``{"expires_at": ...}`` on plan changes).
        request: FastAPI request for IP / UA capture. Optional.

    Returns:
        None. The function never raises — DB errors are logged and
        swallowed so the caller's mutation isn't rolled back.
    """
    if action not in ALLOWED_ACTIONS:
        logger.warning(f"audit_log: unknown action '{action}' — recording anyway")

    ip, ua = _client_context(request)

    # Always emit the structured log line first so we have a record
    # even if the DB write fails.
    logger.info(
        "AUDIT action=%s actor=%s(%s) target=%s(%s) %s -> %s metadata=%s",
        action,
        actor.email,
        actor.id,
        target.email,
        target.id,
        _safe_str(old_value),
        _safe_str(new_value),
        metadata,
    )

    try:
        async with get_session_maker()() as db:
            row = AdminAuditLog(
                actor_user_id=actor.id,
                actor_email=actor.email,
                target_user_id=target.id,
                target_email=target.email,
                action=action,
                old_value=_safe_str(old_value),
                new_value=_safe_str(new_value),
                metadata_json=metadata,
                ip_address=ip,
                user_agent=ua,
            )
            db.add(row)
            await db.commit()
    except Exception as e:
        # Fail-open: never raise from the audit writer. The original
        # mutation already committed; we just lost the row. The
        # loguru line above is still in the log stream.
        logger.warning(f"audit_log: failed to persist row: {e}")
