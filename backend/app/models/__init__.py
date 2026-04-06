from sqlalchemy import BigInteger
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
	pass


@compiles(BigInteger, "sqlite")
def _compile_bigint_for_sqlite(_type, _compiler, **_kw) -> str:
	# SQLite auto-increment only works reliably with INTEGER PK affinity.
	return "INTEGER"


from app.models.assessment import Paper, PaperQuestion, PaperQuestionOption, PaperSection
from app.models.assessment import PaperAttempt, PaperAttemptAnswer
from app.models.assessment import PaperAttemptAIScore, PaperAIAdoptionAudit
from app.models.assessment import QuestionBankItem, QuestionBankOption, QuestionItem
from app.models.assessment import QuizAudioPlaybackAudit, QuizAudioRecord
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
	"PaperAttempt",
	"PaperAttemptAnswer",
	"PaperAttemptAIScore",
	"PaperAIAdoptionAudit",
	"QuestionBankItem",
	"QuestionBankOption",
	"QuestionItem",
	"Question",
	"QuestionStatus",
	"QuestionAttempt",
	"QuestionAttemptAnswer",
	"QuizAudioRecord",
	"QuizAudioPlaybackAudit",
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
