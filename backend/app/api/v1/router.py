from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"success": True, "data": {"status": "ok"}, "message": "healthy"}
