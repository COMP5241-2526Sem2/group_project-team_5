from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app
from app.models.assessment import Paper, PaperQuestion, PaperQuestionOption, PaperSection, PaperStatus, QuestionBankItem
from app.models.course import Course, CourseStatus
from app.models.user import AccountType, User


async def _seed_paper_case(db_session):
    teacher = User(account_id="t_paper", hashed_password="x", name="Teacher", account_type=AccountType.TEACHER)
    other_teacher = User(account_id="t_paper_other", hashed_password="x", name="OtherTeacher", account_type=AccountType.TEACHER)
    admin = User(account_id="a_paper", hashed_password="x", name="Admin", account_type=AccountType.ADMIN)
    student = User(account_id="s_paper", hashed_password="x", name="Student", account_type=AccountType.STUDENT)
    db_session.add_all([teacher, other_teacher, admin, student])
    await db_session.flush()

    course = Course(
        name="S4 Biology",
        subject="Biology",
        grades=["S4"],
        status=CourseStatus.ACTIVE,
        teacher_id=teacher.id,
    )
    other_course = Course(
        name="S4 Physics",
        subject="Physics",
        grades=["S4"],
        status=CourseStatus.ACTIVE,
        teacher_id=other_teacher.id,
    )
    db_session.add_all([course, other_course])
    await db_session.flush()

    bank_question = QuestionBankItem(
        publisher="seed",
        grade="S4",
        subject="Biology",
        question_type="MCQ",
        prompt="What is osmosis?",
        difficulty="easy",
        answer_text="A",
        explanation="seed",
        source_type="manual",
        created_by=teacher.id,
    )
    db_session.add(bank_question)
    await db_session.flush()

    paper = Paper(
        title="S4 Midterm Biology Paper",
        course_id=course.id,
        grade="S4",
        subject="Biology",
        semester="2024-S2",
        exam_type="midterm",
        total_score=100,
        duration_min=90,
        question_count=2,
        quality_score=88,
        status=PaperStatus.PUBLISHED,
        created_by=teacher.id,
        published_at=datetime.now(timezone.utc),
    )
    closed_paper = Paper(
        title="S4 Biology Archived Paper",
        course_id=course.id,
        grade="S4",
        subject="Biology",
        semester="2023-S2",
        exam_type="final",
        total_score=100,
        duration_min=90,
        question_count=1,
        quality_score=80,
        status=PaperStatus.ARCHIVED,
        created_by=teacher.id,
    )
    foreign_paper = Paper(
        title="Other Teacher Paper",
        course_id=other_course.id,
        grade="S4",
        subject="Physics",
        semester="2024-S2",
        exam_type="midterm",
        total_score=80,
        duration_min=75,
        question_count=1,
        quality_score=77,
        status=PaperStatus.DRAFT,
        created_by=other_teacher.id,
    )
    db_session.add_all([paper, closed_paper, foreign_paper])
    await db_session.flush()

    section = PaperSection(
        paper_id=paper.id,
        title="Section A",
        section_order=1,
        question_type="MCQ",
        question_count=1,
        score_each=5,
        total_score=5,
    )
    db_session.add(section)
    await db_session.flush()

    question = PaperQuestion(
        paper_id=paper.id,
        section_id=section.id,
        order_num=1,
        question_type="MCQ",
        prompt="Choose the correct statement.",
        difficulty="easy",
        score=5,
        bank_question_id=bank_question.id,
        answer_text="A",
        explanation="seed",
    )
    db_session.add(question)
    await db_session.flush()

    options = [
        PaperQuestionOption(question_id=question.id, option_key="A", option_text="Correct"),
        PaperQuestionOption(question_id=question.id, option_key="B", option_text="Wrong"),
    ]
    db_session.add_all(options)
    await db_session.commit()

    return {
        "teacher_id": teacher.id,
        "other_teacher_id": other_teacher.id,
        "admin_id": admin.id,
        "student_id": student.id,
        "course_id": course.id,
        "paper_id": paper.id,
        "closed_paper_id": closed_paper.id,
        "foreign_paper_id": foreign_paper.id,
    }


