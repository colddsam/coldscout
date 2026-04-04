"""
User Database Model.

Defines the ORM representation of a platform user. Supports two authentication
modes that coexist on the same table:

  Legacy (email/password):
    - ``hashed_password`` is populated during account creation.
    - ``supabase_uid`` is NULL.
    - Authenticated via the /login/access-token endpoint.

  Supabase Auth (social / email magic-link):
    - ``supabase_uid`` is populated on the first Supabase sign-in.
    - ``hashed_password`` is NULL.
    - Authenticated via the Supabase JWT → /auth/sync upsert flow.

The ``role`` and ``plan`` columns are the authoritative sources of truth for
access control and feature gating respectively. They are set at account creation
and subsequently mutated only by admin action or a payment webhook — never by
the user sync call.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from app.models.base import Base


class User(Base):
    """
    ORM model representing a registered platform user.

    Columns
    -------
    id                  Internal auto-incrementing primary key (integer).
    supabase_uid        UUID issued by Supabase Auth; NULL for legacy accounts.
    email               Unique email address — the primary human-readable identifier.
    hashed_password     bcrypt hash; NULL for social/Supabase-only accounts.
    role                Access role: ``'client'`` or ``'freelancer'``.
                        Determines post-login redirect and feature visibility.
    auth_provider       OAuth provider last used: ``'email'``, ``'google'``, etc.
    full_name           Display name sourced from OAuth provider or manual entry.
    avatar_url          Profile picture URL from OAuth provider.
    plan                Subscription tier: ``'free'``, ``'pro'``, or ``'enterprise'``.
                        Updated by the billing webhook / admin; never by the user.
    plan_expires_at     UTC expiry of the current paid plan; NULL for free-tier users.
    is_active           Soft-disable flag; inactive users are rejected at the auth layer.
    is_superuser        Grants access to superuser-only endpoints and admin UI.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    supabase_uid = Column(String, unique=True, index=True, nullable=True)
    """UUID from Supabase Auth - used for social login users"""

    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    """Nullable for social login users who don't have a password"""

    role = Column(String, default="freelancer")
    """User role: 'client' or 'freelancer' - determines redirect after login"""

    auth_provider = Column(String, default="email")
    """Authentication provider: 'email', 'google', 'github', 'facebook', 'linkedin'"""

    full_name = Column(String, nullable=True)
    """User's full name from OAuth provider or manual entry"""

    avatar_url = Column(String, nullable=True)
    """Profile avatar URL from OAuth provider"""

    plan = Column(String, default="free")
    """Subscription plan: 'free' | 'pro' | 'enterprise'. Managed by admin or payment webhook."""

    plan_expires_at = Column(DateTime(timezone=True), nullable=True)
    """UTC datetime when the current paid plan expires. NULL for free plan users."""

    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
