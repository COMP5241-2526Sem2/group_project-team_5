from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from collections.abc import Iterable

from sqlalchemy import delete, exists, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.assessment import QuestionBankItem, QuestionBankOption
from app.schemas.quiz.question_bank import (
    DeleteSetByKeyOut,
    ManualQuestionIn,
    ManualSetCreateIn,
    ManualSetCreatedOut,
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

_ALLOWED_SUBJECTS = {"Biology", "Physics", "Math", "Chemistry", "English", "History"}
_SUBJECT_ALIASES: dict[str, str] = {
    "science: mathematics": "Math",
    "science: computers": "Physics",
    "science & nature": "Biology",
    "mathematics": "Math",
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


def _bank_item_has_valid_choice_options(row: QuestionBankItem, ui_type: str) -> bool:
    """Drop MCQ / True-False rows that have no usable options (e.g. only answer letter in DB)."""
    if ui_type == "MCQ":
        opts = list(row.options) if row.options else []
        if not (2 <= len(opts) <= 10):
            return False
        return all(str(o.option_text or "").strip() for o in opts)
    if ui_type == "True/False":
        opts = list(row.options) if row.options else []
        if len(opts) != 2:
            return False
        return all(str(o.option_text or "").strip() for o in opts)
    return True


def _build_source(row: QuestionBankItem) -> str:
    if row.publisher and row.publisher.strip():
        return row.publisher.strip()
    if row.source_id is not None:
        return f"{row.source_type} #{row.source_id}"
    return row.source_type or "bank"


def _normalize_subject(raw: str | None) -> str | None:
    if not raw:
        return None
    s = raw.strip()
    if not s:
        return None
    return _SUBJECT_ALIASES.get(s.lower(), s)


_IMG_MD_RE = re.compile(r"!\[[^\]]*\]\((?P<url>[^)\s]+)")
_IMG_HTML_RE = re.compile(r'<img[^>]+src=["\'](?P<url>[^"\']+)["\']', re.IGNORECASE)


def _extract_image_url(prompt: str | None) -> str | None:
    if not prompt:
        return None
    txt = prompt.strip()
    if not txt:
        return None
    if txt.startswith("data:image/"):
        return txt
    if txt.startswith(("http://", "https://")) and re.search(r"\.(png|jpe?g|gif|webp|svg)(\?.*)?$", txt, re.IGNORECASE):
        return txt
    md_match = _IMG_MD_RE.search(txt)
    if md_match:
        return md_match.group("url")
    html_match = _IMG_HTML_RE.search(txt)
    if html_match:
        return html_match.group("url")
    return None


class QuestionBankService:
    @staticmethod
    def _db_semester_predicate(semester_display: str | None):
        s = (semester_display or "").strip()
        if s in ("", "—"):
            return or_(QuestionBankItem.semester.is_(None), QuestionBankItem.semester == "")
        return QuestionBankItem.semester == s

    @staticmethod
    def _db_chapter_predicate(chapter_display: str):
        c = (chapter_display or "").strip()
        if c in ("", "—"):
            return or_(QuestionBankItem.chapter.is_(None), QuestionBankItem.chapter == "")
        return QuestionBankItem.chapter == c

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
        acting_user_id: int | None = None,
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
            option_text_match = exists(
                select(1)
                .select_from(QuestionBankOption)
                .where(
                    QuestionBankOption.bank_question_id == QuestionBankItem.id,
                    QuestionBankOption.option_text.ilike(term),
                )
            )
            stmt = stmt.where(
                or_(
                    QuestionBankItem.chapter.ilike(term),
                    QuestionBankItem.prompt.ilike(term),
                    QuestionBankItem.subject.ilike(term),
                    QuestionBankItem.grade.ilike(term),
                    QuestionBankItem.publisher.ilike(term),
                    QuestionBankItem.answer_text.ilike(term),
                    QuestionBankItem.source_type.ilike(term),
                    QuestionBankItem.question_type.ilike(term),
                    option_text_match,
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
            subj = _normalize_subject(row.subject)
            if subj is None or subj not in _ALLOWED_SUBJECTS:
                continue
            if not _bank_item_has_valid_choice_options(row, ui_type):
                continue
            sem = (row.semester or "").strip()
            chap = (row.chapter or "").strip() or "—"
            key = (subj, row.grade, sem, chap, ui_type)
            groups[key].append(row)

        sets_out: list[QuestionBankSetOut] = []
        for (subj, grd, sem, chap, ui_type), items in groups.items():
            key_str = "|".join([subj, grd, sem, chap, ui_type])
            set_id = "db-" + hashlib.sha256(key_str.encode("utf-8")).hexdigest()[:16]

            any_ai = any((it.source_type or "").lower() == "ai_generated" for it in items)
            source = _build_source(items[0])

            can_delete = False
            if acting_user_id is not None and items:
                can_delete = all(
                    (it.source_type or "").strip().lower() == "manual"
                    and it.created_by is not None
                    and int(it.created_by) == int(acting_user_id)
                    for it in items
                )

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
                        image_url=_extract_image_url(it.prompt),
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
                    can_delete=can_delete,
                    questions=questions,
                )
            )

        return QuestionBankSetsResponse(sets=sets_out)

    @staticmethod
    def _compute_set_id(*, subj: str, grade: str, semester_key: str, chapter: str, ui_type: str) -> str:
        key_str = "|".join([subj, grade, semester_key, chapter, ui_type])
        return "db-" + hashlib.sha256(key_str.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def _canonical_subject(raw: str) -> str:
        subj = _normalize_subject(raw) or raw.strip()
        if subj not in _ALLOWED_SUBJECTS:
            raise ValueError(f"Invalid subject: {raw!r} (allowed: {sorted(_ALLOWED_SUBJECTS)})")
        return subj

    @staticmethod
    def _build_options_for_question(
        db_qtype: str,
        q: ManualQuestionIn,
    ) -> tuple[str, list[QuestionBankOption]]:
        """Return (answer_text, options rows)."""
        ans_raw = q.answer.strip()
        if db_qtype == "MCQ_SINGLE":
            if not q.options or not (2 <= len(q.options) <= 10):
                raise ValueError("Each multiple-choice question needs 2–10 options")
            keys = [o.option_key.strip().upper() for o in q.options]
            expected = [chr(ord("A") + i) for i in range(len(q.options))]
            if keys != expected:
                raise ValueError("Multiple-choice option keys must be A, B, C, … in order")
            au = ans_raw.upper()
            if au not in keys:
                raise ValueError("Answer must match one option key (A–J)")
            opts = [
                QuestionBankOption(
                    option_key=o.option_key.strip().upper(),
                    option_text=o.option_text.strip(),
                    is_correct=(o.option_key.strip().upper() == au),
                )
                for o in q.options
            ]
            return au, opts
        if db_qtype == "TRUE_FALSE":
            if q.options and len(q.options) == 2:
                au = ans_raw.upper()
                key_set = {o.option_key.strip().upper() for o in q.options}
                if au not in key_set:
                    raise ValueError("True/False answer must match an option key (e.g. A or B)")
                opts = [
                    QuestionBankOption(
                        option_key=o.option_key.strip().upper(),
                        option_text=o.option_text.strip(),
                        is_correct=(o.option_key.strip().upper() == au),
                    )
                    for o in q.options
                ]
                return au, opts
            al = ans_raw.lower()
            if al in ("a", "true"):
                answer_key = "A"
            elif al in ("b", "false"):
                answer_key = "B"
            else:
                raise ValueError("True/False answer must be True, False, A, or B")
            opts = [
                QuestionBankOption(option_key="A", option_text="True", is_correct=(answer_key == "A")),
                QuestionBankOption(option_key="B", option_text="False", is_correct=(answer_key == "B")),
            ]
            return answer_key, opts
        if q.options:
            raise ValueError("This question type must not include options")
        if not ans_raw:
            raise ValueError("Answer is required")
        return ans_raw, []

    @staticmethod
    async def create_manual_set(db: AsyncSession, *, user_id: int, body: ManualSetCreateIn) -> ManualSetCreatedOut:
        ui_type = body.question_type.strip()
        db_types = _UI_TO_DB_TYPES.get(ui_type)
        if not db_types:
            raise ValueError(
                f"Invalid question_type: {ui_type!r}. "
                f"Use one of: {', '.join(sorted(_UI_TO_DB_TYPES.keys()))}"
            )
        db_qtype = db_types[0]

        subj = QuestionBankService._canonical_subject(body.subject)
        grade = body.grade.strip()
        sem = (body.semester or "").strip() or None
        chap = body.chapter.strip()
        if not chap:
            raise ValueError("chapter (set title) is required")
        pub = (body.publisher or "").strip() or None

        semester_key = (sem or "").strip()
        for q in body.questions:
            _norm_difficulty(q.difficulty)  # validate early
            answer_text, opts = QuestionBankService._build_options_for_question(db_qtype, q)
            d = _norm_difficulty(q.difficulty)
            item = QuestionBankItem(
                publisher=pub,
                grade=grade,
                subject=subj,
                semester=sem,
                question_type=db_qtype,
                prompt=q.prompt.strip(),
                difficulty=d,
                answer_text=answer_text,
                explanation=None,
                chapter=chap,
                source_type="manual",
                source_id=None,
                created_by=user_id,
                options=opts,
            )
            db.add(item)

        await db.commit()

        set_id = QuestionBankService._compute_set_id(
            subj=subj,
            grade=grade,
            semester_key=semester_key,
            chapter=chap,
            ui_type=ui_type,
        )
        return ManualSetCreatedOut(set_id=set_id, items_created=len(body.questions))

    @staticmethod
    async def delete_manual_set_by_key(
        db: AsyncSession,
        *,
        user_id: int,
        subject: str,
        grade: str,
        semester: str | None,
        chapter: str,
        question_type_ui: str,
    ) -> DeleteSetByKeyOut:
        subj = QuestionBankService._canonical_subject(subject)
        db_types = _UI_TO_DB_TYPES.get(question_type_ui.strip())
        if not db_types:
            raise ValueError(
                f"Invalid question_type: {question_type_ui!r}. "
                f"Use one of: {', '.join(sorted(_UI_TO_DB_TYPES.keys()))}"
            )
        grade_s = grade.strip()

        stmt = select(QuestionBankItem).where(
            QuestionBankItem.subject == subj,
            QuestionBankItem.grade == grade_s,
            QuestionBankService._db_semester_predicate(semester),
            QuestionBankService._db_chapter_predicate(chapter),
            QuestionBankItem.question_type.in_(db_types),
        )
        result = await db.execute(stmt)
        rows = list(result.scalars().all())
        if not rows:
            raise ValueError("No matching question set found")

        if not all(
            (r.source_type or "").strip().lower() == "manual"
            and r.created_by is not None
            and int(r.created_by) == int(user_id)
            for r in rows
        ):
            raise ValueError("You can only delete question sets that you added (manual).")

        ids = [r.id for r in rows]
        try:
            await db.execute(delete(QuestionBankItem).where(QuestionBankItem.id.in_(ids)))
            await db.commit()
        except IntegrityError as e:
            await db.rollback()
            raise ValueError(
                "Some questions in this set are still used elsewhere (e.g. papers or quizzes); cannot delete."
            ) from e

        return DeleteSetByKeyOut(deleted=len(ids))
