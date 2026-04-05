from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from pypdf import PdfReader


PAPER_KEYWORDS = ["paper", "mid term", "midterm", "mock", "qp", "p2"]
TEXTBOOK_KEYWORDS = ["textbook", "chapter", "ch."]
EXERCISE_KEYWORDS = ["exercise", "supplementary", "notes"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract PDFs into normalized JSON payloads for DB import.")
    parser.add_argument("--pdf-dir", type=Path, default=Path("paper_exapmle"), help="Directory containing source PDFs")
    parser.add_argument(
        "--normalized-dir",
        type=Path,
        default=Path("paper_exapmle/normalized"),
        help="Directory to write normalized JSON files",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("paper_exapmle/import_manifest.generated.json"),
        help="Path to write generated import manifest",
    )
    parser.add_argument("--course-id", type=int, default=1, help="Default course_id for imported papers")
    args = parser.parse_args()

    args.normalized_dir.mkdir(parents=True, exist_ok=True)

    entries: list[dict[str, str]] = []
    pdf_paths = sorted(args.pdf_dir.glob("*.pdf"))
    for pdf_path in pdf_paths:
        category = classify(pdf_path.name)
        text = extract_text(pdf_path)
        target_path = args.normalized_dir / f"{pdf_path.stem}.json"

        if category == "paper":
            payload = build_paper_payload(pdf_path.name, text, course_id=args.course_id)
            doc_type = "paper"
        else:
            payload = build_textbook_payload(pdf_path.name, text)
            doc_type = "textbook"

        with target_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)

        relative_target = target_path.relative_to(args.manifest.parent)
        entries.append({"type": doc_type, "path": str(relative_target)})

    with args.manifest.open("w", encoding="utf-8") as handle:
        json.dump(entries, handle, ensure_ascii=False, indent=2)

    print(f"Processed PDFs: {len(pdf_paths)}")
    print(f"Normalized output: {args.normalized_dir}")
    print(f"Manifest: {args.manifest}")


def classify(filename: str) -> str:
    low = filename.lower()
    if any(k in low for k in PAPER_KEYWORDS):
        return "paper"
    if any(k in low for k in EXERCISE_KEYWORDS):
        return "paper"
    if any(k in low for k in TEXTBOOK_KEYWORDS):
        return "textbook"
    return "paper"


def extract_text(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    text = "\n".join(pages)
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def build_textbook_payload(filename: str, text: str) -> dict[str, Any]:
    subject = infer_subject(filename, text)
    grade = infer_grade(filename, text)
    semester = infer_semester(filename, text)
    publisher = infer_publisher(text)
    content = text if text else f"[NO_TEXT_EXTRACTED] {filename}"
    return {
        "publisher": publisher,
        "grade": grade,
        "subject": subject,
        "semester": semester,
        "content": content,
    }


def build_paper_payload(filename: str, text: str, *, course_id: int) -> dict[str, Any]:
    subject = infer_subject(filename, text)
    grade = infer_grade(filename, text)
    semester = infer_semester(filename, text)

    questions = parse_questions(text, subject=subject, grade=grade)
    total_score = int(sum(q["score"] for q in questions))
    if total_score <= 0:
        total_score = max(1, len(questions))

    paper_type = infer_exam_type(filename)

    return {
        "title": Path(filename).stem,
        "course_id": course_id,
        "grade": grade,
        "subject": subject,
        "semester": semester,
        "exam_type": paper_type,
        "total_score": total_score,
        "duration_min": 60,
        "quality_score": None,
        "sections": [
            {
                "title": "Main",
                "question_type": "MIXED",
                "score_each": 1,
                "total_score": total_score,
                "questions": questions,
            }
        ],
        "questions": questions,
    }


def parse_questions(text: str, *, subject: str, grade: str) -> list[dict[str, Any]]:
    if not text:
        return [placeholder_question(subject=subject, grade=grade, prompt="[NO_TEXT_EXTRACTED] Placeholder question")]

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    numbered: list[tuple[int, str]] = []
    for line in lines:
        match = re.match(r"^(\d{1,3})[\).]\s*(.+)$", line)
        if match:
            numbered.append((int(match.group(1)), match.group(2).strip()))

    questions: list[dict[str, Any]] = []
    if not numbered:
        fragments = re.split(r"[。！？!?]", text)
        prompts = [frag.strip() for frag in fragments if len(frag.strip()) >= 12][:10]
        if not prompts:
            prompts = [text[:300]]
        for idx, prompt in enumerate(prompts, start=1):
            questions.append(placeholder_question(subject=subject, grade=grade, prompt=prompt, idx=idx))
        return questions

    for idx, prompt in numbered[:80]:
        questions.append(
            {
                "publisher": "unknown",
                "grade": grade,
                "subject": subject,
                "semester": None,
                "question_type": "SHORT_ANSWER",
                "prompt": prompt,
                "difficulty": "medium",
                "score": extract_score(prompt),
                "answer_text": "TBD",
                "explanation": "TBD",
                "chapter": None,
                "source_type": "paper",
                "source_id": None,
                "options": [],
            }
        )

    return questions


def placeholder_question(*, subject: str, grade: str, prompt: str, idx: int = 1) -> dict[str, Any]:
    return {
        "publisher": "unknown",
        "grade": grade,
        "subject": subject,
        "semester": None,
        "question_type": "SHORT_ANSWER",
        "prompt": f"Q{idx}. {prompt}"[:500],
        "difficulty": "medium",
        "score": 1,
        "answer_text": "TBD",
        "explanation": "TBD",
        "chapter": None,
        "source_type": "paper",
        "source_id": None,
        "options": [],
    }


def extract_score(prompt: str) -> int:
    m = re.search(r"(\d{1,3})\s*(?:marks?|分)", prompt, flags=re.IGNORECASE)
    if not m:
        return 1
    try:
        v = int(m.group(1))
        return v if v > 0 else 1
    except ValueError:
        return 1


def infer_subject(filename: str, text: str) -> str:
    low = f"{filename}\n{text}".lower()
    if "bio" in low or "biology" in low:
        return "Biology"
    if "physics" in low:
        return "Physics"
    if "economics" in low or "econ" in low:
        return "Economics"
    if "chem" in low:
        return "Chemistry"
    if "math" in low:
        return "Mathematics"
    return "General"


def infer_grade(filename: str, text: str) -> str:
    joined = f"{filename} {text}"
    m = re.search(r"\bS\s?(\d)\b", joined, flags=re.IGNORECASE)
    if m:
        return f"S{m.group(1)}"
    m = re.search(r"Form\s+(\w+)", joined, flags=re.IGNORECASE)
    if m:
        return f"Form {m.group(1)}"
    return "Unknown"


def infer_semester(filename: str, text: str) -> str:
    low = f"{filename}\n{text}".lower()
    if "vol2" in low or "semester 2" in low or "term 2" in low:
        return "vol2"
    return "vol1"


def infer_exam_type(filename: str) -> str:
    low = filename.lower()
    if "mid" in low:
        return "midterm"
    if "mock" in low:
        return "mock"
    if "final" in low:
        return "final"
    return "paper"


def infer_publisher(text: str) -> str:
    if not text:
        return "unknown"
    head = " ".join(text.splitlines()[:8])
    m = re.search(r"Publisher[:\s]+([A-Za-z0-9 &\-\.]{2,60})", head, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return "unknown"


if __name__ == "__main__":
    main()