from __future__ import annotations

import asyncio
import base64
import html
import logging
from dataclasses import dataclass

from openai import AsyncOpenAI

from app.config import settings
from app.schemas.quiz.quiz_generation import (
    AIQuestionGenIllustrationRequest,
    AIQuestionGenIllustrationResult,
)
from app.services.supabase_storage_service import SupabaseStorageService


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class _Palette:
    bg_start: str
    bg_end: str
    accent: str


_STYLE_PALETTES: dict[str, _Palette] = {
    "auto": _Palette("#ede9fe", "#dbeafe", "#4f46e5"),
    "diagram": _Palette("#e0f2fe", "#f0f9ff", "#0284c7"),
    "chart": _Palette("#ecfdf3", "#f0fdf4", "#16a34a"),
    "photo": _Palette("#fef3c7", "#fffbeb", "#d97706"),
    "scientific": _Palette("#fef2f2", "#fff1f2", "#e11d48"),
}


class QuizIllustrationService:
    _client: AsyncOpenAI | None = None

    _STYLE_GUIDE: dict[str, str] = {
        "auto": "clean educational visual with neutral simple composition",
        "diagram": "strict flat vector diagram style; 2D, simple lines/shapes, no photoreal textures",
        "chart": "strict chart style; axis/curve/bar-like visual grammar only, no scene objects",
        "photo": "strict realistic photo style; natural lighting/materials, no cartoon or icon look",
        "scientific": "strict scientific schematic style; technical line-art and simplified annotated structure without text",
    }

    @staticmethod
    async def generate(payload: AIQuestionGenIllustrationRequest) -> list[AIQuestionGenIllustrationResult]:
        semaphore = asyncio.Semaphore(max(1, settings.illustration_concurrency))
        palette = _STYLE_PALETTES.get(payload.style, _STYLE_PALETTES["auto"])
        tasks = [
            QuizIllustrationService._generate_one(
                semaphore=semaphore,
                question_id=item.question_id,
                prompt=item.prompt,
                question_type=item.question_type,
                style=payload.style,
                style_prompt=payload.style_prompt,
                palette=palette,
            )
            for item in payload.questions
        ]
        return await asyncio.gather(*tasks)

    @staticmethod
    async def _generate_one(
        *,
        semaphore: asyncio.Semaphore,
        question_id: str,
        prompt: str,
        question_type: str,
        style: str,
        style_prompt: str | None,
        palette: _Palette,
    ) -> AIQuestionGenIllustrationResult:
        async with semaphore:
            max_attempts = max(1, settings.illustration_max_retries)
            last_error: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    if settings.illustration_provider.strip().lower() == "openai":
                        image_bytes = await asyncio.wait_for(
                            QuizIllustrationService._generate_openai_image(
                                prompt=prompt,
                                question_type=question_type,
                                style=style,
                                style_prompt=style_prompt,
                            ),
                            timeout=max(10.0, settings.illustration_request_timeout_sec),
                        )
                        image_url = await SupabaseStorageService.upload_bytes(
                            question_id=question_id,
                            data=image_bytes,
                            content_type="image/png",
                            ext="png",
                        )
                    else:
                        svg_bytes = QuizIllustrationService._build_svg_bytes(
                            question_type=question_type,
                            style_label=style,
                            style_prompt=style_prompt,
                            palette=palette,
                        )
                        image_url = await SupabaseStorageService.upload_bytes(
                            question_id=question_id,
                            data=svg_bytes,
                            content_type="image/svg+xml",
                            ext="svg",
                        )
                    return AIQuestionGenIllustrationResult(question_id=question_id, image_url=image_url)
                except Exception as exc:
                    last_error = exc
                    if attempt < max_attempts:
                        await asyncio.sleep(min(0.5 * attempt, 1.2))

            # Fallback per item to avoid whole-batch failure.
            fallback_reason = "unknown error"
            if last_error is not None:
                fallback_reason = f"{type(last_error).__name__}: {str(last_error)}"[:260]
            logger.warning(
                "Illustration generation fallback used (question_id=%s, style=%s, reason=%s)",
                question_id,
                style,
                fallback_reason,
            )
            svg_bytes = QuizIllustrationService._build_svg_bytes(
                question_type=question_type,
                style_label=style,
                style_prompt=style_prompt,
                palette=palette,
            )
            encoded = base64.b64encode(svg_bytes).decode("ascii")
            return AIQuestionGenIllustrationResult(
                question_id=question_id,
                image_url=f"data:image/svg+xml;base64,{encoded}",
                used_fallback=True,
                error=fallback_reason,
            )

    @staticmethod
    def _get_client() -> AsyncOpenAI:
        if QuizIllustrationService._client is None:
            key = settings.gpt_api_key.strip() or settings.ohmygpt_api_key.strip()
            if not key:
                raise RuntimeError("Missing API key for illustration generation")
            QuizIllustrationService._client = AsyncOpenAI(
                api_key=key,
                base_url=settings.illustration_base_url or None,
                timeout=settings.illustration_request_timeout_sec,
            )
        return QuizIllustrationService._client

    @staticmethod
    def _style_instruction(style: str) -> str:
        return QuizIllustrationService._STYLE_GUIDE.get(
            style,
            QuizIllustrationService._STYLE_GUIDE["auto"],
        )

    @staticmethod
    def _build_openai_prompt(
        *,
        prompt: str,
        question_type: str,
        style: str,
        style_prompt: str | None,
    ) -> str:
        style_line = style_prompt.strip() if style_prompt else ""
        style_instruction = QuizIllustrationService._style_instruction(style)
        return (
            "Create one minimalist educational illustration directly tied to the concept below. "
            f"Question type: {question_type}. "
            f"Concept focus: {prompt}. "
            f"Style mode: {style}. Apply this style strictly and do not mix with other visual styles. "
            "Hard constraints: use plain background and only 1-3 core visual elements; "
            "remove unrelated props or decorative objects; no stickers, weather icons, desks, books, tools, "
            "or scene dressing unless absolutely required by the concept. "
            "Do not include any readable text, letters, numbers, symbols, equations, options, "
            "or question sentences in the image. "
            "For graph concepts, draw only the essential axes/curve relationship without labels. "
            f"Visual style: {style_instruction}. "
            f"Additional style note: {style_line if style_line else 'none'}"
        )

    @staticmethod
    async def _generate_openai_image(
        *,
        prompt: str,
        question_type: str,
        style: str,
        style_prompt: str | None,
    ) -> bytes:
        client = QuizIllustrationService._get_client()
        full_prompt = QuizIllustrationService._build_openai_prompt(
            prompt=prompt,
            question_type=question_type,
            style=style,
            style_prompt=style_prompt,
        )
        resp = await client.images.generate(
            model=settings.illustration_model,
            prompt=full_prompt,
            size=settings.illustration_size,
            response_format="b64_json",
        )
        if not resp.data or not resp.data[0].b64_json:
            raise RuntimeError("Empty image response")
        return base64.b64decode(resp.data[0].b64_json)

    @staticmethod
    def _build_svg_bytes(*, question_type: str, style_label: str, style_prompt: str | None, palette: _Palette) -> bytes:
        safe_type = html.escape(question_type)
        safe_style = html.escape(style_label)
        safe_prompt = html.escape((style_prompt or "Concept visual").strip())
        svg = (
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"640\" height=\"360\" viewBox=\"0 0 640 360\">"
            "<defs>"
            f"<linearGradient id=\"bg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">"
            f"<stop offset=\"0\" stop-color=\"{palette.bg_start}\"/>"
            f"<stop offset=\"1\" stop-color=\"{palette.bg_end}\"/>"
            "</linearGradient>"
            "</defs>"
            "<rect width=\"640\" height=\"360\" rx=\"24\" fill=\"url(#bg)\"/>"
            "<rect x=\"28\" y=\"28\" width=\"584\" height=\"304\" rx=\"18\" fill=\"#ffffff\" opacity=\"0.78\"/>"
            f"<rect x=\"28\" y=\"28\" width=\"6\" height=\"304\" fill=\"{palette.accent}\"/>"
            f"<text x=\"52\" y=\"80\" font-size=\"18\" font-family=\"Arial, sans-serif\" fill=\"{palette.accent}\" font-weight=\"700\">AI Illustration</text>"
            f"<text x=\"52\" y=\"112\" font-size=\"12\" font-family=\"Arial, sans-serif\" fill=\"#6b7280\">Type: {safe_type} | Style: {safe_style}</text>"
            "<text x=\"52\" y=\"152\" font-size=\"13\" font-family=\"Arial, sans-serif\" fill=\"#374151\">Concept visual only (no question/options text)</text>"
            f"<text x=\"52\" y=\"184\" font-size=\"12\" font-family=\"Arial, sans-serif\" fill=\"#9ca3af\">Style notes: {safe_prompt}</text>"
            f"<circle cx=\"548\" cy=\"252\" r=\"48\" fill=\"{palette.accent}\" opacity=\"0.16\"/>"
            f"<path d=\"M500 272 L588 272 L544 220 Z\" fill=\"{palette.accent}\" opacity=\"0.26\"/>"
            f"<rect x=\"474\" y=\"214\" width=\"96\" height=\"80\" rx=\"14\" fill=\"{palette.accent}\" opacity=\"0.12\"/>"
            "</svg>"
        )
        return svg.encode("utf-8")
