from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
	pass


from app.models.assessment import Paper, PaperQuestion, PaperQuestionOption, PaperSection
from app.models.assessment import QuestionBankItem, QuestionBankOption, QuestionItem
from app.models.course import Course, Enrollment
from app.models.lab import LabRegistry
from app.models.lesson import LessonDeck, Slide, SlideBlock
from app.models.assessment import Question, QuestionAttempt, QuestionAttemptAnswer, QuestionStatus
from app.models.textbook import Textbook
from app.models.user import StudentProfile, TeacherProfile, User


__all__ = [
	"Base",
	"Paper",
	"PaperSection",
	"PaperQuestion",
	"PaperQuestionOption",
	"QuestionBankItem",
	"QuestionBankOption",
	"QuestionItem",
	"Question",
	"QuestionStatus",
	"QuestionAttempt",
	"QuestionAttemptAnswer",
	"User",
	"StudentProfile",
	"TeacherProfile",
	"Course",
	"Enrollment",
	"LessonDeck",
	"Slide",
	"SlideBlock",
	"LabRegistry",
	"Textbook",
]
