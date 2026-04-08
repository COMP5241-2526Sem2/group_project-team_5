from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class SlideUpsert(BaseModel):
    title: str = ""
    text: str = ""
    notes: str | None = None
    lab_registry_key: str | None = None
    """实验定义快照（与 labs 表结构一致的 JSON），库中实验删除后课件仍凭此渲染；仅存于 interactive 块 extra_payload['lab_snapshot']。"""
    lab_snapshot: dict[str, Any] | None = None
    """图片 URL 或 data URL 列表，对应 slide_blocks 中 image 类型块。"""
    image_urls: list[str] = Field(default_factory=list)
    """白板布局 JSON，存于首个 text 类型 slide_block 的 extra_payload['wb']。"""
    slide_layout: dict[str, Any] | None = None


class LessonCreate(BaseModel):
    title: str = "Untitled lesson"
    subject: str = "physics"
    grade: str | None = None


class LessonDeckUpsert(BaseModel):
    title: str
    subject: str
    grade: str | None = None
    status: Literal["draft", "published"] | None = None
    slides: list[SlideUpsert] = Field(default_factory=list)


class LessonDeckPatch(BaseModel):
    status: Literal["draft", "published"]


class SlideOut(BaseModel):
    id: int
    order: int
    title: str
    text: str
    notes: str | None = None
    lab_registry_key: str | None = None
    lab_definition_id: int | None = None
    lab_snapshot: dict[str, Any] | None = None
    image_urls: list[str] = Field(default_factory=list)
    slide_layout: dict[str, Any] | None = None


class LessonDeckDetail(BaseModel):
    id: int
    title: str
    subject: str
    grade: str | None = None
    deck_source: str
    status: str
    teacher_id: int
    created_at: datetime
    updated_at: datetime
    slides: list[SlideOut]


class LessonDeckListItem(BaseModel):
    id: int
    title: str
    subject: str
    grade: str | None = None
    deck_source: str
    status: str
    updated_at: datetime
    slide_count: int


class PaginatedLessonList(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[LessonDeckListItem]
