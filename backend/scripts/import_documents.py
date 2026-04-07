from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, select

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal, engine
from app.models.assessment import Paper, PaperQuestion, PaperQuestionOption, PaperSection, PaperStatus, QuestionBankItem, QuestionBankOption
from app.models.textbook import Textbook, TextbookSemester


@dataclass
class ImportSummary:
    textbooks_created: int = 0
    papers_created: int = 0
    sections_created: int = 0
    questions_created: int = 0
    options_created: int = 0
    bank_items_created: int = 0
    bank_options_created: int = 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Import textbooks and papers from normalized JSON files.")
    parser.add_argument("manifest", type=Path, help="Path to a JSON manifest that lists source files and types.")
    parser.add_argument("--created-by", type=int, default=None, help="Optional creator user id for imported records.")
    parser.add_argument(
        "--on-conflict",
        choices=["rebuild", "skip"],
        default="rebuild",
        help="When paper title already exists: rebuild (default) or skip.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate and print what would be imported.")
    args = parser.parse_args()

    manifest = load_json(args.manifest)
    if not isinstance(manifest, list):
        raise ValueError("Manifest must be a JSON array of source entries.")

    asyncio.run(
        run_import_with_cleanup(
            manifest=manifest,
            manifest_path=args.manifest,
            created_by=args.created_by,
            dry_run=args.dry_run,
            on_conflict=args.on_conflict,
        )
    )


async def run_import_with_cleanup(
    *, manifest: list[Any], manifest_path: Path, created_by: int | None, dry_run: bool, on_conflict: str
) -> None:
    try:
        await run_import(
            manifest=manifest,
            manifest_path=manifest_path,
            created_by=created_by,
            dry_run=dry_run,
            on_conflict=on_conflict,
        )
    finally:
        # Dispose engine in the same event loop used by the import.
        await engine.dispose()


async def run_import(
    *, manifest: list[Any], manifest_path: Path, created_by: int | None, dry_run: bool, on_conflict: str
) -> None:
    summary = ImportSummary()
    for entry in manifest:
        if not isinstance(entry, dict):
            raise ValueError("Each manifest entry must be an object.")

        source_path = Path(entry["path"])
        if not source_path.is_absolute() and not source_path.exists():
            source_path = (manifest_path.parent / source_path).resolve()

        document_type = entry.get("type")
        payload = load_json(source_path)
        source_pdf_path = infer_source_pdf_path(
            source_json_path=source_path,
            manifest_path=manifest_path,
            entry=entry,
        )

        if document_type == "textbook":
            await import_textbook(payload=payload, created_by=created_by, dry_run=dry_run, summary=summary)
        elif document_type == "paper":
            await import_paper(
                payload=payload,
                created_by=created_by,
                dry_run=dry_run,
                summary=summary,
                source_pdf_path=source_pdf_path,
                on_conflict=on_conflict,
            )
        else:
            raise ValueError(f"Unsupported document type: {document_type!r}")

    print(summary)


