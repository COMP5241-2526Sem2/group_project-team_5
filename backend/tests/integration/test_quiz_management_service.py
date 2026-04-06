from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.models.assessment import (
    Question,
    QuestionAttemptAnswer,
    QuestionBankItem,
    QuestionBankOption,
    QuestionItem,
    QuestionStatus,
    QuizAudioPlaybackAudit,
)
from app.models.course import Course, CourseStatus, Enrollment
from app.models.user import AccountType, User
from app.schemas.quiz_runtime import AnswerWriteItem, AudioAuditRequest, GradeAnswerBatchItem, GradeAnswerRequest
from app.services.quiz_runtime_service import QuizRuntimeService


async def _seed_teacher_student_quiz(db_session):
    teacher = User(account_id="t_mgr", hashed_password="x", name="Teacher", account_type=AccountType.TEACHER)
    student = User(account_id="s_mgr", hashed_password="x", name="Student", account_type=AccountType.STUDENT)
    admin = User(account_id="a_mgr", hashed_password="x", name="Admin", account_type=AccountType.ADMIN)
    db_session.add_all([teacher, student, admin])
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

    mcq_bank = QuestionBankItem(
        publisher="seed",
        grade="S3",
        subject="Biology",
        question_type="MCQ_SINGLE",
        prompt="Which is correct?",
        difficulty="easy",
        answer_text="A",
        explanation="seed",
        source_type="manual",
        created_by=teacher.id,
    )
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
    db_session.add_all([mcq_bank, sa_bank])
    await db_session.flush()

    db_session.add(QuestionBankOption(bank_question_id=mcq_bank.id, option_key="A", option_text="A", is_correct=True))

    quiz = Question(
        title="Quiz Mgmt Seed",
        course_id=course.id,
        due_at=datetime.now(timezone.utc) + timedelta(days=1),
        duration_min=20,
        total_score=10,
        status=QuestionStatus.DRAFT,
        created_by=teacher.id,
    )
    db_session.add(quiz)
    await db_session.flush()

    item1 = QuestionItem(question_id=quiz.id, bank_question_id=mcq_bank.id, order_num=1, score=5)
    item2 = QuestionItem(question_id=quiz.id, bank_question_id=sa_bank.id, order_num=2, score=5)
    db_session.add_all([item1, item2])
    await db_session.commit()

    return {
        "teacher_id": teacher.id,
        "student_id": student.id,
        "admin_id": admin.id,
        "quiz_id": quiz.id,
        "mcq_qid": item1.id,
        "sa_qid": item2.id,
    }


@pytest.mark.asyncio
async def test_quiz_lifecycle_controls_student_todo_visibility(db_session) -> None:
    seeded = await _seed_teacher_student_quiz(db_session)

    todo_before = await QuizRuntimeService.list_todo(db_session, seeded["student_id"])
    assert todo_before == []

    published = await QuizRuntimeService.publish_quiz(db_session, seeded["quiz_id"], seeded["teacher_id"])
    assert published.status == "published"

    todo_after_publish = await QuizRuntimeService.list_todo(db_session, seeded["student_id"])
    assert [item.quiz_id for item in todo_after_publish] == [seeded["quiz_id"]]

    closed = await QuizRuntimeService.close_quiz(db_session, seeded["quiz_id"], seeded["teacher_id"])
    assert closed.status == "closed"
    assert await QuizRuntimeService.list_todo(db_session, seeded["student_id"]) == []

    reopened = await QuizRuntimeService.reopen_quiz(db_session, seeded["quiz_id"], seeded["teacher_id"])
    assert reopened.status == "published"


@pytest.mark.asyncio
async def test_grade_answer_marks_attempt_graded_when_subjective_scored(db_session) -> None:
    seeded = await _seed_teacher_student_quiz(db_session)
    await QuizRuntimeService.publish_quiz(db_session, seeded["quiz_id"], seeded["teacher_id"])

    attempt = await QuizRuntimeService.create_or_get_attempt(db_session, seeded["quiz_id"], seeded["student_id"])
    await QuizRuntimeService.save_answers(
        db_session,
        attempt.attempt_id,
        seeded["student_id"],
        [
            AnswerWriteItem(question_id=seeded["mcq_qid"], selected_option="A"),
            AnswerWriteItem(question_id=seeded["sa_qid"], text_answer="osmosis is water movement"),
        ],
    )
    await QuizRuntimeService.submit_attempt(db_session, attempt.attempt_id, seeded["student_id"])

    graded = await QuizRuntimeService.grade_answer(
        db=db_session,
        attempt_id=attempt.attempt_id,
        question_id=seeded["sa_qid"],
        actor_id=seeded["teacher_id"],
        payload=GradeAnswerRequest(awarded_score=5, teacher_feedback="good"),
    )

    assert graded.attempt_status == "graded"
    assert graded.total_score == 10.0


@pytest.mark.asyncio
async def test_audio_upload_stream_and_manual_audit(db_session) -> None:
    seeded = await _seed_teacher_student_quiz(db_session)
    await QuizRuntimeService.publish_quiz(db_session, seeded["quiz_id"], seeded["teacher_id"])

    attempt = await QuizRuntimeService.create_or_get_attempt(db_session, seeded["quiz_id"], seeded["student_id"])

    uploaded = await QuizRuntimeService.upload_audio(
        db=db_session,
        actor_id=seeded["student_id"],
        attempt_id=attempt.attempt_id,
        question_id=seeded["sa_qid"],
        file_name="sa.webm",
        content_type="audio/webm",
        audio_data=b"abc123",
        retention_until=None,
    )

    audio = await QuizRuntimeService.get_audio_stream(db_session, seeded["teacher_id"], uploaded.audio_id)
    assert audio.content_type == "audio/webm"
    assert audio.audio_data == b"abc123"

    manual = await QuizRuntimeService.create_audio_audit(
        db=db_session,
        actor_id=seeded["teacher_id"],
        audio_id=uploaded.audio_id,
        payload=AudioAuditRequest(action="manual_review", ip="127.0.0.1"),
    )
    assert manual.action == "manual_review"

    audits = await db_session.execute(
        QuizAudioPlaybackAudit.__table__.select().where(QuizAudioPlaybackAudit.audio_id == uploaded.audio_id)
    )
    assert len(audits.all()) == 2


