"""add visual_profile to lab_definitions if missing

Revision ID: b8c9d0e1f2a3
Revises: 7f3a8c2d1b4e
Create Date: 2026-04-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "7f3a8c2d1b4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("lab_definitions")}
    if "visual_profile" not in cols:
        op.add_column(
            "lab_definitions",
            sa.Column("visual_profile", sa.String(50), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("lab_definitions")}
    if "visual_profile" in cols:
        op.drop_column("lab_definitions", "visual_profile")
