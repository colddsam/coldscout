"""
Billing Background Tasks.

Contains scheduled jobs for subscription lifecycle management:
  - check_subscription_expiry: Runs daily to downgrade users whose
    subscription period has ended.
"""

from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import select, update

from app.core.database import get_session_maker


async def check_subscription_expiry() -> None:
    """
    Daily job — expires overdue subscriptions and downgrades users to free.

    Finds all Subscription records where:
      - status is 'active' OR 'cancelled'
      - current_period_end is in the past

    For each expired subscription:
      1. Sets subscription.status = 'expired'
      2. Sets user.plan = 'free', user.plan_expires_at = NULL
    """
    from app.models.subscription import Subscription
    from app.models.user import User

    now = datetime.now(timezone.utc)
    expired_count = 0

    session_maker = get_session_maker()
    try:
        async with session_maker() as db:
            result = await db.execute(
                select(Subscription).where(
                    Subscription.status.in_(["active", "cancelled"]),
                    Subscription.current_period_end < now,
                )
            )
            expired_subs = result.scalars().all()

            for sub in expired_subs:
                sub.status = "expired"
                sub.updated_at = now

                await db.execute(
                    update(User)
                    .where(User.id == sub.user_id)
                    .values(plan="free", plan_expires_at=None)
                )
                expired_count += 1

            if expired_count:
                await db.commit()
                logger.info(
                    f"Subscription expiry check: expired {expired_count} subscription(s)."
                )
            else:
                logger.debug("Subscription expiry check: no expired subscriptions found.")

    except Exception as exc:
        logger.error(f"Subscription expiry check failed: {exc}")
