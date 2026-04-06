from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.paper_attempts import (
    PaperAttemptCreateResponse,
    PaperAttemptListResponse,
    PaperAttemptReviewResponse,
    PaperGradeAnswerRequest,
    PaperGradeAnswerResponse,
    PaperGradeAnswersBatchRequest,
    PaperGradeAnswersBatchResponse,
    PaperSaveAnswersRequest,
    PaperSaveAnswersResponse,
    PaperSubmitAttemptResponse,
)
from app.schemas.paper_ai_scoring import (
    PaperAIAdoptBatchRequest,
    PaperAIAdoptBatchResponse,
    PaperAIAdoptRequest,
    PaperAIAdoptResponse,
    PaperAISuggestionsResponse,
)
from app.schemas.paper import PaperDetailResponse, PaperListResponse, PaperStatusMutationResponse
from app.services.paper_ai_scoring_service import PaperAIScoringService
from app.services.paper_attempt_service import PaperAttemptService
from app.services.paper_service import PaperService

router = APIRouter(tags=["papers"])


def _require_user_id(x_user_id: int | None) -> int:
    if x_user_id is None:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    return x_user_id


@router.get("/papers", response_model=PaperListResponse)
async def list_papers(
    status: Literal["draft", "published", "closed"] | None = Query(default=None),
    subject: str | None = Query(default=None),
    grade: str | None = Query(default=None),
    semester: str | None = Query(default=None),
    exam_type: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperListResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.list_papers(
        db=db,
        actor_id=actor_id,
        status=status,
        subject=subject,
        grade=grade,
        semester=semester,
        exam_type=exam_type,
        q=q,
        page=page,
        page_size=page_size,
    )


@router.get("/papers/{paper_id}", response_model=PaperDetailResponse)
async def get_paper_detail(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperDetailResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.get_paper_detail(db=db, actor_id=actor_id, paper_id=paper_id)


@router.post("/papers/{paper_id}/publish", response_model=PaperStatusMutationResponse)
async def publish_paper(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperStatusMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.publish_paper(db=db, actor_id=actor_id, paper_id=paper_id)


@router.post("/papers/{paper_id}/close", response_model=PaperStatusMutationResponse)
async def close_paper(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperStatusMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.close_paper(db=db, actor_id=actor_id, paper_id=paper_id)


@router.post("/papers/{paper_id}/reopen", response_model=PaperStatusMutationResponse)
async def reopen_paper(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperStatusMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.reopen_paper(db=db, actor_id=actor_id, paper_id=paper_id)


@router.get("/papers/{paper_id}/attempts/me", response_model=PaperAttemptCreateResponse)
async def create_or_get_my_paper_attempt(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperAttemptCreateResponse:
    student_id = _require_user_id(x_user_id)
    return await PaperAttemptService.create_or_get_my_attempt(db=db, paper_id=paper_id, student_id=student_id)


@router.put("/paper-attempts/{attempt_id}/answers", response_model=PaperSaveAnswersResponse)
async def save_paper_attempt_answers(
    attempt_id: int,
    payload: PaperSaveAnswersRequest,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperSaveAnswersResponse:
    student_id = _require_user_id(x_user_id)
    return await PaperAttemptService.save_answers(
        db=db,
        attempt_id=attempt_id,
        student_id=student_id,
        answers=payload.answers,
    )


@router.post("/paper-attempts/{attempt_id}/submit", response_model=PaperSubmitAttemptResponse)
async def submit_paper_attempt(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperSubmitAttemptResponse:
    student_id = _require_user_id(x_user_id)
    return await PaperAttemptService.submit_attempt(db=db, attempt_id=attempt_id, student_id=student_id)


@router.get("/paper-attempts/{attempt_id}/review", response_model=PaperAttemptReviewResponse)
async def get_paper_attempt_review(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperAttemptReviewResponse:
    student_id = _require_user_id(x_user_id)
    return await PaperAttemptService.get_review(db=db, attempt_id=attempt_id, student_id=student_id)


@router.get("/papers/{paper_id}/attempts", response_model=PaperAttemptListResponse)
async def list_paper_attempts_for_teacher(
    paper_id: int,
    status: Literal["in_progress", "submitted", "graded"] | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperAttemptListResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperAttemptService.list_attempts_for_teacher(
        db=db,
        actor_id=actor_id,
        paper_id=paper_id,
        status=status,
        page=page,
        page_size=page_size,
    )


@router.put("/paper-attempts/{attempt_id}/answers/{question_id}/grade", response_model=PaperGradeAnswerResponse)
async def grade_paper_attempt_answer(
    attempt_id: int,
    question_id: int,
    payload: PaperGradeAnswerRequest,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperGradeAnswerResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperAttemptService.grade_answer(
        db=db,
        actor_id=actor_id,
        attempt_id=attempt_id,
        question_id=question_id,
        awarded_score=payload.awarded_score,
        teacher_feedback=payload.teacher_feedback,
        is_correct=payload.is_correct,
    )


@router.put("/paper-attempts/{attempt_id}/answers/grade-batch", response_model=PaperGradeAnswersBatchResponse)
async def grade_paper_attempt_answers_batch(
    attempt_id: int,
    payload: PaperGradeAnswersBatchRequest,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperGradeAnswersBatchResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperAttemptService.grade_answers_batch(
        db=db,
        actor_id=actor_id,
        attempt_id=attempt_id,
        items=payload.items,
    )


@router.post("/paper-attempts/{attempt_id}/ai-score", response_model=PaperAISuggestionsResponse)
async def generate_ai_suggestions(
    attempt_id: int,
    prompt_version: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperAISuggestionsResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperAIScoringService.generate_suggestions(
        db=db,
        actor_id=actor_id,
        attempt_id=attempt_id,
        prompt_version=prompt_version,
    )


@router.get("/paper-attempts/{attempt_id}/ai-score", response_model=PaperAISuggestionsResponse)
async def list_ai_suggestions(
    attempt_id: int,
    prompt_version: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperAISuggestionsResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperAIScoringService.list_suggestions(
        db=db,
        actor_id=actor_id,
        attempt_id=attempt_id,
        prompt_version=prompt_version,
    )


@router.post("/paper-attempts/{attempt_id}/ai-score/{question_id}/adopt", response_model=PaperAIAdoptResponse)
async def adopt_ai_suggestion(
    attempt_id: int,
    question_id: int,
    payload: PaperAIAdoptRequest,
    prompt_version: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperAIAdoptResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperAIScoringService.adopt_suggestion(
        db=db,
        actor_id=actor_id,
        attempt_id=attempt_id,
        question_id=question_id,
        override_score=payload.override_score,
        override_feedback=payload.override_feedback,
        prompt_version=prompt_version,
    )


@router.post("/paper-attempts/{attempt_id}/ai-score/adopt-batch", response_model=PaperAIAdoptBatchResponse)
async def adopt_ai_suggestions_batch(
    attempt_id: int,
    payload: PaperAIAdoptBatchRequest,
    prompt_version: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperAIAdoptBatchResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperAIScoringService.adopt_suggestions_batch(
        db=db,
        actor_id=actor_id,
        attempt_id=attempt_id,
        items=payload.items,
        prompt_version=prompt_version,
    )
