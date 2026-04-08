"""Add slides.notes when table existed without it (skipped full 20260410 DDL).

Revision ID: 20260411_slides_notes
Revises: 20260410_lesson_decks
Create Date: 2026-04-11
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "20260411_slides_notes"
down_revision = "20260410_lesson_decks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table("slides"):
        return
    cols = {c["name"] for c in insp.get_columns("slides")}
    if "notes" in cols:
        return
    op.add_column("slides", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table("slides"):
        return
    cols = {c["name"] for c in insp.get_columns("slides")}
    if "notes" not in cols:
        return
    op.drop_column("slides", "notes")
