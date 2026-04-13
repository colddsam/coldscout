"""Drop legacy single-column unique on daily_reports.report_date

Revision ID: m7n8o9p0q1r2
Revises: l6m7n8o9p0q1
Create Date: 2026-04-12

The initial schema declared UniqueConstraint('report_date') without a name,
so PostgreSQL auto-named it ``daily_reports_report_date_key``. The
multi-freelancer migration (k5l6m7n8o9p0) attempted to drop
``uq_daily_reports_date`` — the wrong name — inside a bare try/except,
so the drop silently failed and the legacy single-column unique stayed.

Effect: only one freelancer per day could create a daily report; a second
freelancer running discovery on the same day hit a UniqueViolationError
("duplicate key value violates unique constraint
daily_reports_report_date_key").

This migration drops the legacy constraint (if present). The composite
``uq_daily_reports_date_user`` added in k5l6m7n8o9p0 remains and is the
correct uniqueness rule.
"""
from alembic import op
from sqlalchemy import text


revision = "m7n8o9p0q1r2"
down_revision = "l6m7n8o9p0q1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        return

    # Use DROP CONSTRAINT IF EXISTS so a missing constraint does not abort
    # the migration transaction (Python try/except cannot recover an already-
    # aborted Postgres transaction).
    bind.execute(text(
        'ALTER TABLE public.daily_reports '
        'DROP CONSTRAINT IF EXISTS daily_reports_report_date_key'
    ))
    bind.execute(text(
        'ALTER TABLE public.daily_reports '
        'DROP CONSTRAINT IF EXISTS uq_daily_reports_date'
    ))


def downgrade() -> None:
    # Intentional no-op. Recreating a single-column unique on report_date
    # would break multi-freelancer operation, which is the bug this fixes.
    pass
