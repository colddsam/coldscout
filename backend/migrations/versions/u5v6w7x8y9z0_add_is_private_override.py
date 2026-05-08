"""add_is_private_override

Revision ID: u5v6w7x8y9z0
Revises: t4u5v6w7x8y9
Create Date: 2026-05-08 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'u5v6w7x8y9z0'
down_revision = 't4u5v6w7x8y9'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add the is_private_override column with a default of FALSE
    op.add_column('leads', sa.Column('is_private_override', sa.Boolean(), server_default='false', nullable=False))

def downgrade() -> None:
    op.drop_column('leads', 'is_private_override')
