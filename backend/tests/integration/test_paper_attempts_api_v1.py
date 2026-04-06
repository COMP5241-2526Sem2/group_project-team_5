from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.database import get_db
from app.main import app
from app.models.assessment import (
    Paper,
    PaperAttemptAnswer,
    PaperQuestion,
    PaperSection,
    PaperStatus,
    QuestionBankItem,
)
from app.models.course import Course, CourseStatus
from app.models.user import AccountType, User


async def _seed_case(db_session):
    teacher = User(account_id="t_pa", hashed_password="x", name="Teacher", account_type=AccountType.TEACHER)
    other_teacher = User(account_id="t_pa_oth", hashed_password="x", name="Other", account_type=AccountType.TEACHER)
    student = User(account_id="s_pa", hashed_password="x", name="Student", account_type=AccountType.STUDENT)
    admin = User(account_id="a_pa", hashed_password="x", name="Admin", account_type=AccountType.ADMIN)
    db_session.add_all([teacher, other_teacher, student, admin])
    await db_session.flush()

    course = Course(
        name="S5 Biology",
        subject="Biology",
        grades=["S5"],
        status=CourseStatus.ACTIVE,
        teacher_id=teacher.id,
    )
    other_course = Course(
        name="S5 Physics",
        subject="Physics",
        grades=["S5"],
        status=CourseStatus.ACTIVE,
        teacher_id=other_teacher.id,
    )
    db_session.add_all([course, other_course])
    await db_session.flush()

    bank_obj = QuestionBankItem(
        publisher="seed",
        grade="S5",
        subject="Biology",
        question_type="MCQ",
        prompt="Objective",
        difficulty="easy",
        answer_text="A",
        explanation="seed",
        source_type="manual",
        created_by=teacher.id,
    )
    bank_subj = QuestionBankItem(
        publisher="seed",
        grade="S5",
        subject="Biology",
        question_type="SHORT_ANSWER",
        prompt="Subjective",
        difficulty="medium",
        answer_text=None,
        explanation="seed",
        source_type="manual",
        created_by=teacher.id,
    )
    db_session.add_all([bank_obj, bank_subj])
    await db_session.flush()

    paper = Paper(
        title="S5 Mock Paper",
        course_id=course.id,
        grade="S5",
        subject="Biology",
        semester="2024-S2",
        exam_type="mock",
        total_score=20,
        duration_min=60,
        question_count=2,
        quality_score=85,
        status=PaperStatus.PUBLISHED,
        created_by=teacher.id,
        published_at=datetime.now(timezone.utc),
    )
    foreign_paper = Paper(
        title="Foreign Paper",
        course_id=other_course.id,
        grade="S5",
        subject="Physics",
        semester="2024-S2",
        exam_type="mock",
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
        prompt="Obj",
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
        prompt="Subj",
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
        "admin_id": admin.id,
        "paper_id": paper.id,
        "foreign_paper_id": foreign_paper.id,
        "obj_qid": obj_q.id,
        "subj_qid": subj_q.id,
    }


