"""
AI Lead Generation System - Threads Channel Models

Defines the data structures for the Meta Threads lead generation channel.
These models track Threads profiles, discovered posts, engagement interactions,
and keyword search configurations. All tables use the same UUID-based primary
key pattern as the rest of the system to ensure data integrity.

Key Models:
1. ThreadsProfile: Discovered user profiles from Threads keyword search.
2. ThreadsPost: Cached post content for deduplication and context preservation.
3. ThreadsEngagement: Records of every reply interaction we send.
4. ThreadsSearchConfig: Admin-configurable keyword search schedules.
5. ThreadsAuth: OAuth token storage for long-lived access tokens.
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean, Column, DateTime, Float,
    ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models import Base


class ThreadsProfile(Base):
    """
    Represents a Threads user profile discovered via keyword search or mentions.
    Links to the core Lead model when a profile is converted to a lead.

    Qualification lifecycle:
      pending → qualified (score >= 50) → engaged (reply sent) → converted (email obtained)
      pending → rejected (score < 50 or filtered out)

    Uniqueness: the same Threads user can be discovered by multiple freelancers
    without conflict — uniqueness is enforced on (user_id, threads_user_id).
    Legacy rows with user_id IS NULL are grandfathered via a partial index.
    """
    __tablename__ = "threads_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", "threads_user_id", name="uq_threads_profiles_user_threads_id"),
    )

    id                   = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Owning freelancer. Nullable for legacy rows that predate multi-tenancy.
    user_id              = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                                  nullable=True, index=True)
    threads_user_id      = Column(String(100), nullable=False, index=True,
                                  comment="Numeric user ID from the Threads API.")
    username             = Column(String(255), nullable=True, index=True,
                                  comment="@handle on Threads.")
    name                 = Column(String(255), nullable=True)
    bio                  = Column(Text, nullable=True)
    followers_count      = Column(Integer, nullable=True)
    is_verified          = Column(Boolean, default=False)
    profile_picture_url  = Column(String, nullable=True)

    # Foreign key to core Lead (nullable — linked only after conversion)
    lead_id              = Column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"),
                                  nullable=True, index=True)

    # Qualification state
    qualification_status = Column(String(50), default="pending", index=True,
                                  comment="pending | qualified | rejected | engaged | converted")
    ai_score             = Column(Integer, default=0)
    qualification_notes  = Column(Text, nullable=True)
    discovered_via       = Column(String(50), default="keyword_search",
                                  comment="keyword_search | mention | manual")

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    posts       = relationship("ThreadsPost", back_populates="profile", cascade="all, delete-orphan")
    engagements = relationship("ThreadsEngagement", back_populates="profile", cascade="all, delete-orphan")
    lead        = relationship("Lead", backref="threads_profile", foreign_keys=[lead_id])


class ThreadsPost(Base):
    """
    Caches a Threads post discovered via keyword search.
    Used for deduplication (never engage the same post twice)
    and to preserve context for AI qualification prompts.
    """
    __tablename__ = "threads_posts"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    threads_media_id    = Column(String(100), unique=True, nullable=False, index=True,
                                 comment="Unique media ID from the Threads API.")
    threads_profile_id  = Column(UUID(as_uuid=True),
                                 ForeignKey("threads_profiles.id", ondelete="CASCADE"),
                                 nullable=False, index=True)

    text                = Column(Text, nullable=True)
    post_type           = Column(String(20), default="TEXT",
                                 comment="TEXT | IMAGE | VIDEO | CAROUSEL")
    permalink           = Column(String, nullable=True)
    timestamp           = Column(DateTime(timezone=True), nullable=True,
                                 comment="When the post was originally created on Threads.")
    like_count          = Column(Integer, nullable=True)
    reply_count         = Column(Integer, nullable=True)
    repost_count        = Column(Integer, nullable=True)
    search_keyword      = Column(String(255), nullable=True, index=True,
                                 comment="The keyword that matched this post during discovery.")

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    profile     = relationship("ThreadsProfile", back_populates="posts")
    engagements = relationship("ThreadsEngagement", back_populates="post", cascade="all, delete-orphan")


class ThreadsEngagement(Base):
    """
    Tracks every reply interaction sent to a Threads user.
    Enforces cooldown logic and prevents duplicate engagement.

    Lifecycle:
      pending → sent (reply published) → replied_back (user responded)
      pending → failed (API error or spam-filter rejection)
    """
    __tablename__ = "threads_engagements"

    id                      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Owning freelancer (denormalized from profile for cheaper per-user filtering).
    user_id                 = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                                     nullable=True, index=True)
    threads_profile_id      = Column(UUID(as_uuid=True),
                                     ForeignKey("threads_profiles.id", ondelete="CASCADE"),
                                     nullable=False, index=True)
    threads_post_id         = Column(UUID(as_uuid=True),
                                     ForeignKey("threads_posts.id", ondelete="CASCADE"),
                                     nullable=False, index=True)

    reply_threads_media_id  = Column(String(100), nullable=True, unique=True,
                                     comment="Media ID of our published reply on Threads.")
    reply_text              = Column(Text, nullable=False)
    engagement_type         = Column(String(30), default="reply",
                                     comment="reply | follow_up_reply")
    status                  = Column(String(30), default="pending", index=True,
                                     comment="pending | sent | failed | replied_back")
    ai_generated            = Column(Boolean, default=True)

    replied_at              = Column(DateTime(timezone=True), nullable=True)
    response_received_at    = Column(DateTime(timezone=True), nullable=True)
    response_text           = Column(Text, nullable=True,
                                     comment="The lead's reply to our engagement.")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    profile = relationship("ThreadsProfile", back_populates="engagements")
    post    = relationship("ThreadsPost", back_populates="engagements")


class ThreadsSearchConfig(Base):
    """
    Admin-configurable keyword search definitions.
    Each entry represents a keyword that the Threads discovery engine
    will periodically search for potential leads.
    """
    __tablename__ = "threads_search_configs"

    id                      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id                 = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                                     nullable=True, index=True)
    keyword                 = Column(String(255), nullable=False, index=True,
                                     comment="Search term, e.g. 'need web developer'.")
    category                = Column(String(100), nullable=True,
                                     comment="Business category mapping for this keyword.")
    search_type             = Column(String(10), default="RECENT",
                                     comment="TOP | RECENT — Threads search mode.")
    is_active               = Column(Boolean, default=True, index=True)
    last_searched_at        = Column(DateTime(timezone=True), nullable=True)
    max_results_per_search  = Column(Integer, default=25)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ThreadsAuth(Base):
    """
    Stores OAuth 2.0 access tokens for the Threads API.
    Supports automatic refresh of long-lived tokens (60-day expiry)
    before they expire, ensuring uninterrupted API access.
    """
    __tablename__ = "threads_auth"
    __table_args__ = (
        UniqueConstraint("user_id", "threads_user_id", name="uq_threads_auth_user_threads_id"),
    )

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Owning freelancer — each freelancer connects their own Threads account.
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                             nullable=True, index=True)
    threads_user_id = Column(String(100), nullable=False, index=True)
    access_token    = Column(Text, nullable=False)
    token_type      = Column(String(20), default="long_lived",
                             comment="short_lived | long_lived")
    expires_at      = Column(DateTime(timezone=True), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
