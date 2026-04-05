from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.quiz_generation import QuizGenerateRequest, QuizGenerateResponse
from app.services.quiz_generation_service import QuizGenerationService

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
