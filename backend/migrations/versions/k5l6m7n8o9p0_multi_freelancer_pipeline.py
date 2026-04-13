"""Multi-freelancer pipeline support

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-04-11

Adds:
  - freelancer_pipeline_configs table for per-freelancer production status
  - user_id FK to leads, campaigns, daily_reports, search_history tables
  - UniqueConstraint (place_id, user_id) on leads
  - UniqueConstraint (report_date, user_id) on daily_reports
"""
from alembic import op
import sqlalchemy as sa


revision = "k5l6m7n8o9p0"
down_revision = "j4k5l6m7n8o9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create freelancer_pipeline_configs table
    op.create_table(
        "freelancer_pipeline_configs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("production_status", sa.String(10), nullable=False, server_default="RUN"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="public",
    )
    op.create_index(
        "ix_freelancer_pipeline_configs_user_id",
        "freelancer_pipeline_configs",
        ["user_id"],
        schema="public",
    )

    # 2. Add user_id FK to leads (nullable for backward compatibility)
    op.add_column(
        "leads",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        schema="public",
    )
    op.create_index("ix_leads_user_id", "leads", ["user_id"], schema="public")

    # Drop old unique constraint on place_id if it exists, add composite unique
    # Note: The old unique index on place_id alone may or may not exist depending
    # on database state. We use batch_alter_table for safety.
    try:
        op.drop_index("ix_leads_place_id", table_name="leads", schema="public")
    except Exception:
        pass  # Index may not exist
    op.create_unique_constraint(
        "uq_leads_place_id_user_id", "leads", ["place_id", "user_id"], schema="public"
    )

    # 3. Add user_id FK to campaigns
    op.add_column(
        "campaigns",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        schema="public",
    )
    op.create_index("ix_campaigns_user_id", "campaigns", ["user_id"], schema="public")

    # 4. Add user_id FK to daily_reports
    op.add_column(
        "daily_reports",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        schema="public",
    )
    op.create_index("ix_daily_reports_user_id", "daily_reports", ["user_id"], schema="public")

    # Drop old unique constraint on report_date if it exists, add composite unique
    try:
        op.drop_constraint("uq_daily_reports_date", "daily_reports", schema="public")
    except Exception:
        pass
    op.create_unique_constraint(
        "uq_daily_reports_date_user", "daily_reports", ["report_date", "user_id"], schema="public"
    )

    # 5. Add user_id FK to search_history
    op.add_column(
        "search_history",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        schema="public",
    )
    op.create_index("ix_search_history_user_id", "search_history", ["user_id"], schema="public")


def downgrade() -> None:
    # Reverse search_history
    op.drop_index("ix_search_history_user_id", table_name="search_history", schema="public")
    op.drop_column("search_history", "user_id", schema="public")

    # Reverse daily_reports
    op.drop_constraint("uq_daily_reports_date_user", "daily_reports", schema="public")
    op.drop_index("ix_daily_reports_user_id", table_name="daily_reports", schema="public")
    op.drop_column("daily_reports", "user_id", schema="public")

    # Reverse campaigns
    op.drop_index("ix_campaigns_user_id", table_name="campaigns", schema="public")
    op.drop_column("campaigns", "user_id", schema="public")

    # Reverse leads
    op.drop_constraint("uq_leads_place_id_user_id", "leads", schema="public")
    op.drop_index("ix_leads_user_id", table_name="leads", schema="public")
    op.drop_column("leads", "user_id", schema="public")

    # Drop freelancer_pipeline_configs
    op.drop_index(
        "ix_freelancer_pipeline_configs_user_id",
        table_name="freelancer_pipeline_configs",
        schema="public",
    )
    op.drop_table("freelancer_pipeline_configs", schema="public")
