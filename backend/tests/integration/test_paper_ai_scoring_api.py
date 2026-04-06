from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.assessment import Paper, PaperQuestion, PaperSection, PaperStatus, QuestionBankItem
from app.models.course import Course, CourseStatus, Enrollment
from app.models.user import AccountType, User
from app.services.paper_ai_scoring_service import PaperAIScoringService


async def _seed_ai_case(db_session):
    teacher = User(account_id="t_ai", hashed_password="x", name="Teacher", account_type=AccountType.TEACHER)
    other_teacher = User(account_id="t_ai_other", hashed_password="x", name="Other", account_type=AccountType.TEACHER)
    student = User(account_id="s_ai", hashed_password="x", name="Student", account_type=AccountType.STUDENT)
    db_session.add_all([teacher, other_teacher, student])
    await db_session.flush()

    course = Course(
        name="S4 Bio AI",
        subject="Biology",
        grades=["S4"],
        status=CourseStatus.ACTIVE,
        teacher_id=teacher.id,
    )
    other_course = Course(
        name="S4 Phy AI",
        subject="Physics",
        grades=["S4"],
        status=CourseStatus.ACTIVE,
        teacher_id=other_teacher.id,
    )
    db_session.add_all([course, other_course])
    await db_session.flush()

    db_session.add(Enrollment(student_id=student.id, course_id=course.id))

    bank_obj = QuestionBankItem(
        publisher="seed",
        grade="S4",
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
        grade="S4",
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
        title="AI Paper",
        course_id=course.id,
        grade="S4",
        subject="Biology",
        semester="2024-S2",
        exam_type="mock",
        total_score=20,
        duration_min=60,
        question_count=2,
        quality_score=80,
        status=PaperStatus.PUBLISHED,
        created_by=teacher.id,
        published_at=datetime.now(timezone.utc),
    )
    foreign_paper = Paper(
        title="AI Foreign Paper",
        course_id=other_course.id,
        grade="S4",
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
        "paper_id": paper.id,
        "subj_qid": subj_q.id,
    }


@pytest.mark.asyncio
async def test_ai_generate_list_and_adopt_single(db_session):
    seeded = await _seed_ai_case(db_session)

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
                headers={"X-User-Id": str(seeded['student_id']), "Content-Type": "application/json"},
                json={"answers": [{"question_id": seeded["subj_qid"], "text_answer": "some detailed answer"}]},
            )
            await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/submit",
                headers={"X-User-Id": str(seeded['student_id'])},
            )

            gen_res = await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/ai-score",
                headers={"X-User-Id": str(seeded['teacher_id'])},
            )
            list_res = await client.get(
                f"/api/v1/paper-attempts/{attempt_id}/ai-score",
                headers={"X-User-Id": str(seeded['teacher_id'])},
            )
            adopt_res = await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/ai-score/{seeded['subj_qid']}/adopt",
                headers={"X-User-Id": str(seeded['teacher_id']), "Content-Type": "application/json"},
                json={},
            )

        assert gen_res.status_code == 200
        assert len(gen_res.json()["items"]) == 1
        assert list_res.status_code == 200
        assert len(list_res.json()["items"]) == 1
        assert adopt_res.status_code == 200
        assert adopt_res.json()["question_id"] == seeded["subj_qid"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_ai_adopt_batch_with_override(db_session):
    seeded = await _seed_ai_case(db_session)

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
                headers={"X-User-Id": str(seeded['student_id']), "Content-Type": "application/json"},
                json={"answers": [{"question_id": seeded["subj_qid"], "text_answer": "answer"}]},
            )
            await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/submit",
                headers={"X-User-Id": str(seeded['student_id'])},
            )
            await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/ai-score",
                headers={"X-User-Id": str(seeded['teacher_id'])},
            )

            batch_res = await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/ai-score/adopt-batch",
                headers={"X-User-Id": str(seeded['teacher_id']), "Content-Type": "application/json"},
                json={
                    "items": [
                        {
                            "question_id": seeded["subj_qid"],
                            "override_score": 7.5,
                            "override_feedback": "override by teacher",
                        }
                    ]
                },
            )

        assert batch_res.status_code == 200
        assert batch_res.json()["items"][0]["adopted_score"] == 7.5
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_ai_scoring_permissions(db_session):
    seeded = await _seed_ai_case(db_session)

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

            student_call = await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/ai-score",
                headers={"X-User-Id": str(seeded['student_id'])},
            )
            other_teacher_call = await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/ai-score",
                headers={"X-User-Id": str(seeded['other_teacher_id'])},
            )

        assert student_call.status_code == 403
        assert other_teacher_call.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_ai_scoring_llm_failure_fallback(db_session, monkeypatch):
    seeded = await _seed_ai_case(db_session)

    async def _override_get_db():
        yield db_session

    async def _fake_llm_fail(question, answer_text, prompt_version):
        raise RuntimeError("mock llm failure")

    app.dependency_overrides[get_db] = _override_get_db
    old_provider = settings.ai_scoring_provider
    old_key = settings.ohmygpt_api_key
    old_client = PaperAIScoringService._client
    settings.ai_scoring_provider = "openai"
    settings.ohmygpt_api_key = "dummy"
    PaperAIScoringService._client = None
    monkeypatch.setattr(PaperAIScoringService, "_llm_suggest", staticmethod(_fake_llm_fail))

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            attempt_res = await client.get(
                f"/api/v1/papers/{seeded['paper_id']}/attempts/me",
                headers={"X-User-Id": str(seeded["student_id"])},
            )
            attempt_id = attempt_res.json()["attempt_id"]

            await client.put(
                f"/api/v1/paper-attempts/{attempt_id}/answers",
                headers={"X-User-Id": str(seeded['student_id']), "Content-Type": "application/json"},
                json={"answers": [{"question_id": seeded["subj_qid"], "text_answer": "answer for fallback"}]},
            )
            await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/submit",
                headers={"X-User-Id": str(seeded['student_id'])},
            )

            gen_res = await client.post(
                f"/api/v1/paper-attempts/{attempt_id}/ai-score",
                headers={"X-User-Id": str(seeded['teacher_id'])},
            )

        assert gen_res.status_code == 200
        assert len(gen_res.json()["items"]) == 1
        assert gen_res.json()["items"][0]["status"] == "fallback"
        assert gen_res.json()["items"][0]["model_name"] == "heuristic-v1"
        assert "mock llm failure" in (gen_res.json()["items"][0]["error_message"] or "")
    finally:
        settings.ai_scoring_provider = old_provider
        settings.ohmygpt_api_key = old_key
        PaperAIScoringService._client = old_client
        app.dependency_overrides.clear()
