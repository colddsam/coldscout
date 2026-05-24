"""add_admin_audit_log

Revision ID: x8y9z0a1b2c3
Revises: w7x8y9z0a1b2
Create Date: 2026-05-25 12:00:00.000000

Adds the ``admin_audit_logs`` table — append-only trail of every
successful superuser mutation on a user account
(plan / role / active / superuser flag).

Indexes are deliberately chosen for the two read paths:
  * ``(target_user_id, created_at DESC)`` — the per-user view rendered
    on each freelancer's Profile / Settings panel.
  * ``(created_at DESC)`` — the unfiltered superuser timeline.
  * ``(actor_user_id, created_at DESC)`` — operator forensics ("show
    everything user X did").
  * ``(action, created_at DESC)`` — filter dropdowns in the admin UI.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = "x8y9z0a1b2c3"
down_revision = "w7x8y9z0a1b2"
branch_labels = None
depends_on = None


def _metadata_column():
    """JSONB on Postgres, plain JSON on SQLite (tests)."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return sa.Column("metadata", JSONB, nullable=True)
    return sa.Column("metadata", sa.JSON, nullable=True)


def _pk_column():
    """Auto-incrementing PK that works on both dialects.

    SQLite only autoincrements ``INTEGER PRIMARY KEY`` (rowid alias) —
    using BIGINT silently disables it. Production stays on BIGINT for
    long-term volume headroom; tests use plain INTEGER.
    """
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True)
    return sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True)


def _timestamp_default():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return sa.text("now()")
    return sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.create_table(
        "admin_audit_logs",
        _pk_column(),
        sa.Column(
            "actor_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column(
            "target_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("target_email", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        _metadata_column(),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=_timestamp_default(),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_admin_audit_logs_target_user_id",
        "admin_audit_logs",
        ["target_user_id"],
    )
    op.create_index(
        "ix_admin_audit_logs_actor_user_id",
        "admin_audit_logs",
        ["actor_user_id"],
    )
    op.create_index(
        "ix_admin_audit_logs_action",
        "admin_audit_logs",
        ["action"],
    )
    op.create_index(
        "ix_admin_audit_logs_created_at",
        "admin_audit_logs",
        ["created_at"],
    )
    # Composite for the per-user timeline (Settings / Profile audit panel).
    op.create_index(
        "ix_admin_audit_logs_target_created",
        "admin_audit_logs",
        ["target_user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_admin_audit_logs_target_created", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_created_at", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_action", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_actor_user_id", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_target_user_id", table_name="admin_audit_logs")
    op.drop_table("admin_audit_logs")
