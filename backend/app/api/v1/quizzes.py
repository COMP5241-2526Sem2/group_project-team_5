from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.quiz.quiz_runtime import (
    AudioAuditRequest,
    AudioAuditResponse,
    AudioUploadResponse,
    AttemptCreateResponse,
    AttemptSubmitResponse,
    GradeAnswerRequest,
    GradeAnswersBatchRequest,
    GradeAnswersBatchResponse,
    GradeAnswerResponse,
    QuizDetailResponse,
    QuizListResponse,
    QuizReviewResponse,
    QuizStatusMutationResponse,
    SaveAnswersRequest,
    SaveAnswersResponse,
)
from app.services.quiz.quiz_runtime_service import QuizRuntimeService

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


@router.post("/quizzes/{quiz_id}/publish", response_model=QuizStatusMutationResponse)
async def publish_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> QuizStatusMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await QuizRuntimeService.publish_quiz(db=db, quiz_id=quiz_id, actor_id=actor_id)


@router.post("/quizzes/{quiz_id}/close", response_model=QuizStatusMutationResponse)
async def close_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> QuizStatusMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await QuizRuntimeService.close_quiz(db=db, quiz_id=quiz_id, actor_id=actor_id)


@router.post("/quizzes/{quiz_id}/reopen", response_model=QuizStatusMutationResponse)
async def reopen_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> QuizStatusMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await QuizRuntimeService.reopen_quiz(db=db, quiz_id=quiz_id, actor_id=actor_id)


@router.put("/attempts/{attempt_id}/answers/{question_id}/grade", response_model=GradeAnswerResponse)
async def grade_attempt_answer(
    attempt_id: int,
    question_id: int,
    payload: GradeAnswerRequest,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> GradeAnswerResponse:
    actor_id = _require_user_id(x_user_id)
    return await QuizRuntimeService.grade_answer(
        db=db,
        attempt_id=attempt_id,
        question_id=question_id,
        actor_id=actor_id,
        payload=payload,
    )


@router.put("/attempts/{attempt_id}/answers/grade-batch", response_model=GradeAnswersBatchResponse)
async def grade_attempt_answers_batch(
    attempt_id: int,
    payload: GradeAnswersBatchRequest,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> GradeAnswersBatchResponse:
    actor_id = _require_user_id(x_user_id)
    return await QuizRuntimeService.grade_answers_batch(
        db=db,
        attempt_id=attempt_id,
        actor_id=actor_id,
        items=payload.items,
    )


@router.post("/audio", response_model=AudioUploadResponse)
async def upload_audio(
    attempt_id: int = Form(...),
    question_id: int = Form(...),
    retention_until: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> AudioUploadResponse:
    actor_id = _require_user_id(x_user_id)
    parsed_retention = None
    if retention_until:
        try:
            parsed_retention = datetime.fromisoformat(retention_until.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="retention_until must be ISO datetime") from exc

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="audio file is empty")

    return await QuizRuntimeService.upload_audio(
        db=db,
        actor_id=actor_id,
        attempt_id=attempt_id,
        question_id=question_id,
        file_name=file.filename,
        content_type=file.content_type or "application/octet-stream",
        audio_data=data,
        retention_until=parsed_retention,
    )


@router.get("/audio/{audio_id}/stream")
async def stream_audio(
    audio_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> Response:
    actor_id = _require_user_id(x_user_id)
    audio = await QuizRuntimeService.get_audio_stream(db=db, actor_id=actor_id, audio_id=audio_id)
    filename = audio.file_name or f"audio-{audio.id}.bin"
    return Response(
        content=audio.audio_data,
        media_type=audio.content_type,
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/audio/{audio_id}/audit", response_model=AudioAuditResponse)
async def create_audio_audit(
    audio_id: int,
    payload: AudioAuditRequest,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> AudioAuditResponse:
    actor_id = _require_user_id(x_user_id)
    return await QuizRuntimeService.create_audio_audit(
        db=db,
        actor_id=actor_id,
        audio_id=audio_id,
        payload=payload,
    )
