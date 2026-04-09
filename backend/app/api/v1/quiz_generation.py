import json

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.quiz.quiz_generation import (
    AIQuestionGenExtractTextResponse,
    AIQuestionGenPreviewRequest,
    AIQuestionGenPreviewResponse,
    QuizGenerateRequest,
    QuizGenerateResponse,
)
from app.services.paper.common.source_text_extraction_service import SourceTextExtractionService
from app.services.quiz.ai_question_gen_service import AIQuestionGenService
from app.services.quiz.quiz_generation_service import QuizGenerationService

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


@router.post("/preview-multimodal", response_model=AIQuestionGenPreviewResponse)
async def preview_generate_questions_multimodal(
    source_text: str | None = Form(default=None),
    subject: str | None = Form(default=None),
    grade: str | None = Form(default=None),
    task_type: str | None = Form(default=None),
    match_mode: str | None = Form(default=None),
    difficulty: str = Form(...),
    question_count: int = Form(...),
    type_targets: str | None = Form(default=None),
    files: list[UploadFile] | None = File(default=None),
    _db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> AIQuestionGenPreviewResponse:
    if x_user_id is None:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")

    parsed_targets: dict[str, int] | None = None
    if type_targets and type_targets.strip():
        try:
            obj = json.loads(type_targets)
            if isinstance(obj, dict):
                parsed_targets = {str(k): int(v) for k, v in obj.items()}
        except Exception:
            raise HTTPException(status_code=400, detail="type_targets must be a JSON object")

    payload = AIQuestionGenPreviewRequest(
        source_text=(source_text or "").strip() or "[multimodal source]",
        subject=(subject or None),
        grade=(grade or None),
        task_type=(task_type or None),
        match_mode=(match_mode or None),
        difficulty=difficulty,  # validated by pydantic
        question_count=question_count,
        type_targets=parsed_targets,
    )

    file_blobs: list[tuple[str, str, bytes]] = []
    for f in files or []:
        data = await f.read()
        if not data:
            continue
        file_blobs.append((f.filename or "upload.bin", f.content_type or "application/octet-stream", data))

    return await AIQuestionGenService.preview_generate_multimodal(payload, file_blobs)


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
