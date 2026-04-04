from pydantic import BaseModel, ConfigDict
from typing import Optional, Any, List
from datetime import datetime
from uuid import UUID

class LeadSocialNetworkBase(BaseModel):
    """Base schema for lead social network profiles."""
    platform: str
    url: str

class LeadSocialNetworkResponse(LeadSocialNetworkBase):
    """Response schema including database ID and timestamps."""
    id: UUID
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class LeadBase(BaseModel):
    """Base schema for a local business lead prospect."""
    place_id: str
    business_name: str
    category: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website_url: Optional[str] = None
    google_maps_url: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    state: Optional[str] = None
    
    status: Optional[str] = None
    notes: Optional[str] = None

class LeadResponse(LeadBase):
    """Full response schema for a lead including qualification and lifecycle data."""
    id: UUID
    ai_score: Optional[int] = None
    has_website: bool
    has_social_media: bool
    qualification_notes: Optional[str] = None
    competitor_intel: Optional[str] = None
    discovered_at: Optional[datetime] = None
    qualified_at: Optional[datetime] = None
    email_sent_at: Optional[datetime] = None
    first_opened_at: Optional[datetime] = None
    first_clicked_at: Optional[datetime] = None
    first_replied_at: Optional[datetime] = None
    first_replied_at: Optional[datetime] = None
    
    followup_count: Optional[int] = None
    follow_up_stage: Optional[int] = None
    sequence_stage: Optional[int] = None
    next_followup_at: Optional[datetime] = None
    followup_sequence_active: Optional[bool] = None
    reply_classification: Optional[str] = None
    reply_confidence: Optional[float] = None
    suggested_reply_draft: Optional[str] = None
    reply_key_signal: Optional[str] = None
    lead_tier: Optional[str] = None
    website_title: Optional[str] = None
    website_copyright_year: Optional[int] = None
    is_mobile_responsive: Optional[bool] = None
    has_online_booking: Optional[bool] = None
    has_ecommerce: Optional[bool] = None
    
    model_config = ConfigDict(from_attributes=True)

class LeadDetailResponse(LeadResponse):
    """Detailed lead response schema including related multi-channel social networks."""
    social_networks: List[LeadSocialNetworkResponse] = []

class LeadUpdate(BaseModel):
    """Schema for updating a lead's manual notes or status."""
    status: Optional[str] = None
    notes: Optional[str] = None

class LeadListResponse(BaseModel):
    """Paginated response schema for multiple leads."""
    leads: List[LeadResponse]
    total: int
    page: int
    pages: int
