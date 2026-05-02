"""Add freelancer_discovery_configs table

Revision ID: q1r2s3t4u5v6
Revises: p0q1r2s3t4u5
Create Date: 2026-05-02

Adds per-freelancer manual override for discovery target selection. Each
row stores an ``auto_mode_enabled`` toggle (default TRUE so the existing
AI-driven flow keeps running unchanged for every live freelancer) and a
JSON list of pinned (location, category, max_results) targets used when
auto mode is off.

Strict per-user ownership is enforced by the UNIQUE on ``user_id`` plus
the API layer; even superusers cannot edit another freelancer's config.
"""
from alembic import op
import sqlalchemy as sa


revision = "q1r2s3t4u5v6"
down_revision = "p0q1r2s3t4u5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    schema_kw = {} if dialect == "sqlite" else {"schema": "public"}

    # JSON column: PG has native JSONB; on sqlite we use generic JSON which
    # falls back to TEXT. SQLAlchemy's sa.JSON adapts per-dialect.
    op.create_table(
        "freelancer_discovery_configs",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "auto_mode_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "pinned_targets",
            sa.JSON(),
            nullable=False,
            # Cross-dialect default: PG accepts '[]'::json, sqlite accepts '[]'.
            server_default=sa.text("'[]'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        **schema_kw,
    )

    # Explicit index on user_id (UNIQUE already creates one on PG, but
    # naming it keeps reference parity with the other freelancer_* tables).
    op.create_index(
        "ix_freelancer_discovery_configs_user_id",
        "freelancer_discovery_configs",
        ["user_id"],
        unique=False,
        **schema_kw,
    )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    schema_kw = {} if dialect == "sqlite" else {"schema": "public"}

    op.drop_index(
        "ix_freelancer_discovery_configs_user_id",
        table_name="freelancer_discovery_configs",
        **schema_kw,
    )
    op.drop_table("freelancer_discovery_configs", **schema_kw)
