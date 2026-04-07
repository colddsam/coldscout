"""
User Profile Database Models.

Defines the ORM models for the comprehensive profile system:

  UserProfile:
    Core profile data shared by all users — username, phone, gender, bio,
    profile photo, banner, and visibility settings.

  BusinessProfile:
    Extended details for clients/brands — company name, industry, size, etc.

  FreelancerProfile:
    Extended details for freelancers — title, skills, rates, availability.

  PortfolioItem:
    Individual portfolio entries for freelancers — project showcase with
    title, description, images, tags, and per-item visibility control.
"""

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, ForeignKey, JSON,
    UniqueConstraint, func,
)
from sqlalchemy.orm import relationship
from app.models.base import Base


class UserProfile(Base):
    """
    Core profile information for every registered user.

    One-to-one relationship with the ``users`` table.  The ``username`` column
    is the public-facing slug used in profile URLs (``/u/{username}``).
    """
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

    username = Column(String(50), unique=True, nullable=False, index=True)
    """Unique public-facing handle (alphanumeric + underscores, 3-50 chars)."""

    phone = Column(String(20), nullable=True)
    gender = Column(String(30), nullable=True)
    """One of: male, female, non_binary, other, prefer_not_to_say."""

    date_of_birth = Column(DateTime(timezone=True), nullable=True)
    bio = Column(Text, nullable=True)
    """Short bio / tagline (max 500 chars enforced at schema level)."""

    location = Column(String(200), nullable=True)
    website = Column(String(500), nullable=True)

    profile_photo_url = Column(String(1000), nullable=True)
    banner_url = Column(String(1000), nullable=True)

    # Visibility controls
    is_public = Column(Boolean, default=True, nullable=False)
    """Whether the profile is discoverable and viewable by non-authenticated users."""

    show_email = Column(Boolean, default=False, nullable=False)
    show_phone = Column(Boolean, default=False, nullable=False)
    show_location = Column(Boolean, default=True, nullable=False)
    show_date_of_birth = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", backref="profile", uselist=False, lazy="joined")


class BusinessProfile(Base):
    """
    Extended profile for clients / brand owners.

    Stores company and brand information that is displayed on the user's
    public profile when they are not a freelancer.
    """
    __tablename__ = "business_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

    company_name = Column(String(200), nullable=True)
    brand_name = Column(String(200), nullable=True)
    industry = Column(String(100), nullable=True)
    company_size = Column(String(50), nullable=True)
    """One of: 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+."""

    founded_year = Column(Integer, nullable=True)
    company_website = Column(String(500), nullable=True)
    company_logo_url = Column(String(1000), nullable=True)
    company_description = Column(Text, nullable=True)

    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)
    postal_code = Column(String(20), nullable=True)

    linkedin_url = Column(String(500), nullable=True)
    twitter_url = Column(String(500), nullable=True)
    facebook_url = Column(String(500), nullable=True)
    instagram_url = Column(String(500), nullable=True)

    # Visibility
    is_public = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", backref="business_profile", uselist=False, lazy="joined")


class FreelancerProfile(Base):
    """
    Extended profile for freelancers.

    Stores professional details — skills, experience, rates, and availability
    — that are displayed on the freelancer's public profile.
    """
    __tablename__ = "freelancer_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

    professional_title = Column(String(200), nullable=True)
    """e.g. 'Full-Stack Developer', 'UI/UX Designer'."""

    skills = Column(JSON, nullable=True, default=list)
    """JSON array of skill strings."""

    experience_years = Column(Integer, nullable=True)
    hourly_rate = Column(String(50), nullable=True)
    """Free-text rate range, e.g. '$50-80/hr' or '4000-6000 INR/hr'."""

    availability = Column(String(50), nullable=True)
    """One of: available, busy, not_available, open_to_offers."""

    languages = Column(JSON, nullable=True, default=list)
    """JSON array of language strings."""

    education = Column(Text, nullable=True)
    certifications = Column(JSON, nullable=True, default=list)
    """JSON array of certification strings."""

    linkedin_url = Column(String(500), nullable=True)
    github_url = Column(String(500), nullable=True)
    twitter_url = Column(String(500), nullable=True)
    dribbble_url = Column(String(500), nullable=True)
    behance_url = Column(String(500), nullable=True)
    personal_website = Column(String(500), nullable=True)
    booking_url = Column(String(500), nullable=True)
    """External scheduling link (Calendly, Cal.com, etc.)."""

    # Visibility
    is_public = Column(Boolean, default=True, nullable=False)
    show_rates = Column(Boolean, default=True, nullable=False)
    show_availability = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", backref="freelancer_profile", uselist=False, lazy="joined")


class PortfolioItem(Base):
    """
    Individual portfolio entry for a freelancer.

    Showcases completed projects with title, description, images, links,
    and tags.  Each item has its own visibility toggle.
    """
    __tablename__ = "portfolio_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    project_url = Column(String(500), nullable=True)
    image_url = Column(String(1000), nullable=True)
    tags = Column(JSON, nullable=True, default=list)
    """JSON array of tag strings for categorization."""

    client_name = Column(String(200), nullable=True)
    """Name of the client (optional, for credibility)."""

    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)

    is_public = Column(Boolean, default=True, nullable=False)
    display_order = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", backref="portfolio_items", lazy="joined")
