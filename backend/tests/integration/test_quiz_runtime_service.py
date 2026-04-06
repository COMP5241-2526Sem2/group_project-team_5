from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.models.assessment import Question, QuestionBankItem, QuestionBankOption, QuestionItem, QuestionStatus
from app.models.course import Course, CourseStatus, Enrollment
from app.models.user import AccountType, User
from app.schemas.quiz_runtime import AnswerWriteItem
from app.services.quiz_runtime_service import QuizRuntimeService


async def _seed_quiz_graph(db_session):
    teacher = User(
        account_id="t_1",
        hashed_password="x",
        name="Teacher",
        account_type=AccountType.TEACHER,
    )
    student = User(
        account_id="s_1",
        hashed_password="x",
        name="Student",
        account_type=AccountType.STUDENT,
    )
    db_session.add_all([teacher, student])
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

    enrollment = Enrollment(student_id=student.id, course_id=course.id)
    db_session.add(enrollment)

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
        source_id=None,
        created_by=teacher.id,
    )
    tf_bank = QuestionBankItem(
        publisher="seed",
        grade="S3",
        subject="Biology",
        question_type="TRUE_FALSE",
        prompt="Cell has membrane.",
        difficulty="easy",
        answer_text="T",
        explanation="seed",
        source_type="manual",
        source_id=None,
        created_by=teacher.id,
    )
    fb_bank = QuestionBankItem(
        publisher="seed",
        grade="S3",
        subject="Biology",
        question_type="FILL_BLANK",
        prompt="Water movement is ____.",
        difficulty="easy",
        answer_text="osmosis",
        explanation="seed",
        source_type="manual",
        source_id=None,
        created_by=teacher.id,
    )
    db_session.add_all([mcq_bank, tf_bank, fb_bank])
    await db_session.flush()

    db_session.add_all(
        [
            QuestionBankOption(bank_question_id=mcq_bank.id, option_key="A", option_text="A", is_correct=True),
            QuestionBankOption(bank_question_id=mcq_bank.id, option_key="B", option_text="B", is_correct=False),
            QuestionBankOption(bank_question_id=tf_bank.id, option_key="T", option_text="True", is_correct=True),
            QuestionBankOption(bank_question_id=tf_bank.id, option_key="F", option_text="False", is_correct=False),
        ]
    )

    quiz = Question(
        title="Quiz Seed",
        course_id=course.id,
        due_at=datetime.now(timezone.utc),
        duration_min=20,
        total_score=4,
        status=QuestionStatus.DRAFT,
        created_by=teacher.id,
    )
    db_session.add(quiz)
    await db_session.flush()

    item1 = QuestionItem(question_id=quiz.id, bank_question_id=mcq_bank.id, order_num=1, score=2)
    item2 = QuestionItem(question_id=quiz.id, bank_question_id=tf_bank.id, order_num=2, score=1)
    item3 = QuestionItem(question_id=quiz.id, bank_question_id=fb_bank.id, order_num=3, score=1)
    db_session.add_all([item1, item2, item3])

    await db_session.commit()

    return {
        "student_id": student.id,
        "quiz_id": quiz.id,
        "question_item_ids": [item1.id, item2.id, item3.id],
    }


@pytest.mark.asyncio
async def test_submit_attempt_scores_objective_types(db_session) -> None:
    seeded = await _seed_quiz_graph(db_session)

    created = await QuizRuntimeService.create_or_get_attempt(
        db=db_session,
        quiz_id=seeded["quiz_id"],
        student_id=seeded["student_id"],
    )

    await QuizRuntimeService.save_answers(
        db=db_session,
        attempt_id=created.attempt_id,
        student_id=seeded["student_id"],
        answer_items=[
            AnswerWriteItem(question_id=seeded["question_item_ids"][0], selected_option="A"),
            AnswerWriteItem(question_id=seeded["question_item_ids"][1], selected_option="T"),
            AnswerWriteItem(question_id=seeded["question_item_ids"][2], text_answer="osmosis"),
        ],
    )

    submitted = await QuizRuntimeService.submit_attempt(
        db=db_session,
        attempt_id=created.attempt_id,
        student_id=seeded["student_id"],
    )

    review = await QuizRuntimeService.get_review(
        db=db_session,
        attempt_id=created.attempt_id,
        student_id=seeded["student_id"],
    )

    assert submitted.score == 4.0
    assert submitted.total_score == 4
    assert submitted.mcq_correct == 1
    assert submitted.mcq_total == 1

    assert len(review.items) == 3
    assert all(item.is_correct is True for item in review.items)


@pytest.mark.asyncio
async def test_save_answers_rejects_question_outside_quiz(db_session) -> None:
    seeded = await _seed_quiz_graph(db_session)

    created = await QuizRuntimeService.create_or_get_attempt(
        db=db_session,
        quiz_id=seeded["quiz_id"],
        student_id=seeded["student_id"],
    )

    with pytest.raises(HTTPException) as exc:
        await QuizRuntimeService.save_answers(
            db=db_session,
            attempt_id=created.attempt_id,
            student_id=seeded["student_id"],
            answer_items=[
                AnswerWriteItem(question_id=999999, selected_option="A"),
            ],
        )

    assert exc.value.status_code == 400
