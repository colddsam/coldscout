"""
Analytics engine.

Service-layer functions powering the freelancer-facing analytics
dashboard. Each function takes a (db, user_id, time_range) tuple and
returns a JSON-ready dict.

Two design rules:

1. **Tenant scoping is mandatory.** Every query filters by
   ``user_id`` (and ``Lead.user_id`` on joins) — never aggregate
   across freelancers.
2. **No silent fallbacks.** Empty result sets return zeroed scaffolding
   so the UI can still render funnels/heatmaps cleanly, but the engine
   never invents synthetic data.

The public API is:

* ``get_funnel_stats`` — discovered → qualified → sent → opened →
  clicked → replied counts plus stage conversion rates.
* ``get_niche_performance`` — per-category aggregates: leads,
  sent, opened, replied, with derived open / reply rates.
* ``get_timing_insights`` — weekday × hour heatmap of opens and
  replies (freelancer-local interpretation is left to the UI).
* ``get_volume_timeseries`` — per-day outreach volume vs replies,
  used by the area chart.
* ``rebuild_snapshots`` — upserts ``DailySnapshot`` rows for the
  requested window so subsequent reads stay cache-fast.
* ``generate_weekly_advice`` — uses the Groq client to surface three
  prioritised bullet points based on the raw funnel/timing JSON.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from loguru import logger
from sqlalchemy import Date, and_, cast, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analytics import DailySnapshot
from app.models.campaign import EmailOutreach
from app.models.email_event import EmailEvent
from app.models.lead import Lead


# ── Funnel ────────────────────────────────────────────────────────────────────

# Lead status values that count as "qualified or further along the funnel".
# Kept in sync with Lead.status comments — see app/models/lead.py.
_QUALIFIED_STATUSES = {
    "qualified",
    "phone_qualified",
    "queued_for_send",
    "email_sent",
    "opened",
    "clicked",
    "replied",
}


def _utc_window(time_range_days: int) -> tuple[datetime, datetime]:
    """Inclusive [start, end) window ending at the next-minute boundary."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=time_range_days)
    return start, now


async def get_funnel_stats(
    db: AsyncSession, user_id: int, time_range_days: int = 30,
) -> dict[str, Any]:
    """
    Counts every lead stage and the derived conversion rates.

    Returns a dict shaped for the funnel UI:

        {
          "stages": [{"key": "discovered", "label": "...", "count": N}, ...],
          "conversions": {
            "qualified_rate": 0.42,
            "sent_to_open_rate": 0.51,
            ...
          },
          "totals": {"discovered": N, "qualified": M, ...},
          "window_days": 30,
        }
    """
    start, end = _utc_window(time_range_days)

    # Discovered leads in window (all leads owned by user, regardless of status)
    discovered = await db.scalar(
        select(func.count(Lead.id)).where(
            Lead.user_id == user_id,
            Lead.discovered_at >= start,
            Lead.discovered_at < end,
        )
    ) or 0

    qualified = await db.scalar(
        select(func.count(Lead.id)).where(
            Lead.user_id == user_id,
            Lead.discovered_at >= start,
            Lead.discovered_at < end,
            Lead.status.in_(list(_QUALIFIED_STATUSES)),
        )
    ) or 0

    # EmailOutreach metrics (status == 'sent' / 'delivered' / 'opened' ...)
    sent = await db.scalar(
        select(func.count(EmailOutreach.id))
        .join(Lead, EmailOutreach.lead_id == Lead.id)
        .where(
            Lead.user_id == user_id,
            EmailOutreach.sent_at >= start,
            EmailOutreach.sent_at < end,
        )
    ) or 0

    # Distinct outreach rows that received an "opened" / "clicked" / "replied"
    # event. Using DISTINCT keeps the count honest when the same email
    # generates multiple opens (e.g. previewed twice).
    async def _distinct_event(event_type: str) -> int:
        result = await db.scalar(
            select(func.count(func.distinct(EmailEvent.outreach_id)))
            .join(Lead, EmailEvent.lead_id == Lead.id)
            .where(
                Lead.user_id == user_id,
                EmailEvent.event_type == event_type,
                EmailEvent.occurred_at >= start,
                EmailEvent.occurred_at < end,
            )
        )
        return result or 0

    opened = await _distinct_event("opened")
    clicked = await _distinct_event("clicked")
    replied = await _distinct_event("replied")

    def _rate(numerator: int, denominator: int) -> float:
        return round(numerator / denominator, 4) if denominator else 0.0

    return {
        "window_days": time_range_days,
        "totals": {
            "discovered": discovered,
            "qualified": qualified,
            "sent": sent,
            "opened": opened,
            "clicked": clicked,
            "replied": replied,
        },
        "stages": [
            {"key": "discovered", "label": "Discovered", "count": discovered},
            {"key": "qualified", "label": "Qualified", "count": qualified},
            {"key": "sent", "label": "Emails Sent", "count": sent},
            {"key": "opened", "label": "Opened", "count": opened},
            {"key": "clicked", "label": "Clicked", "count": clicked},
            {"key": "replied", "label": "Replied", "count": replied},
        ],
        "conversions": {
            "discovered_to_qualified": _rate(qualified, discovered),
            "qualified_to_sent": _rate(sent, qualified),
            "sent_to_opened": _rate(opened, sent),
            "opened_to_clicked": _rate(clicked, opened),
            "opened_to_replied": _rate(replied, opened),
            "sent_to_replied": _rate(replied, sent),
        },
    }


