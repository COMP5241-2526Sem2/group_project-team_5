"""add paper ai scoring tables

Revision ID: f6a7b8c9d0e1
Revises: e3f4a5b6c7d8
Create Date: 2026-04-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "paper_attempt_ai_scores",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("attempt_id", sa.BigInteger(), nullable=False),
        sa.Column("question_id", sa.BigInteger(), nullable=False),
        sa.Column("suggested_score", sa.Numeric(6, 2), nullable=True),
        sa.Column("suggested_feedback", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Numeric(4, 3), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("model_name", sa.Text(), nullable=False, server_default="heuristic-v1"),
        sa.Column("prompt_version", sa.Text(), nullable=False, server_default="v1"),
        sa.Column("status", sa.Text(), nullable=False, server_default="success"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("suggested_score IS NULL OR suggested_score >= 0", name="ck_paper_attempt_ai_scores_suggested_score_non_negative"),
        sa.CheckConstraint("confidence IS NULL OR (confidence >= 0 AND confidence <= 1)", name="ck_paper_attempt_ai_scores_confidence_range"),
        sa.ForeignKeyConstraint(["attempt_id"], ["paper_attempts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["paper_questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "attempt_id",
            "question_id",
            "prompt_version",
            name="uq_paper_attempt_ai_scores_attempt_question_prompt",
        ),
    )
    op.create_index(op.f("ix_paper_attempt_ai_scores_attempt_id"), "paper_attempt_ai_scores", ["attempt_id"], unique=False)
    op.create_index(op.f("ix_paper_attempt_ai_scores_question_id"), "paper_attempt_ai_scores", ["question_id"], unique=False)

    op.create_table(
        "paper_ai_adoption_audits",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("attempt_id", sa.BigInteger(), nullable=False),
        sa.Column("question_id", sa.BigInteger(), nullable=False),
        sa.Column("actor_id", sa.BigInteger(), nullable=False),
        sa.Column("source_ai_score_id", sa.BigInteger(), nullable=False),
        sa.Column("adopted_score", sa.Numeric(6, 2), nullable=False),
        sa.Column("adopted_feedback", sa.Text(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False, server_default="adopt"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("adopted_score >= 0", name="ck_paper_ai_adoption_audits_adopted_score_non_negative"),
        sa.ForeignKeyConstraint(["attempt_id"], ["paper_attempts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["paper_questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_ai_score_id"], ["paper_attempt_ai_scores.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_paper_ai_adoption_audits_attempt_id"), "paper_ai_adoption_audits", ["attempt_id"], unique=False)
    op.create_index(op.f("ix_paper_ai_adoption_audits_question_id"), "paper_ai_adoption_audits", ["question_id"], unique=False)
    op.create_index(op.f("ix_paper_ai_adoption_audits_actor_id"), "paper_ai_adoption_audits", ["actor_id"], unique=False)
    op.create_index(op.f("ix_paper_ai_adoption_audits_source_ai_score_id"), "paper_ai_adoption_audits", ["source_ai_score_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_paper_ai_adoption_audits_source_ai_score_id"), table_name="paper_ai_adoption_audits")
    op.drop_index(op.f("ix_paper_ai_adoption_audits_actor_id"), table_name="paper_ai_adoption_audits")
    op.drop_index(op.f("ix_paper_ai_adoption_audits_question_id"), table_name="paper_ai_adoption_audits")
    op.drop_index(op.f("ix_paper_ai_adoption_audits_attempt_id"), table_name="paper_ai_adoption_audits")
    op.drop_table("paper_ai_adoption_audits")

    op.drop_index(op.f("ix_paper_attempt_ai_scores_question_id"), table_name="paper_attempt_ai_scores")
    op.drop_index(op.f("ix_paper_attempt_ai_scores_attempt_id"), table_name="paper_attempt_ai_scores")
    op.drop_table("paper_attempt_ai_scores")
