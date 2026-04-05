from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.database import SessionLocal, engine
from app.models.assessment import Paper, PaperQuestion, PaperQuestionOption, PaperSection, PaperStatus, QuestionBankItem, QuestionBankOption
from app.models.textbook import Textbook, TextbookSemester


@dataclass(slots=True)
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
    parser.add_argument("--dry-run", action="store_true", help="Validate and print what would be imported.")
    args = parser.parse_args()

    manifest = load_json(args.manifest)
    if not isinstance(manifest, list):
        raise ValueError("Manifest must be a JSON array of source entries.")

    try:
        asyncio.run(
            run_import(
                manifest=manifest,
                manifest_path=args.manifest,
                created_by=args.created_by,
                dry_run=args.dry_run,
            )
        )
    finally:
        # Ensure pooled MySQL connections are closed before loop shutdown.
        asyncio.run(engine.dispose())


async def run_import(*, manifest: list[Any], manifest_path: Path, created_by: int | None, dry_run: bool) -> None:
    summary = ImportSummary()
    for entry in manifest:
        if not isinstance(entry, dict):
            raise ValueError("Each manifest entry must be an object.")

        source_path = Path(entry["path"])
        if not source_path.is_absolute() and not source_path.exists():
            source_path = (manifest_path.parent / source_path).resolve()

        document_type = entry.get("type")
        payload = load_json(source_path)

        if document_type == "textbook":
            await import_textbook(payload=payload, created_by=created_by, dry_run=dry_run, summary=summary)
        elif document_type == "paper":
            await import_paper(payload=payload, created_by=created_by, dry_run=dry_run, summary=summary)
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


async def import_paper(*, payload: dict[str, Any], created_by: int | None, dry_run: bool, summary: ImportSummary) -> None:
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
        if paper is not None:
            print(f"[skip] paper exists: {payload['title']}")
            return

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
        )
        db.add(paper)
        await db.flush()
        summary.papers_created += 1

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


def fit_mysql_text(value: Any, max_len: int = 60000) -> str | None:
    if value is None:
        return None
    text = str(value)
    if len(text) <= max_len:
        return text
    return text[: max_len - 20] + "\n[TRUNCATED_BY_IMPORT]"


if __name__ == "__main__":
    main()