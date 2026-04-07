from __future__ import annotations

import argparse
import json
import random
import re
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch HuggingFace datasets and emit normalized JSON + manifest for import_documents.py."
    )
    parser.add_argument(
        "--datasets",
        nargs="+",
        choices=["arc", "ceval", "gsm8k"],
        default=["arc"],
        help="Datasets to fetch. Default: arc",
    )
    parser.add_argument("--limit", type=int, default=80, help="Max rows per dataset split.")
    parser.add_argument("--split", type=str, default="train", help="HF split name (e.g., train, validation, test).")
    parser.add_argument(
        "--ceval-config",
        type=str,
        default="high_school_biology",
        help="C-Eval subject config, e.g. high_school_biology/computer_network.",
    )
    parser.add_argument("--course-id", type=int, default=1, help="Default course_id in generated paper payload.")
    parser.add_argument(
        "--normalized-dir",
        type=Path,
        default=Path("paper_exapmle/normalized_hf"),
        help="Output folder for generated normalized JSON files.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("paper_exapmle/import_manifest.hf.generated.json"),
        help="Manifest path for import_documents.py",
    )
    parser.add_argument("--seed", type=int, default=5241, help="Random seed used for sampling.")
    parser.add_argument("--dry-run", action="store_true", help="Preview counts only; do not write files.")
    return parser.parse_args()


def load_dataset_or_fail(name: str, config: str | None, split: str):
    try:
        from datasets import load_dataset  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: datasets. Install with `pip install datasets` and retry."
        ) from exc
    return load_dataset(name, config, split=split)


