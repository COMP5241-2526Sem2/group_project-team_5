from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.paper_attempts import PaperAttemptStatus


class PaperAISuggestionItem(BaseModel):
    ai_score_id: int
    question_id: int
    suggested_score: float | None = None
    suggested_feedback: str | None = None
    confidence: float | None = None
    rationale: str | None = None
    model_name: str
    prompt_version: str
    status: str
    error_message: str | None = None
    created_at: datetime


class PaperAISuggestionsResponse(BaseModel):
    attempt_id: int
    items: list[PaperAISuggestionItem]


class PaperAIAdoptRequest(BaseModel):
    override_score: float | None = Field(default=None, ge=0)
    override_feedback: str | None = None


class PaperAIAdoptResponse(BaseModel):
    attempt_id: int
    question_id: int
    adopted_score: float
    attempt_status: PaperAttemptStatus
    total_score: float


class PaperAIAdoptBatchItem(BaseModel):
    question_id: int = Field(ge=1)
    override_score: float | None = Field(default=None, ge=0)
    override_feedback: str | None = None


class PaperAIAdoptBatchRequest(BaseModel):
    items: list[PaperAIAdoptBatchItem] = Field(min_length=1)


class PaperAIAdoptBatchResponse(BaseModel):
    attempt_id: int
    attempt_status: PaperAttemptStatus
    total_score: float
    items: list[PaperAIAdoptResponse]
