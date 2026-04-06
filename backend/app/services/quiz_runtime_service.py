from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Course, Enrollment
from app.models.assessment import (
    AttemptStatus,
    Question,
    QuestionAttempt,
    QuestionAttemptAnswer,
    QuestionBankItem,
    QuestionBankOption,
    QuestionItem,
    QuestionStatus,
)
from app.schemas.quiz_runtime import (
    AttemptCreateResponse,
    AttemptSubmitResponse,
    AnswerWriteItem,
    QuizDetailItem,
    QuizDetailResponse,
    QuizListItem,
    QuizReviewItem,
    QuizReviewResponse,
    ReviewItemAnswer,
    SaveAnswersResponse,
)


OBJECTIVE_TYPES = {"MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "FILL_BLANK"}
MCQ_TYPES = {"MCQ_SINGLE", "MCQ_MULTI"}


class QuizRuntimeService:
    @staticmethod
    async def list_todo(db: AsyncSession, student_id: int) -> list[QuizListItem]:
        now = datetime.now(timezone.utc)
        stmt = (
            select(Question, Course)
            .join(Course, Course.id == Question.course_id)
            .join(Enrollment, Enrollment.course_id == Question.course_id)
            .where(
                Enrollment.student_id == student_id,
                Question.status == QuestionStatus.DRAFT,
                (Question.due_at.is_(None) | (Question.due_at >= now)),
            )
            .order_by(Question.due_at.is_(None), Question.due_at.asc())
        )

        rows = await db.execute(stmt)
        items: list[QuizListItem] = []
        for question, course in rows.all():
            attempt = await db.scalar(
                select(QuestionAttempt).where(
                    QuestionAttempt.question_id == question.id,
                    QuestionAttempt.student_id == student_id,
                )
            )
            if attempt and attempt.status in {AttemptStatus.SUBMITTED, AttemptStatus.GRADED}:
                continue

            count_summary = await QuizRuntimeService._count_question_types(db, question.id)
            items.append(
                QuizListItem(
                    quiz_id=question.id,
                    title=question.title,
                    course_id=course.id,
                    course_name=course.name,
                    due_at=question.due_at,
                    question_count=count_summary["total"],
                    mcq_count=count_summary["mcq"],
                    sa_count=count_summary["subjective"],
                    status="In progress" if attempt else "Not started",
                    total_score=question.total_score,
                )
            )

        return items

    @staticmethod
    async def list_completed(db: AsyncSession, student_id: int) -> list[QuizListItem]:
        stmt = (
            select(QuestionAttempt, Question, Course)
            .join(Question, Question.id == QuestionAttempt.question_id)
            .join(Course, Course.id == Question.course_id)
            .join(Enrollment, Enrollment.course_id == Question.course_id)
            .where(
                Enrollment.student_id == student_id,
                QuestionAttempt.student_id == student_id,
                QuestionAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.GRADED]),
            )
            .order_by(QuestionAttempt.submitted_at.desc())
        )

        rows = await db.execute(stmt)
        items: list[QuizListItem] = []
        for attempt, question, course in rows.all():
            count_summary = await QuizRuntimeService._count_question_types(db, question.id)
            mcq_correct, mcq_total = await QuizRuntimeService._mcq_result(db, attempt.id)
            items.append(
                QuizListItem(
                    quiz_id=question.id,
                    title=question.title,
                    course_id=course.id,
                    course_name=course.name,
                    due_at=question.due_at,
                    question_count=count_summary["total"],
                    mcq_count=count_summary["mcq"],
                    sa_count=count_summary["subjective"],
                    status="Completed",
                    submitted_at=attempt.submitted_at,
                    score=float(attempt.score or 0),
                    total_score=question.total_score,
                    mcq_correct=mcq_correct,
                )
            )

        return items

    @staticmethod
    async def get_quiz_detail(db: AsyncSession, quiz_id: int, student_id: int) -> QuizDetailResponse:
        question, course = await QuizRuntimeService._get_quiz_with_enrollment(db, quiz_id, student_id)

        item_rows = await db.execute(
            select(QuestionItem, QuestionBankItem)
            .join(QuestionBankItem, QuestionBankItem.id == QuestionItem.bank_question_id)
            .where(QuestionItem.question_id == quiz_id)
            .order_by(QuestionItem.order_num.asc())
        )

        items: list[QuizDetailItem] = []
        for question_item, bank_item in item_rows.all():
            options = None
            if bank_item.question_type in {"MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE"}:
                option_rows = await db.execute(
                    select(QuestionBankOption.option_key, QuestionBankOption.option_text)
                    .where(QuestionBankOption.bank_question_id == bank_item.id)
                    .order_by(QuestionBankOption.option_key.asc())
                )
                options = [{"key": key, "text": text} for key, text in option_rows.all()]

            items.append(
                QuizDetailItem(
                    question_id=question_item.id,
                    order=question_item.order_num,
                    type=bank_item.question_type,
                    prompt=question_item.prompt_snapshot or bank_item.prompt,
                    score=float(question_item.score),
                    options=options,
                )
            )

        return QuizDetailResponse(
            quiz_id=question.id,
            title=question.title,
            course_id=course.id,
            course_name=course.name,
            due_at=question.due_at,
            duration_min=question.duration_min,
            total_score=question.total_score,
            question_count=len(items),
            items=items,
        )

    @staticmethod
    async def create_or_get_attempt(db: AsyncSession, quiz_id: int, student_id: int) -> AttemptCreateResponse:
        await QuizRuntimeService._get_quiz_with_enrollment(db, quiz_id, student_id)

        attempt = await db.scalar(
            select(QuestionAttempt).where(
                QuestionAttempt.question_id == quiz_id,
                QuestionAttempt.student_id == student_id,
            )
        )

        if attempt is None:
            attempt = QuestionAttempt(
                question_id=quiz_id,
                student_id=student_id,
                started_at=datetime.now(timezone.utc),
                status=AttemptStatus.IN_PROGRESS,
            )
            db.add(attempt)
            await db.commit()
            await db.refresh(attempt)

        return AttemptCreateResponse(
            attempt_id=attempt.id,
            quiz_id=attempt.question_id,
            status=attempt.status.value,
            started_at=attempt.started_at,
            submitted_at=attempt.submitted_at,
        )

    @staticmethod
    async def save_answers(
        db: AsyncSession,
        attempt_id: int,
        student_id: int,
        answer_items: list[AnswerWriteItem],
    ) -> SaveAnswersResponse:
        attempt = await QuizRuntimeService._get_attempt(db, attempt_id, student_id)
        if attempt.status != AttemptStatus.IN_PROGRESS:
            raise HTTPException(status_code=400, detail="attempt is not editable")

        allowed_ids = await QuizRuntimeService._question_item_ids(db, attempt.question_id)
        saved = 0

        for item in answer_items:
            if item.question_id not in allowed_ids:
                raise HTTPException(status_code=400, detail=f"question_id {item.question_id} not in this quiz")

            existing = await db.scalar(
                select(QuestionAttemptAnswer).where(
                    QuestionAttemptAnswer.attempt_id == attempt.id,
                    QuestionAttemptAnswer.question_id == item.question_id,
                )
            )

            selected = item.selected_option.strip().upper() if item.selected_option else None
            text_answer = item.text_answer.strip() if item.text_answer else None

            if existing is None:
                db.add(
                    QuestionAttemptAnswer(
                        attempt_id=attempt.id,
                        question_id=item.question_id,
                        selected_option=selected,
                        text_answer=text_answer,
                    )
                )
            else:
                existing.selected_option = selected
                existing.text_answer = text_answer
                existing.is_correct = None
                existing.awarded_score = None

            saved += 1

        await db.commit()
        return SaveAnswersResponse(attempt_id=attempt.id, saved_count=saved)

    @staticmethod
    async def submit_attempt(db: AsyncSession, attempt_id: int, student_id: int) -> AttemptSubmitResponse:
        attempt = await QuizRuntimeService._get_attempt(db, attempt_id, student_id)

        if attempt.status in {AttemptStatus.SUBMITTED, AttemptStatus.GRADED}:
            mcq_correct, mcq_total = await QuizRuntimeService._mcq_result(db, attempt.id)
            question = await db.get(Question, attempt.question_id)
            return AttemptSubmitResponse(
                attempt_id=attempt.id,
                status=attempt.status.value,
                score=float(attempt.score or 0),
                total_score=question.total_score if question else 0,
                mcq_correct=mcq_correct,
                mcq_total=mcq_total,
            )

        score_total = Decimal("0")

        answer_rows = await db.execute(
            select(QuestionAttemptAnswer, QuestionItem, QuestionBankItem)
            .join(QuestionItem, QuestionItem.id == QuestionAttemptAnswer.question_id)
            .join(QuestionBankItem, QuestionBankItem.id == QuestionItem.bank_question_id)
            .where(QuestionAttemptAnswer.attempt_id == attempt.id)
        )

        for answer, question_item, bank_item in answer_rows.all():
            q_type = bank_item.question_type
            if q_type not in OBJECTIVE_TYPES:
                answer.is_correct = None
                answer.awarded_score = None
                continue

            is_correct = await QuizRuntimeService._is_answer_correct(
                db=db,
                question_type=q_type,
                bank_item=bank_item,
                selected_option=answer.selected_option,
                text_answer=answer.text_answer,
            )
            answer.is_correct = is_correct
            answer.awarded_score = float(question_item.score) if is_correct else 0.0
            if answer.awarded_score:
                score_total += Decimal(str(answer.awarded_score))

        attempt.status = AttemptStatus.SUBMITTED
        attempt.submitted_at = datetime.now(timezone.utc)
        attempt.score = float(score_total)

        await db.commit()

        question = await db.get(Question, attempt.question_id)
        mcq_correct, mcq_total = await QuizRuntimeService._mcq_result(db, attempt.id)
        return AttemptSubmitResponse(
            attempt_id=attempt.id,
            status=attempt.status.value,
            score=float(attempt.score or 0),
            total_score=question.total_score if question else 0,
            mcq_correct=mcq_correct,
            mcq_total=mcq_total,
        )

    @staticmethod
    async def get_review(db: AsyncSession, attempt_id: int, student_id: int) -> QuizReviewResponse:
        attempt = await QuizRuntimeService._get_attempt(db, attempt_id, student_id)
        question = await db.get(Question, attempt.question_id)
        if question is None:
            raise HTTPException(status_code=404, detail="quiz not found")

        item_rows = await db.execute(
            select(QuestionItem, QuestionBankItem)
            .join(QuestionBankItem, QuestionBankItem.id == QuestionItem.bank_question_id)
            .where(QuestionItem.question_id == question.id)
            .order_by(QuestionItem.order_num.asc())
        )

        answers_rows = await db.execute(
            select(QuestionAttemptAnswer).where(QuestionAttemptAnswer.attempt_id == attempt.id)
        )
        answers_map = {ans.question_id: ans for ans in answers_rows.scalars().all()}

        items: list[QuizReviewItem] = []
        for question_item, bank_item in item_rows.all():
            answer = answers_map.get(question_item.id)
            options = None
            if bank_item.question_type in {"MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE"}:
                option_rows = await db.execute(
                    select(QuestionBankOption.option_key, QuestionBankOption.option_text)
                    .where(QuestionBankOption.bank_question_id == bank_item.id)
                    .order_by(QuestionBankOption.option_key.asc())
                )
                options = [{"key": key, "text": text} for key, text in option_rows.all()]

            correct_answer = None
            if bank_item.question_type in {"MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE"}:
                correct_answer = ReviewItemAnswer(selected_option=(bank_item.answer_text or "").upper() or None)
            elif bank_item.question_type == "FILL_BLANK":
                correct_answer = ReviewItemAnswer(text_answer=bank_item.answer_text)

            items.append(
                QuizReviewItem(
                    question_id=question_item.id,
                    order=question_item.order_num,
                    type=bank_item.question_type,
                    prompt=question_item.prompt_snapshot or bank_item.prompt,
                    options=options,
                    my_answer=ReviewItemAnswer(
                        selected_option=answer.selected_option if answer else None,
                        text_answer=answer.text_answer if answer else None,
                    ),
                    correct_answer=correct_answer,
                    is_correct=answer.is_correct if answer else None,
                    awarded_score=float(answer.awarded_score) if answer and answer.awarded_score is not None else None,
                    teacher_feedback=answer.teacher_feedback if answer else None,
                )
            )

        mcq_correct, mcq_total = await QuizRuntimeService._mcq_result(db, attempt.id)
        return QuizReviewResponse(
            attempt_id=attempt.id,
            quiz_id=question.id,
            score=float(attempt.score or 0),
            total_score=question.total_score,
            mcq_correct=mcq_correct,
            mcq_total=mcq_total,
            items=items,
        )

    @staticmethod
    async def _get_quiz_with_enrollment(db: AsyncSession, quiz_id: int, student_id: int) -> tuple[Question, Course]:
        row = await db.execute(
            select(Question, Course)
            .join(Course, Course.id == Question.course_id)
            .join(Enrollment, Enrollment.course_id == Question.course_id)
            .where(Question.id == quiz_id, Enrollment.student_id == student_id)
        )
        result = row.first()
        if result is None:
            raise HTTPException(status_code=404, detail="quiz not found")
        return result

    @staticmethod
    async def _get_attempt(db: AsyncSession, attempt_id: int, student_id: int) -> QuestionAttempt:
        attempt = await db.scalar(
            select(QuestionAttempt).where(
                QuestionAttempt.id == attempt_id,
                QuestionAttempt.student_id == student_id,
            )
        )
        if attempt is None:
            raise HTTPException(status_code=404, detail="attempt not found")
        return attempt

    @staticmethod
    async def _question_item_ids(db: AsyncSession, quiz_id: int) -> set[int]:
        rows = await db.execute(select(QuestionItem.id).where(QuestionItem.question_id == quiz_id))
        return {row[0] for row in rows.all()}

    @staticmethod
    async def _is_answer_correct(
        *,
        db: AsyncSession,
        question_type: str,
        bank_item: QuestionBankItem,
        selected_option: str | None,
        text_answer: str | None,
    ) -> bool:
        if question_type in {"MCQ_SINGLE", "TRUE_FALSE"}:
            if not selected_option:
                return False
            expected = (bank_item.answer_text or "").strip().upper()
            return selected_option.strip().upper() == expected

        if question_type == "MCQ_MULTI":
            expected_rows = await db.execute(
                select(QuestionBankOption.option_key)
                .where(
                    and_(
                        QuestionBankOption.bank_question_id == bank_item.id,
                        QuestionBankOption.is_correct.is_(True),
                    )
                )
                .order_by(QuestionBankOption.option_key.asc())
            )
            expected = {str(r[0]).strip().upper() for r in expected_rows.all()}
            if not expected and bank_item.answer_text:
                expected = {token.strip().upper() for token in bank_item.answer_text.split(",") if token.strip()}

            raw = selected_option or text_answer or ""
            given = {token.strip().upper() for token in raw.replace(";", ",").split(",") if token.strip()}
            return bool(given) and given == expected

        if question_type == "FILL_BLANK":
            if not text_answer:
                return False
            expected = (bank_item.answer_text or "").strip().lower()
            return text_answer.strip().lower() == expected

        return False

    @staticmethod
    async def _count_question_types(db: AsyncSession, quiz_id: int) -> dict[str, int]:
        rows = await db.execute(
            select(QuestionBankItem.question_type)
            .join(QuestionItem, QuestionItem.bank_question_id == QuestionBankItem.id)
            .where(QuestionItem.question_id == quiz_id)
        )
        types = [str(r[0]) for r in rows.all()]
        mcq_count = sum(1 for t in types if t in MCQ_TYPES)
        subjective = sum(1 for t in types if t not in MCQ_TYPES)
        return {"total": len(types), "mcq": mcq_count, "subjective": subjective}

    @staticmethod
    async def _mcq_result(db: AsyncSession, attempt_id: int) -> tuple[int, int]:
        rows = await db.execute(
            select(QuestionAttemptAnswer.is_correct, QuestionBankItem.question_type)
            .join(QuestionItem, QuestionItem.id == QuestionAttemptAnswer.question_id)
            .join(QuestionBankItem, QuestionBankItem.id == QuestionItem.bank_question_id)
            .where(QuestionAttemptAnswer.attempt_id == attempt_id)
        )
        mcq_rows = [(ok, t) for ok, t in rows.all() if t in MCQ_TYPES]
        total = len(mcq_rows)
        correct = sum(1 for ok, _ in mcq_rows if ok is True)
        return correct, total
