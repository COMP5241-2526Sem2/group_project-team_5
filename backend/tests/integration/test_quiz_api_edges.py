from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app
from app.models.assessment import AttemptStatus, Question, QuestionAttempt, QuestionBankItem, QuestionItem, QuestionStatus, QuizAudioRecord
from app.models.course import Course, CourseStatus, Enrollment
from app.models.user import AccountType, User


async def _seed_api_case(db_session):
    teacher = User(account_id="t_api", hashed_password="x", name="Teacher", account_type=AccountType.TEACHER)
    other_teacher = User(account_id="t_api_other", hashed_password="x", name="OtherTeacher", account_type=AccountType.TEACHER)
    student = User(account_id="s_api", hashed_password="x", name="Student", account_type=AccountType.STUDENT)
    db_session.add_all([teacher, other_teacher, student])
    await db_session.flush()

    course = Course(
        name="S3 Biology",
        subject="Biology",
        grades=["S3"],
        status=CourseStatus.ACTIVE,
        teacher_id=teacher.id,
    )
    db_session.add(course)
    await db_session.flush()

    db_session.add(Enrollment(student_id=student.id, course_id=course.id))

    sa_bank = QuestionBankItem(
        publisher="seed",
        grade="S3",
        subject="Biology",
        question_type="SHORT_ANSWER",
        prompt="Explain osmosis.",
        difficulty="medium",
        answer_text=None,
        explanation="seed",
        source_type="manual",
        created_by=teacher.id,
    )
    db_session.add(sa_bank)
    await db_session.flush()

    quiz = Question(
        title="Quiz API Edge",
        course_id=course.id,
        due_at=datetime.now(timezone.utc) + timedelta(days=1),
        duration_min=20,
        total_score=10,
        status=QuestionStatus.PUBLISHED,
        created_by=teacher.id,
    )
    db_session.add(quiz)
    await db_session.flush()

    q_item = QuestionItem(question_id=quiz.id, bank_question_id=sa_bank.id, order_num=1, score=10)
    db_session.add(q_item)
    await db_session.flush()

    attempt = QuestionAttempt(
        question_id=quiz.id,
        student_id=student.id,
        started_at=datetime.now(timezone.utc),
        status=AttemptStatus.IN_PROGRESS,
    )
    db_session.add(attempt)
    await db_session.flush()

    audio = QuizAudioRecord(
        attempt_id=attempt.id,
        question_id=q_item.id,
        student_id=student.id,
        file_name="seed.webm",
        content_type="audio/webm",
        audio_data=b"abc",
        size_bytes=3,
        retention_until=None,
    )
    db_session.add(audio)
    await db_session.commit()

    return {
        "teacher_id": teacher.id,
        "other_teacher_id": other_teacher.id,
        "student_id": student.id,
        "quiz_id": quiz.id,
        "attempt_id": attempt.id,
        "question_id": q_item.id,
        "audio_id": audio.id,
    }


@pytest.mark.asyncio
async def test_publish_quiz_by_student_returns_403(db_session):
    seeded = await _seed_api_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/quizzes/{seeded['quiz_id']}/publish",
                headers={"X-User-Id": str(seeded["student_id"])},
            )
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_batch_grade_empty_items_returns_422(db_session):
    seeded = await _seed_api_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.put(
                f"/api/v1/attempts/{seeded['attempt_id']}/answers/grade-batch",
                headers={"X-User-Id": str(seeded["teacher_id"]), "Content-Type": "application/json"},
                json={"items": []},
            )
        assert res.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_publish_quiz_by_teacher_not_owner_returns_403(db_session):
    seeded = await _seed_api_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/quizzes/{seeded['quiz_id']}/publish",
                headers={"X-User-Id": str(seeded["other_teacher_id"])},
            )
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_batch_grade_missing_question_id_returns_422(db_session):
    seeded = await _seed_api_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.put(
                f"/api/v1/attempts/{seeded['attempt_id']}/answers/grade-batch",
                headers={"X-User-Id": str(seeded["teacher_id"]), "Content-Type": "application/json"},
                json={"items": [{"awarded_score": 5}]},
            )
        assert res.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_batch_grade_missing_awarded_score_returns_422(db_session):
    seeded = await _seed_api_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.put(
                f"/api/v1/attempts/{seeded['attempt_id']}/answers/grade-batch",
                headers={"X-User-Id": str(seeded["teacher_id"]), "Content-Type": "application/json"},
                json={"items": [{"question_id": seeded["question_id"]}]},
            )
        assert res.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_audio_audit_empty_action_returns_422(db_session):
    seeded = await _seed_api_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/audio/{seeded['audio_id']}/audit",
                headers={"X-User-Id": str(seeded["teacher_id"]), "Content-Type": "application/json"},
                json={"action": ""},
            )
        assert res.status_code == 422
    finally:
        app.dependency_overrides.clear()