@pytest.mark.asyncio
async def test_publish_forbidden_for_student_role(db_session) -> None:
    seeded = await _seed_teacher_student_quiz(db_session)

    with pytest.raises(HTTPException) as exc:
        await QuizRuntimeService.publish_quiz(db_session, seeded["quiz_id"], seeded["student_id"])
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_batch_grade_answers_marks_attempt_graded(db_session) -> None:
    seeded = await _seed_teacher_student_quiz(db_session)
    await QuizRuntimeService.publish_quiz(db_session, seeded["quiz_id"], seeded["teacher_id"])

    attempt = await QuizRuntimeService.create_or_get_attempt(db_session, seeded["quiz_id"], seeded["student_id"])
    await QuizRuntimeService.save_answers(
        db_session,
        attempt.attempt_id,
        seeded["student_id"],
        [
            AnswerWriteItem(question_id=seeded["mcq_qid"], selected_option="A"),
            AnswerWriteItem(question_id=seeded["sa_qid"], text_answer="osmosis is water movement"),
        ],
    )
    await QuizRuntimeService.submit_attempt(db_session, attempt.attempt_id, seeded["student_id"])

    result = await QuizRuntimeService.grade_answers_batch(
        db=db_session,
        attempt_id=attempt.attempt_id,
        actor_id=seeded["teacher_id"],
        items=[GradeAnswerBatchItem(question_id=seeded["sa_qid"], awarded_score=5, teacher_feedback="clear")],
    )

    assert result.attempt_status == "graded"
    assert len(result.items) == 1
    assert result.total_score == 10.0


@pytest.mark.asyncio
async def test_audio_upload_rejects_oversized_payload(db_session) -> None:
    seeded = await _seed_teacher_student_quiz(db_session)
    await QuizRuntimeService.publish_quiz(db_session, seeded["quiz_id"], seeded["teacher_id"])
    attempt = await QuizRuntimeService.create_or_get_attempt(db_session, seeded["quiz_id"], seeded["student_id"])

    with pytest.raises(HTTPException) as exc:
        await QuizRuntimeService.upload_audio(
            db=db_session,
            actor_id=seeded["student_id"],
            attempt_id=attempt.attempt_id,
            question_id=seeded["sa_qid"],
            file_name="too-large.bin",
            content_type="application/octet-stream",
            audio_data=b"x" * (QuizRuntimeService.MAX_AUDIO_BYTES + 1),
            retention_until=None,
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_review_returns_audio_summaries_per_question(db_session) -> None:
    seeded = await _seed_teacher_student_quiz(db_session)
    await QuizRuntimeService.publish_quiz(db_session, seeded["quiz_id"], seeded["teacher_id"])
    attempt = await QuizRuntimeService.create_or_get_attempt(db_session, seeded["quiz_id"], seeded["student_id"])

    await QuizRuntimeService.upload_audio(
        db=db_session,
        actor_id=seeded["student_id"],
        attempt_id=attempt.attempt_id,
        question_id=seeded["sa_qid"],
        file_name="sa.webm",
        content_type="audio/webm",
        audio_data=b"audio-data",
        retention_until=None,
    )

    review = await QuizRuntimeService.get_review(db_session, attempt.attempt_id, seeded["student_id"])
    sa_item = [item for item in review.items if item.question_id == seeded["sa_qid"]][0]

    assert len(sa_item.audio_records) == 1
    assert sa_item.audio_records[0].content_type == "audio/webm"


@pytest.mark.asyncio
async def test_batch_grading_is_atomic_all_success_or_rollback(db_session) -> None:
    seeded = await _seed_teacher_student_quiz(db_session)
    await QuizRuntimeService.publish_quiz(db_session, seeded["quiz_id"], seeded["teacher_id"])

    attempt = await QuizRuntimeService.create_or_get_attempt(db_session, seeded["quiz_id"], seeded["student_id"])
    await QuizRuntimeService.save_answers(
        db_session,
        attempt.attempt_id,
        seeded["student_id"],
        [
            AnswerWriteItem(question_id=seeded["mcq_qid"], selected_option="A"),
            AnswerWriteItem(question_id=seeded["sa_qid"], text_answer="osmosis is water movement"),
        ],
    )
    await QuizRuntimeService.submit_attempt(db_session, attempt.attempt_id, seeded["student_id"])

    with pytest.raises(HTTPException):
        await QuizRuntimeService.grade_answers_batch(
            db=db_session,
            attempt_id=attempt.attempt_id,
            actor_id=seeded["teacher_id"],
            items=[
                GradeAnswerBatchItem(question_id=seeded["sa_qid"], awarded_score=5, teacher_feedback="ok"),
                GradeAnswerBatchItem(question_id=999999, awarded_score=1, teacher_feedback="bad"),
            ],
        )

    persisted = await db_session.execute(
        QuestionAttemptAnswer.__table__.select().where(
            QuestionAttemptAnswer.attempt_id == attempt.attempt_id,
            QuestionAttemptAnswer.question_id == seeded["sa_qid"],
        )
    )
    row = persisted.first()
    # rollback: no grading feedback written for the valid item
    assert row is not None
    assert row.awarded_score is None
