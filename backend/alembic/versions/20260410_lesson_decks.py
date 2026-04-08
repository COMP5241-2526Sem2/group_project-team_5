"""lesson_decks, slides, slide_blocks + slides.notes

Revision ID: 20260410_lesson_decks
Revises: 20260409_papers_source_pdf_path
Create Date: 2026-04-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision = "20260410_lesson_decks"
down_revision = "20260409_papers_source_pdf_path"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if inspect(bind).has_table("lesson_decks"):
        # Already created (e.g. partial run or sync); stamp revision only.
        return

    # Idempotent enum creation (DB may already have types from manual / partial runs)
    op.execute(
        sa.text("""
        DO $$ BEGIN
            CREATE TYPE deck_source AS ENUM ('kb_ai', 'ppt_import', 'hybrid', 'manual');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """)
    )
    op.execute(
        sa.text("""
        DO $$ BEGIN
            CREATE TYPE deck_status AS ENUM ('draft', 'published');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """)
    )
    op.execute(
        sa.text("""
        DO $$ BEGIN
            CREATE TYPE slide_block_type AS ENUM (
                'text', 'interactive', 'exercise_walkthrough', 'image'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """)
    )

    deck_source = postgresql.ENUM(
        "kb_ai", "ppt_import", "hybrid", "manual", name="deck_source", create_type=False
    )
    deck_status = postgresql.ENUM("draft", "published", name="deck_status", create_type=False)
    slide_block_type = postgresql.ENUM(
        "text",
        "interactive",
        "exercise_walkthrough",
        "image",
        name="slide_block_type",
        create_type=False,
    )

    op.create_table(
        "lesson_decks",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("grade", sa.Text(), nullable=True),
        sa.Column("deck_source", deck_source, nullable=False),
        sa.Column("status", deck_status, nullable=False),
        sa.Column("teacher_id", sa.BigInteger(), nullable=False),
        sa.Column("thumbnail", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lesson_decks_teacher_id", "lesson_decks", ["teacher_id"])

    op.create_table(
        "slides",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("deck_id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("order_num", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["deck_id"], ["lesson_decks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("deck_id", "order_num", name="uq_slides_deck_order"),
        sa.CheckConstraint("order_num >= 1", name="ck_slides_order_positive"),
    )
    op.create_index("ix_slides_deck_id", "slides", ["deck_id"])

    op.create_table(
        "slide_blocks",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("slide_id", sa.BigInteger(), nullable=False),
        sa.Column("block_type", slide_block_type, nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("extra_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("order_num", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["slide_id"], ["slides.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slide_id", "order_num", name="uq_slide_blocks_slide_order"),
        sa.CheckConstraint("order_num >= 1", name="ck_slide_blocks_order_positive"),
    )
    op.create_index("ix_slide_blocks_slide_id", "slide_blocks", ["slide_id"])


def downgrade() -> None:
    op.drop_index("ix_slide_blocks_slide_id", table_name="slide_blocks")
    op.drop_table("slide_blocks")

    op.drop_index("ix_slides_deck_id", table_name="slides")
    op.drop_table("slides")

    op.drop_index("ix_lesson_decks_teacher_id", table_name="lesson_decks")
    op.drop_table("lesson_decks")

    op.execute("DROP TYPE IF EXISTS slide_block_type")
    op.execute("DROP TYPE IF EXISTS deck_status")
    op.execute("DROP TYPE IF EXISTS deck_source")
