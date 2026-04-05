from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


Difficulty = Literal["easy", "medium", "hard"]
GenerateMode = Literal["textbook", "paper_mimic"]
QuestionType = Literal["MCQ_SINGLE", "SHORT_ANSWER"]
SourceType = Literal["paper", "exercise", "textbook", "ai_generated", "manual"]


class QuizGenerateRequest(BaseModel):
    mode: GenerateMode
    subject: str = Field(min_length=1)
    grade: str = Field(min_length=1)
    difficulty: Difficulty
    question_count: int = Field(ge=1)
    total_score: int = Field(ge=1)
    duration_min: int = Field(ge=1)

    textbook_id: int | None = None
    chapter: str | None = None

    source_paper_id: int | None = None
    rewrite_strength: Literal["medium"] = "medium"

    @model_validator(mode="after")
    def validate_mode_dependencies(self) -> "QuizGenerateRequest":
        if self.mode == "textbook" and self.textbook_id is None:
            raise ValueError("textbook_id is required when mode='textbook'")
        if self.mode == "paper_mimic" and self.source_paper_id is None:
            raise ValueError("source_paper_id is required when mode='paper_mimic'")
        return self


class GeneratedQuizItem(BaseModel):
    order_num: int
    question_type: QuestionType
    prompt: str
    score: float
    bank_question_id: int
    source_type: SourceType
    source_id: int | None = None
    options: list[dict] | None = None


class QuizGenerateResponse(BaseModel):
    question_id: int
    title: str
    status: Literal["draft"]
    reused_count: int
    generated_count: int
    items: list[GeneratedQuizItem]
