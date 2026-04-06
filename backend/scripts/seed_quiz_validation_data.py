from __future__ import annotations

import asyncio
import json
from datetime import datetime

from sqlalchemy import select, text

from app.database import SessionLocal, engine
from app.models.assessment import Paper, PaperStatus, QuestionBankItem, QuestionBankOption
from app.models.course import Course, CourseStatus, Enrollment
from app.models.textbook import Textbook, TextbookSemester
from app.models.user import AccountType, User


SEED_TAG = "seed_qg"


SEQUENCE_TABLES = [
    "users",
    "courses",
    "enrollments",
    "textbooks",
    "papers",
    "question_bank_items",
    "question_bank_options",
]


async def sync_postgres_sequences() -> None:
    """Best-effort fix for environments where sequences lag behind existing max(id)."""
    async with SessionLocal() as db:
        for table_name in SEQUENCE_TABLES:
            try:
                await db.execute(
                    text(
                        "SELECT setval(pg_get_serial_sequence(:table_name, 'id'), "
                        "COALESCE((SELECT MAX(id) FROM " + table_name + "), 0) + 1, false)"
                    ),
                    {"table_name": table_name},
                )
            except Exception:
                # Non-Postgres drivers do not support pg_get_serial_sequence.
                await db.rollback()
                return
        await db.commit()


