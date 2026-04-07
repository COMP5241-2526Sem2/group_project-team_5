from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any

import fitz
from fastapi import HTTPException
from openai import AsyncOpenAI

from app.config import settings
from app.schemas.paper import PaperCreateQuestion
from app.services.paper.paper_pdf_llm_parse_service import PaperPdfLlmParseService

logger = logging.getLogger(__name__)


class PaperPdfVisionParseService:
    """Render PDF pages to PNG and call a vision-capable chat model (OhMyGPT / OpenAI-compatible)."""

    @staticmethod
    def _vision_model() -> str:
        m = (settings.paper_pdf_import_vision_model or "").strip()
        return m or settings.ohmygpt_model

    @staticmethod
    def _vision_timeout() -> float:
        t = settings.paper_pdf_import_vision_timeout_sec
        if t and t > 0:
            return t
        return max(90.0, settings.quiz_generation_timeout_sec * 4)

    @staticmethod
    def _vision_max_tokens() -> int:
        mt = settings.paper_pdf_import_vision_max_tokens
        if mt > 0:
            return mt
        return max(4096, settings.quiz_generation_max_tokens * 4)

    @staticmethod
    def _render_pages_png(data: bytes) -> list[bytes]:
        doc = fitz.open(stream=data, filetype="pdf")
        try:
            zoom = max(0.5, min(3.0, settings.paper_pdf_import_vision_zoom))
            mat = fitz.Matrix(zoom, zoom)
            max_pages = max(1, settings.paper_pdf_import_vision_max_pages)
            out: list[bytes] = []
            n = min(doc.page_count, max_pages)
            for i in range(n):
                page = doc.load_page(i)
                pix = page.get_pixmap(matrix=mat, alpha=False)
                out.append(pix.tobytes("png"))
            return out
        finally:
            doc.close()

    @staticmethod
    async def parse_questions_from_pdf_bytes(data: bytes) -> list[PaperCreateQuestion]:
        if not settings.ohmygpt_api_key.strip():
            raise HTTPException(
                status_code=422,
                detail="Vision PDF import requires OHMYGPT_API_KEY (or GPT_API_KEY).",
            )

        pngs = PaperPdfVisionParseService._render_pages_png(data)
        if not pngs:
            raise HTTPException(status_code=422, detail="PDF has no pages to render for vision parsing.")

        model = PaperPdfVisionParseService._vision_model()
        timeout = PaperPdfVisionParseService._vision_timeout()
        max_tokens = PaperPdfVisionParseService._vision_max_tokens()
        max_attempts = max(1, settings.paper_pdf_import_llm_max_retries)
        last_err: Exception | None = None

        user_content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": (
                    f"The following are {len(pngs)} page image(s) from an exam paper PDF (no text layer). "
                    "Extract every distinct question. "
                    'Return JSON only: {{"questions": [...]}}. '
                    "Each item: type (MCQ, Short Answer, True/False, Fill-blank), prompt (string, required), "
                    "options (optional array of {{key, text}}) for multiple-choice. "
                    "Preserve the original language of the exam."
                ),
            },
        ]
        for png in pngs:
            b64 = base64.b64encode(png).decode("ascii")
            user_content.append(
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
            )

        for attempt in range(1, max_attempts + 1):
            try:
                client = AsyncOpenAI(
                    api_key=settings.ohmygpt_api_key,
                    base_url=settings.ohmygpt_base_url,
                    timeout=timeout,
                )
                kwargs = PaperPdfLlmParseService._token_limit_kwargs(model=model, max_tokens=max_tokens)
                response = await client.chat.completions.create(
                    model=model,
                    temperature=settings.paper_pdf_import_temperature,
                    **kwargs,
                    response_format={"type": "json_object"},
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You extract structured exam questions from document page images. "
                                "Output a single JSON object only."
                            ),
                        },
                        {"role": "user", "content": user_content},
                    ],
                )
                raw = response.choices[0].message.content if response.choices else None
                if not raw:
                    last_err = RuntimeError("empty vision model content")
                    continue
                parsed = PaperPdfLlmParseService._parse_json_object(raw)
                if not parsed:
                    last_err = RuntimeError("invalid JSON from vision model")
                    continue
                raw_questions = parsed.get("questions", [])
                if not isinstance(raw_questions, list):
                    last_err = RuntimeError("questions is not a list")
                    continue
                out = PaperPdfLlmParseService.build_questions_from_raw_list(raw_questions)
                if out:
                    return out
                last_err = RuntimeError("vision model returned zero valid questions")
            except HTTPException:
                raise
            except Exception as exc:
                last_err = exc
                logger.warning(
                    "paper pdf vision parse attempt %s/%s failed: %s",
                    attempt,
                    max_attempts,
                    repr(exc),
                )
            if attempt < max_attempts:
                await asyncio.sleep(min(0.5 * attempt, 1.5))

        detail = "Could not parse questions from PDF page images (vision model)."
        if last_err is not None:
            detail = f"{detail} ({type(last_err).__name__})"
        raise HTTPException(status_code=422, detail=detail)
