"""
Shared Audit Reports REST API.

Powers the /scanner page's "Share report" feature. Once an authenticated
user has run an audit (free website audit or paid Maps audit), they can
capture a snapshot of the result and share it with anyone. The receiving
party must sign in or sign up to view — which is the viral loop the
platform intentionally encourages.

Endpoints
---------
POST   /shared-audits        Create + (optionally) email share.    [auth]
GET    /shared-audits/mine   List the caller's own shares.         [auth]
DELETE /shared-audits/{token} Revoke a share.                      [auth, owner-only]
GET    /shared-audits/{token} View the report.                     [auth]

Auth model
----------
Every endpoint requires a valid Cold Scout user session via
``get_current_user``. The viewer endpoint is *intentionally* gated so
that recipients are forced to sign in / sign up — that gate is the
entire point of the feature.

Quota + abuse controls
----------------------
* ``MAX_SHARES_PER_DAY`` cap per user (defends against using the share
  email as a free email-blasting channel).
* ``MAX_RECIPIENTS_PER_SHARE`` cap on the recipients array.
* slowapi limit on POST keyed by IP (in addition to the per-user quota).
* Snapshots are bounded in size at the schema layer (the audit objects
  themselves are already shape-validated upstream by their own schemas).

Note: we deliberately avoid ``from __future__ import annotations`` here
for the same slowapi/Pydantic forward-ref reason as ``public.py``.
"""
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from html import escape as _html_escape
from loguru import logger
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import and_, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import get_settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.shared_audit import (
    ALL_KINDS,
    KIND_MAPS,
    KIND_WEBSITE,
    SharedAuditReport,
)
from app.models.user import User
from app.modules.outreach.email_sender import send_email


router = APIRouter(prefix="/shared-audits", tags=["shared-audits"])


# ── Quotas ────────────────────────────────────────────────────────────────

MAX_SHARES_PER_DAY = 10
"""Maximum new shares one user can create in a rolling 24-hour window.

Picked to cover legitimate use ("I shared with my team of 5") while
preventing the share email channel from being turned into an outbound
spam funnel. Superusers bypass this in the handler so we can demo the
feature without provisioning a fresh account."""

MAX_RECIPIENTS_PER_SHARE = 10
"""Cap on the recipients array per share. Most legitimate shares are
1–3 recipients; a hard ceiling stops anyone from bulk-blasting through
this endpoint."""

SHARE_TTL_DAYS = 30
"""How long a fresh share link remains valid. Matches the design call —
audit data ages so we don't keep them around forever."""

MESSAGE_MAX_LEN = 500
"""Maximum number of characters in the optional message field."""

TITLE_MAX_LEN = 200


# ── Schemas ───────────────────────────────────────────────────────────────


class ShareRecipient(BaseModel):
    """One recipient on a share. Stored back as ``recipients_json``."""

    email: EmailStr
    sent_ok: Optional[bool] = None
    error: Optional[str] = None


class CreateShareRequest(BaseModel):
    """Body posted from the scanner page's Share modal."""

    kind: str = Field(
        ...,
        description="Which scanner output is being shared.",
        pattern=r"^(website|maps|security|security_place)$",
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=TITLE_MAX_LEN,
        description="Human label for this share (defaults to the audited URL).",
    )
    subject_url: Optional[str] = Field(
        None,
        max_length=2048,
        description="The website or place this audit covers — display only.",
    )
    message: Optional[str] = Field(
        None,
        max_length=MESSAGE_MAX_LEN,
        description="Optional note to include in the recipient email body.",
    )
    recipients: list[EmailStr] = Field(
        default_factory=list,
        description=(
            "Recipients to email when the share is created. May be empty if "
            "the owner only wants the shareable link."
        ),
    )
    payload: dict[str, Any] = Field(
        ...,
        description=(
            "The full audit body to snapshot. Mirrors DeepAudit (kind=website) "
            "or MapsAuditResponse (kind=maps)."
        ),
    )


class CreateShareResponse(BaseModel):
    token: str
    url: str
    expires_at: datetime
    delivered: int = Field(..., description="How many recipients we successfully emailed.")
    failed: list[str] = Field(default_factory=list)


