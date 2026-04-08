from __future__ import annotations

import copy
import json
from collections.abc import Mapping
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lab import LabDefinition
from app.models.lesson import DeckSource, DeckStatus, LessonDeck, Slide, SlideBlock, SlideBlockType
from app.schemas.lesson import (
    LessonCreate,
    LessonDeckDetail,
    LessonDeckListItem,
    LessonDeckPatch,
    LessonDeckUpsert,
    PaginatedLessonList,
    SlideOut,
    SlideUpsert,
)


async def _sqlite_alloc_id(db: AsyncSession, model_cls: Any) -> int:
    r = await db.execute(select(func.coalesce(func.max(model_cls.id), 0)))
    return int(r.scalar_one() or 0) + 1


def _is_sqlite(db: AsyncSession) -> bool:
    bind = getattr(db, "bind", None)
    if bind is None:
        return False
    return getattr(getattr(bind, "dialect", None), "name", "") == "sqlite"


def _extra_payload_as_dict(val: Any) -> dict[str, Any] | None:
    """部分环境下 JSON 列会以字符串形式读出，统一成 dict 再取 wb / registry_key。"""
    if val is None:
        return None
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            out = json.loads(val)
        except json.JSONDecodeError:
            return None
        return out if isinstance(out, dict) else None
    if isinstance(val, Mapping):
        return dict(val)
    return None


def _wb_to_plain_dict(val: Any) -> dict[str, Any] | None:
    """extra_payload['wb'] 可能是 dict、JSON 字符串或 asyncpg 的 Mapping。"""
    if val is None:
        return None
    if isinstance(val, dict):
        return dict(val)
    if isinstance(val, str):
        try:
            out = json.loads(val)
        except json.JSONDecodeError:
            return None
        return out if isinstance(out, dict) else None
    if isinstance(val, Mapping):
        return dict(val)
    return None


def _slide_to_out(slide: Slide) -> SlideOut:
    text = ""
    lab_registry_key: str | None = None
    lab_definition_id: int | None = None
    lab_snapshot: dict[str, Any] | None = None
    image_urls: list[str] = []
    slide_layout: dict[str, Any] | None = None
    blocks = sorted(slide.blocks, key=lambda b: b.order_num) if slide.blocks else []
    for b in blocks:
        if b.block_type == SlideBlockType.TEXT:
            text = b.content or ""
            extra = _extra_payload_as_dict(b.extra_payload)
            if extra is not None:
                slide_layout = _wb_to_plain_dict(extra.get("wb"))
        elif b.block_type == SlideBlockType.IMAGE and b.content:
            image_urls.append(b.content.strip())
        elif b.block_type == SlideBlockType.INTERACTIVE:
            extra = _extra_payload_as_dict(b.extra_payload)
            if extra:
                raw_rk = extra.get("registry_key")
                if raw_rk is not None:
                    lab_registry_key = str(raw_rk).strip() or None
                raw_snap = extra.get("lab_snapshot")
                lab_snapshot = _wb_to_plain_dict(raw_snap) if raw_snap is not None else None
            raw_id = extra.get("lab_definition_id") if extra else None
            if raw_id is not None:
                try:
                    lab_definition_id = int(raw_id)
                except (TypeError, ValueError):
                    lab_definition_id = None
    return SlideOut(
        id=slide.id,
        order=slide.order_num,
        title=slide.title or "",
        text=text,
        notes=slide.notes,
        lab_registry_key=lab_registry_key,
        lab_definition_id=lab_definition_id,
        lab_snapshot=lab_snapshot,
        image_urls=image_urls,
        slide_layout=slide_layout,
    )


