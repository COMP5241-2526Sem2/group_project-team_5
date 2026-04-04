from fastapi import APIRouter

from app.api.v1 import labs

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"success": True, "data": {"status": "ok"}, "message": "healthy"}


router.include_router(labs.router)