# ── Niche performance ─────────────────────────────────────────────────────────

async def get_niche_performance(
    db: AsyncSession, user_id: int, time_range_days: int = 90,
) -> list[dict[str, Any]]:
    """
    Per-category aggregates ranked by reply rate (best categories first).

    Categories with fewer than 3 leads in the window are dropped — the
    sample size is too small to draw conclusions and they would dominate
    the rate calculation with noise.
    """
    start, end = _utc_window(time_range_days)

    # Discovered leads by category
    discovered_q = await db.execute(
        select(Lead.category, func.count(Lead.id))
        .where(
            Lead.user_id == user_id,
            Lead.discovered_at >= start,
            Lead.discovered_at < end,
            Lead.category.isnot(None),
        )
        .group_by(Lead.category)
    )
    discovered_by_cat: dict[str, int] = {
        cat: cnt for cat, cnt in discovered_q.all()
    }

    # Outreach metrics by category
    outreach_q = await db.execute(
        select(Lead.category, func.count(EmailOutreach.id))
        .join(EmailOutreach, EmailOutreach.lead_id == Lead.id)
        .where(
            Lead.user_id == user_id,
            EmailOutreach.sent_at >= start,
            EmailOutreach.sent_at < end,
        )
        .group_by(Lead.category)
    )
    sent_by_cat: dict[str, int] = {cat: cnt for cat, cnt in outreach_q.all()}

    async def _events_by_category(event_type: str) -> dict[str, int]:
        rows = await db.execute(
            select(
                Lead.category,
                func.count(func.distinct(EmailEvent.outreach_id)),
            )
            .join(EmailEvent, EmailEvent.lead_id == Lead.id)
            .where(
                Lead.user_id == user_id,
                EmailEvent.event_type == event_type,
                EmailEvent.occurred_at >= start,
                EmailEvent.occurred_at < end,
            )
            .group_by(Lead.category)
        )
        return {cat: cnt for cat, cnt in rows.all()}

    opened_by_cat = await _events_by_category("opened")
    replied_by_cat = await _events_by_category("replied")

    rows: list[dict[str, Any]] = []
    categories = set(discovered_by_cat) | set(sent_by_cat)
    for cat in categories:
        if not cat:
            continue
        discovered = discovered_by_cat.get(cat, 0)
        if discovered < 3:
            # Statistically meaningless — skip rather than pollute the table.
            continue
        sent = sent_by_cat.get(cat, 0)
        opened = opened_by_cat.get(cat, 0)
        replied = replied_by_cat.get(cat, 0)
        rows.append({
            "category": cat,
            "discovered": discovered,
            "sent": sent,
            "opened": opened,
            "replied": replied,
            "open_rate": round(opened / sent, 4) if sent else 0.0,
            "reply_rate": round(replied / sent, 4) if sent else 0.0,
        })

    rows.sort(key=lambda r: (r["reply_rate"], r["open_rate"]), reverse=True)
    return rows


