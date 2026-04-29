"""
Freelancer Profile Signature Renderer.

Builds an HTML signature block from a freelancer's profile that can be
appended to outreach emails. Activation is per-freelancer via the
``FreelancerProfile.include_profile_signature`` toggle.

Design principles
-----------------
* **Additive & isolated** — failures here never bubble out. The caller
  receives an empty string and the email pipeline continues unaffected.
* **Visibility-aware** — phone is only included when ``UserProfile.show_phone``
  is True; email only when ``UserProfile.show_email`` is True. Location
  follows ``show_location``. The toggle itself is the global gate.
* **Safe** — every dynamic string is HTML-escaped before being interpolated.
  URLs are validated to start with http(s):// before being rendered as links.
* **Multi-tenant** — keyed by ``user_id`` (the freelancer who owns the lead),
  so each freelancer's signature is sourced from their own profile.
"""
from __future__ import annotations

import html
from typing import Optional

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import FreelancerProfile, UserProfile
from app.models.user import User


def _escape(value: Optional[str]) -> str:
    """HTML-escape a string for safe interpolation. Returns empty string on None."""
    if value is None:
        return ""
    return html.escape(str(value).strip(), quote=True)


def _safe_url(url: Optional[str]) -> Optional[str]:
    """
    Returns the URL only if it is a valid http(s) link, otherwise None.
    Prevents rendering ``javascript:`` or other dangerous schemes as links.
    """
    if not url:
        return None
    candidate = url.strip()
    if not candidate:
        return None
    lowered = candidate.lower()
    if not (lowered.startswith("http://") or lowered.startswith("https://")):
        return None
    return candidate


async def get_freelancer_signature_html(
    user_id: Optional[int],
    db: AsyncSession,
) -> str:
    """
    Returns an HTML signature block for the given freelancer, or an empty
    string if disabled, missing, or any error occurs.

    Parameters
    ----------
    user_id : Optional[int]
        The freelancer (lead owner) ``user_id``. ``None`` returns "".
    db : AsyncSession
        Active SQLAlchemy session — caller owns its lifecycle.

    Returns
    -------
    str
        Sanitized HTML to inject into the outreach email, or "" when the
        toggle is off / data unavailable / on any internal failure.
    """
    if user_id is None:
        return ""

    try:
        # Pull freelancer profile + check the toggle in one query.
        fl_res = await db.execute(
            select(FreelancerProfile).where(FreelancerProfile.user_id == user_id)
        )
        fl_profile: Optional[FreelancerProfile] = fl_res.scalars().first()
        if not fl_profile or not fl_profile.include_profile_signature:
            return ""

        user_res = await db.execute(select(User).where(User.id == user_id))
        user: Optional[User] = user_res.scalars().first()
        if not user:
            return ""

        up_res = await db.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        user_profile: Optional[UserProfile] = up_res.scalars().first()

        return _render_signature(user, user_profile, fl_profile)
    except Exception as exc:  # noqa: BLE001 — never break the email pipeline
        logger.warning(
            "Profile signature render failed for user_id=%s; emitting empty signature: %s",
            user_id,
            exc,
        )
        return ""


def _render_signature(
    user: User,
    user_profile: Optional[UserProfile],
    fl_profile: FreelancerProfile,
) -> str:
    """
    Render the HTML block. All inputs are escaped/validated.
    Returns "" if no meaningful content is available.
    """
    full_name = _escape(getattr(user, "full_name", None)) or _escape(
        getattr(user_profile, "username", None)
    )
    title = _escape(getattr(fl_profile, "professional_title", None))

    photo_url = _safe_url(getattr(user_profile, "profile_photo_url", None)) or _safe_url(
        getattr(user, "avatar_url", None)
    )

    # Contact rows (visibility gates from UserProfile)
    contact_rows: list[str] = []

    show_email = bool(getattr(user_profile, "show_email", False))
    if show_email and user.email:
        safe_email = _escape(user.email)
        contact_rows.append(
            f'<a href="mailto:{safe_email}" '
            f'style="color:#000000;text-decoration:none;font-weight:600;">'
            f'{safe_email}</a>'
        )

    show_phone = bool(getattr(user_profile, "show_phone", False))
    phone_value = getattr(user_profile, "phone", None) if user_profile else None
    if show_phone and phone_value:
        contact_rows.append(_escape(phone_value))

    show_location = bool(getattr(user_profile, "show_location", True))
    location_value = getattr(user_profile, "location", None) if user_profile else None
    if show_location and location_value:
        contact_rows.append(_escape(location_value))

    # Links (label, url) — only render entries that pass URL validation.
    candidate_links: list[tuple[str, Optional[str]]] = [
        ("Website", getattr(fl_profile, "personal_website", None)
         or (getattr(user_profile, "website", None) if user_profile else None)),
        ("LinkedIn", getattr(fl_profile, "linkedin_url", None)),
        ("GitHub", getattr(fl_profile, "github_url", None)),
        ("Twitter", getattr(fl_profile, "twitter_url", None)),
        ("Dribbble", getattr(fl_profile, "dribbble_url", None)),
        ("Behance", getattr(fl_profile, "behance_url", None)),
        ("Book a Meeting", getattr(fl_profile, "booking_url", None)),
    ]

    link_html_parts: list[str] = []
    for label, raw_url in candidate_links:
        safe = _safe_url(raw_url)
        if not safe:
            continue
        link_html_parts.append(
            f'<a href="{_escape(safe)}" '
            f'style="color:#000000;text-decoration:underline;font-weight:600;'
            f'margin-right:14px;display:inline-block;">{_escape(label)}</a>'
        )

    # If we have nothing useful to show, return empty so the email is unchanged.
    if not full_name and not title and not contact_rows and not link_html_parts:
        return ""

    photo_block = ""
    if photo_url:
        photo_block = (
            f'<img src="{_escape(photo_url)}" alt="" width="56" height="56" '
            f'style="display:block;border-radius:50%;object-fit:cover;'
            f'border:1px solid #eaeaea;" />'
        )

    name_block = (
        f'<div style="font-size:15px;font-weight:700;color:#000000;'
        f'line-height:1.3;">{full_name or "Your Growth Partner"}</div>'
    )
    title_block = (
        f'<div style="font-size:13px;color:#666666;margin-top:2px;">{title}</div>'
        if title
        else ""
    )

    contact_block = ""
    if contact_rows:
        joined = (
            '<span style="color:#cccccc;margin:0 8px;">·</span>'
        ).join(contact_rows)
        contact_block = (
            f'<div style="font-size:12px;color:#555555;margin-top:8px;'
            f'line-height:1.5;">{joined}</div>'
        )

    links_block = ""
    if link_html_parts:
        links_block = (
            f'<div style="font-size:12px;margin-top:10px;line-height:1.6;">'
            f'{"".join(link_html_parts)}</div>'
        )

    photo_cell = (
        f'<td style="vertical-align:top;width:64px;padding-right:14px;">{photo_block}</td>'
        if photo_block
        else ""
    )

    return (
        '<div class="profile-signature" '
        'style="margin:24px 0 0;padding:18px 20px;background:#fafafa;'
        'border:1px solid #eaeaea;border-radius:10px;">'
        '<table role="presentation" cellpadding="0" cellspacing="0" '
        'style="border-collapse:collapse;width:100%;">'
        '<tr>'
        f'{photo_cell}'
        '<td style="vertical-align:top;">'
        f'{name_block}{title_block}{contact_block}{links_block}'
        '</td>'
        '</tr>'
        '</table>'
        '</div>'
    )
