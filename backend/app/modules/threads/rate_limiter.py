"""
Threads Reply Rate Limiter.

Enforces daily reply caps and per-user cooldown periods to prevent
spam flagging and protect the Threads account from suspension.

Checks:
  1. Daily reply cap (default: 20 replies/day) — configurable via THREADS_DAILY_REPLY_CAP
  2. Per-user cooldown (default: 24 hours) — no replying to the same user within window
  3. Tracks state via database queries on the threads_engagements table

All queries are scoped to a freelancer (``user_id``) so each freelancer
gets their own daily cap and cooldown bucket.

SAFE: Read-only — never modifies engagement records itself.
"""
from datetime import datetime, timedelta, timezone
from loguru import logger
from sqlalchemy import select, func

from app.config import get_settings
from app.core.database import get_session_maker
from app.models.threads import ThreadsEngagement

settings = get_settings()


class ThreadsRateLimiter:
    """
    Stateless rate limiter — queries the database for current usage stats.
    This avoids in-memory state that would be lost on restart.
    """

    async def can_send_reply(
        self, threads_profile_id: str | None = None,
        user_id: int | None = None,
    ) -> tuple[bool, str]:
        """
        Check if we can send a reply right now for the given freelancer.

        When ``user_id`` is None the limiter falls back to a global view of
        all engagements (legacy behavior) — prefer passing user_id so each
        freelancer has their own independent cap.
        """
        async with get_session_maker()() as db:
            today_start = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            daily_count_stmt = (
                select(func.count(ThreadsEngagement.id))
                .where(
                    ThreadsEngagement.status == "sent",
                    ThreadsEngagement.replied_at >= today_start,
                )
            )
            if user_id is not None:
                daily_count_stmt = daily_count_stmt.where(
                    ThreadsEngagement.user_id == user_id
                )
            result = await db.execute(daily_count_stmt)
            daily_count = result.scalar() or 0

            cap = settings.THREADS_DAILY_REPLY_CAP
            if daily_count >= cap:
                return False, f"Daily reply cap reached ({daily_count}/{cap})"

            if threads_profile_id:
                cooldown_hours = settings.THREADS_REPLY_COOLDOWN_HOURS
                cutoff = datetime.now(timezone.utc) - timedelta(hours=cooldown_hours)

                user_recent_stmt = (
                    select(func.count(ThreadsEngagement.id))
                    .where(
                        ThreadsEngagement.threads_profile_id == threads_profile_id,
                        ThreadsEngagement.status == "sent",
                        ThreadsEngagement.replied_at >= cutoff,
                    )
                )
                if user_id is not None:
                    user_recent_stmt = user_recent_stmt.where(
                        ThreadsEngagement.user_id == user_id
                    )
                result = await db.execute(user_recent_stmt)
                user_recent = result.scalar() or 0

                if user_recent > 0:
                    return False, (
                        f"Cooldown active for profile {threads_profile_id} "
                        f"({cooldown_hours}h window, {user_recent} recent reply)"
                    )

            remaining = cap - daily_count
            return True, f"OK — {remaining} replies remaining today"

    async def get_daily_stats(self, user_id: int | None = None) -> dict:
        """
        Return current daily reply usage stats for dashboards / reporting,
        scoped to a single freelancer when ``user_id`` is provided.
        """
        async with get_session_maker()() as db:
            today_start = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )

            sent_stmt = (
                select(func.count(ThreadsEngagement.id))
                .where(
                    ThreadsEngagement.status == "sent",
                    ThreadsEngagement.replied_at >= today_start,
                )
            )
            failed_stmt = (
                select(func.count(ThreadsEngagement.id))
                .where(
                    ThreadsEngagement.status == "failed",
                    ThreadsEngagement.created_at >= today_start,
                )
            )
            replied_back_stmt = (
                select(func.count(ThreadsEngagement.id))
                .where(
                    ThreadsEngagement.status == "replied_back",
                    ThreadsEngagement.response_received_at >= today_start,
                )
            )

            if user_id is not None:
                sent_stmt = sent_stmt.where(ThreadsEngagement.user_id == user_id)
                failed_stmt = failed_stmt.where(ThreadsEngagement.user_id == user_id)
                replied_back_stmt = replied_back_stmt.where(
                    ThreadsEngagement.user_id == user_id
                )

            sent = (await db.execute(sent_stmt)).scalar() or 0
            failed = (await db.execute(failed_stmt)).scalar() or 0
            replied_back = (await db.execute(replied_back_stmt)).scalar() or 0

            return {
                "daily_sent": sent,
                "daily_failed": failed,
                "daily_replied_back": replied_back,
                "daily_cap": settings.THREADS_DAILY_REPLY_CAP,
                "remaining": max(0, settings.THREADS_DAILY_REPLY_CAP - sent),
            }
