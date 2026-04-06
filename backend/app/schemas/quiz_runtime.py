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


class QuizReviewResponse(BaseModel):
    attempt_id: int
    quiz_id: int
    score: float
    total_score: int
    mcq_correct: int
    mcq_total: int
    items: list[QuizReviewItem]
