from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal, engine


@dataclass
class Stats:
    scanned: int = 0
    llm_called: int = 0
    updated_qbi: int = 0
    updated_pq: int = 0
    skipped: int = 0
    failed: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fill TBD/missing question_bank_items answers with AI.")
    parser.add_argument("--max-rows", type=int, default=0, help="Max rows to process (0 means all).")
    parser.add_argument("--batch-size", type=int, default=30, help="Rows fetched each batch.")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no DB write.")
    parser.add_argument("--min-confidence", type=float, default=0.7, help="Minimum confidence to write answer.")
    parser.add_argument(
        "--sync-paper-questions",
        action="store_true",
        help="Also update linked paper_questions answer_text when it is null/TBD.",
    )
    return parser.parse_args()


def build_client() -> AsyncOpenAI:
    if not settings.ohmygpt_api_key.strip():
        raise RuntimeError("OHMYGPT_API_KEY/GPT_API_KEY is required.")
    return AsyncOpenAI(
        api_key=settings.ohmygpt_api_key,
        base_url=settings.ohmygpt_base_url,
        timeout=settings.quiz_generation_timeout_sec,
    )


def token_limit_kwargs(*, model: str, max_tokens: int = 300) -> dict[str, int]:
    name = (model or "").strip().lower()
    if name.startswith("gpt-5") or name.startswith("o"):
        return {"max_completion_tokens": max_tokens}
    return {"max_tokens": max_tokens}


async def fetch_candidates(*, batch_size: int, after_id: int) -> list[dict[str, Any]]:
    sql = text(
        """
        SELECT
            qbi.id,
            qbi.question_type,
            qbi.prompt,
            qbi.answer_text,
            qbi.explanation,
            qbi.subject,
            qbi.grade,
            COALESCE(
                json_agg(
                    json_build_object(
                        'key', qbo.option_key,
                        'text', qbo.option_text
                    )
                    ORDER BY qbo.option_key
                ) FILTER (WHERE qbo.id IS NOT NULL),
                '[]'::json
            ) AS options
        FROM question_bank_items qbi
        LEFT JOIN question_bank_options qbo ON qbo.bank_question_id = qbi.id
        WHERE qbi.id > :after_id
          AND (
            qbi.answer_text IS NULL
            OR btrim(qbi.answer_text) = ''
            OR upper(btrim(qbi.answer_text)) = 'TBD'
          )
        GROUP BY qbi.id
        ORDER BY qbi.id
        LIMIT :batch_size
        """
    )
    async with SessionLocal() as db:
        res = await db.execute(sql, {"after_id": after_id, "batch_size": batch_size})
        return [dict(row) for row in res.mappings().all()]


def _normalize_answer(question_type: str, answer: str) -> str:
    qtype = (question_type or "").upper()
    raw = (answer or "").strip().upper()
    if qtype == "MCQ_SINGLE":
        return raw[:1] if raw[:1] in {"A", "B", "C", "D"} else ""
    if qtype == "MCQ_MULTI":
        keys = [k for k in raw.replace(" ", "").replace("，", ",").split(",") if k in {"A", "B", "C", "D"}]
        uniq: list[str] = []
        for k in keys:
            if k not in uniq:
                uniq.append(k)
        return ",".join(uniq)
    if qtype == "TRUE_FALSE":
        if raw in {"T", "TRUE"}:
            return "T"
        if raw in {"F", "FALSE"}:
            return "F"
        return ""
    return (answer or "").strip()


async def infer_answer(client: AsyncOpenAI, row: dict[str, Any]) -> tuple[str | None, float]:
    options = row.get("options") or []
    payload = {
        "question_type": row.get("question_type"),
        "prompt": row.get("prompt"),
        "explanation": row.get("explanation"),
        "subject": row.get("subject"),
        "grade": row.get("grade"),
        "options": options,
    }
    resp = await client.chat.completions.create(
        model=settings.quiz_generation_model,
        temperature=0.1,
        **token_limit_kwargs(model=settings.quiz_generation_model, max_tokens=220),
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You infer a best-effort answer for a school question. "
                    "Return JSON only: {\"answer_text\": string|null, \"confidence\": number}. "
                    "confidence must be 0..1. "
                    "For MCQ_SINGLE answer must be one of A/B/C/D. "
                    "For MCQ_MULTI answer like A,C. "
                    "For TRUE_FALSE answer T or F. "
                    "If uncertain, return answer_text null with low confidence."
                ),
            },
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
    )
    raw = resp.choices[0].message.content if resp.choices else None
    if not raw:
        return None, 0.0
    parsed = json.loads(raw)
    answer = parsed.get("answer_text")
    conf = float(parsed.get("confidence", 0))
    if answer is None:
        return None, conf
    normalized = _normalize_answer(str(row.get("question_type") or ""), str(answer))
    if not normalized:
        return None, conf
    return normalized, conf


async def update_answer(*, qbi_id: int, answer_text: str, sync_pq: bool, dry_run: bool) -> tuple[int, int]:
    if dry_run:
        return 1, 0
    qbi_sql = text("UPDATE question_bank_items SET answer_text=:answer_text, updated_at=CURRENT_TIMESTAMP WHERE id=:id")
    pq_sql = text(
        """
        UPDATE paper_questions
        SET answer_text=:answer_text
        WHERE bank_question_id=:id
          AND (answer_text IS NULL OR btrim(answer_text)='' OR upper(btrim(answer_text))='TBD')
        """
    )
    async with SessionLocal() as db:
        qbi_result = await db.execute(qbi_sql, {"id": qbi_id, "answer_text": answer_text})
        pq_count = 0
        if sync_pq:
            pq_result = await db.execute(pq_sql, {"id": qbi_id, "answer_text": answer_text})
            pq_count = int(getattr(pq_result, "rowcount", 0) or 0)
        await db.commit()
        return int(getattr(qbi_result, "rowcount", 0) or 0), pq_count


async def run() -> None:
    args = parse_args()
    client = build_client()
    stats = Stats()
    after_id = 0

    while True:
        if args.max_rows > 0 and stats.scanned >= args.max_rows:
            break

        rows = await fetch_candidates(batch_size=args.batch_size, after_id=after_id)
        if not rows:
            break

        for row in rows:
            if args.max_rows > 0 and stats.scanned >= args.max_rows:
                break
            stats.scanned += 1
            after_id = int(row["id"])

            try:
                answer_text, conf = await infer_answer(client, row)
                stats.llm_called += 1
                if not answer_text or conf < args.min_confidence:
                    stats.skipped += 1
                    continue
                qbi_count, pq_count = await update_answer(
                    qbi_id=int(row["id"]),
                    answer_text=answer_text,
                    sync_pq=args.sync_paper_questions,
                    dry_run=args.dry_run,
                )
                stats.updated_qbi += qbi_count
                stats.updated_pq += pq_count
                print(f"[ok] qbi#{row['id']} -> {answer_text} (conf={conf:.3f})")
            except Exception as exc:
                stats.failed += 1
                print(f"[failed] qbi#{row['id']}: {exc}")

        if len(rows) < args.batch_size:
            break

    print(
        "summary:",
        f"scanned={stats.scanned}",
        f"llm_called={stats.llm_called}",
        f"updated_qbi={stats.updated_qbi}",
        f"updated_pq={stats.updated_pq}",
        f"skipped={stats.skipped}",
        f"failed={stats.failed}",
        f"dry_run={args.dry_run}",
    )
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