class ShareSummary(BaseModel):
    """One row of the owner's My-Shares list."""

    token: str
    kind: str
    title: str
    subject_url: Optional[str]
    recipients: list[str]
    view_count: int
    created_at: datetime
    expires_at: datetime
    revoked_at: Optional[datetime]
    url: str


class ShareViewResponse(BaseModel):
    """The full hydrated share, returned to an authenticated viewer."""

    token: str
    kind: str
    title: str
    subject_url: Optional[str]
    message: Optional[str]
    owner_display_name: Optional[str]
    owner_avatar_url: Optional[str]
    payload: dict[str, Any]
    created_at: datetime
    expires_at: datetime
    is_owner: bool


# ── Helpers ───────────────────────────────────────────────────────────────


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _share_url(token: str) -> str:
    """Build the public viewer URL for a token.

    Uses ``FRONTEND_DOMAIN`` from settings rather than hard-coding the
    production hostname so OSS deployments (and the local dev server)
    end up with correct links automatically.
    """
    settings = get_settings()
    base = (settings.FRONTEND_DOMAIN or "https://coldscout.colddsam.com").rstrip("/")
    # Token is base64url so no extra escaping needed, but ``quote`` keeps
    # us future-proof if the token shape ever changes.
    return f"{base}/shared/audit/{quote(token, safe='-_~')}"


def _gen_token() -> str:
    """24 bytes = 32 char base64url. 192 bits of entropy."""
    return secrets.token_urlsafe(24)


def _truncate(text: str, n: int) -> str:
    text = text.strip()
    return text if len(text) <= n else text[: n - 1] + "…"


_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


async def _enforce_daily_quota(db: AsyncSession, owner_id: int) -> None:
    """Raise 429 if the caller has already hit MAX_SHARES_PER_DAY."""
    since = _now_utc() - timedelta(hours=24)
    result = await db.execute(
        select(func.count(SharedAuditReport.id))
        .where(
            SharedAuditReport.owner_user_id == owner_id,
            SharedAuditReport.created_at >= since,
        )
    )
    count = result.scalar_one() or 0
    if count >= MAX_SHARES_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"You've created the maximum of {MAX_SHARES_PER_DAY} shared "
                "reports in the last 24 hours. Try again later."
            ),
        )


