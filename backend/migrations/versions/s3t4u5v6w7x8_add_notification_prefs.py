"""Add freelancer_notification_configs table

Revision ID: s3t4u5v6w7x8
Revises: r2s3t4u5v6w7
Create Date: 2026-05-08

Stores per-user, per-job notification on/off preferences. Required by the
Scheduler page's "Notify me" toggle so each freelancer can independently
silence noisy stage events without affecting any other freelancer.

Default behaviour when no row exists for a (user, job) pair is ENABLED —
matches the prior implicit behaviour where every stage event was
notified.
"""
from alembic import op
import sqlalchemy as sa


revision = "s3t4u5v6w7x8"
down_revision = "r2s3t4u5v6w7"
branch_labels = None
depends_on = None


def _schema_kw() -> dict:
    bind = op.get_bind()
    return {} if bind.dialect.name == "sqlite" else {"schema": "public"}


def upgrade() -> None:
    schema_kw = _schema_kw()

    op.create_table(
        "freelancer_notification_configs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("job_id", sa.String(64), nullable=False),
        sa.Column(
            "enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "user_id",
            "job_id",
            name="uq_freelancer_notif_user_job",
        ),
        **schema_kw,
    )
    op.create_index(
        "ix_freelancer_notif_user_id",
        "freelancer_notification_configs",
        ["user_id"],
        **schema_kw,
    )
    op.create_index(
        "ix_freelancer_notif_job_id",
        "freelancer_notification_configs",
        ["job_id"],
        **schema_kw,
    )


def downgrade() -> None:
    schema_kw = _schema_kw()
    op.drop_index(
        "ix_freelancer_notif_job_id",
        table_name="freelancer_notification_configs",
        **schema_kw,
    )
    op.drop_index(
        "ix_freelancer_notif_user_id",
        table_name="freelancer_notification_configs",
        **schema_kw,
    )
    op.drop_table("freelancer_notification_configs", **schema_kw)
