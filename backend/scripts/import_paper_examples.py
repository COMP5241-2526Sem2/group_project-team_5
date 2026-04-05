"""
Import PDFs from paper_exapmle/ into the papers table (metadata + optional BYTEA).

Run from backend/ with the same .env as the app (Supabase or SQLite):

  python scripts/import_paper_examples.py
  python scripts/import_paper_examples.py --dry-run
  python scripts/import_paper_examples.py --no-binary   # metadata only, smaller DB

Requires: alembic upgrade head (including migration that adds source_file_name / source_pdf).
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
PAPER_DIR = BACKEND_ROOT / "paper_exapmle"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select

from app.database import SessionLocal
from app.models.assessment import Paper, PaperStatus


def _guess_subject(name: str) -> str:
    lower = name.lower()
    if "bio" in lower or "biology" in lower:
        return "Biology"
    if "physics" in lower or "phys" in lower:
        return "Physics"
    if "econ" in lower:
        return "Economics"
    if "chem" in lower:
        return "Chemistry"
    return "General"


async def run(*, dry_run: bool, include_binary: bool) -> None:
    if not PAPER_DIR.is_dir():
        raise SystemExit(f"Missing folder: {PAPER_DIR}")

    pdfs = sorted(PAPER_DIR.glob("*.pdf"))
    if not pdfs:
        raise SystemExit(f"No PDF files in {PAPER_DIR}")

    async with SessionLocal() as session:
        for pdf in pdfs:
            name = pdf.name
            result = await session.execute(select(Paper.id).where(Paper.source_file_name == name))
            if result.scalar_one_or_none() is not None:
                print(f"skip (exists): {name}")
                continue

            payload = pdf.read_bytes() if include_binary else None

            paper = Paper(
                title=pdf.stem,
                course_id=1,
                grade="import",
                subject=_guess_subject(name),
                semester=None,
                exam_type="pdf_import",
                total_score=0,
                duration_min=0,
                question_count=0,
                quality_score=None,
                status=PaperStatus.DRAFT,
                created_by=1,
                source_file_name=name,
                source_pdf=payload,
            )
            session.add(paper)
            size = len(payload) if payload else 0
            print(f"add: {name} ({size} bytes)" + (" [dry-run]" if dry_run else ""))

        if dry_run:
            await session.rollback()
        else:
            await session.commit()
            print("committed.")


def main() -> None:
    p = argparse.ArgumentParser(description="Import paper_exapmle PDFs into papers table.")
    p.add_argument("--dry-run", action="store_true", help="Print actions only, no DB writes.")
    p.add_argument("--no-binary", action="store_true", help="Store filename/title only; omit PDF bytes.")
    args = p.parse_args()
    asyncio.run(run(dry_run=args.dry_run, include_binary=not args.no_binary))


if __name__ == "__main__":
    main()
