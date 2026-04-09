from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.quiz.question_bank import (
    DeleteSetByKeyIn,
    DeleteSetByKeyOut,
    ManualSetCreateIn,
    ManualSetCreatedOut,
    QuestionBankSetsResponse,
)
from app.services.paper.question_bank.question_bank_service import QuestionBankService

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
    q: str | None = Query(
        default=None,
        description="Search chapter, prompt, subject, grade, answer, source/publisher, or MCQ option text",
    ),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> QuestionBankSetsResponse:
    uid = _require_user_id(x_user_id)
    return await QuestionBankService.list_grouped_sets(
        db,
        subject=subject,
        grade=grade,
        semester=semester,
        difficulty=difficulty,
        question_type=question_type,
        q=q,
        acting_user_id=uid,
    )


@router.post("/sets/manual", response_model=ManualSetCreatedOut)
async def create_manual_question_bank_set(
    body: ManualSetCreateIn,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> ManualSetCreatedOut:
    uid = _require_user_id(x_user_id)
    try:
        return await QuestionBankService.create_manual_set(db, user_id=uid, body=body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/sets/delete-by-key", response_model=DeleteSetByKeyOut)
async def delete_question_bank_set_by_key(
    body: DeleteSetByKeyIn,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> DeleteSetByKeyOut:
    uid = _require_user_id(x_user_id)
    try:
        return await QuestionBankService.delete_manual_set_by_key(
            db,
            user_id=uid,
            subject=body.subject,
            grade=body.grade,
            semester=body.semester,
            chapter=body.chapter,
            question_type_ui=body.question_type,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
