"""add_api_providers

Revision ID: w7x8y9z0a1b2
Revises: v6w7x8y9z0a1
Create Date: 2026-05-13 12:00:00.000000

Adds the ``api_providers`` table that backs the Dynamic API Key Orchestrator.
Each row is a single rotatable credential (Groq, Gemini, Google Places, etc.)
stored encrypted at rest. The orchestrator picks the healthiest key per
request and cools down keys that hit provider quotas.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "w7x8y9z0a1b2"
down_revision = "5541b6622bec"
branch_labels = None
depends_on = None


def _uuid_column():
    """Return a UUID-compatible primary-key column for both PG and SQLite.

    On PostgreSQL we use the native UUID type. On SQLite (used in tests)
    a CHAR(36) string column is functionally equivalent because the
    application stores Python ``uuid.UUID`` values as their canonical
    string form via the ``GUID`` TypeDecorator on the model.
    """
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
        )
    return sa.Column("id", sa.CHAR(36), primary_key=True)


def _timestamp_default():
    """Return the dialect-appropriate default for created_at / updated_at."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return sa.text("now()")
    # SQLite has no ``now()`` function but accepts CURRENT_TIMESTAMP.
    return sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.create_table(
        "api_providers",
        _uuid_column(),
        sa.Column("provider_name", sa.String(length=32), nullable=False),
        sa.Column(
            "use_case",
            sa.String(length=32),
            nullable=False,
            server_default="GENERAL",
        ),
        sa.Column("label", sa.String(length=120), nullable=True),
        sa.Column("encrypted_api_key", sa.Text(), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "weight",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column(
            "usage_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "rate_limit_hits",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_failures",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failure_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failure_reason", sa.String(length=255), nullable=True),
        sa.Column("cooldown_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=_timestamp_default(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=_timestamp_default(),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_api_providers_provider_name",
        "api_providers",
        ["provider_name"],
    )
    op.create_index(
        "ix_api_providers_use_case",
        "api_providers",
        ["use_case"],
    )
    op.create_index(
        "ix_api_providers_is_active",
        "api_providers",
        ["is_active"],
    )
    op.create_index(
        "ix_api_providers_last_used_at",
        "api_providers",
        ["last_used_at"],
    )
    op.create_index(
        "ix_api_providers_cooldown_until",
        "api_providers",
        ["cooldown_until"],
    )
    op.create_index(
        "ix_api_providers_provider_use_case_active",
        "api_providers",
        ["provider_name", "use_case", "is_active"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_api_providers_provider_use_case_active", table_name="api_providers"
    )
    op.drop_index("ix_api_providers_cooldown_until", table_name="api_providers")
    op.drop_index("ix_api_providers_last_used_at", table_name="api_providers")
    op.drop_index("ix_api_providers_is_active", table_name="api_providers")
    op.drop_index("ix_api_providers_use_case", table_name="api_providers")
    op.drop_index("ix_api_providers_provider_name", table_name="api_providers")
    op.drop_table("api_providers")
