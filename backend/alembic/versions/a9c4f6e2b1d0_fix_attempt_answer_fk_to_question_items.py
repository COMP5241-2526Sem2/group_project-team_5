"""fix attempt answer fk to question_items

Revision ID: a9c4f6e2b1d0
Revises: 8b3c1d2e4f5a
Create Date: 2026-04-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a9c4f6e2b1d0"
down_revision: Union[str, Sequence[str], None] = "8b3c1d2e4f5a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _drop_question_fk(referred_table: str) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for fk in inspector.get_foreign_keys("question_attempt_answers"):
        cols = fk.get("constrained_columns") or []
        table = fk.get("referred_table")
        name = fk.get("name")
        if cols == ["question_id"] and table == referred_table and name:
            op.drop_constraint(name, "question_attempt_answers", type_="foreignkey")


def upgrade() -> None:
    _drop_question_fk("paper_questions")
    op.create_foreign_key(
        "fk_question_attempt_answers_question_id_question_items",
        "question_attempt_answers",
        "question_items",
        ["question_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    _drop_question_fk("question_items")
    op.create_foreign_key(
        "fk_question_attempt_answers_question_id_paper_questions",
        "question_attempt_answers",
        "paper_questions",
        ["question_id"],
        ["id"],
        ondelete="CASCADE",
    )
