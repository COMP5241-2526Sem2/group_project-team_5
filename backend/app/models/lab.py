from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, JSON, Text, UniqueConstraint, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class LabStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    DEPRECATED = "deprecated"


class LabRegistry(Base):
    __tablename__ = "lab_registries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    registry_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    lab_type: Mapped[str | None] = mapped_column("type", Text, nullable=True)
    renderer_profile: Mapped[str | None] = mapped_column(Text, nullable=True)
    initial_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reducer_spec: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    status: Mapped[LabStatus] = mapped_column(SQLEnum(LabStatus, name="lab_status"), nullable=False, default=LabStatus.DRAFT)
    teacher_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("title", "subject", name="uq_lab_registries_title_subject"),)