# ── Timing heatmap ────────────────────────────────────────────────────────────

async def get_timing_insights(
    db: AsyncSession, user_id: int, time_range_days: int = 60,
) -> dict[str, Any]:
    """
    Returns weekday × hour matrices of opens and replies in UTC.

    The frontend converts to the freelancer's local timezone for display.
    Both matrices are 7×24 zero-filled lists.
    """
    start, end = _utc_window(time_range_days)

    def _empty_matrix() -> list[list[int]]:
        return [[0] * 24 for _ in range(7)]

    opens = _empty_matrix()
    replies = _empty_matrix()

    # Pull (event_type, weekday, hour, count) buckets in one query.
    # extract(dow) is 0=Sun..6=Sat in postgres; rotate to 0=Mon..6=Sun.
    rows = await db.execute(
        select(
            EmailEvent.event_type,
            func.extract("dow", EmailEvent.occurred_at).label("dow"),
            func.extract("hour", EmailEvent.occurred_at).label("hour"),
            func.count(EmailEvent.id),
        )
        .join(Lead, EmailEvent.lead_id == Lead.id)
        .where(
            Lead.user_id == user_id,
            EmailEvent.event_type.in_(["opened", "replied"]),
            EmailEvent.occurred_at >= start,
            EmailEvent.occurred_at < end,
        )
        .group_by(EmailEvent.event_type, "dow", "hour")
    )

    peak_open = {"weekday": None, "hour": None, "count": 0}
    peak_reply = {"weekday": None, "hour": None, "count": 0}

    for event_type, dow, hour, count in rows.all():
        # Convert Postgres dow (0..6 Sun..Sat) to Mon=0..Sun=6
        weekday = (int(dow) + 6) % 7
        hr = int(hour)
        target = opens if event_type == "opened" else replies
        target[weekday][hr] = count
        peak = peak_open if event_type == "opened" else peak_reply
        if count > peak["count"]:
            peak["weekday"] = weekday
            peak["hour"] = hr
            peak["count"] = count

    return {
        "window_days": time_range_days,
        "weekday_labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "opens": opens,
        "replies": replies,
        "peak_open": peak_open if peak_open["count"] else None,
        "peak_reply": peak_reply if peak_reply["count"] else None,
    }


# ── Sentiment aggregate ───────────────────────────────────────────────────────

async def get_sentiment_breakdown(
    db: AsyncSession, user_id: int, time_range_days: int = 30,
) -> dict[str, Any]:
    """
    Aggregates reply sentiment over the requested window using cached
    DailySnapshot rows (which are refreshed on every read so the most
    recent day is always up-to-date).

    Returns:
        {
          "window_days": 30,
          "total_replies": N,
          "buckets": [
            {"key": "positive", "label": "Positive",  "count": X, "share": 0.42},
            ...
          ],
        }
    """
    today = datetime.now(timezone.utc).date()
    start_date = today - timedelta(days=time_range_days - 1)

    # Best-effort cache refresh. A transient DB timeout here must not
    # 500 the dashboard — we fall back to whatever snapshots already
    # exist and the next read will retry.
    try:
        await rebuild_snapshots(db, user_id, start_date, today)
    except Exception as exc:
        logger.warning(f"sentiment snapshot refresh skipped: {exc}")

    rows = await db.execute(
        select(
            func.coalesce(func.sum(DailySnapshot.replies_positive), 0),
            func.coalesce(func.sum(DailySnapshot.replies_neutral), 0),
            func.coalesce(func.sum(DailySnapshot.replies_negative), 0),
            func.coalesce(func.sum(DailySnapshot.unsubscribes), 0),
        ).where(
            DailySnapshot.user_id == user_id,
            DailySnapshot.snapshot_date >= start_date,
            DailySnapshot.snapshot_date <= today,
        )
    )
    positive, neutral, negative, unsub = rows.first() or (0, 0, 0, 0)
    total = positive + neutral + negative + unsub

    def _bucket(key: str, label: str, count: int) -> dict[str, Any]:
        return {
            "key": key,
            "label": label,
            "count": int(count),
            "share": round((count / total), 4) if total else 0.0,
        }

    return {
        "window_days": time_range_days,
        "total_replies": int(total),
        "buckets": [
            _bucket("positive", "Positive", positive),
            _bucket("neutral", "Neutral", neutral),
            _bucket("negative", "Negative", negative),
            _bucket("unsubscribe", "Unsubscribed", unsub),
        ],
    }


