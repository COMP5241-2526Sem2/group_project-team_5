from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
	pass


from app.models.assessment import Exercise, ExerciseAttempt, ExerciseAttemptAnswer
from app.models.assessment import (
    AttemptStatus,
    ExerciseStatus,
    Paper,
    PaperQuestion,
    PaperQuestionOption,
    PaperSection,
    PaperStatus,
)
from app.models.lab import (
    LabChatMessage,
    LabDefinition,
    LabGenerationSession,
    LabStatus,
    LabType,
    SubjectLab,
    Dimension,
    SessionMode,
    MessageRole,
)


__all__ = [
    "Base",
    # assessment
    "Paper",
    "PaperStatus",
    "PaperSection",
    "PaperQuestion",
    "PaperQuestionOption",
    "Exercise",
    "ExerciseStatus",
    "ExerciseAttempt",
    "ExerciseAttemptAnswer",
    "AttemptStatus",
    # lab
    "LabDefinition",
    "LabGenerationSession",
    "LabChatMessage",
    "LabStatus",
    "LabType",
    "SubjectLab",
    "Dimension",
    "SessionMode",
    "MessageRole",
]
