from __future__ import annotations

import argparse
import asyncio
import re
from pathlib import Path

from pypdf import PdfReader
from sqlalchemy import delete, select

from app.database import SessionLocal
from app.models.lesson import DeckSource, DeckStatus, LessonDeck, Slide, SlideBlock, SlideBlockType


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import PDF files into lesson_decks/slides/slide_blocks.")
    parser.add_argument(
        "--pdf-dir",
        type=Path,
        default=Path("paper_exapmle"),
        help="Directory containing PDF files to import.",
    )
    parser.add_argument("--teacher-id", type=int, default=1, help="Teacher user id for created decks.")
    parser.add_argument("--subject", type=str, default="Computer Science", help="Default subject.")
    parser.add_argument("--grade", type=str, default=None, help="Optional grade label.")
    parser.add_argument("--max-pdfs", type=int, default=0, help="Import at most N PDFs (0 = all).")
    parser.add_argument(
        "--on-conflict",
        choices=["rebuild", "skip"],
        default="rebuild",
        help="When same title deck exists for teacher: rebuild or skip.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview import plan without writing.")
    return parser.parse_args()


def normalize_text(text: str) -> str:
    text = text.replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def split_to_blocks(page_text: str, max_lines: int = 8) -> list[str]:
    lines = [ln.strip() for ln in page_text.splitlines() if ln.strip()]
    if not lines:
        return []
    chunks: list[str] = []
    for i in range(0, len(lines), max_lines):
        chunk = "\n".join(lines[i : i + max_lines]).strip()
        if chunk:
            chunks.append(chunk)
    return chunks


def page_title(page_text: str) -> str | None:
    for ln in page_text.splitlines():
        s = ln.strip()
        if len(s) >= 4:
            return s[:200]
    return None


async def import_single_pdf(
    *,
    pdf_path: Path,
    teacher_id: int,
    subject: str,
    grade: str | None,
    on_conflict: str,
    dry_run: bool,
) -> tuple[int, int]:
    reader = PdfReader(str(pdf_path))
    pages_text: list[str] = [normalize_text(page.extract_text() or "") for page in reader.pages]

    deck_title = pdf_path.stem
    if dry_run:
        slide_count = len(pages_text)
        block_count = sum(max(1, len(split_to_blocks(text))) for text in pages_text)
        print(f"[dry-run] deck={deck_title!r} slides={slide_count} blocks={block_count}")
        return slide_count, block_count

    async with SessionLocal() as db:
        existing = (
            await db.execute(
                select(LessonDeck).where(
                    LessonDeck.teacher_id == teacher_id,
                    LessonDeck.title == deck_title,
                )
            )
        ).scalar_one_or_none()

        if existing is not None and on_conflict == "skip":
            print(f"[skip] deck exists: {deck_title}")
            return 0, 0

        if existing is None:
            deck = LessonDeck(
                title=deck_title,
                subject=subject,
                grade=grade,
                deck_source=DeckSource.PPT_IMPORT,
                status=DeckStatus.DRAFT,
                teacher_id=teacher_id,
                thumbnail=None,
                metadata_json={
                    "source_file_name": pdf_path.name,
                    "source_type": "pdf",
                },
            )
            db.add(deck)
            await db.flush()
        else:
            deck = existing
            deck.subject = subject
            deck.grade = grade
            deck.deck_source = DeckSource.PPT_IMPORT
            deck.status = DeckStatus.DRAFT
            deck.metadata_json = {
                "source_file_name": pdf_path.name,
                "source_type": "pdf",
            }
            slide_ids = (
                await db.execute(select(Slide.id).where(Slide.deck_id == deck.id).order_by(Slide.id))
            ).scalars().all()
            if slide_ids:
                await db.execute(delete(SlideBlock).where(SlideBlock.slide_id.in_(slide_ids)))
            await db.execute(delete(Slide).where(Slide.deck_id == deck.id))
            print(f"[rebuild] deck refreshed: {deck_title}")

        total_blocks = 0
        for idx, text in enumerate(pages_text, start=1):
            title = page_title(text) or f"Slide {idx}"
            slide = Slide(deck_id=deck.id, title=title, order_num=idx)
            db.add(slide)
            await db.flush()

            chunks = split_to_blocks(text)
            if not chunks:
                chunks = ["[EMPTY_PAGE_TEXT]"]

            for block_idx, chunk in enumerate(chunks, start=1):
                db.add(
                    SlideBlock(
                        slide_id=slide.id,
                        block_type=SlideBlockType.TEXT,
                        content=chunk,
                        extra_payload=None,
                        order_num=block_idx,
                    )
                )
                total_blocks += 1

        await db.commit()
        print(f"[ok] deck={deck_title!r} slides={len(pages_text)} blocks={total_blocks}")
        return len(pages_text), total_blocks


async def run() -> None:
    args = parse_args()
    if not args.pdf_dir.exists():
        raise SystemExit(f"Missing directory: {args.pdf_dir}")

    pdf_paths = sorted(args.pdf_dir.glob("*.pdf"))
    if args.max_pdfs > 0:
        pdf_paths = pdf_paths[: args.max_pdfs]
    if not pdf_paths:
        raise SystemExit(f"No PDFs found in: {args.pdf_dir}")

    total_slides = 0
    total_blocks = 0
    for pdf_path in pdf_paths:
        slides, blocks = await import_single_pdf(
            pdf_path=pdf_path,
            teacher_id=args.teacher_id,
            subject=args.subject,
            grade=args.grade,
            on_conflict=args.on_conflict,
            dry_run=args.dry_run,
        )
        total_slides += slides
        total_blocks += blocks

    print(f"done: pdfs={len(pdf_paths)} slides={total_slides} blocks={total_blocks}")


if __name__ == "__main__":
    asyncio.run(run())
