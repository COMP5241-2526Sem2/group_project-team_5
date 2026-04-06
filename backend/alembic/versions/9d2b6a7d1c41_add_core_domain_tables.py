"""add core domain tables

Revision ID: 9d2b6a7d1c41
Revises: 62125dd14faa
Create Date: 2026-04-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9d2b6a7d1c41"
down_revision: Union[str, Sequence[str], None] = "62125dd14faa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("account_id", sa.Text(), nullable=False),
        sa.Column("hashed_password", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("account_type", sa.Enum("STUDENT", "TEACHER", "ADMIN", name="account_type"), nullable=False),
        sa.Column("phone", sa.Text(), nullable=True),
        sa.Column("id_card", sa.Text(), nullable=True),
        sa.Column("accessibility", sa.Text(), nullable=True),
        sa.Column("registered_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("account_id"),
    )
    op.create_index(op.f("ix_users_account_type"), "users", ["account_type"], unique=False)

    op.create_table(
        "student_profiles",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("student_id", sa.Text(), nullable=False),
        sa.Column("department", sa.Text(), nullable=True),
        sa.Column("major", sa.Text(), nullable=True),
        sa.Column("homeroom", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id"),
        sa.UniqueConstraint("user_id"),
    )

    op.create_table(
        "teacher_profiles",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("employee_id", sa.Text(), nullable=False),
        sa.Column("department", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id"),
        sa.UniqueConstraint("user_id"),
        sa.UniqueConstraint("user_id", "employee_id", name="uq_teacher_profiles_user_employee"),
    )

    op.create_table(
        "courses",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("grades", sa.JSON(), nullable=True),
        sa.Column("period", sa.Text(), nullable=True),
        sa.Column("room", sa.Text(), nullable=True),
        sa.Column("weekdays", sa.JSON(), nullable=True),
        sa.Column("max_students", sa.Integer(), nullable=True),
        sa.Column("status", sa.Enum("DRAFT", "ACTIVE", "ARCHIVED", name="course_status"), nullable=False),
        sa.Column("teacher_id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.CheckConstraint("max_students IS NULL OR max_students >= 1", name="ck_courses_max_students_positive"),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_courses_teacher_id"), "courses", ["teacher_id"], unique=False)

    op.create_table(
        "enrollments",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("student_id", sa.BigInteger(), nullable=False),
        sa.Column("course_id", sa.BigInteger(), nullable=False),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "course_id", name="uq_enrollments_student_course"),
    )
    op.create_index(op.f("ix_enrollments_student_id"), "enrollments", ["student_id"], unique=False)
    op.create_index(op.f("ix_enrollments_course_id"), "enrollments", ["course_id"], unique=False)

    op.create_table(
        "lesson_decks",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("grade", sa.Text(), nullable=True),
        sa.Column("deck_source", sa.Enum("KB_AI", "PPT_IMPORT", "HYBRID", "MANUAL", name="deck_source"), nullable=False),
        sa.Column("status", sa.Enum("DRAFT", "PUBLISHED", name="deck_status"), nullable=False),
        sa.Column("teacher_id", sa.BigInteger(), nullable=False),
        sa.Column("thumbnail", sa.Text(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lesson_decks_teacher_id"), "lesson_decks", ["teacher_id"], unique=False)

    op.create_table(
        "slides",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("deck_id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("order_num", sa.Integer(), nullable=False),
        sa.CheckConstraint("order_num >= 1", name="ck_slides_order_positive"),
        sa.ForeignKeyConstraint(["deck_id"], ["lesson_decks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("deck_id", "order_num", name="uq_slides_deck_order"),
    )
    op.create_index(op.f("ix_slides_deck_id"), "slides", ["deck_id"], unique=False)

    op.create_table(
        "slide_blocks",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("slide_id", sa.BigInteger(), nullable=False),
        sa.Column("block_type", sa.Enum("TEXT", "INTERACTIVE", "EXERCISE_WALKTHROUGH", "IMAGE", name="slide_block_type"), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("extra_payload", sa.JSON(), nullable=True),
        sa.Column("order_num", sa.Integer(), nullable=False),
        sa.CheckConstraint("order_num >= 1", name="ck_slide_blocks_order_positive"),
        sa.ForeignKeyConstraint(["slide_id"], ["slides.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slide_id", "order_num", name="uq_slide_blocks_slide_order"),
    )
    op.create_index(op.f("ix_slide_blocks_slide_id"), "slide_blocks", ["slide_id"], unique=False)

    op.create_table(
        "lab_registries",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("registry_key", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=True),
        sa.Column("type", sa.Text(), nullable=True),
        sa.Column("renderer_profile", sa.Text(), nullable=True),
        sa.Column("initial_state", sa.JSON(), nullable=True),
        sa.Column("reducer_spec", sa.JSON(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("status", sa.Enum("DRAFT", "PUBLISHED", "DEPRECATED", name="lab_status"), nullable=False),
        sa.Column("teacher_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("registry_key"),
        sa.UniqueConstraint("title", "subject", name="uq_lab_registries_title_subject"),
    )
    op.create_index(op.f("ix_lab_registries_teacher_id"), "lab_registries", ["teacher_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_lab_registries_teacher_id"), table_name="lab_registries")
    op.drop_table("lab_registries")

    op.drop_index(op.f("ix_slide_blocks_slide_id"), table_name="slide_blocks")
    op.drop_table("slide_blocks")

    op.drop_index(op.f("ix_slides_deck_id"), table_name="slides")
    op.drop_table("slides")

    op.drop_index(op.f("ix_lesson_decks_teacher_id"), table_name="lesson_decks")
    op.drop_table("lesson_decks")

    op.drop_index(op.f("ix_enrollments_course_id"), table_name="enrollments")
    op.drop_index(op.f("ix_enrollments_student_id"), table_name="enrollments")
    op.drop_table("enrollments")

    op.drop_index(op.f("ix_courses_teacher_id"), table_name="courses")
    op.drop_table("courses")

    op.drop_table("teacher_profiles")
    op.drop_table("student_profiles")

    op.drop_index(op.f("ix_users_account_type"), table_name="users")
    op.drop_table("users")
