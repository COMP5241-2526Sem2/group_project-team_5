from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.question_bank import QuestionBankSetsResponse
from app.services.question_bank_service import QuestionBankService

router = APIRouter(prefix="/question-bank", tags=["question-bank"])


def _require_user_id(x_user_id: int | None) -> int:
    if x_user_id is None:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    return x_user_id


@router.get("/sets", response_model=QuestionBankSetsResponse)
async def list_question_bank_sets(
    subject: str | None = Query(default=None),
    grade: str | None = Query(default=None),
    semester: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    question_type: str | None = Query(default=None, description="MCQ, True/False, Fill-blank, Short Answer, Essay"),
    q: str | None = Query(default=None, description="Search chapter, prompt, or subject"),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> QuestionBankSetsResponse:
    _require_user_id(x_user_id)
    return await QuestionBankService.list_grouped_sets(
        db,
        subject=subject,
        grade=grade,
        semester=semester,
        difficulty=difficulty,
        question_type=question_type,
        q=q,
    )
