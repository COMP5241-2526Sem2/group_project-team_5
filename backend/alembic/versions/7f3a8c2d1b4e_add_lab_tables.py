"""add lab tables

Revision ID: 7f3a8c2d1b4e
Revises: 62125dd14faa
Create Date: 2026-04-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7f3a8c2d1b4e"
down_revision: Union[str, Sequence[str], None] = "62125dd14faa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add lab_definitions, lab_generation_sessions, lab_chat_messages tables."""
    # lab_definitions — use VARCHAR instead of MySQL ENUM to avoid case-sensitivity issues
    op.create_table(
        "lab_definitions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("registry_key", sa.String(100), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("subject_lab", sa.String(20), nullable=False),
        sa.Column("renderer_profile", sa.String(50), nullable=False),
        sa.Column("dimension", sa.String(5), nullable=False),
        sa.Column("initial_state", sa.JSON(), nullable=False),
        sa.Column("reducer_spec", sa.JSON(), nullable=True),
        sa.Column("lab_metadata", sa.JSON(), nullable=True),
        sa.Column("lab_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("visual_profile", sa.String(50), nullable=True),
        sa.Column("teacher_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("registry_key", name="uq_lab_definitions_registry_key"),
        sa.CheckConstraint(
            "teacher_id IS NULL OR lab_type = 'ai_generated'",
            name="ck_lab_definitions_builtin_null_teacher",
        ),
    )
    op.create_index(
        op.f("ix_lab_definitions_registry_key"),
        "lab_definitions",
        ["registry_key"],
        unique=True,
    )
    op.create_index(op.f("ix_lab_definitions_subject_lab"), "lab_definitions", ["subject_lab"], unique=False)
    op.create_index(op.f("ix_lab_definitions_lab_type"), "lab_definitions", ["lab_type"], unique=False)
    op.create_index(op.f("ix_lab_definitions_status"), "lab_definitions", ["status"], unique=False)
    op.create_index(op.f("ix_lab_definitions_teacher_id"), "lab_definitions", ["teacher_id"], unique=False)

    # lab_generation_sessions
    op.create_table(
        "lab_generation_sessions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("teacher_id", sa.BigInteger(), nullable=False),
        sa.Column("lab_definition_id", sa.BigInteger(), nullable=True),
        sa.Column("mode", sa.String(20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["lab_definition_id"], ["lab_definitions.id"], ondelete="SET NULL"),
    )
    op.create_index(
        op.f("ix_lab_generation_sessions_teacher_id"),
        "lab_generation_sessions",
        ["teacher_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_lab_generation_sessions_lab_definition_id"),
        "lab_generation_sessions",
        ["lab_definition_id"],
        unique=False,
    )

    # lab_chat_messages
    op.create_table(
        "lab_chat_messages",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.BigInteger(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("commands", sa.JSON(), nullable=True),
        sa.Column("definition", sa.JSON(), nullable=True),
        sa.Column("token_used", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["session_id"], ["lab_generation_sessions.id"], ondelete="CASCADE"),
    )
    op.create_index(
        op.f("ix_lab_chat_messages_session_id"),
        "lab_chat_messages",
        ["session_id"],
        unique=False,
    )


def downgrade() -> None:
    """Drop lab tables."""
    op.drop_index(op.f("ix_lab_chat_messages_session_id"), table_name="lab_chat_messages")
    op.drop_table("lab_chat_messages")
    op.drop_index(
        op.f("ix_lab_generation_sessions_lab_definition_id"),
        table_name="lab_generation_sessions",
    )
    op.drop_index(
        op.f("ix_lab_generation_sessions_teacher_id"),
        table_name="lab_generation_sessions",
    )
    op.drop_table("lab_generation_sessions")
    op.drop_index(op.f("ix_lab_definitions_teacher_id"), table_name="lab_definitions")
    op.drop_index(op.f("ix_lab_definitions_status"), table_name="lab_definitions")
    op.drop_index(op.f("ix_lab_definitions_lab_type"), table_name="lab_definitions")
    op.drop_index(op.f("ix_lab_definitions_subject_lab"), table_name="lab_definitions")
    op.drop_index(op.f("ix_lab_definitions_registry_key"), table_name="lab_definitions")
    op.drop_table("lab_definitions")