@pytest.mark.asyncio
async def test_student_attempt_flow_submit_and_review(db_session):
    seeded = await _seed_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            attempt_res = await client.get(
                f"/api/v1/papers/{seeded['paper_id']}/attempts/me",
                headers={"X-User-Id": str(seeded["student_id"])},
            )
            attempt_id = attempt_res.json()["attempt_id"]

            save_res = await client.put(
                f"/api/v1/paper-attempts/{attempt_id}/answers",
                headers={"X-User-Id": str(seeded["student_id"]), "Content-Type": "application/json"},
                json={
                    "answers": [
                        {"question_id": seeded["obj_qid"], "selected_option": "A"},
                        {"question_id": seeded["subj_qid"], "text_answer": "long answer"},
                    ]
                },
            )

            submit_res = await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/submit",
                headers={"X-User-Id": str(seeded["student_id"])},
            )
            review_res = await client.get(
                f"/api/v1/paper-attempts/{attempt_id}/review",
                headers={"X-User-Id": str(seeded["student_id"])},
            )

        assert attempt_res.status_code == 200
        assert save_res.status_code == 200
        assert submit_res.status_code == 200
        submit_body = submit_res.json()
        assert submit_body["status"] == "submitted"
        assert submit_body["objective_correct"] == 1
        assert submit_body["objective_total"] == 1
        assert submit_body["score"] == 10.0

        assert review_res.status_code == 200
        review_body = review_res.json()
        assert len(review_body["items"]) == 2
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_submit_then_save_answers_returns_400(db_session):
    seeded = await _seed_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            attempt_res = await client.get(
                f"/api/v1/papers/{seeded['paper_id']}/attempts/me",
                headers={"X-User-Id": str(seeded["student_id"])},
            )
            attempt_id = attempt_res.json()["attempt_id"]

            await client.put(
                f"/api/v1/paper-attempts/{attempt_id}/answers",
                headers={"X-User-Id": str(seeded["student_id"]), "Content-Type": "application/json"},
                json={"answers": [{"question_id": seeded["obj_qid"], "selected_option": "A"}]},
            )
            await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/submit",
                headers={"X-User-Id": str(seeded["student_id"])},
            )
            save_again = await client.put(
                f"/api/v1/paper-attempts/{attempt_id}/answers",
                headers={"X-User-Id": str(seeded["student_id"]), "Content-Type": "application/json"},
                json={"answers": [{"question_id": seeded["obj_qid"], "selected_option": "B"}]},
            )

        assert save_again.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_teacher_can_list_and_grade_attempt(db_session):
    seeded = await _seed_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            attempt_res = await client.get(
                f"/api/v1/papers/{seeded['paper_id']}/attempts/me",
                headers={"X-User-Id": str(seeded["student_id"])},
            )
            attempt_id = attempt_res.json()["attempt_id"]
            await client.put(
                f"/api/v1/paper-attempts/{attempt_id}/answers",
                headers={"X-User-Id": str(seeded["student_id"]), "Content-Type": "application/json"},
                json={"answers": [{"question_id": seeded["subj_qid"], "text_answer": "essay"}]},
            )
            await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/submit",
                headers={"X-User-Id": str(seeded["student_id"])},
            )

            list_res = await client.get(
                f"/api/v1/papers/{seeded['paper_id']}/attempts",
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )
            grade_res = await client.put(
                f"/api/v1/paper-attempts/{attempt_id}/answers/{seeded['subj_qid']}/grade",
                headers={"X-User-Id": str(seeded["teacher_id"]), "Content-Type": "application/json"},
                json={"awarded_score": 8.5, "teacher_feedback": "good"},
            )

        assert list_res.status_code == 200
        assert list_res.json()["total"] == 1
        assert grade_res.status_code == 200
        assert grade_res.json()["attempt_status"] == "graded"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_batch_grade_is_atomic(db_session):
    seeded = await _seed_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            attempt_res = await client.get(
                f"/api/v1/papers/{seeded['paper_id']}/attempts/me",
                headers={"X-User-Id": str(seeded["student_id"])},
            )
            attempt_id = attempt_res.json()["attempt_id"]
            await client.put(
                f"/api/v1/paper-attempts/{attempt_id}/answers",
                headers={"X-User-Id": str(seeded["student_id"]), "Content-Type": "application/json"},
                json={"answers": [{"question_id": seeded["subj_qid"], "text_answer": "essay"}]},
            )
            await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/submit",
                headers={"X-User-Id": str(seeded["student_id"])},
            )

            batch_res = await client.put(
                f"/api/v1/paper-attempts/{attempt_id}/answers/grade-batch",
                headers={"X-User-Id": str(seeded["teacher_id"]), "Content-Type": "application/json"},
                json={
                    "items": [
                        {"question_id": seeded["subj_qid"], "awarded_score": 8.5, "teacher_feedback": "ok"},
                        {"question_id": 999999, "awarded_score": 1.0, "teacher_feedback": "bad"},
                    ]
                },
            )

        assert batch_res.status_code == 400

        persisted = await db_session.scalar(
            select(PaperAttemptAnswer).where(
                PaperAttemptAnswer.attempt_id == attempt_id,
                PaperAttemptAnswer.question_id == seeded["subj_qid"],
            )
        )
        assert persisted is not None
        assert persisted.awarded_score is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_attempt_permissions_enforced(db_session):
    seeded = await _seed_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            student_list = await client.get(
                f"/api/v1/papers/{seeded['paper_id']}/attempts",
                headers={"X-User-Id": str(seeded["student_id"])},
            )
            foreign_teacher_list = await client.get(
                f"/api/v1/papers/{seeded['paper_id']}/attempts",
                headers={"X-User-Id": str(seeded["other_teacher_id"])},
            )

        assert student_list.status_code == 403
        assert foreign_teacher_list.status_code == 403
    finally:
        app.dependency_overrides.clear()
