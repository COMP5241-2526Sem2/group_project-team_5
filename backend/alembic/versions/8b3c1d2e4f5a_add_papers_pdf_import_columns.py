"""add papers pdf import columns

Revision ID: 8b3c1d2e4f5a
Revises: 62125dd14faa
Create Date: 2026-04-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8b3c1d2e4f5a"
down_revision: Union[str, Sequence[str], None] = "d8f1a2c3b4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("papers", sa.Column("source_file_name", sa.Text(), nullable=True))
    op.add_column("papers", sa.Column("source_pdf", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column("papers", "source_pdf")
    op.drop_column("papers", "source_file_name")
