"""
Per-Freelancer Job Override Model.

Lets individual freelancers opt out of specific jobs that are globally
enabled. Semantics:

- Missing row            → default RUN (opt-out model).
- status = HOLD          → that freelancer is skipped for the specified
                            job on both scheduled and manual runs.
- Global job = HOLD      → this override is ignored; the job is blocked
                            for everyone until the superuser re-enables
                            it globally.
- Global PRODUCTION_STATUS = HOLD → overrides every check.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from app.models.base import Base


class FreelancerJobConfig(Base):
    __tablename__ = "freelancer_job_configs"
    __table_args__ = (
        UniqueConstraint("user_id", "job_id", name="uq_freelancer_job_configs_user_job"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_id = Column(String(64), nullable=False, index=True)
    status = Column(String(10), nullable=False, default="RUN")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
