"""Add Supabase Auth fields to users table

Revision ID: e8f5a2b39d51
Revises: d7e3a1f29c42
Create Date: 2024-03-28 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8f5a2b39d51'
down_revision: Union[str, None] = 'd7e3a1f29c42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add Supabase Auth fields to users table:
    - supabase_uid: UUID from Supabase Auth for social login users
    - role: 'client' or 'freelancer' for role-based routing
    - auth_provider: 'email', 'google', 'github', 'facebook', 'linkedin'
    - full_name: User's full name from OAuth provider
    - avatar_url: Profile avatar URL from OAuth provider

    Also makes hashed_password nullable for social login users.
    """
    # Add new columns
    op.add_column('users', sa.Column('supabase_uid', sa.String(), nullable=True))
    op.add_column('users', sa.Column('role', sa.String(), nullable=True, server_default='freelancer'))
    op.add_column('users', sa.Column('auth_provider', sa.String(), nullable=True, server_default='email'))
    op.add_column('users', sa.Column('full_name', sa.String(), nullable=True))
    op.add_column('users', sa.Column('avatar_url', sa.String(), nullable=True))

    # Create unique index on supabase_uid
    op.create_index(op.f('ix_users_supabase_uid'), 'users', ['supabase_uid'], unique=True)

    # Make hashed_password nullable for social login users
    op.alter_column('users', 'hashed_password',
                    existing_type=sa.String(),
                    nullable=True)


def downgrade() -> None:
    """Revert Supabase Auth fields."""
    # Restore hashed_password as non-nullable
    # Note: This will fail if there are users with NULL passwords
    op.alter_column('users', 'hashed_password',
                    existing_type=sa.String(),
                    nullable=False)

    # Drop the index
    op.drop_index(op.f('ix_users_supabase_uid'), table_name='users')

    # Drop the columns
    op.drop_column('users', 'avatar_url')
    op.drop_column('users', 'full_name')
    op.drop_column('users', 'auth_provider')
    op.drop_column('users', 'role')
    op.drop_column('users', 'supabase_uid')