def main() -> None:
    args = parse_args()
    random.seed(args.seed)

    args.normalized_dir.mkdir(parents=True, exist_ok=True)
    manifest_entries: list[dict[str, str]] = []

    total_questions = 0
    for key in args.datasets:
        payload = build_payload_for_dataset(
            dataset_key=key,
            split=args.split,
            limit=args.limit,
            course_id=args.course_id,
            ceval_config=args.ceval_config,
        )
        q_count = len(payload.get("questions", []))
        total_questions += q_count
        filename = f"hf_{key}_{args.split}.json"
        out_path = args.normalized_dir / filename
        rel_path = out_path.relative_to(args.manifest.parent)
        manifest_entries.append({"type": "paper", "path": str(rel_path)})

        if args.dry_run:
            print(f"[dry-run] {key}: questions={q_count}, output={out_path}")
        else:
            with out_path.open("w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            print(f"[write] {key}: questions={q_count}, output={out_path}")

    if args.dry_run:
        print(f"[dry-run] total_questions={total_questions}")
        return

    with args.manifest.open("w", encoding="utf-8") as f:
        json.dump(manifest_entries, f, ensure_ascii=False, indent=2)

    print(f"manifest: {args.manifest}")
    print(f"entries: {len(manifest_entries)}, total_questions={total_questions}")


def build_payload_for_dataset(
    *, dataset_key: str, split: str, limit: int, course_id: int, ceval_config: str
) -> dict[str, Any]:
    if dataset_key == "arc":
        rows = load_dataset_or_fail("allenai/ai2_arc", "ARC-Easy", split=split)
        questions = map_arc_rows(rows=rows, limit=limit)
        return make_paper_payload(
            title=f"HF ARC Easy ({split})",
            subject="Science",
            grade="Unknown",
            exam_type="hf_arc",
            course_id=course_id,
            questions=questions,
        )

    if dataset_key == "ceval":
        ceval_split = split if split in {"test", "val", "dev"} else "test"
        if ceval_split != split:
            print(f"[info] ceval split '{split}' not available, fallback to '{ceval_split}'")
        rows = load_dataset_or_fail("ceval/ceval-exam", ceval_config, split=ceval_split)
        questions = map_ceval_rows(rows=rows, limit=limit)
        return make_paper_payload(
            title=f"HF C-Eval {ceval_config} ({ceval_split})",
            subject="General",
            grade="Unknown",
            exam_type="hf_ceval",
            course_id=course_id,
            questions=questions,
        )

    if dataset_key == "gsm8k":
        rows = load_dataset_or_fail("openai/gsm8k", "main", split=split)
        questions = map_gsm8k_rows(rows=rows, limit=limit)
        return make_paper_payload(
            title=f"HF GSM8K ({split})",
            subject="Mathematics",
            grade="Unknown",
            exam_type="hf_gsm8k",
            course_id=course_id,
            questions=questions,
        )

    raise ValueError(f"Unsupported dataset key: {dataset_key}")


def map_arc_rows(*, rows, limit: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        if len(out) >= limit:
            break
        question = str(row.get("question") or "").strip()
        choices = row.get("choices") or {}
        labels = choices.get("label") or []
        texts = choices.get("text") or []
        answer_key = str(row.get("answerKey") or "").strip().upper()

        options = []
        for label, text in zip(labels, texts):
            key = str(label).strip().upper()
            value = str(text).strip()
            if not key or not value:
                continue
            options.append({"option_key": key, "option_text": value, "is_correct": key == answer_key})

        if not question or not options:
            continue

        out.append(
            {
                "publisher": "huggingface",
                "grade": "Unknown",
                "subject": "Science",
                "semester": None,
                "question_type": "MCQ_SINGLE",
                "prompt": question,
                "difficulty": normalize_difficulty(str(row.get("difficulty") or "")),
                "score": 1,
                "answer_text": answer_key or None,
                "explanation": "Imported from ARC-Easy.",
                "chapter": None,
                "source_type": "hf_arc",
                "source_id": None,
                "options": options,
            }
        )
    return out


def map_ceval_rows(*, rows, limit: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        if len(out) >= limit:
            break

        question = str(row.get("question") or row.get("query") or "").strip()
        answer_key = str(row.get("answer") or "").strip().upper()
        options = []
        for key in ["A", "B", "C", "D"]:
            value = str(row.get(key) or "").strip()
            if not value:
                continue
            options.append({"option_key": key, "option_text": value, "is_correct": key == answer_key})

        if not question or len(options) < 2:
            continue

        subject = str(row.get("subject") or row.get("category") or "General").strip() or "General"
        explanation = row.get("analysis") or row.get("explanation") or "Imported from C-Eval."
        out.append(
            {
                "publisher": "huggingface",
                "grade": "Unknown",
                "subject": subject,
                "semester": None,
                "question_type": "MCQ_SINGLE",
                "prompt": question,
                "difficulty": normalize_difficulty(str(row.get("difficulty") or "")),
                "score": 1,
                "answer_text": answer_key or None,
                "explanation": str(explanation).strip() or "Imported from C-Eval.",
                "chapter": str(row.get("knowledge_point") or "").strip() or None,
                "source_type": "hf_ceval",
                "source_id": None,
                "options": options,
            }
        )
    return out


def map_gsm8k_rows(*, rows, limit: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        if len(out) >= limit:
            break
        question = str(row.get("question") or "").strip()
        answer_raw = str(row.get("answer") or "").strip()
        if not question or not answer_raw:
            continue

        final_answer = extract_gsm8k_final_answer(answer_raw)
        out.append(
            {
                "publisher": "huggingface",
                "grade": "Unknown",
                "subject": "Mathematics",
                "semester": None,
                "question_type": "SHORT_ANSWER",
                "prompt": question,
                "difficulty": "medium",
                "score": 1,
                "answer_text": final_answer,
                "explanation": answer_raw,
                "chapter": None,
                "source_type": "hf_gsm8k",
                "source_id": None,
                "options": [],
            }
        )
    return out


def extract_gsm8k_final_answer(text: str) -> str:
    # GSM8K answers often end with "#### 42"; fall back to full tail if missing.
    m = re.search(r"####\s*(.+)$", text.strip(), flags=re.MULTILINE)
    if m:
        return m.group(1).strip()
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return lines[-1] if lines else text.strip()


def normalize_difficulty(value: str) -> str | None:
    v = value.strip().lower()
    if not v:
        return "medium"
    if v in {"easy", "e", "low"}:
        return "easy"
    if v in {"hard", "h", "high"}:
        return "hard"
    return "medium"


def make_paper_payload(
    *, title: str, subject: str, grade: str, exam_type: str, course_id: int, questions: list[dict[str, Any]]
) -> dict[str, Any]:
    if not questions:
        questions = [
            {
                "publisher": "huggingface",
                "grade": grade,
                "subject": subject,
                "semester": None,
                "question_type": "SHORT_ANSWER",
                "prompt": "[EMPTY_DATASET] Placeholder item",
                "difficulty": "medium",
                "score": 1,
                "answer_text": None,
                "explanation": "No valid rows extracted from dataset.",
                "chapter": None,
                "source_type": "hf_placeholder",
                "source_id": None,
                "options": [],
            }
        ]

    total_score = int(sum(int(q.get("score") or 1) for q in questions))
    return {
        "title": title,
        "course_id": course_id,
        "grade": grade,
        "subject": subject,
        "semester": "vol1",
        "exam_type": exam_type,
        "total_score": max(total_score, 1),
        "duration_min": 60,
        "quality_score": None,
        "sections": [
            {
                "title": "Main",
                "question_type": "MIXED",
                "score_each": 1,
                "total_score": max(total_score, 1),
                "questions": questions,
            }
        ],
        "questions": questions,
    }


if __name__ == "__main__":
    main()
