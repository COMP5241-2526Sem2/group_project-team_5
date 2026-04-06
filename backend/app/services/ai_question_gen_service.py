from __future__ import annotations

import json
import re
from dataclasses import dataclass

from openai import AsyncOpenAI

from app.config import settings
from app.schemas.quiz_generation import (
    AIQuestionGenOption,
    AIQuestionGenPreviewRequest,
    AIQuestionGenPreviewResponse,
    AIQuestionGenQuestion,
)


@dataclass(slots=True)
class _DraftQuestion:
    qtype: str
    prompt: str
    options: list[AIQuestionGenOption]
    answer: str | None
    explanation: str


class AIQuestionGenService:
    _client: AsyncOpenAI | None = None
    _stopwords = {
        "the", "and", "for", "with", "that", "this", "from", "your", "into", "about", "paper", "chapter",
        "notes", "exercise", "exam", "test", "question", "questions", "grade", "unit", "file", "upload", "document",
        "what", "which", "when", "where", "why", "how", "are", "was", "were", "can", "could", "should", "would",
        "have", "has", "had", "more", "than", "then", "their", "there", "they", "them", "also", "only", "between",
        "under", "over", "using", "used", "after", "before", "during", "through", "because", "within", "without",
        "below", "above", "source", "material", "provided", "uploaded",
    }

    @staticmethod
    async def preview_generate(payload: AIQuestionGenPreviewRequest) -> AIQuestionGenPreviewResponse:
        type_targets = payload.type_targets or AIQuestionGenService._default_type_targets(payload.question_count)

        try:
            if AIQuestionGenService._llm_enabled():
                generated = await AIQuestionGenService._llm_generate(payload, type_targets)
                if generated:
                    return AIQuestionGenPreviewResponse(questions=generated[: payload.question_count])
        except Exception:
            pass

        fallback = AIQuestionGenService._heuristic_generate(payload, type_targets)
        return AIQuestionGenPreviewResponse(questions=fallback[: payload.question_count])

    @staticmethod
    def _llm_enabled() -> bool:
        provider = settings.quiz_generation_provider.strip().lower()
        return provider in {"openai", "ohmygpt"} and bool(settings.ohmygpt_api_key.strip())

    @staticmethod
    def _get_client() -> AsyncOpenAI:
        if AIQuestionGenService._client is None:
            AIQuestionGenService._client = AsyncOpenAI(
                api_key=settings.ohmygpt_api_key,
                base_url=settings.ohmygpt_base_url,
                timeout=settings.quiz_generation_timeout_sec,
            )
        return AIQuestionGenService._client

    @staticmethod
    async def _llm_generate(payload: AIQuestionGenPreviewRequest, type_targets: dict[str, int]) -> list[AIQuestionGenQuestion]:
        client = AIQuestionGenService._get_client()
        response = await client.chat.completions.create(
            model=settings.quiz_generation_model,
            temperature=settings.quiz_generation_temperature,
            max_tokens=settings.quiz_generation_max_tokens,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You generate high-quality school assessment questions. "
                        "Use the source text as reference but do NOT mention source/document/material in the question wording. "
                        "Return JSON only with key questions. "
                        "Each question: type, prompt, options(optional), answer(optional), difficulty, explanation."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"subject={payload.subject}\n"
                        f"grade={payload.grade}\n"
                        f"difficulty={payload.difficulty}\n"
                        f"question_count={payload.question_count}\n"
                        f"type_targets={json.dumps(type_targets, ensure_ascii=True)}\n"
                        "Constraints:\n"
                        "1) Do not include phrases like 'according to source/provided material/uploaded document'.\n"
                        "2) Keep questions answerable standalone.\n"
                        "3) For MCQ provide exactly 4 options A-D and exactly one correct option.\n"
                        "4) For True/False provide answer as True or False.\n"
                        "5) Reflect concrete concepts from source text.\n"
                        "source_text:\n"
                        f"{payload.source_text[:7000]}"
                    ),
                },
            ],
        )

        raw = response.choices[0].message.content if response.choices else None
        if not raw:
            return []

        parsed = json.loads(raw)
        raw_questions = parsed.get("questions", []) if isinstance(parsed, dict) else []
        if not isinstance(raw_questions, list):
            return []

        result: list[AIQuestionGenQuestion] = []
        for item in raw_questions:
            if not isinstance(item, dict):
                continue
            qtype = str(item.get("type", "")).strip()
            prompt = AIQuestionGenService._sanitize_prompt(str(item.get("prompt", "")).strip())
            if not qtype or not prompt:
                continue

            normalized_type = AIQuestionGenService._normalize_type_label(qtype)
            difficulty = str(item.get("difficulty", payload.difficulty)).strip().lower()
            if difficulty not in {"easy", "medium", "hard"}:
                difficulty = payload.difficulty

            options: list[AIQuestionGenOption] = []
            raw_options = item.get("options", [])
            if isinstance(raw_options, list):
                for idx, opt in enumerate(raw_options[:4]):
                    if not isinstance(opt, dict):
                        continue
                    key = str(opt.get("key", "")).strip().upper() or "ABCD"[idx]
                    text = str(opt.get("text", "")).strip()
                    if not text:
                        continue
                    options.append(AIQuestionGenOption(key=key, text=text, correct=bool(opt.get("correct", False))))

            answer = item.get("answer")
            answer_text = str(answer).strip() if answer is not None else None
            explanation = str(item.get("explanation", "")).strip() or "Generated from source concepts."

            result.append(
                AIQuestionGenQuestion(
                    type=normalized_type,
                    prompt=prompt,
                    options=options,
                    answer=answer_text,
                    difficulty=difficulty,
                    explanation=explanation,
                )
            )

        return result

    @staticmethod
    def _heuristic_generate(payload: AIQuestionGenPreviewRequest, type_targets: dict[str, int]) -> list[AIQuestionGenQuestion]:
        keywords = AIQuestionGenService._extract_keywords(payload.source_text)
        if not keywords:
            keywords = [payload.subject, "core concept", "application"]

        queue: list[_DraftQuestion] = []
        index = 0

        for raw_type, count in type_targets.items():
            if count <= 0:
                continue
            qtype = AIQuestionGenService._normalize_type_key(raw_type)
            for _ in range(count):
                topic = keywords[index % len(keywords)]
                index += 1

                if qtype == "MCQ":
                    queue.append(
                        _DraftQuestion(
                            qtype="MCQ",
                            prompt=f"In {payload.subject}, which statement best explains {topic}?",
                            options=[
                                AIQuestionGenOption(key="A", text=f"A common misconception about {topic}", correct=False),
                                AIQuestionGenOption(key="B", text=f"A correct explanation of {topic}", correct=True),
                                AIQuestionGenOption(key="C", text=f"A partially correct claim missing key conditions", correct=False),
                                AIQuestionGenOption(key="D", text=f"An unrelated statement about another concept", correct=False),
                            ],
                            answer="B",
                            explanation=f"This item targets the core idea of {topic} from the provided content.",
                        )
                    )
                elif qtype == "True/False":
                    queue.append(
                        _DraftQuestion(
                            qtype="True/False",
                            prompt=f"True or False: {topic} in {payload.subject} should be analyzed with assumptions and boundary conditions.",
                            options=[],
                            answer="True",
                            explanation="This checks whether students avoid overgeneralized claims.",
                        )
                    )
                elif qtype == "Fill-blank":
                    queue.append(
                        _DraftQuestion(
                            qtype="Fill-blank",
                            prompt=f"Fill in the blank: A key term for solving problems related to {topic} is _______.",
                            options=[],
                            answer=topic,
                            explanation="The blank asks for the central concept term.",
                        )
                    )
                elif qtype == "Essay":
                    queue.append(
                        _DraftQuestion(
                            qtype="Essay",
                            prompt=f"Write an essay explaining {topic} in {payload.subject}, including method, example, and limitations.",
                            options=[],
                            answer=None,
                            explanation="The essay expects concept definition, method, and evaluative discussion.",
                        )
                    )
                else:
                    queue.append(
                        _DraftQuestion(
                            qtype="Short Answer",
                            prompt=f"Use 2-3 sentences to explain {topic} and provide one example in {payload.subject}.",
                            options=[],
                            answer=None,
                            explanation="A strong answer includes both concept and example.",
                        )
                    )

        return [
            AIQuestionGenQuestion(
                type=item.qtype,
                prompt=AIQuestionGenService._sanitize_prompt(item.prompt),
                options=item.options,
                answer=item.answer,
                difficulty=payload.difficulty,
                explanation=item.explanation,
            )
            for item in queue
        ]

    @staticmethod
    def _default_type_targets(question_count: int) -> dict[str, int]:
        mcq = max(1, round(question_count * 0.5))
        tf = max(0, round(question_count * 0.2))
        fill = max(0, round(question_count * 0.2))
        sa = max(0, question_count - mcq - tf - fill)
        targets = {"MCQ": mcq, "True/False": tf, "Fill-blank": fill, "Short Answer": sa}
        diff = question_count - sum(targets.values())
        if diff > 0:
            targets["MCQ"] += diff
        elif diff < 0:
            targets["MCQ"] = max(1, targets["MCQ"] + diff)
        return {k: v for k, v in targets.items() if v > 0}

    @staticmethod
    def _extract_keywords(source_text: str) -> list[str]:
        tokens = re.findall(r"[A-Za-z][A-Za-z0-9_\-]{2,}", source_text.lower())
        freq: dict[str, int] = {}
        for token in tokens:
            if token in AIQuestionGenService._stopwords:
                continue
            freq[token] = freq.get(token, 0) + 1

        ranked = sorted(freq.items(), key=lambda item: (-item[1], item[0]))[:16]
        return [word.replace("_", " ") for word, _ in ranked]

    @staticmethod
    def _normalize_type_key(raw_type: str) -> str:
        t = raw_type.strip().lower().replace("_", "-")
        if t in {"mcq", "mcq-single", "mcq-multi"}:
            return "MCQ"
        if t in {"tf", "true-false", "true/false"}:
            return "True/False"
        if t in {"fill", "fill-blank", "fill-blanks"}:
            return "Fill-blank"
        if t in {"essay"}:
            return "Essay"
        return "Short Answer"

    @staticmethod
    def _normalize_type_label(raw_type: str) -> str:
        return AIQuestionGenService._normalize_type_key(raw_type)

    @staticmethod
    def _sanitize_prompt(prompt: str) -> str:
        sanitized = prompt
        banned_phrases = [
            "according to the provided material",
            "based on the provided material",
            "according to the uploaded source",
            "based on the uploaded source",
            "from the document context",
            "using evidence from the source text",
            "source text",
            "provided material",
            "uploaded document",
        ]
        for phrase in banned_phrases:
            sanitized = re.sub(phrase, "", sanitized, flags=re.IGNORECASE)
        sanitized = re.sub(r"\s+", " ", sanitized).strip(" ,.-")
        return sanitized