async def import_textbook(*, payload: dict[str, Any], created_by: int | None, dry_run: bool, summary: ImportSummary) -> None:
    ensure_required_fields(payload, ["publisher", "grade", "subject", "semester", "content"], context="textbook")
    semester = TextbookSemester(payload["semester"])

    if dry_run:
        summary.textbooks_created += 1
        print(f"[dry-run] textbook: {payload['publisher']} / {payload['grade']} / {payload['subject']} / {semester.value}")
        return

    async with SessionLocal() as db:
        result = await db.execute(
            select(Textbook).where(
                Textbook.publisher == payload["publisher"],
                Textbook.grade == payload["grade"],
                Textbook.subject == payload["subject"],
                Textbook.semester == semester,
            )
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            print(
                f"[skip] textbook exists: {payload['publisher']} / {payload['grade']} / {payload['subject']} / {semester.value}"
            )
            return

        db.add(
            Textbook(
                publisher=payload["publisher"],
                grade=payload["grade"],
                subject=payload["subject"],
                semester=semester,
                content=fit_mysql_text(payload["content"]),
                created_by=created_by,
            )
        )
        await db.commit()
        summary.textbooks_created += 1


async def import_paper(
    *,
    payload: dict[str, Any],
    created_by: int | None,
    dry_run: bool,
    summary: ImportSummary,
    source_pdf_path: Path | None,
    on_conflict: str,
) -> None:
    ensure_required_fields(
        payload,
        ["title", "course_id", "grade", "subject", "exam_type", "total_score", "duration_min", "questions"],
        context="paper",
    )

    questions = payload["questions"]
    if not isinstance(questions, list) or not questions:
        raise ValueError("paper.questions must be a non-empty array")

    if dry_run:
        summary.papers_created += 1
        summary.sections_created += len(payload.get("sections", []))
        summary.questions_created += len(questions)
        for question in questions:
            summary.options_created += len(question.get("options", []))
            summary.bank_items_created += 1
            summary.bank_options_created += len(question.get("options", []))
        print(f"[dry-run] paper: {payload['title']}")
        return

    async with SessionLocal() as db:
        result = await db.execute(select(Paper).where(Paper.title == payload["title"]))
        paper = result.scalar_one_or_none()
        source_file_name = payload.get("source_file_name")
        if source_pdf_path and source_pdf_path.exists():
            source_file_name = source_pdf_path.name

        if paper is None:
            paper = Paper(
                title=payload["title"],
                course_id=payload["course_id"],
                grade=payload["grade"],
                subject=payload["subject"],
                semester=payload.get("semester"),
                exam_type=payload["exam_type"],
                total_score=payload["total_score"],
                duration_min=payload["duration_min"],
                question_count=len(questions),
                quality_score=payload.get("quality_score"),
                status=PaperStatus.DRAFT,
                created_by=created_by or 1,
                created_at=datetime.utcnow(),
                source_file_name=source_file_name,
                source_pdf=None,
            )
            db.add(paper)
            await db.flush()
            summary.papers_created += 1
        else:
            if on_conflict == "skip":
                print(f"[skip] paper exists: {payload['title']}")
                return

            paper.course_id = payload["course_id"]
            paper.grade = payload["grade"]
            paper.subject = payload["subject"]
            paper.semester = payload.get("semester")
            paper.exam_type = payload["exam_type"]
            paper.total_score = payload["total_score"]
            paper.duration_min = payload["duration_min"]
            paper.question_count = len(questions)
            paper.quality_score = payload.get("quality_score")
            paper.status = PaperStatus.DRAFT
            if source_file_name:
                paper.source_file_name = source_file_name
            paper.source_pdf = None

            # Rebuild sections/questions to apply improved parsing results.
            await db.execute(delete(PaperQuestion).where(PaperQuestion.paper_id == paper.id))
            await db.execute(delete(PaperSection).where(PaperSection.paper_id == paper.id))
            print(f"[rebuild] paper content refreshed: {payload['title']}")

        sections_payload = payload.get("sections") or [
            {"title": "Main", "question_type": "MCQ_SINGLE", "questions": questions}
        ]

        order_num = 1
        for section_index, section_payload in enumerate(sections_payload, start=1):
            section_questions = section_payload.get("questions", [])
            section = PaperSection(
                paper_id=paper.id,
                title=section_payload.get("title", f"Section {section_index}"),
                section_order=section_index,
                question_type=section_payload.get("question_type", "MCQ_SINGLE"),
                question_count=len(section_questions),
                score_each=section_payload.get("score_each", 0),
                total_score=section_payload.get("total_score", 0),
            )
            db.add(section)
            await db.flush()
            summary.sections_created += 1

            for question_payload in section_questions:
                question_payload = dict(question_payload)
                question_payload["source_type"] = question_payload.get("source_type") or "paper"
                if question_payload["source_type"] == "paper":
                    question_payload["source_id"] = paper.id
                question_payload["options"] = dedupe_option_payloads(question_payload.get("options", []))

                bank_item = await find_or_create_bank_item(
                    db=db, question_payload=question_payload, created_by=created_by, summary=summary
                )

                question = PaperQuestion(
                    paper_id=paper.id,
                    section_id=section.id,
                    order_num=order_num,
                    question_type=question_payload["question_type"],
                    prompt=fit_mysql_text(question_payload["prompt"]),
                    difficulty=question_payload.get("difficulty"),
                    score=question_payload["score"],
                    bank_question_id=bank_item.id,
                    answer_text=fit_mysql_text(question_payload.get("answer_text")),
                    explanation=fit_mysql_text(question_payload.get("explanation")),
                    chapter=fit_mysql_text(question_payload.get("chapter")),
                )
                db.add(question)
                await db.flush()
                summary.questions_created += 1

                for option_payload in question_payload.get("options", []):
                    db.add(
                        PaperQuestionOption(
                            question_id=question.id,
                            option_key=option_payload["option_key"],
                            option_text=fit_mysql_text(option_payload["option_text"]),
                            is_correct=option_payload.get("is_correct"),
                        )
                    )
                    summary.options_created += 1

                order_num += 1

        await db.commit()


async def find_or_create_bank_item(
    *, db, question_payload: dict[str, Any], created_by: int | None, summary: ImportSummary
) -> QuestionBankItem:
    ensure_required_fields(
        question_payload,
        ["grade", "subject", "question_type", "prompt", "source_type"],
        context="question",
    )

    normalized_type, normalized_answer = normalize_objective_fields(
        question_type=str(question_payload.get("question_type", "")),
        answer_text=question_payload.get("answer_text"),
        options=question_payload.get("options", []),
    )
    question_payload["question_type"] = normalized_type
    question_payload["answer_text"] = normalized_answer

    result = await db.execute(
        select(QuestionBankItem).where(
            QuestionBankItem.grade == question_payload["grade"],
            QuestionBankItem.subject == question_payload["subject"],
            QuestionBankItem.question_type == question_payload["question_type"],
            QuestionBankItem.prompt == question_payload["prompt"],
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        incoming_source_id = question_payload.get("source_id")
        if (
            existing.source_type == "paper"
            and incoming_source_id is not None
            and existing.source_id is None
        ):
            existing.source_id = incoming_source_id

        if existing.question_type == "SHORT_ANSWER" and question_payload["question_type"] != "SHORT_ANSWER":
            existing.question_type = question_payload["question_type"]

        incoming_answer = fit_mysql_text(question_payload.get("answer_text"))
        if incoming_answer and incoming_answer != "TBD":
            existing.answer_text = incoming_answer

        if existing.question_type in {"MCQ_SINGLE", "MCQ_MULTI"} and question_payload.get("options"):
            normalized_existing_type, derived_answer = normalize_objective_fields(
                question_type=existing.question_type,
                answer_text=existing.answer_text,
                options=question_payload.get("options", []),
            )
            existing.question_type = normalized_existing_type
            if derived_answer and derived_answer != "TBD":
                existing.answer_text = fit_mysql_text(derived_answer)

        option_count = await db.scalar(
            select(func.count()).select_from(QuestionBankOption).where(QuestionBankOption.bank_question_id == existing.id)
        )
        if (option_count or 0) == 0 and question_payload.get("options"):
            for option_payload in dedupe_option_payloads(question_payload.get("options", [])):
                db.add(
                    QuestionBankOption(
                        bank_question_id=existing.id,
                        option_key=option_payload["option_key"],
                        option_text=fit_mysql_text(option_payload["option_text"]),
                        is_correct=option_payload.get("is_correct"),
                    )
                )
                summary.bank_options_created += 1
        elif question_payload.get("options"):
            rows = await db.execute(
                select(QuestionBankOption).where(QuestionBankOption.bank_question_id == existing.id)
            )
            by_key = {
                str(option.option_key).strip().upper(): option
                for option in rows.scalars().all()
            }
            for option_payload in dedupe_option_payloads(question_payload.get("options", [])):
                key = str(option_payload.get("option_key", "")).strip().upper()
                if not key or key not in by_key:
                    continue
                row = by_key[key]
                row.option_text = fit_mysql_text(option_payload.get("option_text"))
                row.is_correct = option_payload.get("is_correct")

        return existing

    bank_item = QuestionBankItem(
        publisher=question_payload.get("publisher"),
        grade=question_payload["grade"],
        subject=question_payload["subject"],
        semester=question_payload.get("semester"),
        question_type=question_payload["question_type"],
        prompt=fit_mysql_text(question_payload["prompt"]),
        difficulty=question_payload.get("difficulty"),
        answer_text=fit_mysql_text(question_payload.get("answer_text")),
        explanation=fit_mysql_text(question_payload.get("explanation")),
        chapter=fit_mysql_text(question_payload.get("chapter")),
        source_type=question_payload["source_type"],
        source_id=question_payload.get("source_id"),
        created_by=created_by,
        created_at=datetime.utcnow(),
    )
    db.add(bank_item)
    await db.flush()
    summary.bank_items_created += 1

    for option_payload in question_payload.get("options", []):
        db.add(
            QuestionBankOption(
                bank_question_id=bank_item.id,
                option_key=option_payload["option_key"],
                option_text=fit_mysql_text(option_payload["option_text"]),
                is_correct=option_payload.get("is_correct"),
            )
        )
        summary.bank_options_created += 1

    return bank_item


def ensure_required_fields(payload: dict[str, Any], fields: list[str], *, context: str) -> None:
    missing = [field for field in fields if field not in payload or payload[field] in (None, "")]
    if missing:
        raise ValueError(f"{context} payload missing required fields: {', '.join(missing)}")


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def infer_source_pdf_path(*, source_json_path: Path, manifest_path: Path, entry: dict[str, Any]) -> Path | None:
    if entry.get("source_pdf"):
        candidate = Path(str(entry["source_pdf"]))
        if not candidate.is_absolute():
            candidate = (manifest_path.parent / candidate).resolve()
        return candidate if candidate.exists() else None

    candidate_names = [
        f"{source_json_path.stem}.pdf",
        str(entry.get("source_file_name", "")).strip(),
    ]
    candidate_names = [name for name in candidate_names if name]

    roots = [manifest_path.parent]
    if source_json_path.parent.name == "normalized":
        roots.append(source_json_path.parent.parent)

    for root in roots:
        for name in candidate_names:
            candidate = (root / name).resolve()
            if candidate.exists() and candidate.is_file():
                return candidate
    return None


def fit_mysql_text(value: Any, max_len: int = 60000) -> str | None:
    if value is None:
        return None
    text = str(value)
    if len(text) <= max_len:
        return text
    return text[: max_len - 20] + "\n[TRUNCATED_BY_IMPORT]"


def dedupe_option_payloads(options: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for option in options:
        key = str(option.get("option_key", "")).strip()
        text = str(option.get("option_text", "")).strip()
        if not key or not text or key in seen:
            continue
        seen.add(key)
        unique.append(option)
    return unique


def normalize_objective_fields(
    *,
    question_type: str,
    answer_text: Any,
    options: list[dict[str, Any]] | None,
) -> tuple[str, str | None]:
    qtype = str(question_type or "").strip().upper()
    if qtype not in {"MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE"}:
        return qtype or "SHORT_ANSWER", fit_mysql_text(answer_text)

    option_rows = options or []
    correct_keys = [
        str(opt.get("option_key", "")).strip().upper()
        for opt in option_rows
        if bool(opt.get("is_correct"))
    ]
    correct_keys = [k for k in correct_keys if k]

    normalized_answer = fit_mysql_text(answer_text)
    if correct_keys:
        normalized_answer = ",".join(correct_keys)
        if len(correct_keys) > 1 and qtype == "MCQ_SINGLE":
            qtype = "MCQ_MULTI"
        elif len(correct_keys) == 1 and qtype == "MCQ_MULTI":
            qtype = "MCQ_SINGLE"

    return qtype, normalized_answer


if __name__ == "__main__":
    main()