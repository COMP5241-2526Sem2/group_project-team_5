from fastapi import APIRouter

from app.api.v1 import labs
from app.api.v1.papers import router as papers_router
from app.api.v1.question_bank import router as question_bank_router
from app.api.v1.quiz_generation import router as quiz_generation_router
from app.api.v1.quizzes import router as quizzes_router

router = APIRouter()

router.include_router(papers_router)
router.include_router(question_bank_router)
router.include_router(quiz_generation_router)
router.include_router(quizzes_router)


@router.get("/health")
async def health() -> dict:
    return {"success": True, "data": {"status": "ok"}, "message": "healthy"}


router.include_router(labs.router)
