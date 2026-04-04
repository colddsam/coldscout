"""Add plan column to users table

Revision ID: a1b2c3d4e5f6
Revises: e8f5a2b39d51
Create Date: 2026-03-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'e8f5a2b39d51'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add plan column to users table.
    Values: 'free' (default), 'pro', 'enterprise'.
    Managed by admin or payment webhook — not overwritten on auth sync.
    """
    op.add_column(
        'users',
        sa.Column('plan', sa.String(), nullable=True, server_default='free')
    )


def downgrade() -> None:
    """Remove plan column from users table."""
    op.drop_column('users', 'plan')
