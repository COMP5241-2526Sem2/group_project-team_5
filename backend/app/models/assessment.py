from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class PaperStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class QuestionStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"


class AttemptStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    GRADED = "graded"


class PaperAttemptStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    GRADED = "graded"


class Paper(Base):
    __tablename__ = "papers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    course_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    grade: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    semester: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    exam_type: Mapped[str] = mapped_column(Text, nullable=False)
    total_score: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False)
    quality_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[PaperStatus] = mapped_column(
        SQLEnum(PaperStatus, name="paper_status"), nullable=False, default=PaperStatus.DRAFT
    )
    created_by: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    source_file_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_pdf: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)

    sections: Mapped[list[PaperSection]] = relationship(back_populates="paper", cascade="all, delete-orphan")
    questions: Mapped[list[PaperQuestion]] = relationship(back_populates="paper", cascade="all, delete-orphan")
    attempts: Mapped[list[PaperAttempt]] = relationship(back_populates="paper", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("total_score >= 0", name="ck_papers_total_score_non_negative"),
        CheckConstraint("duration_min >= 0", name="ck_papers_duration_non_negative"),
        CheckConstraint("question_count >= 0", name="ck_papers_question_count_non_negative"),
        CheckConstraint(
            "quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)",
            name="ck_papers_quality_score_range",
        ),
    )


class PaperSection(Base):
    __tablename__ = "paper_sections"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    section_order: Mapped[int] = mapped_column(Integer, nullable=False)
    question_type: Mapped[str] = mapped_column(Text, nullable=False)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False)
    score_each: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    total_score: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)

    paper: Mapped[Paper] = relationship(back_populates="sections")
    questions: Mapped[list[PaperQuestion]] = relationship(back_populates="section", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("paper_id", "section_order", name="uq_paper_sections_paper_order"),
        CheckConstraint("section_order >= 1", name="ck_paper_sections_order_positive"),
        CheckConstraint("question_count >= 0", name="ck_paper_sections_question_count_non_negative"),
        CheckConstraint("score_each >= 0", name="ck_paper_sections_score_each_non_negative"),
        CheckConstraint("total_score >= 0", name="ck_paper_sections_total_score_non_negative"),
    )


