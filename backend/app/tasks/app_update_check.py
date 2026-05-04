"""
App-update notification poller.

Fires every 15 minutes from APScheduler. Polls the GitHub Releases API
for the latest ``android-v*`` tag, compares it against the version we
last announced, and — if it's newer — emits ``app_update_available``
into every active freelancer's notification feed (and pushes an OS
notification through Web Push / FCM as a side-effect).

State is intentionally stored in a tiny JSON file on disk
(``tmp/last_known_release.json``). A dedicated DB table would be
overkill for one string. The file is tolerant of missing/corrupt
contents so a wipe just causes one extra notification on next run.

Failure model: every external call (GitHub fetch, DB enumerate,
notification dispatch) is wrapped so a transient failure logs and the
job exits cleanly. APScheduler will retry on its next interval; we never
raise into the scheduler thread.
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Optional

import httpx
from loguru import logger
from sqlalchemy import select

from app.core.database import get_session_maker
from app.models.user import User
from app.modules.notifications import events as notif_events


GITHUB_REPO = "colddsam/coldscout"
RELEASES_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases"
STATE_FILE = Path(__file__).resolve().parent.parent.parent / "tmp" / "last_known_release.json"
HTTP_TIMEOUT_S = 15.0


def _load_last_known() -> Optional[str]:
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        v = data.get("tag")
        return str(v) if v else None
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def _save_last_known(tag: str) -> None:
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump({"tag": tag}, f)
    except OSError as e:
        logger.warning(f"app_update_check: failed to persist last-known tag: {e}")


async def _fetch_latest_release() -> Optional[dict]:
    """Return the newest non-draft, non-prerelease ``android-v*`` release."""
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S) as client:
            resp = await client.get(RELEASES_URL, headers=headers)
        if resp.status_code != 200:
            logger.debug(f"app_update_check: GitHub returned {resp.status_code}")
            return None
        for release in resp.json():
            if release.get("draft") or release.get("prerelease"):
                continue
            tag = release.get("tag_name", "")
            if tag.lower().startswith("android-v"):
                return release
        return None
    except (httpx.HTTPError, ValueError) as e:
        logger.debug(f"app_update_check: GitHub fetch failed: {e}")
        return None


async def _active_freelancer_ids() -> list[int]:
    """All currently-enabled freelancer accounts who should be notified."""
    try:
        async with get_session_maker()() as db:
            res = await db.execute(
                select(User.id)
                .where(User.is_active.is_(True))
                .where(User.role == "freelancer")
            )
            return [int(r) for r in res.scalars().all() if r]
    except Exception as e:
        logger.warning(f"app_update_check: failed to enumerate users: {e}")
        return []


async def check_app_update() -> None:
    """One pass of the poller. Safe to invoke from APScheduler."""
    release = await _fetch_latest_release()
    if not release:
        return

    tag = str(release.get("tag_name", "")).strip()
    if not tag:
        return

    last_known = _load_last_known()
    if last_known == tag:
        return  # No new release.

    # Persist the new tag IMMEDIATELY so a partial fan-out never causes a
    # double-fire on the next interval.
    _save_last_known(tag)

    if last_known is None:
        # First boot after this poller was added — don't spam every user
        # about a release they may already have. Just record the baseline.
        logger.info(f"app_update_check: baseline tag recorded ({tag}); skipping notify on first run.")
        return

    version_name = tag.lower().replace("android-v", "")
    notes = (release.get("body") or "").strip()
    notes_short = notes.split("\n")[0][:200] if notes else None
    download_url = release.get("html_url") or "/download"

    user_ids = await _active_freelancer_ids()
    if not user_ids:
        logger.info(f"app_update_check: new release {tag} but no active freelancers to notify.")
        return

    sent = 0
    failed = 0
    session_maker = get_session_maker()
    for uid in user_ids:
        try:
            async with session_maker() as db:
                await notif_events.app_update_available(
                    db,
                    user_id=uid,
                    version=version_name,
                    platform="android",
                    notes=notes_short,
                    download_url=download_url,
                )
            sent += 1
        except Exception as e:
            failed += 1
            logger.warning(f"app_update_check: notify failed for user={uid}: {e}")
        # Be polite to push providers — small yield between fan-out targets.
        await asyncio.sleep(0)

    logger.info(
        f"app_update_check: announced {tag} to {sent} user(s), {failed} failure(s)."
    )
