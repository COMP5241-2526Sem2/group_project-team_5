from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, Text, UniqueConstraint, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class PaperStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ExerciseStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"


class AttemptStatus(str, enum.Enum):
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
    semester: Mapped[str | None] = mapped_column(Text, nullable=True)
    exam_type: Mapped[str] = mapped_column(Text, nullable=False)
    total_score: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False)
    quality_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[PaperStatus] = mapped_column(
        SQLEnum(PaperStatus, name="paper_status"), nullable=False, default=PaperStatus.DRAFT
    )
    created_by: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sections: Mapped[list[PaperSection]] = relationship(back_populates="paper", cascade="all, delete-orphan")
    questions: Mapped[list[PaperQuestion]] = relationship(back_populates="paper", cascade="all, delete-orphan")

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
    difficulty: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    chapter: Mapped[str | None] = mapped_column(Text, nullable=True)

    paper: Mapped[Paper] = relationship(back_populates="questions")
    section: Mapped[PaperSection] = relationship(back_populates="questions")
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
    option_key: Mapped[str] = mapped_column(Text, nullable=False)
    option_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool | None] = mapped_column(nullable=True)

    question: Mapped[PaperQuestion] = relationship(back_populates="options")

    __table_args__ = (UniqueConstraint("question_id", "option_key", name="uq_paper_question_options_key"),)


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    course_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    paper_id: Mapped[int | None] = mapped_column(ForeignKey("papers.id", ondelete="SET NULL"), nullable=True, index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_score: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[ExerciseStatus] = mapped_column(
        SQLEnum(ExerciseStatus, name="exercise_status"), nullable=False, default=ExerciseStatus.DRAFT
    )
    created_by: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    attempts: Mapped[list[ExerciseAttempt]] = relationship(back_populates="exercise", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("total_score >= 0", name="ck_exercises_total_score_non_negative"),
        CheckConstraint("duration_min IS NULL OR duration_min >= 0", name="ck_exercises_duration_non_negative"),
    )


class ExerciseAttempt(Base):
    __tablename__ = "exercise_attempts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    status: Mapped[AttemptStatus] = mapped_column(
        SQLEnum(AttemptStatus, name="attempt_status"), nullable=False, default=AttemptStatus.IN_PROGRESS
    )

    exercise: Mapped[Exercise] = relationship(back_populates="attempts")
    answers: Mapped[list[ExerciseAttemptAnswer]] = relationship(back_populates="attempt", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("exercise_id", "student_id", name="uq_exercise_attempts_exercise_student"),
        CheckConstraint("score IS NULL OR score >= 0", name="ck_exercise_attempts_score_non_negative"),
    )


class ExerciseAttemptAnswer(Base):
    __tablename__ = "exercise_attempt_answers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("exercise_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("paper_questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    selected_option: Mapped[str | None] = mapped_column(Text, nullable=True)
    text_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_correct: Mapped[bool | None] = mapped_column(nullable=True)
    awarded_score: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    teacher_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)

    attempt: Mapped[ExerciseAttempt] = relationship(back_populates="answers")

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_exercise_attempt_answers_attempt_question"),
        CheckConstraint("awarded_score IS NULL OR awarded_score >= 0", name="ck_attempt_answers_awarded_score_non_negative"),
    )