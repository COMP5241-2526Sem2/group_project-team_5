from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


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
    has_source_pdf: bool = False


class PaperListResponse(BaseModel):
    items: list[PaperListItem]
    page: int
    page_size: int
    total: int


class PaperQuestionOptionView(BaseModel):
    key: str
    text: str
    is_correct: bool | None = None


class PaperQuestionView(BaseModel):
    paper_question_id: int
    order: int
    type: str
    prompt: str
    difficulty: str | None = None
    score: float
    answer: str | None = None
    explanation: str | None = None
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
    has_source_pdf: bool = False
    sections: list[PaperSectionView]


class PaperStatusMutationResponse(BaseModel):
    paper_id: int
    status: PaperStatusView
    changed_at: datetime


class PaperCreateQuestionOption(BaseModel):
    key: str
    text: str
    is_correct: bool = False


class PaperCreateQuestion(BaseModel):
    type: str
    prompt: str = Field(min_length=1)
    difficulty: str | None = None
    explanation: str | None = None
    answer: str | None = None
    options: list[PaperCreateQuestionOption] = []
    score: float | None = Field(default=None, ge=0)


class PaperCreateRequest(BaseModel):
    title: str = Field(min_length=1)
    grade: str = Field(min_length=1)
    subject: str = Field(min_length=1)
    semester: str | None = None
    exam_type: str = "ai_generated"
    duration_min: int = Field(default=45, ge=1)
    total_score: int = Field(default=100, ge=1)
    course_id: int | None = None
    questions: list[PaperCreateQuestion] = Field(min_length=1)


class PaperCreateResponse(BaseModel):
    paper_id: int
    title: str
    status: PaperStatusView
    question_count: int
    created_at: datetime


# Draft update uses the same body shape as create (replace all questions).
PaperUpdateRequest = PaperCreateRequest
PaperUpdateResponse = PaperCreateResponse
