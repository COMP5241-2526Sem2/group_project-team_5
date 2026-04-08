import logging

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.quiz.quiz_generation import (
    AIQuestionGenExtractTextResponse,
    AIQuestionGenPreviewJobCreateResponse,
    AIQuestionGenPreviewRequest,
    AIQuestionGenPreviewResponse,
    AIQuestionGenPreviewJobStatusResponse,
    QuizGenerateRequest,
    QuizGenerateResponse,
)
from app.services.paper.common.source_text_extraction_service import SourceTextExtractionService
from app.services.quiz.ai_question_gen_service import AIQuestionGenService, LLMGenerationError
from app.services.quiz.quiz_preview_job_service import QuizPreviewJobService
from app.services.quiz.quiz_generation_service import QuizGenerationService

router = APIRouter(prefix="/quiz-generation", tags=["quiz-generation"])
logger = logging.getLogger(__name__)


@router.post("", response_model=QuizGenerateResponse)
async def generate_quiz(
    payload: QuizGenerateRequest,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> QuizGenerateResponse:
    if x_user_id is None:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    return await QuizGenerationService.generate(db=db, payload=payload, actor_id=x_user_id)


@router.post("/preview", response_model=AIQuestionGenPreviewResponse)
async def preview_generate_questions(
    payload: AIQuestionGenPreviewRequest,
    _db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> AIQuestionGenPreviewResponse:
    if x_user_id is None:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    try:
        return await AIQuestionGenService.preview_generate(payload)
    except LLMGenerationError as exc:
        logger.warning(
            "Quiz preview failed with LLMGenerationError (user_id=%s, question_count=%s, difficulty=%s, task_type=%s, match_mode=%s, source_chars=%s, error=%s)",
            x_user_id,
            payload.question_count,
            payload.difficulty,
            payload.task_type,
            payload.match_mode,
            len((payload.source_text or "").strip()),
            str(exc),
        )
        raise HTTPException(
            status_code=502,
            detail={
                "warning": str(exc),
                "message": "LLM generation failed; placeholder/heuristic questions are disabled.",
            },
        )


@router.post("/preview/jobs", response_model=AIQuestionGenPreviewJobCreateResponse)
async def create_preview_job(
    payload: AIQuestionGenPreviewRequest,
    _db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> AIQuestionGenPreviewJobCreateResponse:
    if x_user_id is None:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    return await QuizPreviewJobService.create_job(payload=payload, user_id=x_user_id)


@router.get("/preview/jobs/{job_id}", response_model=AIQuestionGenPreviewJobStatusResponse)
async def get_preview_job_status(
    job_id: str,
    _db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> AIQuestionGenPreviewJobStatusResponse:
    if x_user_id is None:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    return await QuizPreviewJobService.get_status(job_id=job_id, user_id=x_user_id)


@router.post("/extract-text", response_model=AIQuestionGenExtractTextResponse)
async def extract_source_text(
    file: UploadFile = File(...),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> AIQuestionGenExtractTextResponse:
    if x_user_id is None:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    data = await file.read()
    text = SourceTextExtractionService.extract_text(
        file_name=file.filename or "",
        content_type=file.content_type,
        data=data,
    )
    return AIQuestionGenExtractTextResponse(source_text=text, chars=len(text))
