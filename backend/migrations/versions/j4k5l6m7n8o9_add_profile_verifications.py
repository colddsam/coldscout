"""Add profile_verifications table

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8
Create Date: 2026-04-07

Adds a profile_verifications table for per-field verification tracking.
Each user can have one verification record per field (email, phone, website, etc.).
"""
from alembic import op
import sqlalchemy as sa


revision = "j4k5l6m7n8o9"
down_revision = "i3j4k5l6m7n8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_verifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_name", sa.String(100), nullable=False),
        sa.Column("field_value", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("method", sa.String(50), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "field_name", name="uq_user_field_verification"),
        schema="public",
    )
    op.create_index("ix_profile_verifications_user_id", "profile_verifications", ["user_id"], schema="public")
    op.create_index("ix_verification_user_status", "profile_verifications", ["user_id", "status"], schema="public")


def downgrade() -> None:
    op.drop_index("ix_verification_user_status", table_name="profile_verifications", schema="public")
    op.drop_index("ix_profile_verifications_user_id", table_name="profile_verifications", schema="public")
    op.drop_table("profile_verifications", schema="public")
