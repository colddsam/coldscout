"""
Infrastructure models — Dynamic API Key Orchestrator & Load Balancer.

The ``APIProvider`` table is the source of truth for every third-party API
credential the platform consumes (Groq, Google Places, Gemini, Meta Threads,
and future providers). Credentials live encrypted at rest; the key_manager
service is the only component allowed to decrypt them.

Design choices:
  - ``provider_name`` and ``use_case`` are plain strings (not Postgres enums)
    so SQLite-based tests and ad-hoc additions don't require schema migrations.
    The accepted vocabularies are enforced at the application layer via the
    ``ProviderName`` and ``UseCase`` enums in ``app.modules.infrastructure``.
  - ``encrypted_api_key`` stores a Fernet-encrypted blob — never the plaintext.
  - ``cooldown_until`` lets the orchestrator skip rate-limited keys until a
    deterministic expiry; ``last_failure_reason`` makes debugging tractable.
  - ``weight`` defaults to 1 so a future weighted-load-balancer can lift
    premium keys without a schema change.
"""

import uuid
from sqlalchemy import (
    Column,
    String,
    Integer,
    Boolean,
    DateTime,
    Text,
    Index,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import TypeDecorator, CHAR

from app.models.base import Base


class GUID(TypeDecorator):
    """Platform-agnostic UUID column.

    Uses PostgreSQL's native UUID type when available, falls back to CHAR(36)
    on SQLite so the model works in unit tests without a schema-level cast.
    """

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)


class APIProvider(Base):
    """Single API credential record in the orchestrator pool.

    Multiple rows per ``(provider_name, use_case)`` are expected and
    encouraged — the orchestrator rotates between them to distribute load
    across free-tier quotas.
    """

    __tablename__ = "api_providers"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)

    provider_name = Column(String(32), nullable=False, index=True)
    """Provider identifier. Allowed values mirror ``ProviderName``:
    ``GROQ``, ``GOOGLE_PLACES``, ``GEMINI``, ``META_THREADS``."""

    use_case = Column(String(32), nullable=False, index=True, default="GENERAL")
    """Workload bucket. Allowed values mirror ``UseCase``:
    ``DISCOVERY``, ``SCORING``, ``PERSONALIZATION``, ``WEBSITE_DEMO``,
    ``GENERAL``. A key tagged ``GENERAL`` is eligible for any workload."""

    label = Column(String(120), nullable=True)
    """Optional human-readable label so operators can identify a key in the
    admin UI without seeing the secret value."""

    encrypted_api_key = Column(Text, nullable=False)
    """Fernet-encrypted ciphertext. Decrypted only inside ``key_manager``."""

    is_active = Column(Boolean, default=True, nullable=False, index=True)
    """When False, the orchestrator never selects this key. Set False on
    permanent failure (invalid credentials) or operator request."""

    weight = Column(Integer, default=1, nullable=False)
    """Selection weight for future weighted-load-balancing. Higher = more
    traffic. Kept as a column now so a later feature doesn't need a
    schema migration."""

    usage_count = Column(Integer, default=0, nullable=False)
    """Lifetime number of successful requests served by this key."""

    rate_limit_hits = Column(Integer, default=0, nullable=False)
    """Cumulative 429/quota errors observed against this key."""

    total_failures = Column(Integer, default=0, nullable=False)
    """Cumulative non-quota failures (e.g. timeouts, 5xx) for visibility."""

    last_used_at = Column(DateTime(timezone=True), nullable=True, index=True)
    """UTC timestamp of the last time this key was handed out by the manager."""

    last_failure_at = Column(DateTime(timezone=True), nullable=True)
    """UTC timestamp of the last error attributed to this key."""

    last_failure_reason = Column(String(255), nullable=True)
    """Short reason string — surfaced in the admin UI so operators don't
    need to grep server logs to investigate a failing key."""

    cooldown_until = Column(DateTime(timezone=True), nullable=True, index=True)
    """When set, the key is considered unavailable until this UTC time.
    Cooldowns are applied automatically when the provider returns 429 or
    a quota-exhaustion error."""

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# Composite index that matches the orchestrator's primary selection query:
# WHERE provider_name = ? AND use_case IN (?, 'GENERAL') AND is_active = TRUE.
Index(
    "ix_api_providers_provider_use_case_active",
    APIProvider.provider_name,
    APIProvider.use_case,
    APIProvider.is_active,
)
