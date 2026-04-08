from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.quiz_generation import (
    AIQuestionGenPreviewRequest,
    AIQuestionGenPreviewResponse,
    AIQuestionGenExtractTextResponse,
    QuizGenerateRequest,
    QuizGenerateResponse,
)
from app.services.ai_question_gen_service import AIQuestionGenService
from app.services.quiz_generation_service import QuizGenerationService
from app.services.source_text_extraction_service import SourceTextExtractionService

router = APIRouter(prefix="/quiz-generation", tags=["quiz-generation"])


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
    return await AIQuestionGenService.preview_generate(payload)


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


@router.post("/illustrations", response_model=AIQuestionGenIllustrationResponse)
async def generate_question_illustrations(
    payload: AIQuestionGenIllustrationRequest,
    _db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> AIQuestionGenIllustrationResponse:
    if x_user_id is None:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    images = await QuizIllustrationService.generate(payload)
    return AIQuestionGenIllustrationResponse(images=images)
