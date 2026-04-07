"""
Verification Pydantic Schemas.

Request and response models for profile verification endpoints.
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class VerifyFieldRequest(BaseModel):
    """Request to verify specific profile fields."""
    fields: List[str] = Field(
        ...,
        min_length=1,
        max_length=20,
        description="List of field names to verify (e.g., ['email', 'phone', 'linkedin_url'])"
    )


class VerificationStatusItem(BaseModel):
    """Status of a single field's verification."""
    field_name: str
    field_value: str
    status: str  # pending, verified, failed, expired
    method: Optional[str] = None
    failure_reason: Optional[str] = None
    verified_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    updated_at: datetime

    class Config:
        from_attributes = True


class VerificationStatusResponse(BaseModel):
    """Full verification status for a user's profile."""
    verifications: List[VerificationStatusItem]
    verified_count: int
    total_count: int


class VerifyResultResponse(BaseModel):
    """Response from a verification trigger."""
    results: List[VerificationStatusItem]
    message: str