# ── Volume timeseries (area chart) ────────────────────────────────────────────

async def get_volume_timeseries(
    db: AsyncSession, user_id: int, time_range_days: int = 30,
) -> list[dict[str, Any]]:
    """
    Per-day series of emails sent, opens, and replies for the area chart.

    Returns a contiguous day range (zero-filled for days with no activity)
    so Recharts renders a smooth area instead of disconnected segments.
    """
    today = datetime.now(timezone.utc).date()
    start_date = today - timedelta(days=time_range_days - 1)

    # Re-use cached snapshots — refresh on read so the most recent day
    # always reflects up-to-the-minute event counts. Failures here must
    # not 500 the dashboard; we still serve whatever snapshots exist.
    try:
        await rebuild_snapshots(db, user_id, start_date, today)
    except Exception as exc:
        logger.warning(f"volume snapshot refresh skipped: {exc}")

    rows = await db.execute(
        select(DailySnapshot).where(
            DailySnapshot.user_id == user_id,
            DailySnapshot.snapshot_date >= start_date,
            DailySnapshot.snapshot_date <= today,
        ).order_by(DailySnapshot.snapshot_date.asc())
    )
    by_date: dict[date, DailySnapshot] = {
        s.snapshot_date: s for s in rows.scalars().all()
    }

    series: list[dict[str, Any]] = []
    d = start_date
    while d <= today:
        snap = by_date.get(d)
        sent = snap.emails_sent if snap else 0
        opened = snap.emails_opened if snap else 0
        replied = snap.replies_received if snap else 0
        # Per-day rates (0 when no sends so the chart shows a flat line
        # rather than NaN gaps).
        open_rate = round(opened / sent, 4) if sent else 0.0
        reply_rate = round(replied / sent, 4) if sent else 0.0
        series.append({
            "date": d.isoformat(),
            "emails_sent": sent,
            "emails_opened": opened,
            "replies_received": replied,
            "leads_found": snap.leads_found if snap else 0,
            "open_rate": open_rate,
            "reply_rate": reply_rate,
        })
        d += timedelta(days=1)
    return series


# ── Snapshot upsert ───────────────────────────────────────────────────────────

