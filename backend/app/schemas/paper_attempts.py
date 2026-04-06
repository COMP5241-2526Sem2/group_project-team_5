from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


PaperAttemptStatus = Literal["in_progress", "submitted", "graded"]


class PaperAttemptCreateResponse(BaseModel):
    attempt_id: int
    paper_id: int
    student_id: int
    status: PaperAttemptStatus
    started_at: datetime | None = None


class PaperAnswerWriteItem(BaseModel):
    question_id: int = Field(ge=1)
    selected_option: str | None = None
    text_answer: str | None = None


class PaperSaveAnswersRequest(BaseModel):
    answers: list[PaperAnswerWriteItem] = Field(min_length=1)


class PaperSaveAnswersResponse(BaseModel):
    attempt_id: int
    saved_count: int
    status: PaperAttemptStatus


class PaperSubmitAttemptResponse(BaseModel):
    attempt_id: int
    status: PaperAttemptStatus
    score: float
    total_score: float
    objective_correct: int
    objective_total: int


class PaperReviewItem(BaseModel):
    question_id: int
    type: str
    max_score: float
    selected_option: str | None = None
    text_answer: str | None = None
    is_correct: bool | None = None
    awarded_score: float | None = None
    teacher_feedback: str | None = None


class PaperAttemptReviewResponse(BaseModel):
    attempt_id: int
    paper_id: int
    student_id: int
    status: PaperAttemptStatus
    score: float
    total_score: float
    items: list[PaperReviewItem]


class PaperAttemptListItem(BaseModel):
    attempt_id: int
    paper_id: int
    paper_title: str
    student_id: int
    student_name: str
    status: PaperAttemptStatus
    score: float | None = None
    total_score: float
    objective_correct: int
    objective_total: int
    started_at: datetime | None = None
    submitted_at: datetime | None = None


class PaperAttemptListResponse(BaseModel):
    items: list[PaperAttemptListItem]
    page: int
    page_size: int
    total: int


class PaperGradeAnswerRequest(BaseModel):
    awarded_score: float = Field(ge=0)
    teacher_feedback: str | None = None
    is_correct: bool | None = None


class PaperGradeAnswerResponse(BaseModel):
    attempt_id: int
    question_id: int
    awarded_score: float
    max_score: float
    attempt_status: PaperAttemptStatus
    total_score: float


class PaperGradeBatchItem(BaseModel):
    question_id: int = Field(ge=1)
    awarded_score: float = Field(ge=0)
    teacher_feedback: str | None = None
    is_correct: bool | None = None


class PaperGradeAnswersBatchRequest(BaseModel):
    items: list[PaperGradeBatchItem] = Field(min_length=1)


class PaperGradeAnswersBatchResponse(BaseModel):
    attempt_id: int
    attempt_status: PaperAttemptStatus
    total_score: float
    items: list[PaperGradeAnswerResponse]
