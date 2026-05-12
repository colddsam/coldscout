"""merge multiple heads

Revision ID: 5541b6622bec
Revises: 17030ca13f1f, v6w7x8y9z0a1
Create Date: 2026-05-12 09:25:43.303147

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5541b6622bec'
down_revision: Union[str, None] = ('17030ca13f1f', 'v6w7x8y9z0a1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