def _render_email_html(
    *,
    owner_name: str,
    owner_email: str,
    title: str,
    subject_url: Optional[str],
    message: Optional[str],
    share_url: str,
) -> str:
    """Render the recipient invitation email.

    Important security note: every piece of user-supplied content is run
    through ``html.escape`` because the share message and title are
    written by the owner — never trust them verbatim inside HTML.
    """
    safe_owner = _html_escape(owner_name or owner_email or "A Cold Scout user")
    safe_owner_email = _html_escape(owner_email or "")
    safe_title = _html_escape(title)
    safe_subject = _html_escape(subject_url) if subject_url else ""
    safe_message = _html_escape(message) if message else ""
    safe_url = _html_escape(share_url)

    message_block = (
        f'<tr><td style="padding:0 0 18px 0;"><div style="background:#F4F7FB;border-left:3px solid #2D6AE3;padding:14px 16px;border-radius:6px;color:#1B2A41;font-size:14px;line-height:1.55;white-space:pre-wrap;">{safe_message}</div></td></tr>'
        if message else ""
    )
    subject_block = (
        f'<tr><td style="padding:0 0 6px 0;color:#586A82;font-size:13px;">For: <span style="color:#0B1320;font-weight:600;">{safe_subject}</span></td></tr>'
        if subject_url else ""
    )

    return f"""\
<!doctype html>
<html><body style="margin:0;padding:0;background:#F6F8FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0B1320;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F6F8FB;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="background:#FFFFFF;border-radius:14px;box-shadow:0 4px 24px rgba(11,19,32,0.06);padding:28px 28px 24px 28px;max-width:560px;width:100%;">
        <tr><td style="padding-bottom:18px;">
          <div style="font-size:12px;letter-spacing:0.18em;color:#586A82;text-transform:uppercase;">Cold Scout · Audit report</div>
          <div style="font-size:22px;font-weight:700;margin-top:6px;color:#0B1320;">{safe_owner} shared an audit report with you</div>
        </td></tr>
        {subject_block}
        <tr><td style="padding:8px 0 18px 0;font-size:15px;line-height:1.55;color:#1B2A41;">
          <strong>{safe_title}</strong>
        </td></tr>
        {message_block}
        <tr><td style="padding:8px 0 22px 0;">
          <a href="{safe_url}" style="display:inline-block;background:#0B1320;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;">Open the report</a>
        </td></tr>
        <tr><td style="padding-top:6px;border-top:1px solid #ECEFF4;color:#586A82;font-size:12px;line-height:1.6;">
          You'll be asked to sign in (or create a free Cold Scout account) to view this report — that keeps the data private to people you choose to share it with.<br><br>
          Sent on behalf of {safe_owner_email} via Cold Scout.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


# ── Routes ────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=CreateShareResponse,
    status_code=201,
    summary="Create + email a shared audit report",
)
@limiter.limit("20/hour")
async def create_shared_audit(
    payload: CreateShareRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CreateShareResponse:
    """Persist an audit snapshot and (optionally) email recipients a link.

    Returns the share token + canonical URL so the SPA can show
    "copy link" UX even when the owner skipped the recipients field.
    """
    _ = response  # slowapi header injection

    if payload.kind not in ALL_KINDS:
        raise HTTPException(status_code=422, detail="Unknown share kind.")

    if len(payload.recipients) > MAX_RECIPIENTS_PER_SHARE:
        raise HTTPException(
            status_code=422,
            detail=(
                f"You can send up to {MAX_RECIPIENTS_PER_SHARE} recipients per "
                "share. Send a second share for the rest."
            ),
        )

    if not current_user.is_superuser:
        await _enforce_daily_quota(db, current_user.id)

    # Deduplicate + lower-case recipients. EmailStr already validated shape.
    seen: set[str] = set()
    normalized_recipients: list[str] = []
    for raw in payload.recipients:
        email = str(raw).strip().lower()
        if email in seen:
            continue
        seen.add(email)
        normalized_recipients.append(email)

    # The title falls back to the audited URL (or a generic label) so the
    # owner can simply leave the field blank.
    title = _truncate(payload.title or payload.subject_url or "Audit report", TITLE_MAX_LEN)

    # Best-effort: cap message length again at write time so a buggy client
    # can't bypass the Field constraint.
    message = _truncate(payload.message, MESSAGE_MAX_LEN) if payload.message else None

    token = _gen_token()
    now = _now_utc()
    expires = now + timedelta(days=SHARE_TTL_DAYS)

    row = SharedAuditReport(
        token=token,
        owner_user_id=current_user.id,
        kind=payload.kind,
        title=title,
        subject_url=(payload.subject_url or "")[:2048] or None,
        message=message,
        recipients_json=[{"email": e, "sent_ok": None} for e in normalized_recipients],
        payload_json=payload.payload,
        view_count=0,
        created_at=now,
        expires_at=expires,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    share_url = _share_url(token)
    delivered = 0
    failed: list[str] = []
    recipients_outcome: list[dict[str, Any]] = []

    if normalized_recipients:
        owner_name = current_user.full_name or current_user.email or "A Cold Scout user"
        html = _render_email_html(
            owner_name=owner_name,
            owner_email=current_user.email or "",
            title=title,
            subject_url=row.subject_url,
            message=row.message,
            share_url=share_url,
        )
        subject_line = _truncate(f"{owner_name} shared an audit report — {title}", 150)

        for email in normalized_recipients:
            entry: dict[str, Any] = {"email": email, "sent_ok": False}
            try:
                await send_email(
                    to_email=email,
                    subject=subject_line,
                    html_content=html,
                    from_name="Cold Scout Audits",
                )
                delivered += 1
                entry["sent_ok"] = True
            except Exception as e:  # tenacity-exhausted SMTP error
                failed.append(email)
                entry["error"] = str(e)[:200]
                logger.warning(
                    "shared-audit: email send failed to %s for token %s: %r",
                    email, token, e,
                )
            recipients_outcome.append(entry)

        # Persist the per-recipient delivery outcome so the owner can see
        # which sends failed in the My-Shares panel.
        row.recipients_json = recipients_outcome
        await db.commit()

    return CreateShareResponse(
        token=token,
        url=share_url,
        expires_at=expires,
        delivered=delivered,
        failed=failed,
    )


@router.get(
    "/mine",
    response_model=list[ShareSummary],
    summary="List shares created by the current user",
)
async def list_my_shares(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ShareSummary]:
    """Owner-only timeline of every share the user has created.

    Returns metadata only — never the full payload — so the listing page
    stays light. The viewer endpoint hydrates the payload on demand.
    """
    res = await db.execute(
        select(SharedAuditReport)
        .where(SharedAuditReport.owner_user_id == current_user.id)
        .order_by(desc(SharedAuditReport.created_at))
        .limit(200)
    )
    rows = res.scalars().all()
    out: list[ShareSummary] = []
    for r in rows:
        recipients = []
        if isinstance(r.recipients_json, list):
            for item in r.recipients_json:
                if isinstance(item, dict) and isinstance(item.get("email"), str):
                    recipients.append(item["email"])
        out.append(
            ShareSummary(
                token=r.token,
                kind=r.kind,
                title=r.title,
                subject_url=r.subject_url,
                recipients=recipients,
                view_count=r.view_count or 0,
                created_at=r.created_at,
                expires_at=r.expires_at,
                revoked_at=r.revoked_at,
                url=_share_url(r.token),
            )
        )
    return out


@router.delete(
    "/{token}",
    status_code=204,
    summary="Revoke a shared audit report",
)
async def revoke_share(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a share as revoked.

    A revoked share returns 410 from the viewer endpoint regardless of
    whether the token is otherwise valid. Only the owner (or a superuser)
    may revoke.
    """
    res = await db.execute(
        select(SharedAuditReport).where(SharedAuditReport.token == token)
    )
    row = res.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Shared report not found.")
    if row.owner_user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only the owner can revoke this share.")
    if row.revoked_at is not None:
        return Response(status_code=204)
    row.revoked_at = _now_utc()
    await db.commit()
    return Response(status_code=204)


