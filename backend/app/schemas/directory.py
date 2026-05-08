"""
Public Lead Directory — Pydantic Schemas.

Privacy-safe response models for the public directory API.
These schemas intentionally omit sensitive fields (email, phone,
qualification_notes, competitor_intel) to prevent PII leakage.
"""

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime


class DirectoryLocation(BaseModel):
    """A city/region group with its lead count."""

    city: str
    region: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    lead_count: int = Field(ge=0)


class DirectoryLocationList(BaseModel):
    """Aggregated location groups for the directory index."""

    locations: List[DirectoryLocation]
    total_locations: int


class DirectoryIndustry(BaseModel):
    """A category group with its lead count for a specific location."""

    category: str
    slug: str
    lead_count: int = Field(ge=0)


class DirectoryLeadSummary(BaseModel):
    """Compact, privacy-safe lead card for directory listings.

    No email, phone, or internal notes are ever exposed.
    """

    slug: str
    business_name: str
    category: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    ai_score_tier: str = Field(
        description="Anonymized tier: A (80-100), B (50-79), C (0-49)"
    )
    has_website: bool = False
    website_url: Optional[str] = None
    google_maps_url: Optional[str] = None
    discovered_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DirectoryLeadDetail(BaseModel):
    """Detailed, privacy-safe lead view for individual directory pages.

    Enriched with website quality signals but still no email/phone.
    """

    slug: str
    business_name: str
    category: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    postal_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    ai_score_tier: str
    has_website: bool = False
    website_url: Optional[str] = None
    google_maps_url: Optional[str] = None

    # Website quality signals (public-safe)
    is_mobile_responsive: Optional[bool] = None
    has_online_booking: Optional[bool] = None
    has_ecommerce: Optional[bool] = None
    has_social_media: bool = False
    website_title: Optional[str] = None

    discovered_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DirectoryListResponse(BaseModel):
    """Paginated directory listing response."""

    leads: List[DirectoryLeadSummary]
    total: int
    page: int
    pages: int
    industry: str
    city: str


class DirectoryIndustryList(BaseModel):
    """Aggregated industry/category groups for the directory index."""

    industries: List[DirectoryIndustry]
    total_industries: int


class DirectoryStats(BaseModel):
    """High-level directory statistics for the public landing page."""

    total_leads: int
    total_cities: int
    total_industries: int
    total_countries: int
    top_industries: List[DirectoryIndustry]
    top_locations: List[DirectoryLocation]