@pytest.mark.asyncio
async def test_list_papers_teacher_scope(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/papers", headers={"X-User-Id": str(seeded["teacher_id"])})

        assert res.status_code == 200
        body = res.json()
        ids = {item["paper_id"] for item in body["items"]}
        assert seeded["paper_id"] in ids
        assert seeded["closed_paper_id"] in ids
        assert seeded["foreign_paper_id"] not in ids
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_papers_closed_filter_maps_archived(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(
                "/api/v1/papers",
                params={"status": "closed"},
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )

        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 1
        assert body["items"][0]["paper_id"] == seeded["closed_paper_id"]
        assert body["items"][0]["status"] == "closed"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_paper_detail_success(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(
                f"/api/v1/papers/{seeded['paper_id']}",
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )

        assert res.status_code == 200
        body = res.json()
        assert body["paper_id"] == seeded["paper_id"]
        assert len(body["sections"]) == 1
        assert len(body["sections"][0]["questions"]) == 1
        assert len(body["sections"][0]["questions"][0]["options"]) == 2
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_paper_detail_forbidden_for_other_teacher(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(
                f"/api/v1/papers/{seeded['paper_id']}",
                headers={"X-User-Id": str(seeded["other_teacher_id"])},
            )

        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_paper_detail_not_found(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/papers/999999", headers={"X-User-Id": str(seeded["admin_id"])})

        assert res.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_papers_student_forbidden(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/papers", headers={"X-User-Id": str(seeded["student_id"])})

        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_papers_invalid_status_returns_422(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(
                "/api/v1/papers",
                params={"status": "archived"},
                headers={"X-User-Id": str(seeded["admin_id"])},
            )

        assert res.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_papers_admin_can_view_cross_course_papers(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/papers", headers={"X-User-Id": str(seeded["admin_id"])})

        assert res.status_code == 200
        body = res.json()
        ids = {item["paper_id"] for item in body["items"]}
        assert seeded["paper_id"] in ids
        assert seeded["closed_paper_id"] in ids
        assert seeded["foreign_paper_id"] in ids
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_papers_combined_filters_and_query(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(
                "/api/v1/papers",
                params={
                    "status": "published",
                    "subject": "Biology",
                    "grade": "S4",
                    "semester": "2024-S2",
                    "exam_type": "midterm",
                    "q": "Midterm",
                },
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )

        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 1
        assert body["items"][0]["paper_id"] == seeded["paper_id"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_papers_pagination_returns_expected_slice(db_session):
    seeded = await _seed_paper_case(db_session)

    for i in range(3):
        db_session.add(
            Paper(
                title=f"Teacher Extra Paper {i}",
                course_id=seeded["course_id"],
                grade="S4",
                subject="Biology",
                semester="2024-S2",
                exam_type="unit",
                total_score=50,
                duration_min=45,
                question_count=0,
                quality_score=None,
                status=PaperStatus.DRAFT,
                created_by=seeded["teacher_id"],
            )
        )
    await db_session.commit()

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            page1 = await client.get(
                "/api/v1/papers",
                params={"page": 1, "page_size": 2},
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )
            page2 = await client.get(
                "/api/v1/papers",
                params={"page": 2, "page_size": 2},
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )

        assert page1.status_code == 200
        assert page2.status_code == 200
        body1 = page1.json()
        body2 = page2.json()
        assert body1["total"] == 5
        assert body2["total"] == 5
        assert len(body1["items"]) == 2
        assert len(body2["items"]) == 2
        page1_ids = {item["paper_id"] for item in body1["items"]}
        page2_ids = {item["paper_id"] for item in body2["items"]}
        assert page1_ids.isdisjoint(page2_ids)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_papers_invalid_pagination_returns_422(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res_page = await client.get(
                "/api/v1/papers",
                params={"page": 0},
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )
            res_page_size = await client.get(
                "/api/v1/papers",
                params={"page_size": 101},
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )

        assert res_page.status_code == 422
        assert res_page_size.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_paper_lifecycle_publish_close_reopen_success(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            close_res = await client.post(
                f"/api/v1/papers/{seeded['paper_id']}/close",
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )
            publish_res = await client.post(
                f"/api/v1/papers/{seeded['paper_id']}/publish",
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )
            close_again_res = await client.post(
                f"/api/v1/papers/{seeded['paper_id']}/close",
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )
            reopen_res = await client.post(
                f"/api/v1/papers/{seeded['paper_id']}/reopen",
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )

        assert close_res.status_code == 200
        assert close_res.json()["status"] == "closed"
        assert publish_res.status_code == 200
        assert publish_res.json()["status"] == "published"
        assert close_again_res.status_code == 200
        assert close_again_res.json()["status"] == "closed"
        assert reopen_res.status_code == 200
        assert reopen_res.json()["status"] == "published"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_publish_paper_without_questions_returns_400(db_session):
    seeded = await _seed_paper_case(db_session)

    draft_no_question = Paper(
        title="Empty Draft Paper",
        course_id=seeded["course_id"],
        grade="S4",
        subject="Biology",
        semester="2024-S2",
        exam_type="unit",
        total_score=0,
        duration_min=30,
        question_count=0,
        quality_score=None,
        status=PaperStatus.DRAFT,
        created_by=seeded["teacher_id"],
    )
    db_session.add(draft_no_question)
    await db_session.commit()
    await db_session.refresh(draft_no_question)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/papers/{draft_no_question.id}/publish",
                headers={"X-User-Id": str(seeded["teacher_id"])},
            )

        assert res.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_lifecycle_forbidden_for_student(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/papers/{seeded['paper_id']}/close",
                headers={"X-User-Id": str(seeded["student_id"])},
            )

        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_lifecycle_forbidden_for_non_owner_teacher(db_session):
    seeded = await _seed_paper_case(db_session)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/papers/{seeded['paper_id']}/close",
                headers={"X-User-Id": str(seeded["other_teacher_id"])},
            )

        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()
