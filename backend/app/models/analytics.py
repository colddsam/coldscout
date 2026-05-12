"""
Analytics persistence models.

The pipeline emits raw EmailEvent rows and DailyReport summaries written
by the daily cron. Chart rendering needs the same shape but recomputed
from live events (not just the daily-cron view), so we cache a fast,
chart-ready aggregate here.

DailySnapshot is a small, indexed-by-(user_id, date) table; the
analytics engine upserts a row whenever it needs fresh data for a
window. It is intentionally a different surface from DailyReport
(which is owned by the pipeline run and includes the workbook path)
so reads from the dashboard never block on a running pipeline.
"""

import uuid
from sqlalchemy import (
    Column, Integer, Date, DateTime, ForeignKey, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.models import Base


class DailySnapshot(Base):
    """
    Cached daily metrics aggregated from EmailEvent / EmailOutreach / Lead.

    One row per (user_id, snapshot_date). The analytics engine recomputes
    the most recent rows on read; older rows are stable and reused.

    Reply sentiment columns ride along so the funnel/insight UI can plot
    positive vs negative replies without a second query.
    """
    __tablename__ = "daily_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "snapshot_date", name="uq_daily_snapshots_user_date"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    snapshot_date = Column(Date, nullable=False, index=True)

    # Funnel counters
    leads_found = Column(Integer, default=0, nullable=False)
    leads_qualified = Column(Integer, default=0, nullable=False)
    emails_sent = Column(Integer, default=0, nullable=False)
    emails_opened = Column(Integer, default=0, nullable=False)
    links_clicked = Column(Integer, default=0, nullable=False)
    replies_received = Column(Integer, default=0, nullable=False)

    # Sentiment split (derived from EmailEvent.sentiment)
    replies_positive = Column(Integer, default=0, nullable=False)
    replies_neutral = Column(Integer, default=0, nullable=False)
    replies_negative = Column(Integer, default=0, nullable=False)
    unsubscribes = Column(Integer, default=0, nullable=False)

    computed_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