class LessonService:
    @staticmethod
    async def _resolve_lab_id(db: AsyncSession, registry_key: str | None) -> int | None:
        if not registry_key:
            return None
        r = await db.execute(select(LabDefinition.id).where(LabDefinition.registry_key == registry_key))
        row = r.scalar_one_or_none()
        return int(row) if row is not None else None

    @staticmethod
    async def list_decks(
        db: AsyncSession,
        *,
        teacher_id: int,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedLessonList:
        count_stmt = select(func.count()).select_from(LessonDeck).where(LessonDeck.teacher_id == teacher_id)
        total = int((await db.execute(count_stmt)).scalar_one() or 0)
        offset = (page - 1) * page_size
        stmt = (
            select(LessonDeck)
            .where(LessonDeck.teacher_id == teacher_id)
            .order_by(LessonDeck.updated_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        decks = list((await db.execute(stmt)).scalars().all())
        deck_ids = [d.id for d in decks]
        counts: dict[int, int] = {}
        if deck_ids:
            cnt_q = await db.execute(
                select(Slide.deck_id, func.count(Slide.id)).where(Slide.deck_id.in_(deck_ids)).group_by(Slide.deck_id)
            )
            for deck_id, n in cnt_q.all():
                counts[int(deck_id)] = int(n)

        items = [
            LessonDeckListItem(
                id=d.id,
                title=d.title,
                subject=d.subject,
                grade=d.grade,
                deck_source=d.deck_source.value,
                status=d.status.value,
                updated_at=d.updated_at,
                slide_count=counts.get(d.id, 0),
            )
            for d in decks
        ]
        return PaginatedLessonList(total=total, page=page, page_size=page_size, items=items)

    @staticmethod
    async def _deck_to_detail(deck: LessonDeck) -> LessonDeckDetail:
        slides_sorted = sorted(deck.slides, key=lambda s: s.order_num)
        return LessonDeckDetail(
            id=deck.id,
            title=deck.title,
            subject=deck.subject,
            grade=deck.grade,
            deck_source=deck.deck_source.value,
            status=deck.status.value,
            teacher_id=deck.teacher_id,
            created_at=deck.created_at,
            updated_at=deck.updated_at,
            slides=[_slide_to_out(s) for s in slides_sorted],
        )

    @staticmethod
    async def create_deck(db: AsyncSession, *, teacher_id: int, payload: LessonCreate) -> LessonDeckDetail:
        deck = LessonDeck(
            title=payload.title,
            subject=payload.subject,
            grade=payload.grade,
            teacher_id=teacher_id,
            deck_source=DeckSource.MANUAL,
            status=DeckStatus.DRAFT,
        )
        if _is_sqlite(db):
            deck.id = await _sqlite_alloc_id(db, LessonDeck)
        db.add(deck)
        await db.flush()

        slide = Slide(deck_id=deck.id, title="New Slide", notes=None, order_num=1)
        if _is_sqlite(db):
            slide.id = await _sqlite_alloc_id(db, Slide)
        db.add(slide)
        await db.flush()

        block = SlideBlock(
            slide_id=slide.id,
            block_type=SlideBlockType.TEXT,
            content="",
            order_num=1,
        )
        if _is_sqlite(db):
            block.id = await _sqlite_alloc_id(db, SlideBlock)
        db.add(block)
        await db.commit()

        stmt = (
            select(LessonDeck)
            .where(LessonDeck.id == deck.id)
            .options(selectinload(LessonDeck.slides).selectinload(Slide.blocks))
        )
        deck_loaded = (await db.execute(stmt)).scalar_one()
        return await LessonService._deck_to_detail(deck_loaded)

    @staticmethod
    async def get_deck(db: AsyncSession, *, deck_id: int, teacher_id: int) -> LessonDeckDetail | None:
        stmt = (
            select(LessonDeck)
            .where(LessonDeck.id == deck_id, LessonDeck.teacher_id == teacher_id)
            .options(selectinload(LessonDeck.slides).selectinload(Slide.blocks))
        )
        deck = (await db.execute(stmt)).scalar_one_or_none()
        if deck is None:
            return None
        return await LessonService._deck_to_detail(deck)

    @staticmethod
    async def _persist_slides(
        db: AsyncSession,
        *,
        deck_id: int,
        slides_in: list[SlideUpsert],
    ) -> None:
        await db.execute(delete(Slide).where(Slide.deck_id == deck_id))
        await db.flush()

        for i, s_in in enumerate(slides_in, start=1):
            slide = Slide(
                deck_id=deck_id,
                title=s_in.title or "",
                notes=s_in.notes,
                order_num=i,
            )
            if _is_sqlite(db):
                slide.id = await _sqlite_alloc_id(db, Slide)
            db.add(slide)
            await db.flush()

            text_extra: dict[str, Any] | None = None
            if s_in.slide_layout is not None:
                wb_in = s_in.slide_layout
                if isinstance(wb_in, Mapping) and not isinstance(wb_in, dict):
                    wb_in = dict(wb_in)
                text_extra = {"wb": copy.deepcopy(wb_in)}
            tb = SlideBlock(
                slide_id=slide.id,
                block_type=SlideBlockType.TEXT,
                content=s_in.text or "",
                extra_payload=text_extra,
                order_num=1,
            )
            if _is_sqlite(db):
                tb.id = await _sqlite_alloc_id(db, SlideBlock)
            db.add(tb)

            order_next = 2
            for raw_url in s_in.image_urls or []:
                u = (raw_url or "").strip()
                if not u:
                    continue
                img_b = SlideBlock(
                    slide_id=slide.id,
                    block_type=SlideBlockType.IMAGE,
                    content=u,
                    order_num=order_next,
                )
                order_next += 1
                if _is_sqlite(db):
                    img_b.id = await _sqlite_alloc_id(db, SlideBlock)
                db.add(img_b)

            rk = (s_in.lab_registry_key or "").strip() or None
            if rk:
                lab_id = await LessonService._resolve_lab_id(db, rk)
                extra: dict[str, Any] = {"registry_key": rk}
                if lab_id is not None:
                    extra["lab_definition_id"] = lab_id
                if s_in.lab_snapshot is not None:
                    extra["lab_snapshot"] = copy.deepcopy(s_in.lab_snapshot)
                ib = SlideBlock(
                    slide_id=slide.id,
                    block_type=SlideBlockType.INTERACTIVE,
                    content=None,
                    extra_payload=extra,
                    order_num=order_next,
                )
                if _is_sqlite(db):
                    ib.id = await _sqlite_alloc_id(db, SlideBlock)
                db.add(ib)

    @staticmethod
    async def replace_deck(
        db: AsyncSession,
        *,
        deck_id: int,
        teacher_id: int,
        payload: LessonDeckUpsert,
    ) -> LessonDeckDetail | None:
        stmt = select(LessonDeck).where(LessonDeck.id == deck_id, LessonDeck.teacher_id == teacher_id)
        deck = (await db.execute(stmt)).scalar_one_or_none()
        if deck is None:
            return None

        deck.title = payload.title
        deck.subject = payload.subject
        deck.grade = payload.grade
        if payload.status is not None:
            deck.status = DeckStatus(payload.status)

        slides_payload = payload.slides if payload.slides else [
            SlideUpsert(title="New Slide", text="", notes=None, lab_registry_key=None)
        ]
        await LessonService._persist_slides(db, deck_id=deck_id, slides_in=slides_payload)
        await db.commit()

        return await LessonService.get_deck(db, deck_id=deck_id, teacher_id=teacher_id)

    @staticmethod
    async def patch_deck(
        db: AsyncSession,
        *,
        deck_id: int,
        teacher_id: int,
        payload: LessonDeckPatch,
    ) -> LessonDeckDetail | None:
        stmt = select(LessonDeck).where(LessonDeck.id == deck_id, LessonDeck.teacher_id == teacher_id)
        deck = (await db.execute(stmt)).scalar_one_or_none()
        if deck is None:
            return None
        deck.status = DeckStatus(payload.status)
        await db.commit()
        return await LessonService.get_deck(db, deck_id=deck_id, teacher_id=teacher_id)

    @staticmethod
    async def delete_deck(db: AsyncSession, *, deck_id: int, teacher_id: int) -> bool:
        stmt = select(LessonDeck).where(LessonDeck.id == deck_id, LessonDeck.teacher_id == teacher_id)
        deck = (await db.execute(stmt)).scalar_one_or_none()
        if deck is None:
            return False
        await db.delete(deck)
        await db.commit()
        return True
