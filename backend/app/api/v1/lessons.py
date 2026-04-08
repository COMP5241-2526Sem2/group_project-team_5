from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.lesson import (
    LessonCreate,
    LessonDeckDetail,
    LessonDeckPatch,
    LessonDeckUpsert,
    PaginatedLessonList,
)
from app.services.lesson.lesson_service import LessonService

router = APIRouter(prefix="/lessons", tags=["lessons"])


async def resolve_teacher_id(
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> int:
    return x_user_id if x_user_id is not None else 1


@router.get("/", response_model=PaginatedLessonList)
async def list_lessons(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    teacher_id: int = Depends(resolve_teacher_id),
) -> PaginatedLessonList:
    return await LessonService.list_decks(db, teacher_id=teacher_id, page=page, page_size=page_size)


@router.post("/", response_model=LessonDeckDetail, status_code=201)
async def create_lesson(
    payload: LessonCreate,
    db: AsyncSession = Depends(get_db),
    teacher_id: int = Depends(resolve_teacher_id),
) -> LessonDeckDetail:
    return await LessonService.create_deck(db, teacher_id=teacher_id, payload=payload)


@router.get("/{deck_id}", response_model=LessonDeckDetail)
async def get_lesson(
    deck_id: int,
    db: AsyncSession = Depends(get_db),
    teacher_id: int = Depends(resolve_teacher_id),
) -> LessonDeckDetail:
    out = await LessonService.get_deck(db, deck_id=deck_id, teacher_id=teacher_id)
    if out is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return out


@router.put("/{deck_id}", response_model=LessonDeckDetail)
async def replace_lesson(
    deck_id: int,
    payload: LessonDeckUpsert,
    db: AsyncSession = Depends(get_db),
    teacher_id: int = Depends(resolve_teacher_id),
) -> LessonDeckDetail:
    out = await LessonService.replace_deck(db, deck_id=deck_id, teacher_id=teacher_id, payload=payload)
    if out is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return out


@router.patch("/{deck_id}", response_model=LessonDeckDetail)
async def patch_lesson(
    deck_id: int,
    payload: LessonDeckPatch,
    db: AsyncSession = Depends(get_db),
    teacher_id: int = Depends(resolve_teacher_id),
) -> LessonDeckDetail:
    out = await LessonService.patch_deck(db, deck_id=deck_id, teacher_id=teacher_id, payload=payload)
    if out is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return out


@router.delete("/{deck_id}", status_code=204)
async def delete_lesson(
    deck_id: int,
    db: AsyncSession = Depends(get_db),
    teacher_id: int = Depends(resolve_teacher_id),
) -> None:
    ok = await LessonService.delete_deck(db, deck_id=deck_id, teacher_id=teacher_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Lesson not found")
