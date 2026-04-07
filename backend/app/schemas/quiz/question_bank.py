from __future__ import annotations

from pydantic import BaseModel


class QuestionBankSetQuestionOut(BaseModel):
    id: str
    type: str
    prompt: str
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
    questions: list[QuestionBankSetQuestionOut]


class QuestionBankSetsResponse(BaseModel):
    sets: list[QuestionBankSetOut]