class PaperQuestion(Base):
    __tablename__ = "paper_questions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    section_id: Mapped[int] = mapped_column(
        ForeignKey("paper_sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_num: Mapped[int] = mapped_column(Integer, nullable=False)
    question_type: Mapped[str] = mapped_column(Text, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    bank_question_id: Mapped[int] = mapped_column(
        ForeignKey("question_bank_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    answer_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    chapter: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    paper: Mapped[Paper] = relationship(back_populates="questions")
    section: Mapped[PaperSection] = relationship(back_populates="questions")
    bank_question: Mapped[QuestionBankItem | None] = relationship(back_populates="paper_questions")
    options: Mapped[list[PaperQuestionOption]] = relationship(back_populates="question", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("paper_id", "order_num", name="uq_paper_questions_paper_order"),
        CheckConstraint("order_num >= 1", name="ck_paper_questions_order_positive"),
        CheckConstraint("score >= 0", name="ck_paper_questions_score_non_negative"),
    )


class PaperQuestionOption(Base):
    __tablename__ = "paper_question_options"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("paper_questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    option_key: Mapped[str] = mapped_column(String(10), nullable=False)
    option_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[Optional[bool]] = mapped_column(nullable=True)

    question: Mapped[PaperQuestion] = relationship(back_populates="options")

    __table_args__ = (UniqueConstraint("question_id", "option_key", name="uq_paper_question_options_key"),)


class PaperAttempt(Base):
    __tablename__ = "paper_attempts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    status: Mapped[PaperAttemptStatus] = mapped_column(
        SQLEnum(
            PaperAttemptStatus,
            name="paper_attempt_status",
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
        ),
        nullable=False,
        default=PaperAttemptStatus.IN_PROGRESS,
    )

    paper: Mapped[Paper] = relationship(back_populates="attempts")
    answers: Mapped[list[PaperAttemptAnswer]] = relationship(back_populates="attempt", cascade="all, delete-orphan")
    ai_scores: Mapped[list[PaperAttemptAIScore]] = relationship(back_populates="attempt", cascade="all, delete-orphan")
    ai_adoption_audits: Mapped[list[PaperAIAdoptionAudit]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("paper_id", "student_id", name="uq_paper_attempts_paper_student"),
        CheckConstraint("score IS NULL OR score >= 0", name="ck_paper_attempts_score_non_negative"),
    )


class PaperAttemptAnswer(Base):
    __tablename__ = "paper_attempt_answers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("paper_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("paper_questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    selected_option: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    text_answer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_correct: Mapped[Optional[bool]] = mapped_column(nullable=True)
    awarded_score: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    teacher_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    attempt: Mapped[PaperAttempt] = relationship(back_populates="answers")

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_paper_attempt_answers_attempt_question"),
        CheckConstraint("awarded_score IS NULL OR awarded_score >= 0", name="ck_paper_attempt_answers_awarded_non_negative"),
    )


class PaperAttemptAIScore(Base):
    __tablename__ = "paper_attempt_ai_scores"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("paper_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("paper_questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    suggested_score: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    suggested_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_name: Mapped[str] = mapped_column(Text, nullable=False, server_default="heuristic-v1")
    prompt_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="v1")
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="success")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    attempt: Mapped[PaperAttempt] = relationship(back_populates="ai_scores")

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", "prompt_version", name="uq_paper_attempt_ai_scores_attempt_question_prompt"),
        CheckConstraint("suggested_score IS NULL OR suggested_score >= 0", name="ck_paper_attempt_ai_scores_suggested_score_non_negative"),
        CheckConstraint("confidence IS NULL OR (confidence >= 0 AND confidence <= 1)", name="ck_paper_attempt_ai_scores_confidence_range"),
    )


class PaperAIAdoptionAudit(Base):
    __tablename__ = "paper_ai_adoption_audits"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("paper_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("paper_questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    source_ai_score_id: Mapped[int] = mapped_column(
        ForeignKey("paper_attempt_ai_scores.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    adopted_score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    adopted_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    action: Mapped[str] = mapped_column(Text, nullable=False, server_default="adopt")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    attempt: Mapped[PaperAttempt] = relationship(back_populates="ai_adoption_audits")

    __table_args__ = (
        CheckConstraint("adopted_score >= 0", name="ck_paper_ai_adoption_audits_adopted_score_non_negative"),
    )


class QuestionBankItem(Base):
    __tablename__ = "question_bank_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    publisher: Mapped[str | None] = mapped_column(Text, nullable=True)
    grade: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    semester: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_type: Mapped[str] = mapped_column(Text, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    chapter: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    source_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    options: Mapped[list[QuestionBankOption]] = relationship(back_populates="bank_question", cascade="all, delete-orphan")
    paper_questions: Mapped[list[PaperQuestion]] = relationship(back_populates="bank_question")
    question_items: Mapped[list[QuestionItem]] = relationship(back_populates="bank_question")


class QuestionBankOption(Base):
    __tablename__ = "question_bank_options"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    bank_question_id: Mapped[int] = mapped_column(
        ForeignKey("question_bank_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    option_key: Mapped[str] = mapped_column(Text, nullable=False)
    option_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool | None] = mapped_column(nullable=True)

    bank_question: Mapped[QuestionBankItem] = relationship(back_populates="options")

    __table_args__ = (UniqueConstraint("bank_question_id", "option_key", name="uq_question_bank_options_key"),)


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    course_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_score: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[QuestionStatus] = mapped_column(
        SQLEnum(QuestionStatus, name="question_status"), nullable=False, default=QuestionStatus.DRAFT
    )
    created_by: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    attempts: Mapped[list[QuestionAttempt]] = relationship(back_populates="question", cascade="all, delete-orphan")
    items: Mapped[list[QuestionItem]] = relationship(back_populates="question", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("total_score >= 0", name="ck_questions_total_score_non_negative"),
        CheckConstraint("duration_min IS NULL OR duration_min >= 0", name="ck_questions_duration_non_negative"),
    )


class QuestionAttempt(Base):
    __tablename__ = "question_attempts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    status: Mapped[AttemptStatus] = mapped_column(
        SQLEnum(AttemptStatus, name="attempt_status"), nullable=False, default=AttemptStatus.IN_PROGRESS
    )

    question: Mapped[Question] = relationship(back_populates="attempts")
    answers: Mapped[list[QuestionAttemptAnswer]] = relationship(back_populates="attempt", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("question_id", "student_id", name="uq_question_attempts_question_student"),
        CheckConstraint("score IS NULL OR score >= 0", name="ck_question_attempts_score_non_negative"),
    )


class QuestionItem(Base):
    __tablename__ = "question_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    bank_question_id: Mapped[int] = mapped_column(
        ForeignKey("question_bank_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    order_num: Mapped[int] = mapped_column(Integer, nullable=False)
    score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    prompt_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)

    question: Mapped[Question] = relationship(back_populates="items")
    bank_question: Mapped[QuestionBankItem] = relationship(back_populates="question_items")

    __table_args__ = (
        UniqueConstraint("question_id", "order_num", name="uq_question_items_order"),
        CheckConstraint("order_num >= 1", name="ck_question_items_order_positive"),
        CheckConstraint("score >= 0", name="ck_question_items_score_non_negative"),
    )


class QuestionAttemptAnswer(Base):
    __tablename__ = "question_attempt_answers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("question_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("question_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    selected_option: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    text_answer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_correct: Mapped[Optional[bool]] = mapped_column(nullable=True)
    awarded_score: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    teacher_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    attempt: Mapped[QuestionAttempt] = relationship(back_populates="answers")

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_question_attempt_answers_attempt_question"),
        CheckConstraint("awarded_score IS NULL OR awarded_score >= 0", name="ck_attempt_answers_awarded_score_non_negative"),
    )


class QuizAudioRecord(Base):
    __tablename__ = "quiz_audio_records"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("question_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("question_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    file_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    audio_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    retention_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("size_bytes >= 1", name="ck_quiz_audio_records_size_positive"),
    )


class QuizAudioPlaybackAudit(Base):
    __tablename__ = "quiz_audio_playback_audits"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    audio_id: Mapped[int] = mapped_column(
        ForeignKey("quiz_audio_records.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(Text, nullable=False, server_default="stream")
    ip: Mapped[str | None] = mapped_column(Text, nullable=True)
    device_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)