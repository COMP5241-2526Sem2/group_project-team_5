from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal, engine


SCHEMA_PATH = Path(__file__).resolve().parent / "sql" / "20260407_ai_cleaning_output_schema.json"
DEFAULT_CLEAN_VERSION = "ai_clean_v1"


@dataclass
class RunStats:
    scanned: int = 0
    llm_called: int = 0
    updated: int = 0
    skipped_low_confidence: int = 0
    skipped_invalid_schema: int = 0
    failed: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="AI-clean question text fields for question_bank_items and paper_questions."
    )
    parser.add_argument(
        "--table",
        choices=["question_bank_items", "paper_questions", "both"],
        default="both",
        help="Which table to process.",
    )
    parser.add_argument("--batch-size", type=int, default=50, help="Number of rows per fetch batch.")
    parser.add_argument("--max-rows", type=int, default=0, help="Max rows to process (0 means no limit).")
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.85,
        help="Only write AI output when clean_confidence >= this threshold.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-process rows even if they already have clean_version starting with 'ai_'.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Call LLM and validate, but do not write back.")
    parser.add_argument(
        "--clean-version",
        default=DEFAULT_CLEAN_VERSION,
        help="Version tag written to clean_version field for successful AI updates.",
    )
    return parser.parse_args()


def build_client() -> AsyncOpenAI:
    if not settings.ohmygpt_api_key.strip():
        raise RuntimeError("OHMYGPT_API_KEY/GPT_API_KEY is required for AI cleaning.")
    return AsyncOpenAI(
        api_key=settings.ohmygpt_api_key,
        base_url=settings.ohmygpt_base_url,
        timeout=settings.quiz_generation_timeout_sec,
    )


def build_messages(row: dict[str, Any], table_name: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are a data cleaning assistant for education question data. "
                "Return strict JSON only with keys: normalized_prompt, normalized_answer_text, "
                "normalized_explanation, normalized_chapter, normalized_difficulty, clean_confidence, clean_version. "
                "For normalized_difficulty only use easy|medium|hard|null. "
                "Do not invent facts; prefer conservative edits."
            ),
        },
        {
            "role": "user",
            "content": (
                f"table={table_name}\n"
                f"id={row['id']}\n"
                f"grade={row.get('grade') or ''}\n"
                f"subject={row.get('subject') or ''}\n"
                f"question_type={row.get('question_type') or ''}\n"
                f"prompt={row.get('prompt') or ''}\n"
                f"answer_text={row.get('answer_text') or ''}\n"
                f"explanation={row.get('explanation') or ''}\n"
                f"chapter={row.get('chapter') or ''}\n"
                f"difficulty={row.get('difficulty') or ''}\n"
                "Rules:\n"
                "1) Keep semantics unchanged, clean wording only.\n"
                "2) normalized_prompt should be concise and grammatically correct.\n"
                "3) If a field is effectively empty, return null.\n"
                "4) clean_confidence must be between 0 and 1.\n"
                "5) clean_version can be a placeholder; caller will override it.\n"
            ),
        },
    ]


def token_limit_kwargs(*, model: str, max_tokens: int = 900) -> dict[str, int]:
    name = (model or "").strip().lower()
    if name.startswith("gpt-5") or name.startswith("o"):
        return {"max_completion_tokens": max_tokens}
    return {"max_tokens": max_tokens}


