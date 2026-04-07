from __future__ import annotations

import hashlib
from collections import defaultdict
from collections.abc import Iterable

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.assessment import QuestionBankItem, QuestionBankOption
from app.schemas.question_bank import (
    QuestionBankSetOut,
    QuestionBankSetQuestionOut,
    QuestionBankSetsResponse,
)

_UI_TO_DB_TYPES: dict[str, tuple[str, ...]] = {
    "MCQ": ("MCQ_SINGLE", "MCQ_MULTI"),
    "True/False": ("TRUE_FALSE",),
    "Fill-blank": ("FILL_BLANK",),
    "Short Answer": ("SHORT_ANSWER",),
    "Essay": ("ESSAY",),
}

_DB_TO_UI_TYPE: dict[str, str] = {
    "MCQ_SINGLE": "MCQ",
    "MCQ_MULTI": "MCQ",
    "TRUE_FALSE": "True/False",
    "FILL_BLANK": "Fill-blank",
    "SHORT_ANSWER": "Short Answer",
    "ESSAY": "Essay",
}


def _norm_difficulty(raw: str | None) -> str:
    if not raw:
        return "medium"
    v = raw.strip().lower()
    if v in {"easy", "medium", "hard"}:
        return v
    return "medium"


def _set_difficulty(rows: Iterable[QuestionBankItem]) -> str:
    diffs = [_norm_difficulty(r.difficulty) for r in rows]
    if not diffs:
        return "medium"
    if len(set(diffs)) == 1:
        return diffs[0]
    return "medium"


def _options_to_strings(opts: list[QuestionBankOption]) -> list[str]:
    sorted_opts = sorted(opts, key=lambda o: o.option_key)
    return [f"{o.option_key}. {o.option_text}" for o in sorted_opts]


def _build_source(row: QuestionBankItem) -> str:
    if row.publisher and row.publisher.strip():
        return row.publisher.strip()
    if row.source_id is not None:
        return f"{row.source_type} #{row.source_id}"
    return row.source_type or "bank"


class QuestionBankService:
    @staticmethod
    async def list_grouped_sets(
        db: AsyncSession,
        *,
        subject: str | None = None,
        grade: str | None = None,
        semester: str | None = None,
        difficulty: str | None = None,
        question_type: str | None = None,
        q: str | None = None,
    ) -> QuestionBankSetsResponse:
        stmt = select(QuestionBankItem).options(selectinload(QuestionBankItem.options))

        if subject and subject.strip():
            stmt = stmt.where(QuestionBankItem.subject == subject.strip())
        if grade and grade.strip():
            stmt = stmt.where(QuestionBankItem.grade == grade.strip())
        if semester and semester.strip():
            stmt = stmt.where(QuestionBankItem.semester == semester.strip())
        if difficulty and difficulty.strip():
            d = difficulty.strip().lower()
            stmt = stmt.where(QuestionBankItem.difficulty.isnot(None)).where(
                QuestionBankItem.difficulty.ilike(d)
            )
        if question_type and question_type.strip():
            db_types = _UI_TO_DB_TYPES.get(question_type.strip())
            if db_types:
                stmt = stmt.where(QuestionBankItem.question_type.in_(db_types))
        if q and q.strip():
            term = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(
                    QuestionBankItem.chapter.ilike(term),
                    QuestionBankItem.prompt.ilike(term),
                    QuestionBankItem.subject.ilike(term),
                )
            )

        stmt = stmt.order_by(
            QuestionBankItem.subject,
            QuestionBankItem.grade,
            QuestionBankItem.semester.nullsfirst(),
            QuestionBankItem.chapter.nullsfirst(),
            QuestionBankItem.question_type,
            QuestionBankItem.id,
        )

        result = await db.execute(stmt)
        rows = list(result.scalars().unique().all())

        groups: dict[tuple[str, str, str, str, str], list[QuestionBankItem]] = defaultdict(list)
        for row in rows:
            ui_type = _DB_TO_UI_TYPE.get(row.question_type)
            if ui_type is None:
                continue
            sem = (row.semester or "").strip()
            chap = (row.chapter or "").strip() or "—"
            key = (row.subject, row.grade, sem, chap, ui_type)
            groups[key].append(row)

        sets_out: list[QuestionBankSetOut] = []
        for (subj, grd, sem, chap, ui_type), items in groups.items():
            key_str = "|".join([subj, grd, sem, chap, ui_type])
            set_id = "db-" + hashlib.sha256(key_str.encode("utf-8")).hexdigest()[:16]

            any_ai = any((it.source_type or "").lower() == "ai_generated" for it in items)
            source = _build_source(items[0])

            questions: list[QuestionBankSetQuestionOut] = []
            for it in items:
                opts = _options_to_strings(list(it.options)) if it.options else None
                if ui_type == "MCQ" and not opts:
                    opts = None
                questions.append(
                    QuestionBankSetQuestionOut(
                        id=str(it.id),
                        type=ui_type,
                        prompt=it.prompt,
                        options=opts if ui_type == "MCQ" else None,
                        answer=(it.answer_text or None),
                        difficulty=_norm_difficulty(it.difficulty),
                    )
                )

            sets_out.append(
                QuestionBankSetOut(
                    id=set_id,
                    type=ui_type,
                    subject=subj,
                    grade=grd,
                    semester=sem or "—",
                    difficulty=_set_difficulty(items),
                    chapter=chap,
                    source=source,
                    ai_generated=any_ai,
                    questions=questions,
                )
            )

        return QuestionBankSetsResponse(sets=sets_out)
