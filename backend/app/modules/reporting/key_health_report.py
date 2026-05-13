"""
Daily API key-pool health report.

Once a day the scheduler invokes :func:`send_daily_key_health_report` which
generates an HTML summary of every credential in the orchestrator pool and
emails it to ``settings.ADMIN_EMAIL``. The report mirrors the visual
language of the existing pipeline daily report.

Contents:
  - Per-provider counts (active / cooldown / disabled)
  - Last-24h request counts and 429s per (provider, use_case)
  - Currently-disabled keys with their last failure reason
  - Keys currently in cooldown with remaining time

Failure isolation:
  Email-send errors are swallowed — the scheduler must never crash because
  the SMTP relay was briefly unavailable.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from html import escape
from typing import Iterable

from loguru import logger
from sqlalchemy import select

from app.config import get_settings
from app.core.database import get_session_maker
from app.models.infrastructure import APIProvider
from app.modules.infrastructure.key_manager import provider_status
from app.modules.outreach.email_sender import send_email


def _format_remaining(until: datetime | None, now: datetime) -> str:
    if until is None:
        return "—"
    # SQLite strips tzinfo when round-tripping DateTime(timezone=True);
    # normalise both sides to UTC-aware so subtraction never raises.
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    delta = until - now
    secs = max(0, int(delta.total_seconds()))
    if secs == 0:
        return "expired"
    if secs < 90:
        return f"{secs}s"
    if secs < 3600:
        return f"{secs // 60}m"
    hours = secs / 3600
    return f"{hours:.1f}h"


def _row(label: str, value, bg: str = "#ffffff") -> str:
    return (
        f'<tr style="background:{bg};">'
        f'<td style="padding:10px 14px; border-bottom:1px solid #eaeaea; color:#333;">'
        f"{escape(str(label))}</td>"
        f'<td style="padding:10px 14px; border-bottom:1px solid #eaeaea; '
        f'text-align:right; font-weight:700; color:#000;">{escape(str(value))}</td>'
        f"</tr>"
    )


def _build_html(rows: Iterable[APIProvider], now: datetime, report_date) -> str:
    rows = list(rows)
    total = len(rows)

    # Aggregate buckets ------------------------------------------------------
    per_provider: dict[str, dict[str, int]] = {}
    active_total = 0
    cooldown_total = 0
    disabled_total = 0
    usage_total = 0
    rate_limit_total = 0
    failure_total = 0

    disabled_rows: list[APIProvider] = []
    cooldown_rows: list[APIProvider] = []

    for r in rows:
        bucket = per_provider.setdefault(
            r.provider_name,
            {
                "active": 0,
                "cooldown": 0,
                "disabled": 0,
                "usage": 0,
                "rate_limit_hits": 0,
                "total_failures": 0,
            },
        )
        status = provider_status(r)
        if status == "active":
            active_total += 1
            bucket["active"] += 1
        elif status == "cooldown":
            cooldown_total += 1
            bucket["cooldown"] += 1
            cooldown_rows.append(r)
        else:
            disabled_total += 1
            bucket["disabled"] += 1
            disabled_rows.append(r)
        bucket["usage"] += r.usage_count or 0
        bucket["rate_limit_hits"] += r.rate_limit_hits or 0
        bucket["total_failures"] += r.total_failures or 0
        usage_total += r.usage_count or 0
        rate_limit_total += r.rate_limit_hits or 0
        failure_total += r.total_failures or 0

    # Summary table ----------------------------------------------------------
    summary_rows = (
        _row("Total keys configured", total, "#fafafa")
        + _row("Active", active_total, "#ffffff")
        + _row("In cooldown", cooldown_total, "#fafafa")
        + _row("Disabled", disabled_total, "#ffffff")
        + _row("Lifetime requests", usage_total, "#fafafa")
        + _row("Lifetime 429 / quota hits", rate_limit_total, "#ffffff")
        + _row("Lifetime non-quota failures", failure_total, "#fafafa")
    )

    # Per-provider table -----------------------------------------------------
    provider_table = ""
    if per_provider:
        body = "".join(
            (
                '<tr style="background:#fafafa;">'
                f'<td style="padding:8px 12px; border-bottom:1px solid #eaeaea; '
                f'color:#000; font-weight:600;">{escape(p)}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #eaeaea; text-align:center;">{b["active"]}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #eaeaea; text-align:center;">{b["cooldown"]}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #eaeaea; text-align:center;">{b["disabled"]}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #eaeaea; text-align:right;">{b["usage"]}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #eaeaea; text-align:right;">{b["rate_limit_hits"]}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #eaeaea; text-align:right;">{b["total_failures"]}</td>'
                "</tr>"
            )
            for p, b in sorted(per_provider.items())
        )
        provider_table = f"""
        <h3 style="margin:24px 0 8px; font-size:14px; color:#000;">Per-provider breakdown</h3>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <tr style="background:#000; color:#fff;">
            <th style="padding:8px 12px; text-align:left;">Provider</th>
            <th style="padding:8px 12px;">Active</th>
            <th style="padding:8px 12px;">Cooldown</th>
            <th style="padding:8px 12px;">Disabled</th>
            <th style="padding:8px 12px; text-align:right;">Requests</th>
            <th style="padding:8px 12px; text-align:right;">429s</th>
            <th style="padding:8px 12px; text-align:right;">Failures</th>
          </tr>
          {body}
        </table>
        """

    # Cooldown table ---------------------------------------------------------
    cooldown_table = ""
    if cooldown_rows:
        body = "".join(
            (
                '<tr style="background:#fff8e6;">'
                f'<td style="padding:8px 12px; border-bottom:1px solid #f5e6b8;">{escape(r.provider_name)}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #f5e6b8;">{escape(r.label or "—")}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #f5e6b8;">{escape(r.use_case)}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #f5e6b8;">{_format_remaining(r.cooldown_until, now)}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #f5e6b8; color:#7a4c00; max-width:340px; word-break:break-word;">'
                f'{escape((r.last_failure_reason or "")[:200])}</td>'
                "</tr>"
            )
            for r in cooldown_rows
        )
        cooldown_table = f"""
        <h3 style="margin:24px 0 8px; font-size:14px; color:#000;">Currently in cooldown</h3>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <tr style="background:#000; color:#fff;">
            <th style="padding:8px 12px; text-align:left;">Provider</th>
            <th style="padding:8px 12px; text-align:left;">Label</th>
            <th style="padding:8px 12px; text-align:left;">Use case</th>
            <th style="padding:8px 12px; text-align:left;">Time left</th>
            <th style="padding:8px 12px; text-align:left;">Last error</th>
          </tr>
          {body}
        </table>
        """

    # Disabled table ---------------------------------------------------------
    disabled_table = ""
    if disabled_rows:
        body = "".join(
            (
                '<tr style="background:#fff0f0;">'
                f'<td style="padding:8px 12px; border-bottom:1px solid #f5c8c8;">{escape(r.provider_name)}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #f5c8c8;">{escape(r.label or "—")}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #f5c8c8;">{escape(r.use_case)}</td>'
                f'<td style="padding:8px 12px; border-bottom:1px solid #f5c8c8; color:#7a0000; max-width:340px; word-break:break-word;">'
                f'{escape((r.last_failure_reason or "operator-disabled")[:200])}</td>'
                "</tr>"
            )
            for r in disabled_rows
        )
        disabled_table = f"""
        <h3 style="margin:24px 0 8px; font-size:14px; color:#000;">Disabled keys (action required)</h3>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <tr style="background:#000; color:#fff;">
            <th style="padding:8px 12px; text-align:left;">Provider</th>
            <th style="padding:8px 12px; text-align:left;">Label</th>
            <th style="padding:8px 12px; text-align:left;">Use case</th>
            <th style="padding:8px 12px; text-align:left;">Reason</th>
          </tr>
          {body}
        </table>
        """

    empty_pool_notice = ""
    if not rows:
        empty_pool_notice = (
            '<p style="background:#fff8e6; border-left:3px solid #f5b800; '
            'padding:12px 16px; color:#7a4c00; margin:16px 0; font-size:13px;">'
            "The orchestrator pool is empty. Outbound providers are running "
            "on the legacy <code>.env</code> credentials only. Add keys in "
            "<em>Settings → API Key Orchestrator</em> to enable rotation."
            "</p>"
        )

    return f"""
    <html>
    <body style="margin:0; padding:0; background-color:#f5f5f5;
                 font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
      <div style="max-width:640px; margin:32px auto; background:#ffffff;
                  border:1px solid #eaeaea; border-radius:12px; overflow:hidden;
                  box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <div style="background:#000000; padding:28px 32px;">
          <p style="margin:0 0 4px; font-size:11px; letter-spacing:2px;
                    text-transform:uppercase; color:#999; font-weight:600;">
            API Key Health
          </p>
          <h1 style="margin:0; font-size:22px; font-weight:800; color:#fff;
                     letter-spacing:-0.3px;">
            Cold Scout — {report_date}
          </h1>
        </div>

        <div style="padding:28px 32px;">
          {empty_pool_notice}
          <h3 style="margin:0 0 8px; font-size:14px; color:#000;">Pool summary</h3>
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            {summary_rows}
          </table>

          {provider_table}
          {cooldown_table}
          {disabled_table}

          <p style="margin-top:28px; font-size:11px; color:#888;">
            Generated automatically — open the
            <strong>Settings → API Key Orchestrator</strong> page to manage
            keys, clear cooldowns, or rotate credentials.
          </p>
        </div>
      </div>
    </body>
    </html>
    """


async def send_daily_key_health_report() -> bool:
    """Generate and email the daily key-pool health summary.

    Returns ``True`` on successful dispatch. Catches every exception so the
    APScheduler heartbeat keeps running even if SMTP / the database is
    momentarily unavailable.
    """
    settings = get_settings()
    if not settings.ADMIN_EMAIL:
        logger.info("send_daily_key_health_report: ADMIN_EMAIL unset, skipping")
        return False

    now = datetime.now(timezone.utc)
    report_date = now.date()

    try:
        session_maker = get_session_maker()
        async with session_maker() as session:
            rows = list(
                (
                    await session.execute(
                        select(APIProvider).order_by(
                            APIProvider.provider_name.asc(),
                            APIProvider.weight.desc(),
                            APIProvider.created_at.asc(),
                        )
                    )
                ).scalars()
            )
    except Exception as e:
        logger.error(
            "send_daily_key_health_report: failed to load api_providers ({}), "
            "sending empty-pool report",
            e,
        )
        rows = []

    html = _build_html(rows, now, report_date)
    subject = (
        f"[Cold Scout] API Key Health — {report_date} | "
        f"{sum(1 for r in rows if provider_status(r) == 'active')} active / "
        f"{sum(1 for r in rows if provider_status(r) == 'cooldown')} cooling / "
        f"{sum(1 for r in rows if provider_status(r) == 'disabled')} disabled"
    )

    try:
        await send_email(
            to_email=settings.ADMIN_EMAIL,
            subject=subject,
            html_content=html,
            from_name="Cold Scout Orchestrator",
        )
        logger.info(
            "send_daily_key_health_report: dispatched to {} ({} rows)",
            settings.ADMIN_EMAIL,
            len(rows),
        )
        return True
    except Exception as e:
        logger.error("send_daily_key_health_report: SMTP dispatch failed — {}", e)
        return False
