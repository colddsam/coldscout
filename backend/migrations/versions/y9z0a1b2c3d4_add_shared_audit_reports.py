"""add_shared_audit_reports

Revision ID: y9z0a1b2c3d4
Revises: x8y9z0a1b2c3
Create Date: 2026-05-26 12:00:00.000000

Adds the ``shared_audit_reports`` table that backs the "Share report"
button on the public /scanner page.

Indexes chosen for the three read paths:
  * ``token`` (unique) — every viewer hit by token.
  * ``(owner_user_id, created_at DESC)`` — the owner's "my shares" list.
  * ``expires_at`` — used by a future sweep job that may purge stale rows.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = "y9z0a1b2c3d4"
down_revision = "x8y9z0a1b2c3"
branch_labels = None
depends_on = None


def _json_column(name: str, nullable: bool):
    """JSONB on Postgres, plain JSON on SQLite (tests)."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return sa.Column(name, JSONB, nullable=nullable)
    return sa.Column(name, sa.JSON, nullable=nullable)


def _timestamp_default():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return sa.text("now()")
    return sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.create_table(
        "shared_audit_reports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("token", sa.String(length=64), nullable=False, unique=True),
        sa.Column(
            "owner_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="website"),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("subject_url", sa.String(length=2048), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        _json_column("recipients_json", nullable=True),
        _json_column("payload_json", nullable=False),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=_timestamp_default(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        "ix_shared_audits_token", "shared_audit_reports", ["token"], unique=True
    )
    op.create_index(
        "ix_shared_audits_owner_user_id",
        "shared_audit_reports",
        ["owner_user_id"],
    )
    op.create_index(
        "ix_shared_audits_expires_at",
        "shared_audit_reports",
        ["expires_at"],
    )
    op.create_index(
        "ix_shared_audits_owner_created",
        "shared_audit_reports",
        ["owner_user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_shared_audits_owner_created", table_name="shared_audit_reports")
    op.drop_index("ix_shared_audits_expires_at", table_name="shared_audit_reports")
    op.drop_index("ix_shared_audits_owner_user_id", table_name="shared_audit_reports")
    op.drop_index("ix_shared_audits_token", table_name="shared_audit_reports")
    op.drop_table("shared_audit_reports")
