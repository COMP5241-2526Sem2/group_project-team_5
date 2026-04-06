import asyncio

from app.database import SessionLocal
from app.models.lab import LabGenerationSession
from app.schemas.lab import SessionMode as SchemaSessionMode


async def main() -> None:
    async with SessionLocal() as db:
        s = LabGenerationSession(
            teacher_id=1,
            lab_definition_id=None,
            mode=SchemaSessionMode.GENERATE,  # type: ignore[arg-type]
        )
        db.add(s)
        try:
            await db.commit()
            await db.refresh(s)
            print("ok", s.id, s.mode)
        except Exception as e:
            await db.rollback()
            print("commit error:", type(e).__name__, str(e))


if __name__ == "__main__":
    asyncio.run(main())

