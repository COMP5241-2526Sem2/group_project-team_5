"""add teacher_tasks and teacher_task_items

Revision ID: 20260407_teacher_tasks
Revises: f6a7b8c9d0e1
Create Date: 2026-04-07
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260407_teacher_tasks"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "teacher_tasks",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("course_id", sa.BigInteger(), nullable=False),
        sa.Column("grade", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("semester", sa.Text(), nullable=True),
        sa.Column("task_kind", sa.Text(), nullable=False),
        sa.Column("total_score", sa.Integer(), nullable=False),
        sa.Column("duration_min", sa.Integer(), nullable=False),
        sa.Column("question_count", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "published", "archived", name="teacher_task_status"),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("total_score >= 0", name="ck_teacher_tasks_total_score_non_negative"),
        sa.CheckConstraint("duration_min >= 0", name="ck_teacher_tasks_duration_non_negative"),
        sa.CheckConstraint("question_count >= 0", name="ck_teacher_tasks_question_count_non_negative"),
    )
    op.create_index("ix_teacher_tasks_course_id", "teacher_tasks", ["course_id"])
    op.create_index("ix_teacher_tasks_created_by", "teacher_tasks", ["created_by"])

    op.create_table(
        "teacher_task_items",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("task_id", sa.BigInteger(), nullable=False),
        sa.Column("order_num", sa.Integer(), nullable=False),
        sa.Column("section_label", sa.Text(), nullable=True),
        sa.Column("question_type", sa.Text(), nullable=False),
        sa.Column("score", sa.Numeric(8, 2), nullable=False),
        sa.Column("source_kind", sa.Text(), nullable=False),
        sa.Column("bank_question_id", sa.BigInteger(), nullable=True),
        sa.Column("ref_paper_id", sa.BigInteger(), nullable=True),
        sa.Column("ref_paper_question_id", sa.BigInteger(), nullable=True),
        sa.Column("snapshot_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["teacher_tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bank_question_id"], ["question_bank_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "order_num", name="uq_teacher_task_items_task_order"),
        sa.CheckConstraint("order_num >= 1", name="ck_teacher_task_items_order_positive"),
        sa.CheckConstraint("score >= 0", name="ck_teacher_task_items_score_non_negative"),
        sa.CheckConstraint(
            "source_kind IN ('bank', 'paper_snapshot')",
            name="ck_teacher_task_items_source_kind",
        ),
    )
    op.create_index("ix_teacher_task_items_task_id", "teacher_task_items", ["task_id"])
    op.create_index("ix_teacher_task_items_bank_question_id", "teacher_task_items", ["bank_question_id"])
    op.create_index("ix_teacher_task_items_ref_paper_id", "teacher_task_items", ["ref_paper_id"])


def downgrade() -> None:
    op.drop_index("ix_teacher_task_items_ref_paper_id", table_name="teacher_task_items")
    op.drop_index("ix_teacher_task_items_bank_question_id", table_name="teacher_task_items")
    op.drop_index("ix_teacher_task_items_task_id", table_name="teacher_task_items")
    op.drop_table("teacher_task_items")
    op.drop_index("ix_teacher_tasks_created_by", table_name="teacher_tasks")
    op.drop_index("ix_teacher_tasks_course_id", table_name="teacher_tasks")
    op.drop_table("teacher_tasks")
    op.execute("DROP TYPE IF EXISTS teacher_task_status")
