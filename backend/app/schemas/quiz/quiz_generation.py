from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


Difficulty = Literal["easy", "medium", "hard"]
GenerateMode = Literal["textbook", "paper_mimic"]
QuestionType = Literal[
    "MCQ_SINGLE",
    "MCQ_MULTI",
    "TRUE_FALSE",
    "FILL_BLANK",
    "SHORT_ANSWER",
    "ESSAY",
]
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
    rewrite_strength: Literal["low", "medium", "high"] = "medium"
    type_targets: dict[QuestionType, int] | None = None

    @model_validator(mode="after")
    def validate_mode_dependencies(self) -> "QuizGenerateRequest":
        if self.mode == "textbook" and self.textbook_id is None:
            raise ValueError("textbook_id is required when mode='textbook'")
        if self.mode == "paper_mimic" and self.source_paper_id is None:
            raise ValueError("source_paper_id is required when mode='paper_mimic'")

        targets = self.type_targets or {}
        if targets:
            total = sum(targets.values())
            if total != self.question_count:
                raise ValueError("sum(type_targets) must equal question_count")
            invalid = [k for k, v in targets.items() if v < 0]
            if invalid:
                raise ValueError(f"type_targets must be non-negative: {', '.join(invalid)}")

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


class AIQuestionGenOption(BaseModel):
    key: str
    text: str
    correct: bool = False


class AIQuestionGenQuestion(BaseModel):
    type: Literal["MCQ", "True/False", "Fill-blank", "Short Answer", "Essay"]
    prompt: str
    options: list[AIQuestionGenOption] = []
    answer: str | None = None
    difficulty: Difficulty
    explanation: str


class AIQuestionGenPreviewRequest(BaseModel):
    source_text: str = Field(min_length=1)
    subject: str | None = None
    grade: str | None = None
    task_type: Literal["simulation", "error_based"] | None = None
    match_mode: Literal["type", "knowledge"] | None = None
    source_mode: Literal["upload", "text", "textbook", "exam", "questions"] | None = None
    exam_generation_mode: Literal["error-questions", "simulation"] | None = None
    exam_match_mode: Literal["type", "knowledge"] | None = None
    exam_difficulty: Literal["basic", "solid", "advanced"] | None = None
    source_file_names: list[str] | None = None
    question_input_mode: Literal["paste", "bank"] | None = None
    derive_mode: Literal["variation", "extension", "contrast"] | None = None
    seed_questions: list[str] | None = None
    difficulty: Difficulty
    question_count: int = Field(ge=1)
    type_targets: dict[str, int] | None = None


class AIQuestionGenPreviewResponse(BaseModel):
    questions: list[AIQuestionGenQuestion]
    generation_mode: Literal["llm", "heuristic"] = "heuristic"
    warning: str | None = None


class AIQuestionGenExtractTextResponse(BaseModel):
    source_text: str
    chars: int


class AIQuestionGenIllustrationRequestItem(BaseModel):
    question_id: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    question_type: str = Field(min_length=1)


class AIQuestionGenIllustrationRequest(BaseModel):
    style: Literal["auto", "diagram", "chart", "photo", "scientific"] = "auto"
    style_prompt: str | None = None
    questions: list[AIQuestionGenIllustrationRequestItem] = Field(min_length=1, max_length=30)


class AIQuestionGenIllustrationResult(BaseModel):
    question_id: str
    image_url: str
    used_fallback: bool = False
    error: str | None = None


class AIQuestionGenIllustrationResponse(BaseModel):
    images: list[AIQuestionGenIllustrationResult]
