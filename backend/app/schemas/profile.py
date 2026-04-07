"""
Profile Pydantic Schemas.

Request and response models for the profile API endpoints.
Covers user profiles, business profiles, freelancer profiles,
portfolio items, and visibility settings.
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, field_validator
import re


# ── Username Validation ───────────────────────────────────────────────────────

USERNAME_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]{2,49}$")

RESERVED_USERNAMES = frozenset({
    "admin", "administrator", "root", "system", "support", "help",
    "api", "www", "mail", "ftp", "login", "signup", "auth",
    "profile", "settings", "billing", "dashboard", "overview",
    "null", "undefined", "anonymous", "user", "users", "coldscout",
})


# ── User Profile ──────────────────────────────────────────────────────────────

class UserProfileCreate(BaseModel):
    """Initial profile creation — only username is required."""
    username: str = Field(..., min_length=3, max_length=50)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip().lower()
        if not USERNAME_PATTERN.match(v):
            raise ValueError(
                "Username must start with a letter, contain only letters, "
                "numbers, and underscores, and be 3-50 characters long."
            )
        if v in RESERVED_USERNAMES:
            raise ValueError("This username is reserved.")
        return v


class UserProfileUpdate(BaseModel):
    """Fields that can be updated on the core profile."""
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    phone: Optional[str] = Field(None, max_length=20)
    gender: Optional[str] = Field(None, max_length=30)
    date_of_birth: Optional[datetime] = None
    bio: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = Field(None, max_length=200)
    website: Optional[str] = Field(None, max_length=500)
    profile_photo_url: Optional[str] = None
    banner_url: Optional[str] = None
    is_public: Optional[bool] = None
    show_email: Optional[bool] = None
    show_phone: Optional[bool] = None
    show_location: Optional[bool] = None
    show_date_of_birth: Optional[bool] = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip().lower()
        if not USERNAME_PATTERN.match(v):
            raise ValueError(
                "Username must start with a letter, contain only letters, "
                "numbers, and underscores, and be 3-50 characters long."
            )
        if v in RESERVED_USERNAMES:
            raise ValueError("This username is reserved.")
        return v

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        allowed = {"male", "female", "non_binary", "other", "prefer_not_to_say"}
        if v not in allowed:
            raise ValueError(f"Gender must be one of: {', '.join(sorted(allowed))}")
        return v


class UserProfileOut(BaseModel):
    """Response model for the authenticated user's own profile."""
    id: int
    user_id: int
    username: str
    phone: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    profile_photo_url: Optional[str] = None
    banner_url: Optional[str] = None
    is_public: bool = True
    show_email: bool = False
    show_phone: bool = False
    show_location: bool = True
    show_date_of_birth: bool = False
    created_at: datetime
    updated_at: datetime

    # Joined user fields
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    plan: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class UsernameCheckResponse(BaseModel):
    available: bool
    message: str


# ── Business Profile ──────────────────────────────────────────────────────────

