from sqlalchemy import BigInteger
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


@compiles(BigInteger, "sqlite")
def _compile_bigint_for_sqlite(_type, _compiler, **_kw) -> str:
    # SQLite auto-increment only works reliably with INTEGER PK affinity.
    return "INTEGER"


from app.models.assessment import (  # noqa: E402
    TeacherTask,
    TeacherTaskItem,
    TeacherTaskStatus,
    Paper,
    PaperAIAdoptionAudit,
    PaperAttempt,
    PaperAttemptAIScore,
    PaperAttemptAnswer,
    PaperQuestion,
    PaperQuestionOption,
    PaperSection,
    Question,
    QuestionAttempt,
    QuestionAttemptAnswer,
    QuestionBankItem,
    QuestionBankOption,
    QuestionItem,
    QuestionStatus,
    QuizAudioPlaybackAudit,
    QuizAudioRecord,
)
from app.models.course import Course, Enrollment  # noqa: E402
from app.models.lab import (  # noqa: E402
    Dimension,
    LabChatMessage,
    LabDefinition,
    LabGenerationSession,
    LabStatus,
    LabType,
    MessageRole,
    SessionMode,
    SubjectLab,
)
from app.models.lesson import LessonDeck, Slide, SlideBlock  # noqa: E402
from app.models.textbook import Textbook  # noqa: E402
from app.models.user import StudentProfile, TeacherProfile, User  # noqa: E402


__all__ = [
    "Base",
    # assessment
    "TeacherTask",
    "TeacherTaskItem",
    "TeacherTaskStatus",
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
    # user/course/lesson/textbook
    "User",
    "StudentProfile",
    "TeacherProfile",
    "Course",
    "Enrollment",
    "LessonDeck",
    "Slide",
    "SlideBlock",
    "Textbook",
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
