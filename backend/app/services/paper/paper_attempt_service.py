from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.models import Course, User
from app.models.assessment import (
    Paper,
    PaperAttempt,
    PaperAttemptAnswer,
    PaperAttemptStatus,
    PaperQuestion,
    PaperStatus,
)
from app.models.user import AccountType
from app.schemas.paper.paper_attempts import (
    PaperAnswerWriteItem,
    PaperAttemptCreateResponse,
    PaperAttemptListItem,
    PaperAttemptListResponse,
    PaperAttemptReviewResponse,
    PaperGradeAnswerResponse,
    PaperGradeBatchItem,
    PaperGradeAnswersBatchResponse,
    PaperReviewItem,
    PaperSaveAnswersResponse,
    PaperSubmitAttemptResponse,
)

OBJECTIVE_TYPES = {"MCQ", "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "FILL_BLANK"}


@dataclass(slots=True)
class _AttemptSummary:
    score: float
    total_score: float
    objective_correct: int
    objective_total: int
    all_subjective_graded: bool


class PaperAttemptService:
    @staticmethod
    async def create_or_get_my_attempt(db: AsyncSession, paper_id: int, student_id: int) -> PaperAttemptCreateResponse:
        user = await PaperAttemptService._get_user(db, student_id)
        if user.account_type != AccountType.STUDENT:
            raise HTTPException(status_code=403, detail="student role required")

        paper = await db.get(Paper, paper_id)
        if paper is None:
            raise HTTPException(status_code=404, detail="paper not found")
        if paper.status != PaperStatus.PUBLISHED:
            raise HTTPException(status_code=400, detail="paper is not open for attempts")

        attempt = await db.scalar(
            select(PaperAttempt).where(PaperAttempt.paper_id == paper.id, PaperAttempt.student_id == student_id)
        )
        if attempt is None:
            attempt = PaperAttempt(
                paper_id=paper.id,
                student_id=student_id,
                status=PaperAttemptStatus.IN_PROGRESS,
                started_at=datetime.now(timezone.utc),
            )
            db.add(attempt)
            await db.commit()
            await db.refresh(attempt)

        return PaperAttemptCreateResponse(
            attempt_id=attempt.id,
            paper_id=attempt.paper_id,
            student_id=attempt.student_id,
            status=attempt.status.value,
            started_at=attempt.started_at,
        )

    @staticmethod
    async def save_answers(
        db: AsyncSession,
        attempt_id: int,
        student_id: int,
        answers: list[PaperAnswerWriteItem],
    ) -> PaperSaveAnswersResponse:
        attempt = await PaperAttemptService._get_attempt_for_student(db, attempt_id, student_id)
        if attempt.status != PaperAttemptStatus.IN_PROGRESS:
            raise HTTPException(status_code=400, detail="attempt cannot be modified after submit")

        valid_ids = await PaperAttemptService._paper_question_ids(db, attempt.paper_id)
        for answer in answers:
            if answer.question_id not in valid_ids:
                raise HTTPException(status_code=400, detail="question_id not in this paper")

        for answer in answers:
            row = await db.scalar(
                select(PaperAttemptAnswer).where(
                    PaperAttemptAnswer.attempt_id == attempt.id,
                    PaperAttemptAnswer.question_id == answer.question_id,
                )
            )
            if row is None:
                row = PaperAttemptAnswer(attempt_id=attempt.id, question_id=answer.question_id)
                db.add(row)
            row.selected_option = answer.selected_option
            row.text_answer = answer.text_answer

        await db.commit()
        return PaperSaveAnswersResponse(attempt_id=attempt.id, saved_count=len(answers), status=attempt.status.value)

    @staticmethod
    async def submit_attempt(db: AsyncSession, attempt_id: int, student_id: int) -> PaperSubmitAttemptResponse:
        attempt = await PaperAttemptService._get_attempt_for_student(db, attempt_id, student_id)
        if attempt.status != PaperAttemptStatus.IN_PROGRESS:
            raise HTTPException(status_code=400, detail="attempt already submitted")

        summary = await PaperAttemptService._recompute_and_score(db, attempt)

        attempt.status = PaperAttemptStatus.GRADED if summary.all_subjective_graded else PaperAttemptStatus.SUBMITTED
        attempt.submitted_at = datetime.now(timezone.utc)
        attempt.score = summary.score
        await db.commit()

        return PaperSubmitAttemptResponse(
            attempt_id=attempt.id,
            status=attempt.status.value,
            score=summary.score,
            total_score=summary.total_score,
            objective_correct=summary.objective_correct,
            objective_total=summary.objective_total,
        )

    @staticmethod
    async def get_review(db: AsyncSession, attempt_id: int, student_id: int) -> PaperAttemptReviewResponse:
        attempt = await PaperAttemptService._get_attempt_for_student(db, attempt_id, student_id)

        question_rows = await db.execute(
            select(PaperQuestion).where(PaperQuestion.paper_id == attempt.paper_id).order_by(PaperQuestion.order_num.asc())
        )
        questions = question_rows.scalars().all()

        answer_rows = await db.execute(
            select(PaperAttemptAnswer).where(PaperAttemptAnswer.attempt_id == attempt.id)
        )
        answers = {row.question_id: row for row in answer_rows.scalars().all()}

        total_score = 0.0
        items: list[PaperReviewItem] = []
        for q in questions:
            total_score += float(q.score)
            ans = answers.get(q.id)
            items.append(
                PaperReviewItem(
                    question_id=q.id,
                    type=q.question_type,
                    max_score=float(q.score),
                    selected_option=ans.selected_option if ans else None,
                    text_answer=ans.text_answer if ans else None,
                    is_correct=ans.is_correct if ans else None,
                    awarded_score=float(ans.awarded_score) if ans and ans.awarded_score is not None else None,
                    teacher_feedback=ans.teacher_feedback if ans else None,
                )
            )

        return PaperAttemptReviewResponse(
            attempt_id=attempt.id,
            paper_id=attempt.paper_id,
            student_id=attempt.student_id,
            status=attempt.status.value,
            score=float(attempt.score or 0),
            total_score=total_score,
            items=items,
        )

    @staticmethod
    async def list_attempts_for_teacher(
        db: AsyncSession,
        actor_id: int,
        paper_id: int,
        status: str | None,
        page: int,
        page_size: int,
    ) -> PaperAttemptListResponse:
        actor = await PaperAttemptService._require_teacher_or_admin(db, actor_id)
        paper, course = await PaperAttemptService._get_paper_and_course(db, paper_id)
        PaperAttemptService._assert_course_scope(actor, course)

        stmt = (
            select(PaperAttempt, User, Paper)
            .join(User, User.id == PaperAttempt.student_id)
            .join(Paper, Paper.id == PaperAttempt.paper_id)
            .where(PaperAttempt.paper_id == paper.id)
            .options(defer(Paper.source_pdf), defer(Paper.source_file_name))
        )
        count_stmt = select(func.count()).select_from(PaperAttempt).where(PaperAttempt.paper_id == paper.id)

        if status:
            mapped_status = PaperAttemptService._parse_attempt_status(status)
            stmt = stmt.where(PaperAttempt.status == mapped_status)
            count_stmt = count_stmt.where(PaperAttempt.status == mapped_status)

        total = int((await db.scalar(count_stmt)) or 0)
        rows = await db.execute(
            stmt.order_by(PaperAttempt.id.desc()).offset((page - 1) * page_size).limit(page_size)
        )

        items: list[PaperAttemptListItem] = []
        for attempt, student, row_paper in rows.all():
            summary = await PaperAttemptService._recompute_and_score(db, attempt)
            items.append(
                PaperAttemptListItem(
                    attempt_id=attempt.id,
                    paper_id=attempt.paper_id,
                    paper_title=row_paper.title,
                    student_id=student.id,
                    student_name=student.name,
                    status=attempt.status.value,
                    score=float(attempt.score) if attempt.score is not None else None,
                    total_score=summary.total_score,
                    objective_correct=summary.objective_correct,
                    objective_total=summary.objective_total,
                    started_at=attempt.started_at,
                    submitted_at=attempt.submitted_at,
                )
            )

        return PaperAttemptListResponse(items=items, page=page, page_size=page_size, total=total)

    @staticmethod
    async def grade_answer(
        db: AsyncSession,
        actor_id: int,
        attempt_id: int,
        question_id: int,
        awarded_score: float,
        teacher_feedback: str | None,
        is_correct: bool | None,
        *,
        auto_commit: bool = True,
    ) -> PaperGradeAnswerResponse:
        attempt = await PaperAttemptService._get_attempt_for_teacher_or_admin(db, attempt_id, actor_id)
        if attempt.status not in {PaperAttemptStatus.SUBMITTED, PaperAttemptStatus.GRADED}:
            raise HTTPException(status_code=400, detail="attempt must be submitted before grading")

        question = await db.scalar(
            select(PaperQuestion).where(PaperQuestion.id == question_id, PaperQuestion.paper_id == attempt.paper_id)
        )
        if question is None:
            raise HTTPException(status_code=400, detail="question_id not in this attempt")

        max_score = float(question.score)
        if awarded_score > max_score:
            raise HTTPException(status_code=400, detail=f"awarded_score exceeds max_score {max_score}")

        answer = await db.scalar(
            select(PaperAttemptAnswer).where(
                PaperAttemptAnswer.attempt_id == attempt.id,
                PaperAttemptAnswer.question_id == question.id,
            )
        )
        if answer is None:
            answer = PaperAttemptAnswer(attempt_id=attempt.id, question_id=question.id)
            db.add(answer)

        answer.awarded_score = awarded_score
        answer.teacher_feedback = teacher_feedback.strip() if teacher_feedback is not None else None
        if is_correct is not None:
            answer.is_correct = is_correct

        summary = await PaperAttemptService._recompute_and_score(db, attempt)
        attempt.score = summary.score
        attempt.status = PaperAttemptStatus.GRADED if summary.all_subjective_graded else PaperAttemptStatus.SUBMITTED
        if auto_commit:
            await db.commit()

        return PaperGradeAnswerResponse(
            attempt_id=attempt.id,
            question_id=question.id,
            awarded_score=float(answer.awarded_score or 0),
            max_score=max_score,
            attempt_status=attempt.status.value,
            total_score=float(attempt.score or 0),
        )

    @staticmethod
    async def grade_answers_batch(
        db: AsyncSession,
        actor_id: int,
        attempt_id: int,
        items: list[PaperGradeBatchItem],
    ) -> PaperGradeAnswersBatchResponse:
        attempt = await PaperAttemptService._get_attempt_for_teacher_or_admin(db, attempt_id, actor_id)
        if attempt.status not in {PaperAttemptStatus.SUBMITTED, PaperAttemptStatus.GRADED}:
            raise HTTPException(status_code=400, detail="attempt must be submitted before grading")

        try:
            graded_items: list[PaperGradeAnswerResponse] = []
            for item in items:
                graded = await PaperAttemptService.grade_answer(
                    db=db,
                    actor_id=actor_id,
                    attempt_id=attempt_id,
                    question_id=item.question_id,
                    awarded_score=item.awarded_score,
                    teacher_feedback=item.teacher_feedback,
                    is_correct=item.is_correct,
                    auto_commit=False,
                )
                graded_items.append(graded)

            await db.commit()
            return PaperGradeAnswersBatchResponse(
                attempt_id=attempt.id,
                attempt_status=attempt.status.value,
                total_score=float(attempt.score or 0),
                items=graded_items,
            )
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def _get_user(db: AsyncSession, user_id: int) -> User:
        user = await db.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="user not found")
        return user

    @staticmethod
    async def _require_teacher_or_admin(db: AsyncSession, actor_id: int) -> User:
        user = await PaperAttemptService._get_user(db, actor_id)
        if user.account_type not in {AccountType.TEACHER, AccountType.ADMIN}:
            raise HTTPException(status_code=403, detail="teacher/admin role required")
        return user

    @staticmethod
    async def _get_attempt_for_student(db: AsyncSession, attempt_id: int, student_id: int) -> PaperAttempt:
        attempt = await db.get(PaperAttempt, attempt_id)
        if attempt is None:
            raise HTTPException(status_code=404, detail="attempt not found")
        if attempt.student_id != student_id:
            raise HTTPException(status_code=403, detail="forbidden for this attempt")
        return attempt

    @staticmethod
    async def _get_attempt_for_teacher_or_admin(db: AsyncSession, attempt_id: int, actor_id: int) -> PaperAttempt:
        actor = await PaperAttemptService._require_teacher_or_admin(db, actor_id)
        row = await db.execute(
            select(PaperAttempt, Course)
            .join(Paper, Paper.id == PaperAttempt.paper_id)
            .join(Course, Course.id == Paper.course_id)
            .where(PaperAttempt.id == attempt_id)
        )
        resolved = row.first()
        if resolved is None:
            raise HTTPException(status_code=404, detail="attempt not found")

        attempt, course = resolved
        PaperAttemptService._assert_course_scope(actor, course)
        return attempt

    @staticmethod
    async def _get_paper_and_course(db: AsyncSession, paper_id: int) -> tuple[Paper, Course]:
        row = await db.execute(
            select(Paper, Course).join(Course, Course.id == Paper.course_id).where(Paper.id == paper_id)
        )
        resolved = row.first()
        if resolved is None:
            raise HTTPException(status_code=404, detail="paper not found")
        return resolved

    @staticmethod
    def _assert_course_scope(actor: User, course: Course) -> None:
        if actor.account_type == AccountType.TEACHER and course.teacher_id != actor.id:
            raise HTTPException(status_code=403, detail="forbidden for this course")

    @staticmethod
    async def _paper_question_ids(db: AsyncSession, paper_id: int) -> set[int]:
        rows = await db.execute(select(PaperQuestion.id).where(PaperQuestion.paper_id == paper_id))
        return {int(row[0]) for row in rows.all()}

    @staticmethod
    def _parse_attempt_status(status: str) -> PaperAttemptStatus:
        if status == "in_progress":
            return PaperAttemptStatus.IN_PROGRESS
        if status == "submitted":
            return PaperAttemptStatus.SUBMITTED
        if status == "graded":
            return PaperAttemptStatus.GRADED
        raise HTTPException(status_code=422, detail="invalid status")

    @staticmethod
    async def _recompute_and_score(db: AsyncSession, attempt: PaperAttempt) -> _AttemptSummary:
        question_rows = await db.execute(
            select(PaperQuestion)
            .where(PaperQuestion.paper_id == attempt.paper_id)
            .order_by(PaperQuestion.order_num.asc())
        )
        questions = question_rows.scalars().all()

        answer_rows = await db.execute(
            select(PaperAttemptAnswer).where(PaperAttemptAnswer.attempt_id == attempt.id)
        )
        answers = {row.question_id: row for row in answer_rows.scalars().all()}

        total_score = Decimal("0")
        achieved = Decimal("0")
        objective_correct = 0
        objective_total = 0
        all_subjective_graded = True

        for q in questions:
            max_score = Decimal(str(q.score))
            total_score += max_score
            ans = answers.get(q.id)

            if q.question_type in OBJECTIVE_TYPES:
                objective_total += 1
                if ans and ans.awarded_score is not None:
                    achieved += Decimal(str(ans.awarded_score))
                    if ans.is_correct is True:
                        objective_correct += 1
                elif ans and q.answer_text is not None:
                    selected = (ans.selected_option or ans.text_answer or "").strip()
                    correct = q.answer_text.strip()
                    is_correct = selected == correct
                    ans.is_correct = is_correct
                    ans.awarded_score = float(q.score) if is_correct else 0.0
                    achieved += Decimal(str(ans.awarded_score))
                    if is_correct:
                        objective_correct += 1
            else:
                if ans and ans.awarded_score is not None:
                    achieved += Decimal(str(ans.awarded_score))
                else:
                    all_subjective_graded = False

        return _AttemptSummary(
            score=float(achieved),
            total_score=float(total_score),
            objective_correct=objective_correct,
            objective_total=objective_total,
            all_subjective_graded=all_subjective_graded,
        )
