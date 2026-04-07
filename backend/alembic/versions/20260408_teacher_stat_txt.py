"""teacher_tasks.status as text + check (align with task_kind)

Revision ID: 20260408_teacher_stat_txt
Revises: 20260407_teacher_tasks
Create Date: 2026-04-08
"""

from __future__ import annotations

from alembic import op

revision = "20260408_teacher_stat_txt"
down_revision = "20260407_teacher_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE teacher_tasks ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE teacher_tasks ALTER COLUMN status TYPE text USING status::text")
    op.execute("ALTER TABLE teacher_tasks ALTER COLUMN status SET DEFAULT 'draft'")
    op.execute("DROP TYPE IF EXISTS teacher_task_status")
    op.create_check_constraint(
        "ck_teacher_tasks_status",
        "teacher_tasks",
        "status IN ('draft', 'published', 'archived')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_teacher_tasks_status", "teacher_tasks", type_="check")
    op.execute("CREATE TYPE teacher_task_status AS ENUM ('draft', 'published', 'archived')")
    op.execute("ALTER TABLE teacher_tasks ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE teacher_tasks ALTER COLUMN status TYPE teacher_task_status "
        "USING status::teacher_task_status"
    )
    op.execute("ALTER TABLE teacher_tasks ALTER COLUMN status SET DEFAULT 'draft'::teacher_task_status")
