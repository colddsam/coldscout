"""
Pydantic response schemas for the analytics dashboard endpoints.

These are wire-format only; the engine returns plain dicts and we
validate / document the shape here.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class FunnelStage(BaseModel):
    key: str
    label: str
    count: int


class FunnelConversions(BaseModel):
    discovered_to_qualified: float
    qualified_to_sent: float
    sent_to_opened: float
    opened_to_clicked: float
    opened_to_replied: float
    sent_to_replied: float


class FunnelTotals(BaseModel):
    discovered: int
    qualified: int
    sent: int
    opened: int
    clicked: int
    replied: int


class FunnelResponse(BaseModel):
    window_days: int
    totals: FunnelTotals
    stages: list[FunnelStage]
    conversions: FunnelConversions


class NicheRow(BaseModel):
    category: str
    discovered: int
    sent: int
    opened: int
    replied: int
    open_rate: float
    reply_rate: float


class TimingPeak(BaseModel):
    weekday: int
    hour: int
    count: int


class TimingResponse(BaseModel):
    window_days: int
    weekday_labels: list[str]
    opens: list[list[int]]
    replies: list[list[int]]
    peak_open: Optional[TimingPeak] = None
    peak_reply: Optional[TimingPeak] = None


class VolumePoint(BaseModel):
    date: str
    emails_sent: int
    emails_opened: int
    replies_received: int
    leads_found: int
    open_rate: float = 0.0
    reply_rate: float = 0.0


class SentimentBucket(BaseModel):
    key: str
    label: str
    count: int
    share: float


class SentimentResponse(BaseModel):
    window_days: int
    total_replies: int
    buckets: list[SentimentBucket]


class AdviceResponse(BaseModel):
    bullets: list[str] = Field(default_factory=list)
    metrics: dict
    source: str
