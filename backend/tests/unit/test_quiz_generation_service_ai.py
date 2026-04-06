from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import QuestionBankOption
from app.schemas.quiz_generation import QuizGenerateRequest
from app.services.quiz_generation_service import QuizGenerationService, _GeneratedQuestionContent


def _payload() -> QuizGenerateRequest:
    return QuizGenerateRequest(
        mode="textbook",
        course_id=1,
        grade="S3",
        subject="Biology",
        difficulty="medium",
        question_count=1,
        total_score=10,
        duration_min=20,
        textbook_id=1,
        chapter="Chapter 1",
    )


@pytest.mark.asyncio
async def test_build_question_content_prefers_llm(db_session, monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _payload()

    async def fake_llm(*_args, **_kwargs):
        return _GeneratedQuestionContent(
            prompt="LLM generated prompt",
            answer_text="B",
            explanation="From model",
            options=[
                ("A", "A1"),
                ("B", "B1"),
                ("C", "C1"),
                ("D", "D1"),
            ],
        )

    async def never_similar(*_args, **_kwargs):
        return False

    monkeypatch.setattr(QuizGenerationService, "_llm_enabled", staticmethod(lambda: True))
    monkeypatch.setattr(QuizGenerationService, "_llm_generate_question_content", staticmethod(fake_llm))
    monkeypatch.setattr(QuizGenerationService, "_is_similar_to_existing", staticmethod(never_similar))

    content = await QuizGenerationService._build_question_content(
        db=db_session,
        payload=payload,
        question_type="MCQ_SINGLE",
        index=1,
        seen_prompts=[],
    )

    assert content.prompt == "LLM generated prompt"
    assert content.answer_text == "B"
    assert content.options[1] == ("B", "B1")


@pytest.mark.asyncio
async def test_build_question_content_falls_back_on_llm_failure(db_session, monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _payload()

    async def failing_llm(*_args, **_kwargs):
        raise RuntimeError("llm unavailable")

    async def never_similar(*_args, **_kwargs):
        return False

    monkeypatch.setattr(QuizGenerationService, "_llm_enabled", staticmethod(lambda: True))
    monkeypatch.setattr(QuizGenerationService, "_llm_generate_question_content", staticmethod(failing_llm))
    monkeypatch.setattr(QuizGenerationService, "_is_similar_to_existing", staticmethod(never_similar))

    content = await QuizGenerationService._build_question_content(
        db=db_session,
        payload=payload,
        question_type="SHORT_ANSWER",
        index=1,
        seen_prompts=[],
    )

    assert "SHORT_ANSWER" in content.prompt
    assert content.answer_text == "TBD"
    assert content.explanation == "TBD"


@pytest.mark.asyncio
async def test_generate_and_store_bank_items_marks_correct_mcq_option(db_session, monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _payload()

    async def fake_content(*_args, **_kwargs):
        return _GeneratedQuestionContent(
            prompt="MCQ prompt",
            answer_text="B",
            explanation="LLM explanation",
            options=[
                ("A", "Option A"),
                ("B", "Option B"),
                ("C", "Option C"),
                ("D", "Option D"),
            ],
        )

    monkeypatch.setattr(QuizGenerationService, "_build_question_content", staticmethod(fake_content))

    created = await QuizGenerationService._generate_and_store_bank_items(
        db=db_session,
        payload=payload,
        actor_id=1,
        question_type="MCQ_SINGLE",
        count=1,
        seen_prompts=[],
    )

    assert len(created) == 1

    rows = await db_session.execute(
        select(QuestionBankOption.option_key, QuestionBankOption.is_correct).where(
            QuestionBankOption.bank_question_id == created[0].id
        )
    )
    correctness = {key: is_correct for key, is_correct in rows.all()}

    assert correctness == {"A": False, "B": True, "C": False, "D": False}
