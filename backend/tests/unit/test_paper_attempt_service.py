from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.assessment import (
    Paper,
    PaperAttempt,
    PaperAttemptAnswer,
    PaperQuestion,
    PaperSection,
    PaperStatus,
    QuestionBankItem,
)
from app.models.course import Course, CourseStatus
from app.models.user import AccountType, User
from app.schemas.paper_attempts import PaperAnswerWriteItem, PaperGradeBatchItem
from app.services.paper_attempt_service import PaperAttemptService


async def _seed(db_session):
    teacher = User(account_id="t_unit_pa", hashed_password="x", name="Teacher", account_type=AccountType.TEACHER)
    other_teacher = User(
        account_id="t_unit_pa_oth",
        hashed_password="x",
        name="OtherTeacher",
        account_type=AccountType.TEACHER,
    )
    student = User(account_id="s_unit_pa", hashed_password="x", name="Student", account_type=AccountType.STUDENT)
    db_session.add_all([teacher, other_teacher, student])
    await db_session.flush()

    course = Course(
        name="S6 Biology",
        subject="Biology",
        grades=["S6"],
        status=CourseStatus.ACTIVE,
        teacher_id=teacher.id,
    )
    other_course = Course(
        name="S6 Physics",
        subject="Physics",
        grades=["S6"],
        status=CourseStatus.ACTIVE,
        teacher_id=other_teacher.id,
    )
    db_session.add_all([course, other_course])
    await db_session.flush()

    bank_obj = QuestionBankItem(
        publisher="seed",
        grade="S6",
        subject="Biology",
        question_type="MCQ",
        prompt="Objective prompt",
        difficulty="easy",
        answer_text="A",
        explanation="seed",
        source_type="manual",
        created_by=teacher.id,
    )
    bank_subj = QuestionBankItem(
        publisher="seed",
        grade="S6",
        subject="Biology",
        question_type="SHORT_ANSWER",
        prompt="Subjective prompt",
        difficulty="medium",
        answer_text=None,
        explanation="seed",
        source_type="manual",
        created_by=teacher.id,
    )
    db_session.add_all([bank_obj, bank_subj])
    await db_session.flush()

    paper = Paper(
        title="S6 Unit Paper",
        course_id=course.id,
        grade="S6",
        subject="Biology",
        semester="2024-S2",
        exam_type="unit",
        total_score=20,
        duration_min=60,
        question_count=2,
        quality_score=90,
        status=PaperStatus.PUBLISHED,
        created_by=teacher.id,
        published_at=datetime.now(timezone.utc),
    )
    foreign_paper = Paper(
        title="Foreign Paper",
        course_id=other_course.id,
        grade="S6",
        subject="Physics",
        semester="2024-S2",
        exam_type="unit",
        total_score=10,
        duration_min=30,
        question_count=1,
        quality_score=70,
        status=PaperStatus.PUBLISHED,
        created_by=other_teacher.id,
        published_at=datetime.now(timezone.utc),
    )
    db_session.add_all([paper, foreign_paper])
    await db_session.flush()

    section = PaperSection(
        paper_id=paper.id,
        title="Section A",
        section_order=1,
        question_type="MIXED",
        question_count=2,
        score_each=10,
        total_score=20,
    )
    db_session.add(section)
    await db_session.flush()

    obj_q = PaperQuestion(
        paper_id=paper.id,
        section_id=section.id,
        order_num=1,
        question_type="MCQ",
        prompt="MCQ prompt",
        difficulty="easy",
        score=10,
        bank_question_id=bank_obj.id,
        answer_text="A",
    )
    subj_q = PaperQuestion(
        paper_id=paper.id,
        section_id=section.id,
        order_num=2,
        question_type="SHORT_ANSWER",
        prompt="Essay prompt",
        difficulty="medium",
        score=10,
        bank_question_id=bank_subj.id,
        answer_text=None,
    )
    db_session.add_all([obj_q, subj_q])
    await db_session.commit()

    return {
        "teacher_id": teacher.id,
        "other_teacher_id": other_teacher.id,
        "student_id": student.id,
        "paper_id": paper.id,
        "obj_qid": obj_q.id,
        "subj_qid": subj_q.id,
        "foreign_paper_id": foreign_paper.id,
    }


