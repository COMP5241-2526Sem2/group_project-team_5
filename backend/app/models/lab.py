from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, BigInteger, CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class SubjectLab(str, enum.Enum):
    MATH = "math"
    PHYSICS = "physics"
    CHEMISTRY = "chemistry"
    BIOLOGY = "biology"
    DYNAMIC = "dynamic"


class Dimension(str, enum.Enum):
    DIM_2D = "2d"
    DIM_3D = "3d"


class LabType(str, enum.Enum):
    BUILTIN = "builtin"
    AI_GENERATED = "ai_generated"


class LabStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    DEPRECATED = "deprecated"


class SessionMode(str, enum.Enum):
    DRIVE = "drive"
    GENERATE = "generate"


class MessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"


class LabDefinition(Base):
    __tablename__ = "lab_definitions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    registry_key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subject_lab: Mapped[SubjectLab] = mapped_column(String(20), nullable=False, index=True)
    renderer_profile: Mapped[str] = mapped_column(String(50), nullable=False)
    dimension: Mapped[Dimension] = mapped_column(String(5), nullable=False)
    initial_state: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    reducer_spec: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    lab_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    lab_type: Mapped[LabType] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[LabStatus] = mapped_column(
        String(20), nullable=False, default=LabStatus.DRAFT, index=True
    )
    visual_profile: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    visual_hint: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    render_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    teacher_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "teacher_id IS NULL OR lab_type = 'ai_generated'",
            name="ck_lab_definitions_builtin_null_teacher",
        ),
    )


class LabGenerationSession(Base):
    __tablename__ = "lab_generation_sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    teacher_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    lab_definition_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("lab_definitions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    mode: Mapped[SessionMode] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    messages: Mapped[list[LabChatMessage]] = relationship(
        back_populates="session", cascade="all, delete-orphan", lazy="selectin"
    )


class LabChatMessage(Base):
    __tablename__ = "lab_chat_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("lab_generation_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[MessageRole] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    commands: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    definition: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    token_used: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session: Mapped[LabGenerationSession] = relationship(back_populates="messages")
