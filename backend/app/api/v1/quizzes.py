from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.quiz_runtime import (
    AttemptCreateResponse,
    AttemptSubmitResponse,
    QuizDetailResponse,
    QuizListResponse,
    QuizReviewResponse,
    SaveAnswersRequest,
    SaveAnswersResponse,
)
from app.services.quiz_runtime_service import QuizRuntimeService

router = APIRouter(tags=["quizzes"])


def _require_user_id(x_user_id: int | None) -> int:
    if x_user_id is None:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    return x_user_id


@router.get("/quizzes/todo", response_model=QuizListResponse)
async def list_todo_quizzes(
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> QuizListResponse:
    student_id = _require_user_id(x_user_id)
    items = await QuizRuntimeService.list_todo(db=db, student_id=student_id)
    return QuizListResponse(items=items)


@router.get("/quizzes/completed", response_model=QuizListResponse)
async def list_completed_quizzes(
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> QuizListResponse:
    student_id = _require_user_id(x_user_id)
    items = await QuizRuntimeService.list_completed(db=db, student_id=student_id)
    return QuizListResponse(items=items)


@router.get("/quizzes/{quiz_id}", response_model=QuizDetailResponse)
async def get_quiz_detail(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> QuizDetailResponse:
    student_id = _require_user_id(x_user_id)
    return await QuizRuntimeService.get_quiz_detail(db=db, quiz_id=quiz_id, student_id=student_id)


@router.post("/quizzes/{quiz_id}/attempts", response_model=AttemptCreateResponse)
async def create_or_get_attempt(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> AttemptCreateResponse:
    student_id = _require_user_id(x_user_id)
    return await QuizRuntimeService.create_or_get_attempt(db=db, quiz_id=quiz_id, student_id=student_id)


@router.put("/attempts/{attempt_id}/answers", response_model=SaveAnswersResponse)
async def save_attempt_answers(
    attempt_id: int,
    payload: SaveAnswersRequest,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> SaveAnswersResponse:
    student_id = _require_user_id(x_user_id)
    return await QuizRuntimeService.save_answers(
        db=db,
        attempt_id=attempt_id,
        student_id=student_id,
        answer_items=payload.answers,
    )


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptSubmitResponse)
async def submit_attempt(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> AttemptSubmitResponse:
    student_id = _require_user_id(x_user_id)
    return await QuizRuntimeService.submit_attempt(db=db, attempt_id=attempt_id, student_id=student_id)


@router.get("/attempts/{attempt_id}/review", response_model=QuizReviewResponse)
async def get_attempt_review(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> QuizReviewResponse:
    student_id = _require_user_id(x_user_id)
    return await QuizRuntimeService.get_review(db=db, attempt_id=attempt_id, student_id=student_id)
