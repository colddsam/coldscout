"""
Daily Reporting Database Model
==============================

This module defines the schema for daily performance metrics aggregation.

Classes
-------

*   `DailyReport`: Consolidates daily metrics for discovery, qualification, and outreach.

"""
import uuid
from sqlalchemy import Column, String, Integer, Date, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.models import Base

class DailyReport(Base):
    """
    Consolidates daily metrics for discovery, qualification, and outreach.

    Attributes
    ----------
    id : UUID
        Unique identifier for the daily report.
    report_date : Date
        Date for which the daily report is generated.
    leads_discovered : int
        Number of leads discovered on the report date.
    leads_qualified : int
        Number of leads qualified on the report date.
    emails_sent : int
        Number of emails sent on the report date.
    emails_opened : int
        Number of emails opened on the report date.
    links_clicked : int
        Number of links clicked on the report date.
    replies_received : int
        Number of replies received on the report date.
    new_conversions : int
        Number of new conversions on the report date.
    report_file_path : str
        File path of the report.
    email_sent_to : str
        Email address to which the report was sent.
    pipeline_started_at : DateTime
        Timestamp when the pipeline started.
    pipeline_ended_at : DateTime
        Timestamp when the pipeline ended.
    pipeline_status : str
        Status of the pipeline.
    error_log : str
        Error log for the report.
    created_at : DateTime
        Timestamp when the report was created.

    """
    __tablename__ = "daily_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_date = Column(Date, unique=True, nullable=False)

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