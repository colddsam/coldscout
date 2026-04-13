"""Add user_id to Threads tables for multi-freelancer isolation

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-04-12

Adds user_id FKs to:
  - threads_profiles
  - threads_engagements
  - threads_search_configs
  - threads_auth

Replaces the single-column unique on ``threads_user_id`` with a composite
``(user_id, threads_user_id)`` unique on ``threads_profiles`` and
``threads_auth`` so two freelancers can each own their own row for the same
Threads handle.

Backwards compatibility: columns are nullable. Legacy rows keep
``user_id IS NULL`` and remain visible only to callers that explicitly
opt-in to legacy-global behavior (scheduler with no user_id).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = "n8o9p0q1r2s3"
down_revision = "m7n8o9p0q1r2"
branch_labels = None
depends_on = None


TABLES = [
    "threads_profiles",
    "threads_engagements",
    "threads_search_configs",
    "threads_auth",
]


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # Add user_id column + index on all four tables
    for table in TABLES:
        op.add_column(
            table,
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=True,
            ),
        )
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])

    if dialect == "sqlite":
        return

    # Drop legacy single-column unique on threads_user_id for profiles + auth.
    # Postgres auto-names these ``<table>_<col>_key``. Use IF EXISTS so a
    # missing constraint doesn't abort the migration transaction.
    bind.execute(text(
        'ALTER TABLE threads_profiles '
        'DROP CONSTRAINT IF EXISTS threads_profiles_threads_user_id_key'
    ))
    bind.execute(text(
        'ALTER TABLE threads_auth '
        'DROP CONSTRAINT IF EXISTS threads_auth_threads_user_id_key'
    ))

    # Add composite uniqueness (user_id, threads_user_id)
    op.create_unique_constraint(
        "uq_threads_profiles_user_threads_id",
        "threads_profiles",
        ["user_id", "threads_user_id"],
    )
    op.create_unique_constraint(
        "uq_threads_auth_user_threads_id",
        "threads_auth",
        ["user_id", "threads_user_id"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect != "sqlite":
        try:
            op.drop_constraint(
                "uq_threads_profiles_user_threads_id", "threads_profiles", type_="unique"
            )
        except Exception:
            pass
        try:
            op.drop_constraint(
                "uq_threads_auth_user_threads_id", "threads_auth", type_="unique"
            )
        except Exception:
            pass
        # Recreate the legacy single-column uniques (best-effort)
        try:
            op.create_unique_constraint(
                "threads_profiles_threads_user_id_key",
                "threads_profiles",
                ["threads_user_id"],
            )
        except Exception:
            pass
        try:
            op.create_unique_constraint(
                "threads_auth_threads_user_id_key",
                "threads_auth",
                ["threads_user_id"],
            )
        except Exception:
            pass

    for table in TABLES:
        try:
            op.drop_index(f"ix_{table}_user_id", table_name=table)
        except Exception:
            pass
        try:
            op.drop_column(table, "user_id")
        except Exception:
            pass
