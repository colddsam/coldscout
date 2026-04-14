"""
Global Job Configuration Model.

Supersedes the legacy ``jobs_config.json`` file. Stores the authoritative,
superuser-controlled schedule and status (RUN/HOLD) for every APScheduler
job. Persisted in Postgres so the configuration is shared across all
backend replicas and visible for admin auditing.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.models.base import Base


class GlobalJobConfig(Base):
    """One row per scheduled job (e.g. discovery, outreach, weekly_optimization)."""

    __tablename__ = "global_job_configs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(64), nullable=False, unique=True, index=True)
    status = Column(String(10), nullable=False, default="RUN")
    type = Column(String(16), nullable=False, default="cron")
    hour = Column(Integer, nullable=True)
    minute = Column(Integer, nullable=True)
    minutes = Column(Integer, nullable=True)
    day_of_week = Column(String(8), nullable=True)

    updated_by = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
