from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.quiz_generation import QuizGenerateRequest
from app.services.quiz_generation_service import QuizGenerationService


def test_type_targets_sum_must_match_question_count() -> None:
    with pytest.raises(ValidationError):
        QuizGenerateRequest(
            mode="textbook",
            course_id=1,
            grade="S3",
            subject="Biology",
            difficulty="medium",
            question_count=6,
            textbook_id=1,
            type_targets={"MCQ_SINGLE": 3, "SHORT_ANSWER": 1},
        )


def test_type_targets_non_negative() -> None:
    with pytest.raises(ValidationError):
        QuizGenerateRequest(
            mode="textbook",
            course_id=1,
            grade="S3",
            subject="Biology",
            difficulty="medium",
            question_count=6,
            textbook_id=1,
            type_targets={"MCQ_SINGLE": -1, "SHORT_ANSWER": 7},
        )


def test_default_type_targets_cover_total_count() -> None:
    targets = QuizGenerationService._default_type_targets(10)

    assert sum(targets.values()) == 10
    assert targets["MCQ_SINGLE"] >= 1
