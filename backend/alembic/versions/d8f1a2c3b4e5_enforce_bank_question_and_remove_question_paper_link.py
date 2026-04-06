"""enforce bank question and remove question paper link

Revision ID: d8f1a2c3b4e5
Revises: c4a9d9f2b6e1
Create Date: 2026-04-04 00:00:02.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d8f1a2c3b4e5"
down_revision: Union[str, Sequence[str], None] = "c4a9d9f2b6e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("question_bank_items", schema=None) as batch_op:
        batch_op.add_column(sa.Column("source_type", sa.Text(), server_default="manual", nullable=False))
        batch_op.add_column(sa.Column("source_id", sa.BigInteger(), nullable=True))
        batch_op.create_index(op.f("ix_question_bank_items_source_id"), ["source_id"], unique=False)
        batch_op.drop_index(op.f("ix_question_bank_items_source_paper_question_id"))
        batch_op.drop_column("source_paper_question_id")

    with op.batch_alter_table("questions", schema=None) as batch_op:
        batch_op.drop_index(op.f("ix_questions_paper_id"))
        batch_op.drop_column("paper_id")

    with op.batch_alter_table("paper_questions", schema=None) as batch_op:
        batch_op.drop_constraint("fk_paper_questions_bank_question_id_question_bank_items", type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_paper_questions_bank_question_id_question_bank_items",
            "question_bank_items",
            ["bank_question_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.alter_column("bank_question_id", existing_type=sa.BigInteger(), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("paper_questions", schema=None) as batch_op:
        batch_op.drop_constraint("fk_paper_questions_bank_question_id_question_bank_items", type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_paper_questions_bank_question_id_question_bank_items",
            "question_bank_items",
            ["bank_question_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.alter_column("bank_question_id", existing_type=sa.BigInteger(), nullable=True)

    with op.batch_alter_table("questions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("paper_id", sa.BigInteger(), nullable=True))
        batch_op.create_index(op.f("ix_questions_paper_id"), ["paper_id"], unique=False)
        batch_op.create_foreign_key("fk_questions_paper_id_papers", "papers", ["paper_id"], ["id"], ondelete="SET NULL")

    with op.batch_alter_table("question_bank_items", schema=None) as batch_op:
        batch_op.add_column(sa.Column("source_paper_question_id", sa.BigInteger(), nullable=True))
        batch_op.create_index(op.f("ix_question_bank_items_source_paper_question_id"), ["source_paper_question_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_question_bank_items_source_paper_question_id_paper_questions",
            "paper_questions",
            ["source_paper_question_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.drop_index(op.f("ix_question_bank_items_source_id"))
        batch_op.drop_column("source_id")
        batch_op.drop_column("source_type")