async def rebuild_snapshots(
    db: AsyncSession,
    user_id: int,
    start_date: date,
    end_date: date,
) -> int:
    """
    Recompute DailySnapshot rows for every day in [start_date, end_date].

    Uses Postgres ON CONFLICT to upsert so concurrent pipeline writes
    don't crash with UniqueViolation. Returns the number of days
    refreshed.
    """
    if start_date > end_date:
        return 0

    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)

    # Bucket each row to its UTC calendar day. ``timezone('UTC', col)``
    # converts the timestamptz to a naive UTC timestamp, and a Date cast
    # truncates it to the day boundary that matches DailySnapshot.snapshot_date.
    lead_day = cast(func.timezone("UTC", Lead.discovered_at), Date)
    qual_day = cast(func.timezone("UTC", Lead.qualified_at), Date)
    sent_day = cast(func.timezone("UTC", EmailOutreach.sent_at), Date)
    event_day = cast(func.timezone("UTC", EmailEvent.occurred_at), Date)

    # ── 1. Leads discovered, grouped by UTC day ────────────────────────────
    discovered_rows = (await db.execute(
        select(lead_day.label("day"), func.count(Lead.id))
        .where(
            Lead.user_id == user_id,
            Lead.discovered_at >= start_dt,
            Lead.discovered_at < end_dt,
        )
        .group_by("day")
    )).all()
    leads_by_day: dict[date, int] = {row[0]: int(row[1]) for row in discovered_rows}

    # ── 2. Leads qualified, grouped by UTC day ─────────────────────────────
    qualified_rows = (await db.execute(
        select(qual_day.label("day"), func.count(Lead.id))
        .where(
            Lead.user_id == user_id,
            Lead.qualified_at.isnot(None),
            Lead.qualified_at >= start_dt,
            Lead.qualified_at < end_dt,
        )
        .group_by("day")
    )).all()
    qualified_by_day: dict[date, int] = {row[0]: int(row[1]) for row in qualified_rows}

    # ── 3. Emails sent, grouped by UTC day ─────────────────────────────────
    sent_rows = (await db.execute(
        select(sent_day.label("day"), func.count(EmailOutreach.id))
        .join(Lead, EmailOutreach.lead_id == Lead.id)
        .where(
            Lead.user_id == user_id,
            EmailOutreach.sent_at.isnot(None),
            EmailOutreach.sent_at >= start_dt,
            EmailOutreach.sent_at < end_dt,
        )
        .group_by("day")
    )).all()
    sent_by_day: dict[date, int] = {row[0]: int(row[1]) for row in sent_rows}

    # ── 4. Engagement events (opened / clicked / replied) in one query ─────
    event_rows = (await db.execute(
        select(
            event_day.label("day"),
            EmailEvent.event_type,
            func.count(func.distinct(EmailEvent.outreach_id)),
        )
        .join(Lead, EmailEvent.lead_id == Lead.id)
        .where(
            Lead.user_id == user_id,
            EmailEvent.event_type.in_(["opened", "clicked", "replied"]),
            EmailEvent.occurred_at >= start_dt,
            EmailEvent.occurred_at < end_dt,
        )
        .group_by("day", EmailEvent.event_type)
    )).all()
    events_by_key: dict[tuple[date, str], int] = {
        (row[0], row[1]): int(row[2]) for row in event_rows
    }

    # ── 5. Reply sentiment, grouped by UTC day ─────────────────────────────
    sentiment_rows = (await db.execute(
        select(
            event_day.label("day"),
            EmailEvent.sentiment,
            func.count(EmailEvent.id),
        )
        .join(Lead, EmailEvent.lead_id == Lead.id)
        .where(
            Lead.user_id == user_id,
            EmailEvent.event_type == "replied",
            EmailEvent.occurred_at >= start_dt,
            EmailEvent.occurred_at < end_dt,
        )
        .group_by("day", EmailEvent.sentiment)
    )).all()
    sentiment_by_key: dict[tuple[date, str], int] = {
        (row[0], row[1] or "none"): int(row[2]) for row in sentiment_rows
    }

    # ── 6. Assemble per-day rows and batch upsert in a single statement ────
    rows: list[dict[str, Any]] = []
    d = start_date
    while d <= end_date:
        rows.append({
            "id": uuid.uuid4(),
            "user_id": user_id,
            "snapshot_date": d,
            "leads_found": leads_by_day.get(d, 0),
            "leads_qualified": qualified_by_day.get(d, 0),
            "emails_sent": sent_by_day.get(d, 0),
            "emails_opened": events_by_key.get((d, "opened"), 0),
            "links_clicked": events_by_key.get((d, "clicked"), 0),
            "replies_received": events_by_key.get((d, "replied"), 0),
            "replies_positive": sentiment_by_key.get((d, "positive"), 0),
            "replies_neutral": sentiment_by_key.get((d, "neutral"), 0),
            "replies_negative": sentiment_by_key.get((d, "negative"), 0),
            "unsubscribes": sentiment_by_key.get((d, "unsubscribe"), 0),
        })
        d += timedelta(days=1)

    if not rows:
        return 0

    stmt = pg_insert(DailySnapshot).values(rows)
    update_cols = (
        "leads_found", "leads_qualified", "emails_sent", "emails_opened",
        "links_clicked", "replies_received", "replies_positive",
        "replies_neutral", "replies_negative", "unsubscribes",
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "snapshot_date"],
        set_={c: stmt.excluded[c] for c in update_cols},
    )

    try:
        await db.execute(stmt)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.error(f"rebuild_snapshots commit failed: {exc}")
        raise

    return len(rows)


# ── Weekly advice (Groq) ──────────────────────────────────────────────────────

