from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, JSON, Text, UniqueConstraint, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class DeckStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


class SlideBlockType(str, enum.Enum):
    TEXT = "text"
    INTERACTIVE = "interactive"
    EXERCISE_WALKTHROUGH = "exercise_walkthrough"
    IMAGE = "image"


class DeckSource(str, enum.Enum):
    KB_AI = "kb_ai"
    PPT_IMPORT = "ppt_import"
    HYBRID = "hybrid"
    MANUAL = "manual"


class LessonDeck(Base):
    __tablename__ = "lesson_decks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    grade: Mapped[str | None] = mapped_column(Text, nullable=True)
    deck_source: Mapped[DeckSource] = mapped_column(
        SQLEnum(DeckSource, name="deck_source"), nullable=False, default=DeckSource.MANUAL
    )
    status: Mapped[DeckStatus] = mapped_column(SQLEnum(DeckStatus, name="deck_status"), nullable=False, default=DeckStatus.DRAFT)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    thumbnail: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Slide(Base):
    __tablename__ = "slides"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    deck_id: Mapped[int] = mapped_column(ForeignKey("lesson_decks.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_num: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint("deck_id", "order_num", name="uq_slides_deck_order"),
        CheckConstraint("order_num >= 1", name="ck_slides_order_positive"),
    )


class SlideBlock(Base):
    __tablename__ = "slide_blocks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    slide_id: Mapped[int] = mapped_column(ForeignKey("slides.id", ondelete="CASCADE"), nullable=False, index=True)
    block_type: Mapped[SlideBlockType] = mapped_column(
        SQLEnum(SlideBlockType, name="slide_block_type"), nullable=False
    )
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    order_num: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint("slide_id", "order_num", name="uq_slide_blocks_slide_order"),
        CheckConstraint("order_num >= 1", name="ck_slide_blocks_order_positive"),
    )
