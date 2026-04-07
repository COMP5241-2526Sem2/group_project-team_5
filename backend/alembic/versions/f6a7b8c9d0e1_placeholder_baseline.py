"""Placeholder: matches existing alembic_version on deployed DB (revision was applied outside this repo).

Revision ID: f6a7b8c9d0e1
Revises:
Create Date: 2026-04-07

upgrade/downgrade are no-ops — schema already exists in the database.
"""

from __future__ import annotations

from alembic import op

revision = "f6a7b8c9d0e1"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
