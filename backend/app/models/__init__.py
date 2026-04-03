from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
	pass


from app.models.assessment import Exercise, ExerciseAttempt, ExerciseAttemptAnswer
from app.models.assessment import Paper, PaperQuestion, PaperQuestionOption, PaperSection


__all__ = [
	"Base",
	"Paper",
	"PaperSection",
	"PaperQuestion",
	"PaperQuestionOption",
	"Exercise",
	"ExerciseAttempt",
	"ExerciseAttemptAnswer",
]