@pytest.mark.asyncio
async def test_submit_keeps_submitted_when_subjective_ungraded(db_session):
    seeded = await _seed(db_session)

    attempt = await PaperAttemptService.create_or_get_my_attempt(db_session, seeded["paper_id"], seeded["student_id"])
    await PaperAttemptService.save_answers(
        db_session,
        attempt.attempt_id,
        seeded["student_id"],
        [
            PaperAnswerWriteItem(question_id=seeded["obj_qid"], selected_option="A"),
            PaperAnswerWriteItem(question_id=seeded["subj_qid"], text_answer="essay"),
        ],
    )

    submitted = await PaperAttemptService.submit_attempt(db_session, attempt.attempt_id, seeded["student_id"])

    assert submitted.status == "submitted"
    assert submitted.objective_correct == 1
    assert submitted.objective_total == 1
    assert submitted.score == 10.0


@pytest.mark.asyncio
async def test_grade_answer_moves_attempt_to_graded(db_session):
    seeded = await _seed(db_session)

    attempt = await PaperAttemptService.create_or_get_my_attempt(db_session, seeded["paper_id"], seeded["student_id"])
    await PaperAttemptService.save_answers(
        db_session,
        attempt.attempt_id,
        seeded["student_id"],
        [
            PaperAnswerWriteItem(question_id=seeded["obj_qid"], selected_option="A"),
            PaperAnswerWriteItem(question_id=seeded["subj_qid"], text_answer="essay"),
        ],
    )
    await PaperAttemptService.submit_attempt(db_session, attempt.attempt_id, seeded["student_id"])

    graded = await PaperAttemptService.grade_answer(
        db=db_session,
        actor_id=seeded["teacher_id"],
        attempt_id=attempt.attempt_id,
        question_id=seeded["subj_qid"],
        awarded_score=8.5,
        teacher_feedback="good",
        is_correct=None,
    )

    assert graded.attempt_status == "graded"
    assert graded.total_score == 18.5


@pytest.mark.asyncio
async def test_teacher_cannot_access_foreign_course_attempts(db_session):
    seeded = await _seed(db_session)

    # make one attempt under first teacher's paper
    attempt = await PaperAttemptService.create_or_get_my_attempt(db_session, seeded["paper_id"], seeded["student_id"])

    with pytest.raises(HTTPException) as exc:
        await PaperAttemptService.list_attempts_for_teacher(
            db=db_session,
            actor_id=seeded["other_teacher_id"],
            paper_id=seeded["paper_id"],
            status=None,
            page=1,
            page_size=20,
        )

    assert attempt.attempt_id > 0
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_batch_grading_rolls_back_on_error(db_session):
    seeded = await _seed(db_session)

    attempt = await PaperAttemptService.create_or_get_my_attempt(db_session, seeded["paper_id"], seeded["student_id"])
    await PaperAttemptService.save_answers(
        db_session,
        attempt.attempt_id,
        seeded["student_id"],
        [PaperAnswerWriteItem(question_id=seeded["subj_qid"], text_answer="essay")],
    )
    await PaperAttemptService.submit_attempt(db_session, attempt.attempt_id, seeded["student_id"])

    with pytest.raises(HTTPException):
        await PaperAttemptService.grade_answers_batch(
            db=db_session,
            actor_id=seeded["teacher_id"],
            attempt_id=attempt.attempt_id,
            items=[
                PaperGradeBatchItem(question_id=seeded["subj_qid"], awarded_score=8.0, teacher_feedback="ok"),
                PaperGradeBatchItem(question_id=999999, awarded_score=1.0, teacher_feedback="bad"),
            ],
        )

    persisted = await db_session.scalar(
        select(PaperAttemptAnswer).where(
            PaperAttemptAnswer.attempt_id == attempt.attempt_id,
            PaperAttemptAnswer.question_id == seeded["subj_qid"],
        )
    )
    assert persisted is not None
    assert persisted.awarded_score is None

    fresh_attempt = await db_session.get(PaperAttempt, attempt.attempt_id)
    assert fresh_attempt is not None
    assert fresh_attempt.score in (None, 0)
