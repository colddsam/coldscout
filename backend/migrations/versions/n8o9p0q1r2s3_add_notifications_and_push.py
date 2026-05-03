"""Add notifications + push_subscriptions tables

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-05-03

Backs the new live notification system. Two tables, both per-user with
``ON DELETE CASCADE`` so a user's deletion takes their feed and devices
down with it.

* ``notifications`` — feed entries (in-app bell icon center). Indexed on
  ``(user_id, created_at)`` for the hot list-feed query and on
  ``group_key`` for live-banner dedupe.
* ``push_subscriptions`` — Web Push endpoints + FCM tokens. UNIQUE on
  ``(user_id, endpoint)`` so re-subscribing is idempotent.

The schema namespace is detected from the dialect (mirrors the other
migrations) so SQLite tests don't try to use ``public.``.
"""
from alembic import op
import sqlalchemy as sa


revision = "n8o9p0q1r2s3"
down_revision = "m7n8o9p0q1r2"
branch_labels = None
depends_on = None


def _schema() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else "public"


def upgrade() -> None:
    schema = _schema()

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey(
                f"{schema + '.' if schema else ''}users.id",
                ondelete="CASCADE",
            ),
            nullable=False,
            index=True,
        ),
        sa.Column("kind", sa.String(length=32), nullable=False, server_default="system"),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("url", sa.String(length=500), nullable=True),
        sa.Column("icon", sa.String(length=500), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("group_key", sa.String(length=120), nullable=True, index=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        schema=schema,
    )
    op.create_index(
        "ix_notifications_user_created",
        "notifications",
        ["user_id", "created_at"],
        schema=schema,
    )

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey(
                f"{schema + '.' if schema else ''}users.id",
                ondelete="CASCADE",
            ),
            nullable=False,
            index=True,
        ),
        sa.Column("platform", sa.String(length=16), nullable=False, server_default="web"),
        sa.Column("endpoint", sa.String(), nullable=False),
        sa.Column("p256dh", sa.String(), nullable=True),
        sa.Column("auth", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("label", sa.String(length=120), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_used_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "endpoint", name="uq_push_user_endpoint"),
        schema=schema,
    )


def downgrade() -> None:
    schema = _schema()
    op.drop_table("push_subscriptions", schema=schema)
    op.drop_index(
        "ix_notifications_user_created",
        table_name="notifications",
        schema=schema,
    )
    op.drop_table("notifications", schema=schema)
