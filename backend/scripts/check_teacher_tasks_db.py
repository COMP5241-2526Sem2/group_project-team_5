"""One-off: verify teacher_tasks migration in DB (run from backend/: python scripts/check_teacher_tasks_db.py)."""

from __future__ import annotations

import asyncio
import os
import sys

# Ensure backend root on path
_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from dotenv import load_dotenv

load_dotenv(os.path.join(_BACKEND, ".env"))


def _dsn() -> str:
    raw = os.environ.get("DATABASE_URL", "").strip()
    if not raw:
        raise SystemExit("DATABASE_URL not set")
    return raw.replace("postgresql+asyncpg", "postgresql")


async def main() -> None:
    import asyncpg

    conn = await asyncpg.connect(_dsn())
    try:
        ver = await conn.fetchrow("SELECT version_num FROM alembic_version LIMIT 1")
        print("alembic_version:", ver["version_num"] if ver else "(empty)")

        for t in ("teacher_tasks", "teacher_task_items"):
            exists = await conn.fetchval(
                """
                SELECT EXISTS (
                  SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = $1
                )
                """,
                t,
            )
            print(f"table {t!r} exists:", bool(exists))

        if await conn.fetchval(
            """
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'teacher_tasks'
            )
            """
        ):
            n = await conn.fetchval("SELECT COUNT(*) FROM teacher_tasks")
            print("teacher_tasks row count:", n)
        if await conn.fetchval(
            """
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'teacher_task_items'
            )
            """
        ):
            m = await conn.fetchval("SELECT COUNT(*) FROM teacher_task_items")
            print("teacher_task_items row count:", m)

        cols = await conn.fetch(
            """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'teacher_tasks'
            ORDER BY ordinal_position
            """
        )
        print("teacher_tasks columns:", len(cols))
        for r in cols:
            print(f"  - {r['column_name']}: {r['data_type']}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
