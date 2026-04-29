"""Add include_profile_signature toggle to freelancer_profiles

Revision ID: p0q1r2s3t4u5
Revises: o9p0q1r2s3t4
Create Date: 2026-04-29

Adds a per-freelancer toggle that controls whether outreach emails sent
for this freelancer's leads append a signature block built from their
profile (name, title, photo, contacts, social links). Defaults to FALSE
so existing freelancers see no behavior change until they opt in.
"""
from alembic import op
import sqlalchemy as sa


revision = "p0q1r2s3t4u5"
down_revision = "o9p0q1r2s3t4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    schema_kw = {} if dialect == "sqlite" else {"schema": "public"}

    op.add_column(
        "freelancer_profiles",
        sa.Column(
            "include_profile_signature",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        **schema_kw,
    )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    schema_kw = {} if dialect == "sqlite" else {"schema": "public"}

    op.drop_column("freelancer_profiles", "include_profile_signature", **schema_kw)
