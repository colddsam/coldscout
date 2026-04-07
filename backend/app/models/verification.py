"""
Profile Verification Database Model.

Tracks per-field verification status for user profiles. Each row represents
a single verifiable field (email, phone, website, linkedin_url, etc.) and
its current verification state.

Statuses:
  - pending:   Verification requested but not yet completed.
  - verified:  Field has been confirmed as valid/reachable.
  - failed:    Verification attempted but the check did not pass.
  - expired:   A previously verified field whose verification has lapsed.
"""

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, ForeignKey,
    UniqueConstraint, func, Index,
)
from sqlalchemy.orm import relationship
from app.models.base import Base


class ProfileVerification(Base):
    """
    Per-field verification record for a user's profile.

    Attributes
    ----------
    user_id : int
        Foreign key to the users table.
    field_name : str
        The profile field being verified (e.g., 'email', 'phone',
        'website', 'linkedin_url', 'company_website').
    field_value : str
        The value that was verified (snapshot at verification time).
    status : str
        One of: 'pending', 'verified', 'failed', 'expired'.
    method : str
        How it was verified: 'auto_check', 'email_otp', 'supabase_auth',
        'http_reachable', 'format_valid'.
    failure_reason : str or None
        Human-readable reason if status is 'failed'.
    verified_at : datetime or None
        When verification succeeded.
    expires_at : datetime or None
        When the verification should be considered stale (e.g., 90 days).
    """
    __tablename__ = "profile_verifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    field_name = Column(String(100), nullable=False)
    field_value = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    method = Column(String(50), nullable=True)
    failure_reason = Column(Text, nullable=True)

    verified_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # A user can only have one verification record per field name
    __table_args__ = (
        UniqueConstraint("user_id", "field_name", name="uq_user_field_verification"),
        Index("ix_verification_user_status", "user_id", "status"),
    )

    user = relationship("User", backref="verifications", lazy="joined")