async def get_or_create_user(*, account_id: str, name: str, account_type: AccountType) -> tuple[User, bool]:
    async with SessionLocal() as db:
        row = await db.execute(select(User).where(User.account_id == account_id))
        existing = row.scalar_one_or_none()
        if existing is not None:
            return existing, False

        user = User(
            account_id=account_id,
            hashed_password="seed",
            name=name,
            account_type=account_type,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user, True


async def get_or_create_course(*, teacher_id: int) -> tuple[Course, bool]:
    async with SessionLocal() as db:
        row = await db.execute(
            select(Course).where(
                Course.name == "Seed QuizGen Biology S3",
                Course.teacher_id == teacher_id,
            )
        )
        existing = row.scalar_one_or_none()
        if existing is not None:
            return existing, False

        course = Course(
            name="Seed QuizGen Biology S3",
            subject="Biology",
            grades=["S3"],
            period="2025-2026 S2",
            room="Online",
            weekdays=["Mon"],
            max_students=50,
            status=CourseStatus.ACTIVE,
            teacher_id=teacher_id,
        )
        db.add(course)
        await db.commit()
        await db.refresh(course)
        return course, True


async def ensure_enrollment(*, student_id: int, course_id: int) -> bool:
    async with SessionLocal() as db:
        row = await db.execute(
            select(Enrollment).where(
                Enrollment.student_id == student_id,
                Enrollment.course_id == course_id,
            )
        )
        existing = row.scalar_one_or_none()
        if existing is not None:
            return False

        db.add(Enrollment(student_id=student_id, course_id=course_id))
        await db.commit()
        return True


async def get_or_create_textbook(*, created_by: int) -> tuple[Textbook, bool]:
    async with SessionLocal() as db:
        row = await db.execute(
            select(Textbook).where(
                Textbook.publisher == "Seed Publisher",
                Textbook.grade == "S3",
                Textbook.subject == "Biology",
                Textbook.semester == TextbookSemester.VOL1,
            )
        )
        existing = row.scalar_one_or_none()
        if existing is not None:
            return existing, False

        textbook = Textbook(
            publisher="Seed Publisher",
            grade="S3",
            subject="Biology",
            semester=TextbookSemester.VOL1,
            content="Seed textbook content for quiz generation validation.",
            created_by=created_by,
        )
        db.add(textbook)
        await db.commit()
        await db.refresh(textbook)
        return textbook, True


async def get_or_create_paper(*, course_id: int, created_by: int) -> tuple[Paper, bool]:
    async with SessionLocal() as db:
        row = await db.execute(select(Paper).where(Paper.title == "Seed QuizGen Paper Mimic"))
        existing = row.scalar_one_or_none()
        if existing is not None:
            return existing, False

        paper = Paper(
            title="Seed QuizGen Paper Mimic",
            course_id=course_id,
            grade="S3",
            subject="Biology",
            semester="S2",
            exam_type="mock",
            total_score=100,
            duration_min=40,
            question_count=6,
            quality_score=90,
            status=PaperStatus.DRAFT,
            created_by=created_by,
            created_at=datetime.utcnow(),
            source_file_name="seed_quizgen.pdf",
        )
        db.add(paper)
        await db.commit()
        await db.refresh(paper)
        return paper, True


async def ensure_bank_item(
    *,
    prompt: str,
    question_type: str,
    difficulty: str,
    source_type: str,
    source_id: int | None,
    chapter: str | None,
    answer_text: str,
    created_by: int,
    options: list[tuple[str, str, bool]] | None,
) -> bool:
    async with SessionLocal() as db:
        row = await db.execute(select(QuestionBankItem).where(QuestionBankItem.prompt == prompt))
        existing = row.scalar_one_or_none()
        if existing is not None:
            return False

        item = QuestionBankItem(
            publisher=SEED_TAG,
            grade="S3",
            subject="Biology",
            semester=None,
            question_type=question_type,
            prompt=prompt,
            difficulty=difficulty,
            answer_text=answer_text,
            explanation="seed",
            chapter=chapter,
            source_type=source_type,
            source_id=source_id,
            created_by=created_by,
            created_at=datetime.utcnow(),
        )
        db.add(item)
        await db.flush()

        for option_key, option_text, is_correct in options or []:
            db.add(
                QuestionBankOption(
                    bank_question_id=item.id,
                    option_key=option_key,
                    option_text=option_text,
                    is_correct=is_correct,
                )
            )

        await db.commit()
        return True


async def seed() -> dict[str, int | str | bool]:
    await sync_postgres_sequences()

    teacher, teacher_created = await get_or_create_user(
        account_id="seed_qg_teacher",
        name="Seed Quiz Teacher",
        account_type=AccountType.TEACHER,
    )
    student, student_created = await get_or_create_user(
        account_id="seed_qg_student",
        name="Seed Quiz Student",
        account_type=AccountType.STUDENT,
    )
    course, course_created = await get_or_create_course(teacher_id=teacher.id)
    enrollment_created = await ensure_enrollment(student_id=student.id, course_id=course.id)
    textbook, textbook_created = await get_or_create_textbook(created_by=teacher.id)
    paper, paper_created = await get_or_create_paper(course_id=course.id, created_by=teacher.id)

    created_bank_items = 0

    textbook_bank_payloads = [
        {
            "prompt": f"[{SEED_TAG}] TB Ch1 MCQ 1",
            "question_type": "MCQ_SINGLE",
            "difficulty": "medium",
            "source_type": "textbook",
            "source_id": textbook.id,
            "chapter": "Chapter 1",
            "answer_text": "A",
            "options": [
                ("A", "Cell membrane", True),
                ("B", "Cell wall", False),
                ("C", "Nucleus", False),
                ("D", "Ribosome", False),
            ],
        },
        {
            "prompt": f"[{SEED_TAG}] TB Ch1 MCQ 2",
            "question_type": "MCQ_SINGLE",
            "difficulty": "medium",
            "source_type": "textbook",
            "source_id": textbook.id,
            "chapter": "Chapter 1",
            "answer_text": "B",
            "options": [
                ("A", "Mitochondria", False),
                ("B", "Chloroplast", True),
                ("C", "Golgi", False),
                ("D", "Lysosome", False),
            ],
        },
        {
            "prompt": f"[{SEED_TAG}] TB Ch1 TRUE_FALSE 1",
            "question_type": "TRUE_FALSE",
            "difficulty": "medium",
            "source_type": "textbook",
            "source_id": textbook.id,
            "chapter": "Chapter 1",
            "answer_text": "T",
            "options": [("T", "True", True), ("F", "False", False)],
        },
        {
            "prompt": f"[{SEED_TAG}] TB Ch1 FILL_BLANK 1",
            "question_type": "FILL_BLANK",
            "difficulty": "medium",
            "source_type": "textbook",
            "source_id": textbook.id,
            "chapter": "Chapter 1",
            "answer_text": "osmosis",
            "options": None,
        },
        {
            "prompt": f"[{SEED_TAG}] TB Ch1 SHORT_ANSWER 1",
            "question_type": "SHORT_ANSWER",
            "difficulty": "medium",
            "source_type": "textbook",
            "source_id": textbook.id,
            "chapter": "Chapter 1",
            "answer_text": "seed answer",
            "options": None,
        },
    ]

    paper_bank_payloads = [
        {
            "prompt": f"[{SEED_TAG}] PAPER MCQ 1",
            "question_type": "MCQ_SINGLE",
            "difficulty": "medium",
            "source_type": "paper",
            "source_id": paper.id,
            "chapter": None,
            "answer_text": "A",
            "options": [
                ("A", "Correct", True),
                ("B", "Wrong", False),
                ("C", "Wrong", False),
                ("D", "Wrong", False),
            ],
        },
        {
            "prompt": f"[{SEED_TAG}] PAPER MCQ 2",
            "question_type": "MCQ_SINGLE",
            "difficulty": "medium",
            "source_type": "paper",
            "source_id": paper.id,
            "chapter": None,
            "answer_text": "C",
            "options": [
                ("A", "Wrong", False),
                ("B", "Wrong", False),
                ("C", "Correct", True),
                ("D", "Wrong", False),
            ],
        },
        {
            "prompt": f"[{SEED_TAG}] PAPER TRUE_FALSE 1",
            "question_type": "TRUE_FALSE",
            "difficulty": "medium",
            "source_type": "paper",
            "source_id": paper.id,
            "chapter": None,
            "answer_text": "F",
            "options": [("T", "True", False), ("F", "False", True)],
        },
        {
            "prompt": f"[{SEED_TAG}] PAPER SHORT_ANSWER 1",
            "question_type": "SHORT_ANSWER",
            "difficulty": "medium",
            "source_type": "paper",
            "source_id": paper.id,
            "chapter": None,
            "answer_text": "seed answer",
            "options": None,
        },
    ]

    for payload in textbook_bank_payloads + paper_bank_payloads:
        created = await ensure_bank_item(
            prompt=payload["prompt"],
            question_type=payload["question_type"],
            difficulty=payload["difficulty"],
            source_type=payload["source_type"],
            source_id=payload["source_id"],
            chapter=payload["chapter"],
            answer_text=payload["answer_text"],
            created_by=teacher.id,
            options=payload["options"],
        )
        if created:
            created_bank_items += 1

    return {
        "seed_tag": SEED_TAG,
        "teacher_id": teacher.id,
        "student_id": student.id,
        "course_id": course.id,
        "textbook_id": textbook.id,
        "source_paper_id": paper.id,
        "teacher_created": teacher_created,
        "student_created": student_created,
        "course_created": course_created,
        "enrollment_created": enrollment_created,
        "textbook_created": textbook_created,
        "paper_created": paper_created,
        "bank_items_created": created_bank_items,
    }


async def amain() -> None:
    try:
        result = await seed()
        print(json.dumps(result, ensure_ascii=True, indent=2))
        print("\nSuggested exports:")
        print(f"export TEACHER_ID={result['teacher_id']}")
        print(f"export STUDENT_ID={result['student_id']}")
        print(f"export TEXTBOOK_ID={result['textbook_id']}")
        print(f"export SOURCE_PAPER_ID={result['source_paper_id']}")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(amain())