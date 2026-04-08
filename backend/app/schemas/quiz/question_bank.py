from __future__ import annotations

from pydantic import BaseModel, Field


class QuestionBankSetQuestionOut(BaseModel):
    id: str
    type: str
    prompt: str
    image_url: str | None = None
    options: list[str] | None = None
    answer: str | None = None
    difficulty: str


class QuestionBankSetOut(BaseModel):
    id: str
    type: str
    subject: str
    grade: str
    semester: str
    difficulty: str
    chapter: str
    source: str
    ai_generated: bool
    can_delete: bool = False
    questions: list[QuestionBankSetQuestionOut]


class QuestionBankSetsResponse(BaseModel):
    sets: list[QuestionBankSetOut]


class ManualQuestionOptionIn(BaseModel):
    option_key: str = Field(min_length=1, max_length=8)
    option_text: str = Field(min_length=1)


class ManualQuestionIn(BaseModel):
    prompt: str = Field(min_length=1)
    difficulty: str = "medium"
    answer: str = Field(min_length=1)
    options: list[ManualQuestionOptionIn] | None = None


class ManualSetCreateIn(BaseModel):
    """Create one logical set: same subject/grade/semester/chapter/type for all rows (matches list_grouped_sets)."""

    question_type: str = Field(min_length=1)
    subject: str = Field(min_length=1)
    grade: str = Field(min_length=1)
    semester: str | None = None
    chapter: str = Field(min_length=1, description="Set title / chapter line shown on cards")
    publisher: str | None = Field(default=None, description="Source tag, e.g. Supplement, SciQ")
    questions: list[ManualQuestionIn] = Field(min_length=1)


class ManualSetCreatedOut(BaseModel):
    set_id: str
    items_created: int


class DeleteSetByKeyIn(BaseModel):
    subject: str = Field(min_length=1)
    grade: str = Field(min_length=1)
    semester: str | None = None
    chapter: str = Field(min_length=1)
    question_type: str = Field(min_length=1)


class DeleteSetByKeyOut(BaseModel):
    deleted: int
