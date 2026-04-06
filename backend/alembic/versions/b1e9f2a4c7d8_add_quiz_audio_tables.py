"""add quiz audio tables

Revision ID: b1e9f2a4c7d8
Revises: a9c4f6e2b1d0
Create Date: 2026-04-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1e9f2a4c7d8"
down_revision: Union[str, Sequence[str], None] = "a9c4f6e2b1d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "quiz_audio_records",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("attempt_id", sa.BigInteger(), nullable=False),
        sa.Column("question_id", sa.BigInteger(), nullable=False),
        sa.Column("student_id", sa.BigInteger(), nullable=False),
        sa.Column("file_name", sa.Text(), nullable=True),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("audio_data", sa.LargeBinary(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("retention_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("size_bytes >= 1", name="ck_quiz_audio_records_size_positive"),
        sa.ForeignKeyConstraint(["attempt_id"], ["question_attempts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["question_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_quiz_audio_records_attempt_id"), "quiz_audio_records", ["attempt_id"], unique=False)
    op.create_index(op.f("ix_quiz_audio_records_question_id"), "quiz_audio_records", ["question_id"], unique=False)
    op.create_index(op.f("ix_quiz_audio_records_student_id"), "quiz_audio_records", ["student_id"], unique=False)

    op.create_table(
        "quiz_audio_playback_audits",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("audio_id", sa.BigInteger(), nullable=False),
        sa.Column("actor_id", sa.BigInteger(), nullable=False),
        sa.Column("action", sa.Text(), server_default="stream", nullable=False),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("device_info", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["audio_id"], ["quiz_audio_records.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_quiz_audio_playback_audits_audio_id"), "quiz_audio_playback_audits", ["audio_id"], unique=False)
    op.create_index(op.f("ix_quiz_audio_playback_audits_actor_id"), "quiz_audio_playback_audits", ["actor_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_quiz_audio_playback_audits_actor_id"), table_name="quiz_audio_playback_audits")
    op.drop_index(op.f("ix_quiz_audio_playback_audits_audio_id"), table_name="quiz_audio_playback_audits")
    op.drop_table("quiz_audio_playback_audits")

    op.drop_index(op.f("ix_quiz_audio_records_student_id"), table_name="quiz_audio_records")
    op.drop_index(op.f("ix_quiz_audio_records_question_id"), table_name="quiz_audio_records")
    op.drop_index(op.f("ix_quiz_audio_records_attempt_id"), table_name="quiz_audio_records")
    op.drop_table("quiz_audio_records")