def load_schema(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def validate_against_schema(payload: dict[str, Any], schema: dict[str, Any]) -> tuple[bool, str | None]:
    required = schema.get("required", [])
    properties = schema.get("properties", {})
    additional = schema.get("additionalProperties", True)

    for key in required:
        if key not in payload:
            return False, f"missing required key: {key}"

    if not additional:
        extra = [k for k in payload.keys() if k not in properties]
        if extra:
            return False, f"unexpected keys: {extra}"

    for key, rules in properties.items():
        if key not in payload:
            continue
        value = payload[key]
        types = rules.get("type")
        if types is not None:
            allowed_types = types if isinstance(types, list) else [types]
            if not _value_matches_types(value, allowed_types):
                return False, f"type mismatch for {key}: got {type(value).__name__}"
        if "enum" in rules and value not in rules["enum"]:
            return False, f"enum mismatch for {key}: {value!r}"
        if isinstance(value, str):
            min_len = rules.get("minLength")
            max_len = rules.get("maxLength")
            if min_len is not None and len(value) < min_len:
                return False, f"minLength mismatch for {key}"
            if max_len is not None and len(value) > max_len:
                return False, f"maxLength mismatch for {key}"
        if isinstance(value, (int, float)):
            minimum = rules.get("minimum")
            maximum = rules.get("maximum")
            if minimum is not None and value < minimum:
                return False, f"minimum mismatch for {key}"
            if maximum is not None and value > maximum:
                return False, f"maximum mismatch for {key}"

    return True, None


def _value_matches_types(value: Any, allowed_types: list[str]) -> bool:
    type_map = {
        "string": str,
        "number": (int, float),
        "null": type(None),
        "object": dict,
        "array": list,
        "boolean": bool,
        "integer": int,
    }
    for t in allowed_types:
        py_type = type_map.get(t)
        if py_type is None:
            continue
        if isinstance(value, py_type):
            if t == "number" and isinstance(value, bool):
                continue
            return True
    return False


async def fetch_rows(table_name: str, batch_size: int, force: bool, after_id: int) -> list[dict[str, Any]]:
    if table_name == "question_bank_items":
        where_clause = "1=1" if force else "(clean_version IS NULL OR clean_version NOT LIKE 'ai_%')"
        query = text(
            f"""
            SELECT id, grade, subject, question_type, prompt, answer_text, explanation, chapter, difficulty
            FROM question_bank_items
            WHERE {where_clause} AND id > :after_id
            ORDER BY id
            LIMIT :batch_size
            """
        )
    else:
        where_clause = "1=1" if force else "(clean_version IS NULL OR clean_version NOT LIKE 'ai_%')"
        query = text(
            f"""
            SELECT id, NULL::text AS grade, NULL::text AS subject, question_type, prompt, answer_text, explanation, chapter, difficulty
            FROM paper_questions
            WHERE {where_clause} AND id > :after_id
            ORDER BY id
            LIMIT :batch_size
            """
        )

    async with SessionLocal() as db:
        result = await db.execute(query, {"batch_size": batch_size, "after_id": after_id})
        return [dict(row) for row in result.mappings().all()]


async def apply_update(
    *,
    table_name: str,
    row_id: int,
    payload: dict[str, Any],
    clean_version: str,
    dry_run: bool,
) -> None:
    if dry_run:
        return

    update_sql = text(
        f"""
        UPDATE {table_name}
        SET
            normalized_prompt = :normalized_prompt,
            normalized_answer_text = :normalized_answer_text,
            normalized_explanation = :normalized_explanation,
            normalized_chapter = :normalized_chapter,
            normalized_difficulty = :normalized_difficulty,
            clean_confidence = :clean_confidence,
            clean_version = :clean_version,
            cleaned_at = CURRENT_TIMESTAMP
        WHERE id = :id
        """
    )

    params = {
        "id": row_id,
        "normalized_prompt": payload.get("normalized_prompt"),
        "normalized_answer_text": payload.get("normalized_answer_text"),
        "normalized_explanation": payload.get("normalized_explanation"),
        "normalized_chapter": payload.get("normalized_chapter"),
        "normalized_difficulty": payload.get("normalized_difficulty"),
        "clean_confidence": float(payload.get("clean_confidence")),
        "clean_version": clean_version,
    }

    async with SessionLocal() as db:
        await db.execute(update_sql, params)
        await db.commit()


async def process_table(
    *,
    table_name: str,
    client: AsyncOpenAI,
    schema: dict[str, Any],
    batch_size: int,
    max_rows: int,
    min_confidence: float,
    dry_run: bool,
    clean_version: str,
    force: bool,
) -> RunStats:
    stats = RunStats()
    last_id = 0
    print(f"[{table_name}] start processing...", flush=True)

    while True:
        if max_rows > 0 and stats.scanned >= max_rows:
            break

        rows = await fetch_rows(table_name, batch_size=batch_size, force=force, after_id=last_id)
        if not rows:
            print(f"[{table_name}] no more rows.", flush=True)
            break

        for row in rows:
            if max_rows > 0 and stats.scanned >= max_rows:
                break

            stats.scanned += 1
            last_id = int(row["id"])
            if stats.scanned % 5 == 0:
                print(f"[{table_name}] progress: scanned={stats.scanned}, updated={stats.updated}", flush=True)
            try:
                response = await client.chat.completions.create(
                    model=settings.quiz_generation_model,
                    temperature=0.1,
                    **token_limit_kwargs(model=settings.quiz_generation_model, max_tokens=900),
                    response_format={"type": "json_object"},
                    messages=build_messages(row=row, table_name=table_name),
                )
                stats.llm_called += 1

                content = response.choices[0].message.content if response.choices else None
                if not content:
                    stats.failed += 1
                    continue
                parsed = json.loads(content)
                if not isinstance(parsed, dict):
                    stats.skipped_invalid_schema += 1
                    continue

                parsed["clean_version"] = clean_version

                ok, err = validate_against_schema(parsed, schema)
                if not ok:
                    stats.skipped_invalid_schema += 1
                    print(f"[{table_name}#{row['id']}] schema skip: {err}")
                    continue

                confidence = float(parsed["clean_confidence"])
                if confidence < min_confidence:
                    stats.skipped_low_confidence += 1
                    continue

                await apply_update(
                    table_name=table_name,
                    row_id=int(row["id"]),
                    payload=parsed,
                    clean_version=clean_version,
                    dry_run=dry_run,
                )
                stats.updated += 1
            except Exception as exc:
                stats.failed += 1
                print(f"[{table_name}#{row['id']}] failed: {exc}")

        if len(rows) < batch_size:
            break

    return stats


def print_summary(table_name: str, stats: RunStats) -> None:
    print(
        f"[{table_name}] scanned={stats.scanned}, llm_called={stats.llm_called}, "
        f"updated={stats.updated}, skipped_low_confidence={stats.skipped_low_confidence}, "
        f"skipped_invalid_schema={stats.skipped_invalid_schema}, failed={stats.failed}"
    )


async def run() -> None:
    args = parse_args()
    schema = load_schema(SCHEMA_PATH)
    client = build_client()

    targets = (
        ["question_bank_items", "paper_questions"]
        if args.table == "both"
        else [args.table]
    )

    try:
        print("[pipeline] checking required columns...", flush=True)
        await ensure_required_columns(targets)
        print("[pipeline] column precheck passed.", flush=True)
        for table_name in targets:
            stats = await process_table(
                table_name=table_name,
                client=client,
                schema=schema,
                batch_size=args.batch_size,
                max_rows=args.max_rows,
                min_confidence=args.min_confidence,
                dry_run=args.dry_run,
                clean_version=args.clean_version,
                force=args.force,
            )
            print_summary(table_name, stats)
    finally:
        await engine.dispose()


async def ensure_required_columns(targets: list[str]) -> None:
    required = {
        "question_bank_items": {
            "normalized_prompt",
            "normalized_answer_text",
            "normalized_explanation",
            "normalized_chapter",
            "normalized_difficulty",
            "clean_confidence",
            "clean_version",
            "cleaned_at",
        },
        "paper_questions": {
            "normalized_prompt",
            "normalized_answer_text",
            "normalized_explanation",
            "normalized_chapter",
            "normalized_difficulty",
            "clean_confidence",
            "clean_version",
            "cleaned_at",
        },
    }
    async with SessionLocal() as db:
        for table_name in targets:
            result = await db.execute(
                text(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = :table_name
                    """
                ),
                {"table_name": table_name},
            )
            existing = {row[0] for row in result.all()}
            missing = sorted(required[table_name] - existing)
            if missing:
                missing_list = ", ".join(missing)
                raise RuntimeError(
                    f"table '{table_name}' missing required columns: {missing_list}. "
                    "Please run scripts/sql/20260407_add_cleaning_columns.sql first."
                )


if __name__ == "__main__":
    asyncio.run(run())
