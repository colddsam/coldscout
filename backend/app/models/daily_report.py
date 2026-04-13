"""
Daily Reporting Database Model
==============================

This module defines the schema for daily performance metrics aggregation.

Classes
-------

*   `DailyReport`: Consolidates daily metrics for discovery, qualification, and outreach.

"""
import uuid
from sqlalchemy import Column, String, Integer, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.models import Base

class DailyReport(Base):
    """
    Consolidates daily metrics for discovery, qualification, and outreach.

    Multi-tenant: each freelancer has independent daily reports.
    The (report_date, user_id) pair is unique.
    """
    __tablename__ = "daily_reports"
    __table_args__ = (
        UniqueConstraint("report_date", "user_id", name="uq_daily_reports_date_user"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    report_date = Column(Date, nullable=False)

    leads_discovered = Column(Integer, default=0)
    leads_qualified = Column(Integer, default=0)
    emails_sent = Column(Integer, default=0)
    emails_opened = Column(Integer, default=0)
    links_clicked = Column(Integer, default=0)
    replies_received = Column(Integer, default=0)
    new_conversions = Column(Integer, default=0)

    report_file_path = Column(String, nullable=True)
    email_sent_to = Column(String(255), nullable=True)

    pipeline_started_at = Column(DateTime(timezone=True), nullable=True)
    pipeline_ended_at = Column(DateTime(timezone=True), nullable=True)
    pipeline_status = Column(String(50), default="pending")
    error_log = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())