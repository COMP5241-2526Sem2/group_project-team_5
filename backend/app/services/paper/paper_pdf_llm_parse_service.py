from __future__ import annotations

import asyncio
import json
import logging
import re

from fastapi import HTTPException
from openai import AsyncOpenAI

from app.config import settings
from app.schemas.paper import PaperCreateQuestion, PaperCreateQuestionOption

logger = logging.getLogger(__name__)

_ALLOWED_TYPES = frozenset({"MCQ", "Short Answer", "True/False", "Fill-blank"})


class PaperPdfLlmParseService:
    """Use OpenAI-compatible API to turn raw exam text into PaperCreateQuestion rows."""

    _client: AsyncOpenAI | None = None

    @staticmethod
    def _get_client() -> AsyncOpenAI:
        if PaperPdfLlmParseService._client is None:
            PaperPdfLlmParseService._client = AsyncOpenAI(
                api_key=settings.ohmygpt_api_key,
                base_url=settings.ohmygpt_base_url,
                timeout=PaperPdfLlmParseService._timeout_sec(),
            )
        return PaperPdfLlmParseService._client

    @staticmethod
    def _timeout_sec() -> float:
        t = settings.paper_pdf_import_timeout_sec
        if t and t > 0:
            return t
        return settings.quiz_generation_timeout_sec

    @staticmethod
    def _model() -> str:
        m = (settings.paper_pdf_import_model or "").strip()
        return m or settings.quiz_generation_model

    @staticmethod
    def _max_tokens() -> int:
        mt = settings.paper_pdf_import_max_tokens
        return mt if mt > 0 else settings.quiz_generation_max_tokens

    @staticmethod
    def _token_limit_kwargs(*, model: str, max_tokens: int) -> dict[str, int]:
        name = (model or "").strip().lower()
        if name.startswith("gpt-5") or name.startswith("o"):
            return {"max_completion_tokens": max_tokens}
        return {"max_tokens": max_tokens}

    @staticmethod
    def _parse_json_object(raw: str) -> dict | None:
        text = raw.strip()
        if not text:
            return None
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
            text = re.sub(r"\s*```$", "", text).strip()
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            pass
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None

    @staticmethod
    def _normalize_qtype(raw: str) -> str:
        t = (raw or "").strip()
        if not t:
            return "Short Answer"
        low = t.lower()
        if "mcq" in low or "multiple" in low or "选择" in t:
            return "MCQ"
        if "true" in low and "false" in low or "判断" in t:
            return "True/False"
        if "fill" in low or "blank" in low or "填空" in t:
            return "Fill-blank"
        if t in _ALLOWED_TYPES:
            return t
        return "Short Answer"

    @staticmethod
    def build_questions_from_raw_list(raw_questions: list) -> list[PaperCreateQuestion]:
        out: list[PaperCreateQuestion] = []
        for item in raw_questions[:200]:
            if not isinstance(item, dict):
                continue
            qtype = PaperPdfLlmParseService._normalize_qtype(str(item.get("type", "")))
            prompt = str(item.get("prompt", "")).strip()
            if len(prompt) < 1:
                continue
            opts_out: list[PaperCreateQuestionOption] = []
            raw_opts = item.get("options", [])
            if isinstance(raw_opts, list):
                for idx, opt in enumerate(raw_opts[:12]):
                    if not isinstance(opt, dict):
                        continue
                    key = str(opt.get("key", "")).strip().upper() or (
                        "ABCDEFGH"[idx] if idx < 8 else str(idx + 1)
                    )
                    text = str(opt.get("text", "")).strip()
                    if not text:
                        continue
                    opts_out.append(PaperCreateQuestionOption(key=key, text=text, is_correct=False))
            if qtype == "MCQ" and len(opts_out) < 2:
                qtype = "Short Answer"
                opts_out = []
            out.append(
                PaperCreateQuestion(
                    type=qtype,
                    prompt=prompt,
                    difficulty=None,
                    explanation=None,
                    answer=None,
                    options=opts_out,
                    score=None,
                )
            )
        return out

    @staticmethod
    async def parse_questions_from_text(source_text: str) -> list[PaperCreateQuestion]:
        if not settings.ohmygpt_api_key.strip():
            raise HTTPException(
                status_code=422,
                detail="Heuristic parsing found no questions; configure OHMYGPT_API_KEY (or GPT_API_KEY) for LLM-assisted import.",
            )

        truncated = source_text[: max(1, settings.paper_pdf_import_max_source_chars)]
        model = PaperPdfLlmParseService._model()
        max_attempts = max(1, settings.paper_pdf_import_llm_max_retries)
        last_err: Exception | None = None

        for attempt in range(1, max_attempts + 1):
            try:
                client = PaperPdfLlmParseService._get_client()
                response = await client.chat.completions.create(
                    model=model,
                    temperature=settings.paper_pdf_import_temperature,
                    **PaperPdfLlmParseService._token_limit_kwargs(
                        model=model,
                        max_tokens=PaperPdfLlmParseService._max_tokens(),
                    ),
                    response_format={"type": "json_object"},
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You extract assessment questions from raw exam text. "
                                "Return JSON only: {\"questions\": [...]}. "
                                "Each item: type (one of: MCQ, Short Answer, True/False, Fill-blank), "
                                "prompt (string, required), options (optional array of {key, text}). "
                                "For MCQ include options A–D when possible. "
                                "Do not invent content not supported by the source text."
                            ),
                        },
                        {
                            "role": "user",
                            "content": f"Extract all distinct questions from this exam text:\n\n{truncated}",
                        },
                    ],
                )
                raw = response.choices[0].message.content if response.choices else None
                if not raw:
                    last_err = RuntimeError("empty LLM content")
                    continue
                parsed = PaperPdfLlmParseService._parse_json_object(raw)
                if not parsed:
                    last_err = RuntimeError("invalid JSON from LLM")
                    continue
                raw_questions = parsed.get("questions", [])
                if not isinstance(raw_questions, list):
                    last_err = RuntimeError("questions is not a list")
                    continue
                out = PaperPdfLlmParseService.build_questions_from_raw_list(raw_questions)
                if out:
                    return out
                last_err = RuntimeError("LLM returned zero valid questions")
            except HTTPException:
                raise
            except Exception as exc:
                last_err = exc
                logger.warning("paper pdf LLM parse attempt %s/%s failed: %s", attempt, max_attempts, repr(exc))
            if attempt < max_attempts:
                await asyncio.sleep(min(0.5 * attempt, 1.5))

        detail = "Could not parse questions from PDF text using LLM."
        if last_err is not None:
            detail = f"{detail} ({type(last_err).__name__})"
        raise HTTPException(status_code=422, detail=detail)
