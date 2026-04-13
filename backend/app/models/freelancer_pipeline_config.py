"""
Freelancer Pipeline Configuration Model.

Stores per-freelancer production status for multi-tenant pipeline isolation.
Each freelancer can independently control their daily pipeline execution
while respecting the global production status override.

Production Status Logic:
  - Global HOLD  → ALL pipelines stop (daily + manual triggers)
  - Freelancer HOLD → Only that freelancer's daily pipeline stops;
                       manual triggers still work for them
  - Global RUN + Freelancer RUN → Daily pipeline runs normally
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.models.base import Base


class FreelancerPipelineConfig(Base):
    """
    Per-freelancer pipeline configuration.

    Each freelancer with role='freelancer' gets one row in this table
    (auto-created on first pipeline interaction or login).

    Columns
    -------
    id                  Auto-incrementing primary key.
    user_id             FK to users.id — the freelancer who owns this config.
    production_status   'RUN' or 'HOLD' — controls daily pipeline for this freelancer.
    created_at          Row creation timestamp.
    updated_at          Last modification timestamp.
    """
    __tablename__ = "freelancer_pipeline_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    production_status = Column(String(10), default="RUN", nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
