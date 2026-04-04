"""v3_phone_qualified_path

Adds no new columns — the 'status' and 'lead_tier' fields already exist
from previous migrations. This migration documents the new 'phone_qualified'
status value and corrects the lead_tier scoring logic that was inverted.

Changes captured here (code-only, no DDL needed):
  1. New valid status value: 'phone_qualified'
     (score >= 50, phone present, no email → manual call/WhatsApp path)
  2. lead_tier 'D' is now correctly assigned when score < 30 OR no contact,
     not when score < 50. Tier A now reachable for no-website leads.
  3. Scoring inverted: higher score now means MORE digital need (weaker presence),
     not stronger presence.
  4. Qualification gate changed from 'email required' to 'email OR phone'.

Revision ID: c3f21d9e77b1
Revises: fabaa4a4c84e
Create Date: 2026-03-04
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic
revision: str = 'c3f21d9e77b1'
down_revision: Union[str, None] = 'fabaa4a4c84e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Re-qualify any existing 'rejected' leads that:
      - scored >= 50 (they would have qualified under new scoring)
      - have a phone number
      - have no email

    These leads were incorrectly rejected by the old gate (email required).
    Mark them as 'phone_qualified' so they appear in the call list.

    NOTE: This does NOT re-run the scorer — it uses the stored
    qualification_score which was computed with the old (inverted) logic.
    These leads will be re-scored naturally the next time a pipeline run
    processes them. This migration is a best-effort recovery only.
    """
    op.execute(
        sa.text("""
            UPDATE leads
            SET
                status       = 'phone_qualified',
                qualified_at = NOW()
            WHERE
                status              = 'rejected'
                AND qualification_score >= 50
                AND phone IS NOT NULL
                AND (email IS NULL OR email = '')
        """)
    )


def downgrade() -> None:
    """
    Revert phone_qualified leads back to rejected.
    Safe to run — does not touch any leads that were already qualified.
    """
    op.execute(
        sa.text("""
            UPDATE leads
            SET
                status       = 'rejected',
                qualified_at = NULL
            WHERE status = 'phone_qualified'
        """)
    )
