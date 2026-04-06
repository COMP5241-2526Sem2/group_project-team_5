"""add paper attempt tables

Revision ID: e3f4a5b6c7d8
Revises: b1e9f2a4c7d8
Create Date: 2026-04-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, Sequence[str], None] = "b1e9f2a4c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    paper_attempt_status = postgresql.ENUM(
        "in_progress",
        "submitted",
        "graded",
        name="paper_attempt_status",
        create_type=False,
    )
    paper_attempt_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "paper_attempts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("paper_id", sa.BigInteger(), nullable=False),
        sa.Column("student_id", sa.BigInteger(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("score", sa.Numeric(8, 2), nullable=True),
        sa.Column("status", paper_attempt_status, nullable=False, server_default="in_progress"),
        sa.CheckConstraint("score IS NULL OR score >= 0", name="ck_paper_attempts_score_non_negative"),
        sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("paper_id", "student_id", name="uq_paper_attempts_paper_student"),
    )
    op.create_index(op.f("ix_paper_attempts_paper_id"), "paper_attempts", ["paper_id"], unique=False)
    op.create_index(op.f("ix_paper_attempts_student_id"), "paper_attempts", ["student_id"], unique=False)

    op.create_table(
        "paper_attempt_answers",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("attempt_id", sa.BigInteger(), nullable=False),
        sa.Column("question_id", sa.BigInteger(), nullable=False),
        sa.Column("selected_option", sa.Text(), nullable=True),
        sa.Column("text_answer", sa.Text(), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.Column("awarded_score", sa.Numeric(6, 2), nullable=True),
        sa.Column("teacher_feedback", sa.Text(), nullable=True),
        sa.CheckConstraint("awarded_score IS NULL OR awarded_score >= 0", name="ck_paper_attempt_answers_awarded_non_negative"),
        sa.ForeignKeyConstraint(["attempt_id"], ["paper_attempts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["paper_questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("attempt_id", "question_id", name="uq_paper_attempt_answers_attempt_question"),
    )
    op.create_index(op.f("ix_paper_attempt_answers_attempt_id"), "paper_attempt_answers", ["attempt_id"], unique=False)
    op.create_index(op.f("ix_paper_attempt_answers_question_id"), "paper_attempt_answers", ["question_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_paper_attempt_answers_question_id"), table_name="paper_attempt_answers")
    op.drop_index(op.f("ix_paper_attempt_answers_attempt_id"), table_name="paper_attempt_answers")
    op.drop_table("paper_attempt_answers")

    op.drop_index(op.f("ix_paper_attempts_student_id"), table_name="paper_attempts")
    op.drop_index(op.f("ix_paper_attempts_paper_id"), table_name="paper_attempts")
    op.drop_table("paper_attempts")

    paper_attempt_status = postgresql.ENUM("in_progress", "submitted", "graded", name="paper_attempt_status")
    paper_attempt_status.drop(op.get_bind(), checkfirst=True)
