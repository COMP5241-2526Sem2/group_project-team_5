from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


PaperStatusView = Literal["draft", "published", "closed"]


class PaperListItem(BaseModel):
    paper_id: int
    title: str
    course_id: int
    course_name: str
    grade: str
    subject: str
    semester: str | None = None
    exam_type: str
    status: PaperStatusView
    total_score: int
    duration_min: int
    question_count: int
    quality_score: int | None = None
    published_at: datetime | None = None
    created_at: datetime


class PaperListResponse(BaseModel):
    items: list[PaperListItem]
    page: int
    page_size: int
    total: int


class PaperQuestionOptionView(BaseModel):
    key: str
    text: str


class PaperQuestionView(BaseModel):
    paper_question_id: int
    order: int
    type: str
    prompt: str
    difficulty: str | None = None
    score: float
    options: list[PaperQuestionOptionView] = []


class PaperSectionView(BaseModel):
    section_id: int
    order: int
    title: str
    question_type: str
    question_count: int
    score_each: float
    total_score: float
    questions: list[PaperQuestionView]


class PaperDetailResponse(BaseModel):
    paper_id: int
    title: str
    course_id: int
    course_name: str
    grade: str
    subject: str
    semester: str | None = None
    exam_type: str
    status: PaperStatusView
    total_score: int
    duration_min: int
    question_count: int
    quality_score: int | None = None
    published_at: datetime | None = None
    created_at: datetime
    sections: list[PaperSectionView]


class PaperStatusMutationResponse(BaseModel):
    paper_id: int
    status: PaperStatusView
    changed_at: datetime
