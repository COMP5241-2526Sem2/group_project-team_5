from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


QuestionType = Literal[
    "MCQ_SINGLE",
    "MCQ_MULTI",
    "TRUE_FALSE",
    "FILL_BLANK",
    "SHORT_ANSWER",
    "ESSAY",
]


class QuizListItem(BaseModel):
    quiz_id: int
    title: str
    course_id: int
    course_name: str
    due_at: datetime | None
    question_count: int
    mcq_count: int
    sa_count: int
    status: Literal["Not started", "In progress", "Completed"]
    submitted_at: datetime | None = None
    score: float | None = None
    total_score: int
    mcq_correct: int | None = None


class QuizListResponse(BaseModel):
    items: list[QuizListItem]


class QuizDetailItem(BaseModel):
    question_id: int
    order: int
    type: QuestionType
    prompt: str
    score: float
    options: list[dict] | None = None


class QuizDetailResponse(BaseModel):
    quiz_id: int
    title: str
    course_id: int
    course_name: str
    due_at: datetime | None
    duration_min: int | None
    total_score: int
    question_count: int
    items: list[QuizDetailItem]


class AttemptCreateResponse(BaseModel):
    attempt_id: int
    quiz_id: int
    status: Literal["in_progress", "submitted", "graded"]
    started_at: datetime | None
    submitted_at: datetime | None


class AnswerWriteItem(BaseModel):
    question_id: int = Field(ge=1)
    selected_option: str | None = None
    text_answer: str | None = None


class SaveAnswersRequest(BaseModel):
    answers: list[AnswerWriteItem] = Field(min_length=1)


class SaveAnswersResponse(BaseModel):
    attempt_id: int
    saved_count: int


class AttemptSubmitResponse(BaseModel):
    attempt_id: int
    status: Literal["submitted", "graded"]
    score: float
    total_score: int
    mcq_correct: int
    mcq_total: int


class ReviewItemAnswer(BaseModel):
    selected_option: str | None = None
    text_answer: str | None = None


class QuizReviewItem(BaseModel):
    question_id: int
    order: int
    type: QuestionType
    prompt: str
    options: list[dict] | None = None
    my_answer: ReviewItemAnswer
    correct_answer: ReviewItemAnswer | None = None
    is_correct: bool | None = None
    awarded_score: float | None = None
    teacher_feedback: str | None = None
    audio_records: list["AudioRecordSummary"] = Field(default_factory=list)


class QuizReviewResponse(BaseModel):
    attempt_id: int
    quiz_id: int
    score: float
    total_score: int
    mcq_correct: int
    mcq_total: int
    items: list[QuizReviewItem]


class QuizStatusMutationResponse(BaseModel):
    quiz_id: int
    status: Literal["draft", "published", "closed"]
    changed_at: datetime


class GradeAnswerRequest(BaseModel):
    awarded_score: float = Field(ge=0)
    teacher_feedback: str | None = None
    is_correct: bool | None = None


class GradeAnswerResponse(BaseModel):
    attempt_id: int
    question_id: int
    awarded_score: float
    max_score: float
    attempt_status: Literal["in_progress", "submitted", "graded"]
    total_score: float


class GradeAnswersBatchRequest(BaseModel):
    items: list["GradeAnswerBatchItem"] = Field(min_length=1)


class GradeAnswersBatchResponse(BaseModel):
    attempt_id: int
    attempt_status: Literal["in_progress", "submitted", "graded"]
    total_score: float
    items: list[GradeAnswerResponse]


class GradeAnswerBatchItem(BaseModel):
    question_id: int = Field(ge=1)
    awarded_score: float = Field(ge=0)
    teacher_feedback: str | None = None
    is_correct: bool | None = None


class AudioRecordSummary(BaseModel):
    audio_id: int
    content_type: str
    size_bytes: int
    created_at: datetime


class AudioUploadResponse(BaseModel):
    audio_id: int
    attempt_id: int
    question_id: int
    content_type: str
    size_bytes: int
    created_at: datetime
    retention_until: datetime | None


class AudioAuditRequest(BaseModel):
    action: str = Field(min_length=1, max_length=64)
    ip: str | None = Field(default=None, max_length=128)
    device_info: str | None = Field(default=None, max_length=512)


class AudioAuditResponse(BaseModel):
    audit_id: int
    audio_id: int
    action: str
    created_at: datetime
