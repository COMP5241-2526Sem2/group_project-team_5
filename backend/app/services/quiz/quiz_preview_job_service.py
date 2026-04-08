from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from redis.asyncio import Redis

from app.config import settings
from app.schemas.quiz.quiz_generation import (
    AIQuestionGenPreviewJobCreateResponse,
    AIQuestionGenPreviewJobStatusResponse,
    AIQuestionGenPreviewRequest,
    AIQuestionGenPreviewResponse,
)
from app.services.quiz.ai_question_gen_service import AIQuestionGenService


class QuizPreviewJobService:
    _redis: Redis | None = None
    _prefix = "quiz_preview_job"

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(UTC).isoformat()

    @staticmethod
    def _ensure_redis_configured() -> None:
        if settings.redis_url.strip():
            return
        raise HTTPException(
            status_code=503,
            detail="redis_url is not configured; preview async jobs are unavailable.",
        )

    @staticmethod
    def _key(job_id: str) -> str:
        return f"{QuizPreviewJobService._prefix}:{job_id}"

    @staticmethod
    def _lock_key(job_id: str) -> str:
        return f"{QuizPreviewJobService._prefix}:{job_id}:lock"

    @staticmethod
    async def _client() -> Redis:
        QuizPreviewJobService._ensure_redis_configured()
        if QuizPreviewJobService._redis is None:
            QuizPreviewJobService._redis = Redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        return QuizPreviewJobService._redis

    @staticmethod
    async def create_job(
        *,
        payload: AIQuestionGenPreviewRequest,
        user_id: int,
    ) -> AIQuestionGenPreviewJobCreateResponse:
        redis = await QuizPreviewJobService._client()
        job_id = uuid4().hex
        now = QuizPreviewJobService._now_iso()
        record = {
            "job_id": job_id,
            "status": "queued",
            "owner_user_id": user_id,
            "payload": payload.model_dump(mode="json"),
            "result": None,
            "error": None,
            "created_at": now,
            "updated_at": now,
        }
        await redis.setex(
            QuizPreviewJobService._key(job_id),
            settings.quiz_preview_job_ttl_sec,
            json.dumps(record, ensure_ascii=False),
        )
        return AIQuestionGenPreviewJobCreateResponse(job_id=job_id, status="queued")

    @staticmethod
    async def get_status(
        *,
        job_id: str,
        user_id: int,
    ) -> AIQuestionGenPreviewJobStatusResponse:
        redis = await QuizPreviewJobService._client()
        record = await QuizPreviewJobService._load_record(redis, job_id=job_id, user_id=user_id)
        if record["status"] in {"queued", "running"}:
            await QuizPreviewJobService._try_run_job(redis=redis, record=record)
            record = await QuizPreviewJobService._load_record(redis, job_id=job_id, user_id=user_id)
        return QuizPreviewJobService._to_status_response(record)

    @staticmethod
    async def _load_record(redis: Redis, *, job_id: str, user_id: int) -> dict:
        raw = await redis.get(QuizPreviewJobService._key(job_id))
        if not raw:
            raise HTTPException(status_code=404, detail="Preview job not found or expired.")
        try:
            record = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail="Preview job payload is corrupted.") from exc
        if int(record.get("owner_user_id", -1)) != int(user_id):
            raise HTTPException(status_code=403, detail="No permission to access this preview job.")
        return record

    @staticmethod
    async def _save_record(redis: Redis, record: dict) -> None:
        record["updated_at"] = QuizPreviewJobService._now_iso()
        await redis.setex(
            QuizPreviewJobService._key(record["job_id"]),
            settings.quiz_preview_job_ttl_sec,
            json.dumps(record, ensure_ascii=False),
        )

    @staticmethod
    async def _try_run_job(*, redis: Redis, record: dict) -> None:
        if record["status"] == "running":
            return
        lock_key = QuizPreviewJobService._lock_key(record["job_id"])
        locked = await redis.set(lock_key, "1", ex=settings.quiz_preview_job_lock_sec, nx=True)
        if not locked:
            return
        record["status"] = "running"
        await QuizPreviewJobService._save_record(redis, record)
        try:
            payload = AIQuestionGenPreviewRequest.model_validate(record.get("payload", {}))
            result: AIQuestionGenPreviewResponse = await AIQuestionGenService.preview_generate(payload)
            record["status"] = "succeeded"
            record["result"] = result.model_dump(mode="json")
            record["error"] = None
        except Exception as exc:  # keep terminal error in job state
            record["status"] = "failed"
            record["result"] = None
            record["error"] = str(exc)
        finally:
            await QuizPreviewJobService._save_record(redis, record)

    @staticmethod
    def _to_status_response(record: dict) -> AIQuestionGenPreviewJobStatusResponse:
        result = record.get("result")
        return AIQuestionGenPreviewJobStatusResponse(
            job_id=str(record["job_id"]),
            status=str(record["status"]),
            result=AIQuestionGenPreviewResponse.model_validate(result) if isinstance(result, dict) else None,
            error=str(record["error"]) if record.get("error") else None,
            updated_at=str(record.get("updated_at") or ""),
        )