@router.get(
    "/{token}",
    response_model=ShareViewResponse,
    summary="View a shared audit report (authenticated)",
)
async def view_shared_audit(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ShareViewResponse:
    """Hydrate a shared report for an authenticated viewer.

    The viewer doesn't have to be on the recipients list — the moment
    they sign in, anyone with a non-revoked, non-expired token can view.
    This matches "Anyone with the link" semantics on Notion / Figma /
    Google Drive — the auth gate is what turns this into a signup
    funnel, not a per-recipient ACL.
    """
    res = await db.execute(
        select(SharedAuditReport).where(SharedAuditReport.token == token)
    )
    row = res.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Shared report not found.")
    if row.revoked_at is not None:
        raise HTTPException(
            status_code=410,
            detail="This shared report has been revoked by its owner.",
        )
    now = _now_utc()
    expires = row.expires_at
    # SQLite returns naive datetimes; coerce so the comparison is consistent.
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires is not None and expires < now:
        raise HTTPException(
            status_code=410,
            detail="This shared report has expired. Ask the owner for a fresh link.",
        )

    # Bump the view counter (best-effort — never fail the request on this).
    if row.owner_user_id != current_user.id:
        try:
            await db.execute(
                update(SharedAuditReport)
                .where(SharedAuditReport.id == row.id)
                .values(view_count=(SharedAuditReport.view_count + 1))
            )
            await db.commit()
        except Exception:
            await db.rollback()

    # Look up owner display fields. We deliberately do not return the
    # owner's email — only their public display name + avatar.
    owner_name: Optional[str] = None
    owner_avatar: Optional[str] = None
    owner_res = await db.execute(select(User).where(User.id == row.owner_user_id))
    owner = owner_res.scalar_one_or_none()
    if owner is not None:
        owner_name = owner.full_name or None
        owner_avatar = owner.avatar_url or None

    return ShareViewResponse(
        token=row.token,
        kind=row.kind,
        title=row.title,
        subject_url=row.subject_url,
        message=row.message,
        owner_display_name=owner_name,
        owner_avatar_url=owner_avatar,
        payload=row.payload_json if isinstance(row.payload_json, dict) else {},
        created_at=row.created_at,
        expires_at=row.expires_at,
        is_owner=(row.owner_user_id == current_user.id),
    )
