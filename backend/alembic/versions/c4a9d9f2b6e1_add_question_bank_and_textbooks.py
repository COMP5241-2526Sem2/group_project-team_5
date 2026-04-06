"""add question bank and textbooks

Revision ID: c4a9d9f2b6e1
Revises: 9d2b6a7d1c41
Create Date: 2026-04-04 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4a9d9f2b6e1"
down_revision: Union[str, Sequence[str], None] = "9d2b6a7d1c41"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "question_bank_items",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("publisher", sa.Text(), nullable=True),
        sa.Column("grade", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("semester", sa.Text(), nullable=True),
        sa.Column("question_type", sa.Text(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("difficulty", sa.Text(), nullable=True),
        sa.Column("answer_text", sa.Text(), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("chapter", sa.Text(), nullable=True),
        sa.Column("source_paper_question_id", sa.BigInteger(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["source_paper_question_id"], ["paper_questions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_question_bank_items_source_paper_question_id"), "question_bank_items", ["source_paper_question_id"], unique=False)
    op.create_index(op.f("ix_question_bank_items_created_by"), "question_bank_items", ["created_by"], unique=False)

    op.create_table(
        "question_bank_options",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("bank_question_id", sa.BigInteger(), nullable=False),
        sa.Column("option_key", sa.Text(), nullable=False),
        sa.Column("option_text", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(["bank_question_id"], ["question_bank_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bank_question_id", "option_key", name="uq_question_bank_options_key"),
    )
    op.create_index(op.f("ix_question_bank_options_bank_question_id"), "question_bank_options", ["bank_question_id"], unique=False)

    with op.batch_alter_table("paper_questions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("bank_question_id", sa.BigInteger(), nullable=True))
        batch_op.create_index(op.f("ix_paper_questions_bank_question_id"), ["bank_question_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_paper_questions_bank_question_id_question_bank_items",
            "question_bank_items",
            ["bank_question_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_table(
        "question_items",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("question_id", sa.BigInteger(), nullable=False),
        sa.Column("bank_question_id", sa.BigInteger(), nullable=False),
        sa.Column("order_num", sa.Integer(), nullable=False),
        sa.Column("score", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("prompt_snapshot", sa.Text(), nullable=True),
        sa.CheckConstraint("order_num >= 1", name="ck_question_items_order_positive"),
        sa.CheckConstraint("score >= 0", name="ck_question_items_score_non_negative"),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bank_question_id"], ["question_bank_items.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("question_id", "order_num", name="uq_question_items_order"),
    )
    op.create_index(op.f("ix_question_items_question_id"), "question_items", ["question_id"], unique=False)
    op.create_index(op.f("ix_question_items_bank_question_id"), "question_items", ["bank_question_id"], unique=False)

    op.create_table(
        "textbooks",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("publisher", sa.Text(), nullable=False),
        sa.Column("grade", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("semester", sa.Enum("VOL1", "VOL2", name="textbook_semester"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("publisher", "grade", "subject", "semester", name="uq_textbooks_identity"),
    )
    op.create_index(op.f("ix_textbooks_created_by"), "textbooks", ["created_by"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_textbooks_created_by"), table_name="textbooks")
    op.drop_table("textbooks")

    op.drop_index(op.f("ix_question_items_bank_question_id"), table_name="question_items")
    op.drop_index(op.f("ix_question_items_question_id"), table_name="question_items")
    op.drop_table("question_items")

    with op.batch_alter_table("paper_questions", schema=None) as batch_op:
        batch_op.drop_constraint("fk_paper_questions_bank_question_id_question_bank_items", type_="foreignkey")
        batch_op.drop_index(op.f("ix_paper_questions_bank_question_id"))
        batch_op.drop_column("bank_question_id")

    op.drop_index(op.f("ix_question_bank_options_bank_question_id"), table_name="question_bank_options")
    op.drop_table("question_bank_options")

    op.drop_index(op.f("ix_question_bank_items_created_by"), table_name="question_bank_items")
    op.drop_index(op.f("ix_question_bank_items_source_paper_question_id"), table_name="question_bank_items")
    op.drop_table("question_bank_items")
