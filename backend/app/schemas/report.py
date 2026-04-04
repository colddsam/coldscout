from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime, date
from uuid import UUID

class ReportResponse(BaseModel):
    id: UUID
    report_date: date
    leads_discovered: int
    leads_qualified: int
    emails_sent: int
    emails_opened: int
    links_clicked: int
    replies_received: int
    new_conversions: int
    pipeline_status: str
    pipeline_started_at: Optional[datetime] = None
    pipeline_ended_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)