async def generate_weekly_advice(
    db: AsyncSession, user_id: int,
) -> dict[str, Any]:
    """
    Asks Groq for three prioritised bullet points of actionable advice
    based on the freelancer's last-30-day funnel + last-60-day timing.

    The model gets only the JSON metrics, never raw lead PII. If Groq is
    unavailable, falls back to a deterministic rule-based summary so the
    UI always renders something useful.
    """
    funnel = await get_funnel_stats(db, user_id, time_range_days=30)
    timing = await get_timing_insights(db, user_id, time_range_days=60)
    niches = await get_niche_performance(db, user_id, time_range_days=90)

    # Trim to the top 5 niches and strip noisy fields before sending to LLM.
    top_niches = [
        {
            "category": n["category"],
            "sent": n["sent"],
            "open_rate": n["open_rate"],
            "reply_rate": n["reply_rate"],
        }
        for n in niches[:5]
    ]

    metrics_payload = {
        "funnel": funnel,
        "top_niches": top_niches,
        "peak_open": timing["peak_open"],
        "peak_reply": timing["peak_reply"],
    }

    prompt = (
        "You are a senior cold-outreach strategist. Below is a freelancer's "
        "last-30-day performance JSON. Return EXACTLY three short bullet "
        "points of prioritised advice — one per line, each starting with "
        "'- '. Each bullet must reference a specific metric from the JSON "
        "(e.g. 'open rate', 'reply rate', 'peak reply hour') and propose "
        "one concrete next action. Do NOT add a preamble or summary.\n\n"
        f"{metrics_payload}"
    )

    try:
        from app.modules.personalization.groq_client import GroqClient
        client = GroqClient()
        completion = await client.client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=client.model,
            temperature=0.4,
            max_tokens=400,
        )
        raw = completion.choices[0].message.content or ""
        bullets = [
            line.lstrip("-•* ").strip()
            for line in raw.splitlines()
            if line.strip().startswith(("-", "•", "*"))
        ]
        if not bullets:
            # Model returned plain prose — split on sentences as a fallback.
            bullets = [s.strip() for s in raw.split(".") if s.strip()][:3]
        return {
            "bullets": bullets[:3],
            "metrics": metrics_payload,
            "source": "groq",
        }
    except Exception as exc:
        logger.warning(f"Weekly advice Groq call failed, using fallback: {exc}")
        return {
            "bullets": _fallback_advice(metrics_payload),
            "metrics": metrics_payload,
            "source": "fallback",
        }


def _fallback_advice(metrics: dict[str, Any]) -> list[str]:
    """Deterministic advice when Groq is unreachable."""
    bullets: list[str] = []
    conv = metrics["funnel"]["conversions"]
    totals = metrics["funnel"]["totals"]
    open_rate = conv["sent_to_opened"]
    reply_rate = conv["sent_to_replied"]

    if totals["sent"] == 0:
        bullets.append(
            "No emails sent in the last 30 days — start a campaign before "
            "running another performance review."
        )
    elif open_rate < 0.20:
        bullets.append(
            f"Open rate is {open_rate:.0%} (below the 25–35% target). "
            "Rewrite subject lines to be specific and curiosity-driven."
        )
    elif reply_rate < 0.03:
        bullets.append(
            f"Reply rate is {reply_rate:.1%} on {totals['sent']} sends. "
            "Shorten the first email to 4–5 lines and end with one direct question."
        )
    else:
        bullets.append(
            f"Open rate {open_rate:.0%} and reply rate {reply_rate:.1%} are "
            "healthy. Scale send volume in your top niche."
        )

    if metrics["top_niches"]:
        best = metrics["top_niches"][0]
        bullets.append(
            f"'{best['category']}' replies at {best['reply_rate']:.1%}. "
            "Reallocate discovery weight toward this category for the next sprint."
        )

    peak = metrics.get("peak_reply") or metrics.get("peak_open")
    if peak:
        day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][peak["weekday"]]
        bullets.append(
            f"Engagement peaks {day} around {peak['hour']:02d}:00 UTC. "
            "Shift outreach send time to land 30 minutes before that."
        )
    return bullets[:3]
