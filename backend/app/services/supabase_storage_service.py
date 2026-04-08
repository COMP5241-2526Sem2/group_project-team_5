from __future__ import annotations

import re
from uuid import uuid4

import httpx

from app.config import settings


def _safe_segment(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", value).strip("_") or "item"


class SupabaseStorageService:
    @staticmethod
    def _require_config() -> tuple[str, str, str]:
        base = settings.supabase_url.strip().rstrip("/")
        key = settings.supabase_service_role_key.strip()
        bucket = settings.supabase_storage_bucket.strip()
        if not base or not key or not bucket:
            raise RuntimeError("Missing Supabase Storage config")
        return base, key, bucket

    @staticmethod
    def _object_path(question_id: str, ext: str) -> str:
        return f"illustrations/{_safe_segment(question_id)}/{uuid4().hex}.{ext}"

    @staticmethod
    async def upload_bytes(*, question_id: str, data: bytes, content_type: str, ext: str) -> str:
        base, key, bucket = SupabaseStorageService._require_config()
        object_path = SupabaseStorageService._object_path(question_id, ext)
        url = f"{base}/storage/v1/object/{bucket}/{object_path}"
        headers = {
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, content=data, headers=headers)
        if resp.status_code >= 300:
            raise RuntimeError(f"Supabase upload failed: {resp.status_code} {resp.text}")
        return f"{base}/storage/v1/object/public/{bucket}/{object_path}"
