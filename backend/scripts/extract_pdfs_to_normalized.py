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

    lines = [normalize_ocr_line(ln.strip()) for ln in text.splitlines() if ln.strip()]
    blocks = split_question_blocks(lines)

    questions: list[dict[str, Any]] = []
    if not blocks:
        fragments = re.split(r"[。！？!?]", text)
        prompts = [frag.strip() for frag in fragments if len(frag.strip()) >= 12][:10]
        if not prompts:
            prompts = [text[:300]]
        for idx, prompt in enumerate(prompts, start=1):
            questions.append(placeholder_question(subject=subject, grade=grade, prompt=prompt, idx=idx))
        return questions

    for idx, block in blocks[:80]:
        prompt, options = parse_question_block(block)
        question_type = infer_question_type(prompt=prompt, options=options)

        questions.append(
            {
                "publisher": "unknown",
                "grade": grade,
                "subject": subject,
                "semester": None,
                "question_type": question_type,
                "prompt": prompt,
                "difficulty": "medium",
                "score": extract_score(prompt),
                "answer_text": "TBD",
                "explanation": "TBD",
                "chapter": None,
                "source_type": "paper",
                "source_id": None,
                "options": options,
            }
        )

    apply_answer_keys(questions=questions, answer_tokens=extract_answer_key_tokens(text))

    return questions


def split_question_blocks(lines: list[str]) -> list[tuple[int, list[str]]]:
    blocks: list[tuple[int, list[str]]] = []
    current_num: int | None = None
    current_lines: list[str] = []

    for line in lines:
        match = re.match(r"^(\d{1,3})[\).]\s*(.*)$", line)
        if match:
            if current_num is not None and current_lines:
                blocks.append((current_num, current_lines))
            current_num = int(match.group(1))
            first_line = match.group(2).strip()
            current_lines = [first_line] if first_line else []
            continue

        if current_num is not None:
            current_lines.append(line)

    if current_num is not None and current_lines:
        blocks.append((current_num, current_lines))

    return blocks


def parse_question_block(lines: list[str]) -> tuple[str, list[dict[str, Any]]]:
    stem_lines: list[str] = []
    options: list[dict[str, Any]] = []

    for line in lines:
        inline_options = split_inline_options(line)
        if inline_options:
            for key, text in inline_options:
                options.append({"option_key": key, "option_text": text, "is_correct": None})
            continue

        if options:
            # Option text may wrap onto multiple lines; attach continuation.
            options[-1]["option_text"] = f"{options[-1]['option_text']} {line}".strip()
            continue

        stem_lines.append(line)

    options = dedupe_options(options)

    prompt = " ".join(stem_lines).strip()
    prompt = re.sub(r"\s{2,}", " ", prompt)
    if not prompt:
        prompt = "[UNPARSED_QUESTION]"
    return prompt, options


def split_inline_options(line: str) -> list[tuple[str, str]]:
    matches = list(re.finditer(r"([A-D])[\).]\s*", line))
    if not matches:
        return []

    options: list[tuple[str, str]] = []
    for i, match in enumerate(matches):
        key = match.group(1)
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(line)
        text = line[start:end].strip()
        if text:
            options.append((key, text))
    return options


def dedupe_options(options: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for option in options:
        key = str(option.get("option_key", "")).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(option)
    return unique


def infer_question_type(*, prompt: str, options: list[dict[str, Any]]) -> str:
    low = prompt.lower()

    if options:
        option_texts = " ".join(str(o.get("option_text", "")) for o in options).lower()
        if is_true_false_prompt(prompt=low, option_texts=option_texts):
            return "TRUE_FALSE"
        if "select two" in low or "choose two" in low or "all that apply" in low:
            return "MCQ_MULTI"
        return "MCQ_SINGLE"

    if is_true_false_prompt(prompt=low, option_texts=""):
        return "TRUE_FALSE"
    if "___" in prompt or "____" in prompt or "fill in the blank" in low:
        return "FILL_BLANK"
    if "essay" in low:
        return "ESSAY"
    return "SHORT_ANSWER"


def is_true_false_prompt(*, prompt: str, option_texts: str) -> bool:
    if "true or false" in prompt or "true/false" in prompt or re.search(r"\b(t/f)\b", prompt):
        return True
    tf_signals = [" true ", " false ", "correct", "incorrect"]
    signal_count = sum(1 for s in tf_signals if s in f" {option_texts} ")
    return signal_count >= 2


def extract_answer_key_tokens(text: str) -> list[str]:
    lines = [normalize_ocr_line(ln.strip()) for ln in text.splitlines() if ln.strip()]
    tail = lines[-80:]
    patterns = [
        re.compile(r"^(?:mc|multiple choice|answers?|answer key)\s*[:：]?\s*([A-DFT\s,;/]+)$", re.IGNORECASE),
        re.compile(r"^([A-DFT](?:[\s,;/]+[A-DFT]){2,})$", re.IGNORECASE),
        re.compile(r"^([A-DFT]{3,})$", re.IGNORECASE),
    ]

    tokens: list[str] = []
    for line in tail:
        for pattern in patterns:
            match = pattern.match(line)
            if not match:
                continue
            seq = match.group(1).upper()
            tokens.extend(re.findall(r"[A-DFT]", seq))
            break

    return tokens


def apply_answer_keys(*, questions: list[dict[str, Any]], answer_tokens: list[str]) -> None:
    if not answer_tokens:
        return

    idx = 0
    for question in questions:
        qtype = str(question.get("question_type", "")).upper()
        if qtype not in {"MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE"}:
            continue
        if idx >= len(answer_tokens):
            break

        token = answer_tokens[idx]
        idx += 1
        question["answer_text"] = token

        # Handle compact multi-select keys like "AC".
        answer_set = set(re.findall(r"[A-DFT]", token.upper()))
        if not answer_set:
            answer_set = {token.upper()}

        for option in question.get("options", []):
            key = str(option.get("option_key", "")).strip().upper()
            option["is_correct"] = key in answer_set


def normalize_ocr_line(line: str) -> str:
    # Repair common OCR artifacts like "t he" and "enter s".
    line = re.sub(r"\b([A-Za-z])\s+([A-Za-z]{2,})\b", r"\1\2", line)
    line = re.sub(r"\b([A-Za-z]{2,})\s+([A-Za-z])\b", r"\1\2", line)
    return re.sub(r"\s{2,}", " ", line).strip()


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