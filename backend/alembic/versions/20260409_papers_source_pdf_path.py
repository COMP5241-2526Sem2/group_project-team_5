"""papers.source_pdf_path: store original PDF on disk instead of BYTEA

Revision ID: 20260409_papers_source_pdf_path
Revises: 20260408_teacher_stat_txt
Create Date: 2026-04-09
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260409_papers_source_pdf_path"
down_revision = "20260408_teacher_stat_txt"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("papers", sa.Column("source_pdf_path", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("papers", "source_pdf_path")