class BusinessProfileUpdate(BaseModel):
    company_name: Optional[str] = Field(None, max_length=200)
    brand_name: Optional[str] = Field(None, max_length=200)
    industry: Optional[str] = Field(None, max_length=100)
    company_size: Optional[str] = Field(None, max_length=50)
    founded_year: Optional[int] = None
    company_website: Optional[str] = Field(None, max_length=500)
    company_logo_url: Optional[str] = None
    company_description: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    linkedin_url: Optional[str] = Field(None, max_length=500)
    twitter_url: Optional[str] = Field(None, max_length=500)
    facebook_url: Optional[str] = Field(None, max_length=500)
    instagram_url: Optional[str] = Field(None, max_length=500)
    is_public: Optional[bool] = None

    @field_validator("company_size")
    @classmethod
    def validate_company_size(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        allowed = {"1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"}
        if v not in allowed:
            raise ValueError(f"Company size must be one of: {', '.join(sorted(allowed))}")
        return v


class BusinessProfileOut(BaseModel):
    id: int
    user_id: int
    company_name: Optional[str] = None
    brand_name: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    founded_year: Optional[int] = None
    company_website: Optional[str] = None
    company_logo_url: Optional[str] = None
    company_description: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    linkedin_url: Optional[str] = None
    twitter_url: Optional[str] = None
    facebook_url: Optional[str] = None
    instagram_url: Optional[str] = None
    is_public: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Freelancer Profile ────────────────────────────────────────────────────────

class FreelancerProfileUpdate(BaseModel):
    professional_title: Optional[str] = Field(None, max_length=200)
    skills: Optional[List[str]] = None
    experience_years: Optional[int] = None
    hourly_rate: Optional[str] = Field(None, max_length=50)
    availability: Optional[str] = Field(None, max_length=50)
    languages: Optional[List[str]] = None
    education: Optional[str] = None
    certifications: Optional[List[str]] = None
    linkedin_url: Optional[str] = Field(None, max_length=500)
    github_url: Optional[str] = Field(None, max_length=500)
    twitter_url: Optional[str] = Field(None, max_length=500)
    dribbble_url: Optional[str] = Field(None, max_length=500)
    behance_url: Optional[str] = Field(None, max_length=500)
    personal_website: Optional[str] = Field(None, max_length=500)
    booking_url: Optional[str] = Field(None, max_length=500)
    is_public: Optional[bool] = None
    show_rates: Optional[bool] = None
    show_availability: Optional[bool] = None

    @field_validator("booking_url")
    @classmethod
    def validate_booking_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return v
        if not v.startswith(("https://", "http://")):
            raise ValueError("Booking URL must start with https:// or http://")
        return v

    @field_validator("availability")
    @classmethod
    def validate_availability(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        allowed = {"available", "busy", "not_available", "open_to_offers"}
        if v not in allowed:
            raise ValueError(f"Availability must be one of: {', '.join(sorted(allowed))}")
        return v


class FreelancerProfileOut(BaseModel):
    id: int
    user_id: int
    professional_title: Optional[str] = None
    skills: Optional[List[str]] = None
    experience_years: Optional[int] = None
    hourly_rate: Optional[str] = None
    availability: Optional[str] = None
    languages: Optional[List[str]] = None
    education: Optional[str] = None
    certifications: Optional[List[str]] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    twitter_url: Optional[str] = None
    dribbble_url: Optional[str] = None
    behance_url: Optional[str] = None
    personal_website: Optional[str] = None
    booking_url: Optional[str] = None
    is_public: bool = True
    show_rates: bool = True
    show_availability: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Portfolio ─────────────────────────────────────────────────────────────────

class PortfolioItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    project_url: Optional[str] = Field(None, max_length=500)
    image_url: Optional[str] = None
    tags: Optional[List[str]] = None
    client_name: Optional[str] = Field(None, max_length=200)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_public: bool = True
    display_order: int = 0


class PortfolioItemUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    project_url: Optional[str] = Field(None, max_length=500)
    image_url: Optional[str] = None
    tags: Optional[List[str]] = None
    client_name: Optional[str] = Field(None, max_length=200)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_public: Optional[bool] = None
    display_order: Optional[int] = None


class PortfolioItemOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str] = None
    project_url: Optional[str] = None
    image_url: Optional[str] = None
    tags: Optional[List[str]] = None
    client_name: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_public: bool = True
    display_order: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Public Profile (aggregated view) ─────────────────────────────────────────

class PublicVerificationItem(BaseModel):
    """Minimal verification info exposed on public profiles."""
    field_name: str
    status: str
    verified_at: Optional[datetime] = None


class PublicProfileOut(BaseModel):
    """Aggregated public-facing profile returned for /u/{username}."""
    # Core
    username: str
    full_name: Optional[str] = None
    role: Optional[str] = None
    plan: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    profile_photo_url: Optional[str] = None
    banner_url: Optional[str] = None
    avatar_url: Optional[str] = None

    # Conditionally included based on visibility
    email: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    gender: Optional[str] = None

    # Role-specific (only one will be populated)
    business: Optional[BusinessProfileOut] = None
    freelancer: Optional[FreelancerProfileOut] = None
    portfolio: Optional[List[PortfolioItemOut]] = None

    # Verification badges
    verifications: Optional[List[PublicVerificationItem]] = None

    member_since: Optional[datetime] = None


class FileUploadResponse(BaseModel):
    url: str
    message: str
