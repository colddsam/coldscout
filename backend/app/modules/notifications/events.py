"""
High-level notification "events" used across the codebase.

Centralising these keeps copy / icons / group-keys consistent everywhere a
stage hooks in (manual triggers, the APScheduler runner, Celery, future
webhooks). Each helper builds a ``NotificationPayload`` and calls into
``push_dispatcher.notify_user`` so the in-app feed + OS push happen together.

Every function takes a ``user_id`` — ALWAYS pass the freelancer who triggered
or owns the work, never a stand-in like 0 or "system". Notifications are
strictly per-user and the feed/push pipeline enforces that downstream.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import (
    KIND_APP_UPDATE,
    KIND_STAGE_FAILED,
    KIND_STAGE_FINISHED,
    KIND_STAGE_PROGRESS,
    KIND_STAGE_STARTED,
    KIND_SYSTEM,
)

from .push_dispatcher import NotificationPayload, notify_user


# Stable, human-readable labels used in titles. Keep in sync with
# ``app.core.job_manager`` so the UI shows the same names everywhere.
STAGE_LABELS = {
    "discovery": "Discovery",
    "qualification": "Qualification",
    "personalization": "Personalization",
    "outreach": "Outreach",
    "report": "Daily Report",
    "all": "Full pipeline",
    "lead-outreach": "Lead Outreach",
    "threads-discovery": "Threads Discovery",
    "threads-qualification": "Threads Qualification",
    "threads-engagement": "Threads Engagement",
}


def _stage_label(stage: str) -> str:
    return STAGE_LABELS.get(stage, stage.replace("-", " ").replace("_", " ").title())


def _stage_group(stage: str, *, run_id: Optional[str] = None) -> str:
    """Same group_key for start/progress/finish so the feed collapses them."""
    if run_id:
        return f"stage:{stage}:{run_id}"
    return f"stage:{stage}"


# ── Stage lifecycle ───────────────────────────────────────────────────────────


async def stage_started(
    db: AsyncSession,
    *,
    user_id: int,
    stage: str,
    trigger: str = "manual",
    extra: Optional[dict[str, Any]] = None,
    run_id: Optional[str] = None,
) -> None:
    """Fire when a pipeline stage begins running for ``user_id``.

    ``trigger`` is one of ``"manual"``, ``"scheduled"``, or ``"system"`` so
    the UI badge can distinguish a button-click run from a cron-driven one.
    """
    label = _stage_label(stage)
    body = "Started just now…"
    if trigger == "scheduled":
        body = "Scheduled run started…"
    payload: dict[str, Any] = {"stage": stage, "trigger": trigger, "status": "running"}
    if extra:
        payload.update(extra)
    await notify_user(
        db,
        user_id,
        NotificationPayload(
            kind=KIND_STAGE_STARTED,
            title=f"{label} running",
            body=body,
            url="/pipeline",
            payload=payload,
            group_key=_stage_group(stage, run_id=run_id),
        ),
    )


async def stage_finished(
    db: AsyncSession,
    *,
    user_id: int,
    stage: str,
    summary: str,
    counts: Optional[dict[str, int]] = None,
    run_id: Optional[str] = None,
) -> None:
    """Fire when a stage completes successfully. ``summary`` is a one-liner
    rendered as the body, e.g. ``"42 leads qualified, 3 skipped."``"""
    label = _stage_label(stage)
    payload: dict[str, Any] = {"stage": stage, "status": "finished"}
    if counts:
        payload["counts"] = counts
    await notify_user(
        db,
        user_id,
        NotificationPayload(
            kind=KIND_STAGE_FINISHED,
            title=f"{label} complete",
            body=summary,
            url="/pipeline",
            payload=payload,
            group_key=_stage_group(stage, run_id=run_id),
        ),
    )


async def stage_failed(
    db: AsyncSession,
    *,
    user_id: int,
    stage: str,
    error: str,
    run_id: Optional[str] = None,
) -> None:
    """Fire when a stage raises. ``error`` is the short message — full
    tracebacks belong in the server log, not the user-facing notification."""
    label = _stage_label(stage)
    await notify_user(
        db,
        user_id,
        NotificationPayload(
            kind=KIND_STAGE_FAILED,
            title=f"{label} failed",
            body=error[:240],
            url="/pipeline",
            payload={"stage": stage, "status": "failed", "error": error},
            group_key=_stage_group(stage, run_id=run_id),
        ),
    )


async def stage_progress(
    db: AsyncSession,
    *,
    user_id: int,
    stage: str,
    message: str,
    counts: Optional[dict[str, int]] = None,
    run_id: Optional[str] = None,
) -> None:
    """Optional incremental update mid-stage. Coalesces with start/finish via
    the shared group_key so the live banner mutates in place."""
    label = _stage_label(stage)
    payload: dict[str, Any] = {"stage": stage, "status": "running"}
    if counts:
        payload["counts"] = counts
    await notify_user(
        db,
        user_id,
        NotificationPayload(
            kind=KIND_STAGE_PROGRESS,
            title=f"{label} in progress",
            body=message,
            url="/pipeline",
            payload=payload,
            group_key=_stage_group(stage, run_id=run_id),
        ),
    )


# ── App / system notifications ────────────────────────────────────────────────


async def app_update_available(
    db: AsyncSession,
    *,
    user_id: int,
    version: str,
    platform: str,
    notes: Optional[str] = None,
    download_url: Optional[str] = None,
) -> None:
    """Fire on a new build (Android APK release, PWA SW activation, etc.)."""
    await notify_user(
        db,
        user_id,
        NotificationPayload(
            kind=KIND_APP_UPDATE,
            title=f"Cold Scout {version} is ready",
            body=notes or f"Tap to install the latest {platform} build.",
            url=download_url or "/download",
            payload={"version": version, "platform": platform, "download_url": download_url},
            group_key=f"app-update:{platform}:{version}",
        ),
    )


async def system_message(
    db: AsyncSession,
    *,
    user_id: int,
    title: str,
    body: str,
    url: Optional[str] = None,
) -> None:
    """Generic operator-driven announcement (maintenance, comms)."""
    await notify_user(
        db,
        user_id,
        NotificationPayload(
            kind=KIND_SYSTEM,
            title=title,
            body=body,
            url=url,
        ),
    )
