from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass

from openai import AsyncOpenAI

from app.config import settings
from app.schemas.quiz.quiz_generation import (
    AIQuestionGenOption,
    AIQuestionGenPreviewRequest,
    AIQuestionGenPreviewResponse,
    AIQuestionGenQuestion,
)


logger = logging.getLogger(__name__)


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

        provider = settings.quiz_generation_provider.strip().lower()
        if AIQuestionGenService._llm_enabled():
            max_attempts = max(1, settings.quiz_generation_llm_max_retries)
            last_error: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    generated = await AIQuestionGenService._llm_generate(payload, type_targets)
                    if generated:
                        return AIQuestionGenPreviewResponse(
                            questions=generated[: payload.question_count],
                            generation_mode="llm",
                        )
                    logger.warning(
                        "AI question preview got empty LLM output (attempt=%s/%s, provider=%s)",
                        attempt,
                        max_attempts,
                        provider,
                    )
                except Exception as exc:
                    last_error = exc
                    logger.warning(
                        "AI question preview LLM call failed (attempt=%s/%s, provider=%s, error=%s)",
                        attempt,
                        max_attempts,
                        provider,
                        repr(exc),
                    )
                if attempt < max_attempts:
                    await asyncio.sleep(min(0.5 * attempt, 1.5))

            fallback = AIQuestionGenService._heuristic_generate(payload, type_targets)
            warning = "LLM unavailable or returned empty output; heuristic fallback was used."
            if last_error is not None:
                warning = f"LLM call failed ({type(last_error).__name__}); heuristic fallback was used."
            return AIQuestionGenPreviewResponse(
                questions=fallback[: payload.question_count],
                generation_mode="heuristic",
                warning=warning,
            )

        key_missing = provider in {"openai", "ohmygpt"} and not settings.ohmygpt_api_key.strip()
        provider_mismatch = provider not in {"openai", "ohmygpt", "heuristic"}

        fallback = AIQuestionGenService._heuristic_generate(payload, type_targets)
        warning: str | None = None
        if key_missing:
            warning = "LLM provider is enabled but API key is missing; heuristic fallback was used."
        elif provider_mismatch:
            warning = f"Unknown provider '{provider}'; heuristic fallback was used."
        return AIQuestionGenPreviewResponse(
            questions=fallback[: payload.question_count],
            generation_mode="heuristic",
            warning=warning,
        )

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
    def _token_limit_kwargs(*, model: str, max_tokens: int) -> dict[str, int]:
        """
        OpenAI-style APIs have started migrating some models to `max_completion_tokens`.
        Keep backward compatibility by switching based on model name.
        """
        name = (model or "").strip().lower()
        if name.startswith("gpt-5") or name.startswith("o"):
            return {"max_completion_tokens": max_tokens}
        return {"max_tokens": max_tokens}

    @staticmethod
    async def _llm_generate(payload: AIQuestionGenPreviewRequest, type_targets: dict[str, int]) -> list[AIQuestionGenQuestion]:
        client = AIQuestionGenService._get_client()
        messages = AIQuestionGenService._build_messages(payload, type_targets)
        response = await client.chat.completions.create(
            model=settings.quiz_generation_model,
            temperature=settings.quiz_generation_temperature,
            **AIQuestionGenService._token_limit_kwargs(
                model=settings.quiz_generation_model,
                max_tokens=settings.quiz_generation_max_tokens,
            ),
            response_format={"type": "json_object"},
            messages=messages,
        )

        raw = response.choices[0].message.content if response.choices else None
        if not raw:
            return await AIQuestionGenService._llm_generate_text_mode(payload, type_targets)

        parsed = AIQuestionGenService._parse_json_object(raw)
        if parsed is None:
            markdown_parsed = AIQuestionGenService._parse_markdown_questions(raw, payload.difficulty)
            if markdown_parsed:
                return markdown_parsed
            return await AIQuestionGenService._llm_generate_text_mode(payload, type_targets)
        raw_questions = parsed.get("questions", []) if isinstance(parsed, dict) else []
        if not isinstance(raw_questions, list):
            return await AIQuestionGenService._llm_generate_text_mode(payload, type_targets)

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

            answer = item.get("answer")
            answer_text = str(answer).strip() if answer is not None else None
            options = AIQuestionGenService._parse_options(item.get("options"))
            if normalized_type == "MCQ":
                options = AIQuestionGenService._normalize_mcq_options(
                    options=options,
                    prompt=prompt,
                    answer_text=answer_text,
                )
                answer_text = AIQuestionGenService._extract_answer_key(answer_text) or next(
                    (opt.key for opt in options if opt.correct),
                    "A",
                )
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

        if result:
            return result
        return await AIQuestionGenService._llm_generate_text_mode(payload, type_targets)

    @staticmethod
    def _build_messages(payload: AIQuestionGenPreviewRequest, type_targets: dict[str, int]) -> list[dict[str, str]]:
        extra_context: list[str] = []
        extra_constraints: list[str] = [
            "6) Keep terminology, numeric context, and scenario style aligned with source_text.",
        ]
        seed_block = ""

        if payload.source_mode:
            extra_context.append(f"source_mode={payload.source_mode}")
        if payload.source_file_names:
            extra_context.append(f"source_files={json.dumps(payload.source_file_names, ensure_ascii=True)}")

        if payload.source_mode == "exam":
            if payload.exam_generation_mode:
                extra_context.append(f"exam_generation_mode={payload.exam_generation_mode}")
            if payload.exam_match_mode:
                extra_context.append(f"exam_match_mode={payload.exam_match_mode}")
            if payload.exam_difficulty:
                extra_context.append(f"exam_difficulty={payload.exam_difficulty}")

            if payload.exam_match_mode == "type":
                extra_constraints.append(
                    "7) Strictly mirror the question-type pattern and item framing style found in source_text."
                )
            elif payload.exam_match_mode == "knowledge":
                extra_constraints.append(
                    "7) Keep the same knowledge points as source_text; question types may vary."
                )

        if payload.source_mode == "questions":
            if payload.question_input_mode:
                extra_context.append(f"question_input_mode={payload.question_input_mode}")
            if payload.derive_mode:
                extra_context.append(f"derive_mode={payload.derive_mode}")

            seeds = [s.strip() for s in (payload.seed_questions or []) if s and s.strip()]
            if seeds:
                listed = "\n".join(f"{idx + 1}. {seed[:320]}" for idx, seed in enumerate(seeds[:12]))
                seed_block = f"seed_questions:\n{listed}\n"

            extra_constraints.append(
                "7) Each generated item must be derived from the seed_questions intent; do not copy any seed question verbatim."
            )
            if payload.derive_mode == "variation":
                extra_constraints.append(
                    "8) Variation style: keep the same concept and question type, but change scenario values/wording/conditions."
                )
            elif payload.derive_mode == "extension":
                extra_constraints.append(
                    "8) Extension style: build a deeper follow-up question requiring one extra reasoning step or transfer."
                )
            elif payload.derive_mode == "contrast":
                extra_constraints.append(
                    "8) Contrast style: emphasize misconception discrimination and include plausible but incorrect reasoning paths."
                )
            else:
                extra_constraints.append(
                    "8) Use derivation style requested by derive_mode when creating each question."
                )

        context_block = "\n".join(extra_context)
        constraint_block = "\n".join(extra_constraints)

        return [
            {
                "role": "system",
                "content": (
                    "You generate high-quality school assessment questions. "
                    "Use the source text as reference but do NOT mention source/document/material in the question wording. "
                    "Return JSON only with key questions. "
                    "Each question: type, prompt, options, answer, difficulty, explanation. "
                    "For MCQ, options are mandatory and must contain exactly 4 choices A-D with one correct answer."
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
                    f"{context_block + chr(10) if context_block else ''}"
                    f"{seed_block}"
                    "Constraints:\n"
                    "1) Do not include phrases like 'according to source/provided material/uploaded document'.\n"
                    "2) Keep questions answerable standalone.\n"
                    "3) For MCQ provide exactly 4 options A-D and exactly one correct option.\n"
                    "4) For True/False provide answer as True or False.\n"
                    "5) Reflect concrete concepts from source text.\n"
                    f"{constraint_block}\n"
                    "source_text:\n"
                    f"{payload.source_text[:7000]}"
                ),
            },
        ]

    @staticmethod
    async def _llm_generate_text_mode(payload: AIQuestionGenPreviewRequest, type_targets: dict[str, int]) -> list[AIQuestionGenQuestion]:
        client = AIQuestionGenService._get_client()
        response = await client.chat.completions.create(
            model=settings.quiz_generation_model,
            temperature=settings.quiz_generation_temperature,
            **AIQuestionGenService._token_limit_kwargs(
                model=settings.quiz_generation_model,
                max_tokens=settings.quiz_generation_max_tokens,
            ),
            messages=AIQuestionGenService._build_messages(payload, type_targets),
        )
        raw = response.choices[0].message.content if response.choices else None
        if not raw:
            return []

        parsed = AIQuestionGenService._parse_json_object(raw)
        if parsed is not None and isinstance(parsed.get("questions"), list):
            # Reuse the strict path by feeding back as string for normalized mapping.
            try:
                normalized_raw = json.dumps(parsed, ensure_ascii=False)
            except Exception:
                normalized_raw = raw
            reparsed = AIQuestionGenService._parse_json_object(normalized_raw)
            if reparsed and isinstance(reparsed.get("questions"), list):
                # Let the main mapper process by simulating the existing loop.
                raw_questions = reparsed.get("questions", [])
                mapped: list[AIQuestionGenQuestion] = []
                for item in raw_questions:
                    if not isinstance(item, dict):
                        continue
                    qtype = str(item.get("type", "")).strip()
                    prompt = AIQuestionGenService._sanitize_prompt(str(item.get("prompt", "")).strip())
                    if not qtype or not prompt:
                        continue
                    normalized_type = AIQuestionGenService._normalize_type_label(qtype)
                    diff = str(item.get("difficulty", payload.difficulty)).strip().lower()
                    if diff not in {"easy", "medium", "hard"}:
                        diff = payload.difficulty
                    answer = item.get("answer")
                    answer_text = str(answer).strip() if answer is not None else None
                    options = AIQuestionGenService._parse_options(item.get("options"))
                    if normalized_type == "MCQ":
                        options = AIQuestionGenService._normalize_mcq_options(
                            options=options,
                            prompt=prompt,
                            answer_text=answer_text,
                        )
                        answer_text = AIQuestionGenService._extract_answer_key(answer_text) or next(
                            (opt.key for opt in options if opt.correct),
                            "A",
                        )
                    explanation = str(item.get("explanation", "")).strip() or "Generated from source concepts."
                    mapped.append(
                        AIQuestionGenQuestion(
                            type=normalized_type,
                            prompt=prompt,
                            options=options,
                            answer=answer_text,
                            difficulty=diff,
                            explanation=explanation,
                        )
                    )
                if mapped:
                    return mapped

        return AIQuestionGenService._parse_markdown_questions(raw, payload.difficulty)

    @staticmethod
    def _parse_options(raw_options: object) -> list[AIQuestionGenOption]:
        parsed: list[AIQuestionGenOption] = []

        if isinstance(raw_options, dict):
            for key in "ABCD":
                if key not in raw_options:
                    continue
                raw_item = raw_options.get(key)
                if isinstance(raw_item, dict):
                    text = str(raw_item.get("text") or raw_item.get("option") or raw_item.get("content") or "").strip()
                    correct = bool(raw_item.get("correct", False))
                else:
                    text = str(raw_item or "").strip()
                    correct = False
                if text:
                    parsed.append(AIQuestionGenOption(key=key, text=text, correct=correct))
            return parsed

        if not isinstance(raw_options, list):
            return parsed

        for idx, raw_item in enumerate(raw_options[:8]):
            if isinstance(raw_item, dict):
                key = str(raw_item.get("key", "")).strip().upper() or ("ABCD"[idx] if idx < 4 else "")
                text = str(raw_item.get("text") or raw_item.get("option") or raw_item.get("content") or "").strip()
                correct = bool(raw_item.get("correct", False))
                if key and text:
                    parsed.append(AIQuestionGenOption(key=key, text=text, correct=correct))
                continue

            line = str(raw_item or "").strip()
            if not line:
                continue
            matched = re.match(r"^([A-D])[\.|\)|:|-]\s*(.+)$", line, flags=re.IGNORECASE)
            if matched:
                key = matched.group(1).upper()
                text = matched.group(2).strip()
            else:
                key = "ABCD"[idx] if idx < 4 else ""
                text = line
            if key and text:
                parsed.append(AIQuestionGenOption(key=key, text=text, correct=False))

        return parsed

    @staticmethod
    def _extract_answer_key(answer_text: str | None) -> str | None:
        if not answer_text:
            return None
        matched = re.search(r"\b([A-D])\b", answer_text.upper())
        return matched.group(1) if matched else None

    @staticmethod
    def _normalize_mcq_options(
        *,
        options: list[AIQuestionGenOption],
        prompt: str,
        answer_text: str | None,
    ) -> list[AIQuestionGenOption]:
        clean_texts: list[str] = []
        original_correct_index: int | None = None

        for opt in options:
            text = opt.text.strip()
            if not text or text in clean_texts:
                continue
            if opt.correct and original_correct_index is None and len(clean_texts) < 4:
                original_correct_index = len(clean_texts)
            clean_texts.append(text)
            if len(clean_texts) >= 4:
                break

        if not clean_texts:
            topics = AIQuestionGenService._extract_keywords(prompt)
            topic = topics[0] if topics else "the concept"
            clean_texts = [
                f"A common misconception about {topic}",
                f"A correct explanation of {topic}",
                "A partially correct claim missing key conditions",
                "An unrelated statement about another concept",
            ]

        while len(clean_texts) < 4:
            clean_texts.append(f"Alternative statement {len(clean_texts) + 1}")

        answer_key = AIQuestionGenService._extract_answer_key(answer_text)
        correct_index = original_correct_index
        if answer_key:
            correct_index = ord(answer_key) - ord("A")
        elif answer_text:
            lowered_answer = answer_text.strip().lower()
            for idx, text in enumerate(clean_texts):
                if lowered_answer == text.lower():
                    correct_index = idx
                    break

        if correct_index is None or correct_index < 0 or correct_index > 3:
            correct_index = 0

        return [
            AIQuestionGenOption(
                key=chr(ord("A") + idx),
                text=clean_texts[idx],
                correct=(idx == correct_index),
            )
            for idx in range(4)
        ]

    @staticmethod
    def _parse_json_object(raw: str) -> dict | None:
        text = raw.strip()
        if not text:
            return None

        # Some providers still wrap JSON in markdown fences.
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
            text = re.sub(r"\s*```$", "", text).strip()

        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            pass

        # Fallback: extract the first JSON object span from mixed text.
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None

    @staticmethod
    def _parse_markdown_questions(raw: str, difficulty: str) -> list[AIQuestionGenQuestion]:
        heading = re.compile(
            r"(?m)^\s*\d+\.\s*\*\*(MCQ|True/False|Fill(?:-in-the-blank|-blank)|Short Answer|Essay)\*\*"
        )
        matches = list(heading.finditer(raw))
        if not matches:
            return AIQuestionGenService._parse_markdown_questions_by_section(raw, difficulty)

        parsed_questions: list[AIQuestionGenQuestion] = []
        for i, m in enumerate(matches):
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
            block = raw[start:end].strip()
            qtype = AIQuestionGenService._normalize_type_label(m.group(1))

            lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
            if not lines:
                continue

            # Remove heading line like: 1. **MCQ**
            if re.match(r"^\d+\.\s*\*\*", lines[0]):
                lines = lines[1:]
            if not lines:
                continue

            prompt_lines: list[str] = []
            options: list[AIQuestionGenOption] = []
            answer: str | None = None

            for ln in lines:
                opt = re.match(r"^([A-D])\.\s*(.+)$", ln)
                if opt:
                    options.append(
                        AIQuestionGenOption(
                            key=opt.group(1),
                            text=opt.group(2).strip(),
                            correct=False,
                        )
                    )
                    continue

                ans = re.match(r"^\*\*Answer:\*\*\s*(.+)$", ln, flags=re.IGNORECASE)
                if ans:
                    answer = ans.group(1).strip()
                    continue

                if re.match(r"^\*\*Answer:\*\*", ln, flags=re.IGNORECASE):
                    continue

                prompt_lines.append(ln)

            prompt = AIQuestionGenService._sanitize_prompt(" ".join(prompt_lines).strip())
            if not prompt:
                continue

            if qtype == "MCQ" and answer:
                key = answer[:1].upper()
                for opt in options:
                    if opt.key == key:
                        opt.correct = True

            parsed_questions.append(
                AIQuestionGenQuestion(
                    type=qtype,
                    prompt=prompt,
                    options=options,
                    answer=answer,
                    difficulty=difficulty,
                    explanation="Generated from LLM markdown response.",
                )
            )

        return parsed_questions

    @staticmethod
    def _parse_markdown_questions_by_section(raw: str, difficulty: str) -> list[AIQuestionGenQuestion]:
        lines = [ln.strip() for ln in raw.splitlines()]
        result: list[AIQuestionGenQuestion] = []

        section_type: str | None = None
        prompt_lines: list[str] = []
        options: list[AIQuestionGenOption] = []
        answer: str | None = None

        def infer_type(prompt: str, hinted: str | None, opts: list[AIQuestionGenOption], ans: str | None) -> str:
            if hinted:
                return hinted
            if opts:
                return "MCQ"
            ans_norm = (ans or "").strip().lower()
            if ans_norm in {"true", "false"}:
                return "True/False"
            if "_____" in prompt or "blank" in prompt.lower():
                return "Fill-blank"
            return "Short Answer"

        def flush_current() -> None:
            nonlocal prompt_lines, options, answer
            prompt = AIQuestionGenService._sanitize_prompt(" ".join(prompt_lines).strip())
            if not prompt:
                prompt_lines = []
                options = []
                answer = None
                return

            qtype = infer_type(prompt, section_type, options, answer)

            if qtype == "MCQ" and answer:
                key = answer[:1].upper()
                for opt in options:
                    if opt.key == key:
                        opt.correct = True

            result.append(
                AIQuestionGenQuestion(
                    type=qtype,
                    prompt=prompt,
                    options=options.copy(),
                    answer=answer,
                    difficulty=difficulty,
                    explanation="Generated from LLM markdown response.",
                )
            )
            prompt_lines = []
            options = []
            answer = None

        for line in lines:
            if not line:
                continue

            section = line.lower()
            if "multiple choice" in section or "(mcq)" in section:
                flush_current()
                section_type = "MCQ"
                continue
            if "true/false" in section or "true or false" in section:
                flush_current()
                section_type = "True/False"
                continue
            if "fill in the blank" in section or "fill-in-the-blank" in section:
                flush_current()
                section_type = "Fill-blank"
                continue
            if "short answer" in section:
                flush_current()
                section_type = "Short Answer"
                continue
            if line.startswith("---"):
                flush_current()
                continue

            q_match = re.match(r"^\*\*(\d+)\.\s*(.+?)\*\*$", line)
            if not q_match:
                q_match = re.match(r"^(\d+)\.\s+(.+)$", line)
            if q_match:
                flush_current()
                prompt_lines.append(q_match.group(2).strip())
                continue

            opt_match = re.match(r"^([A-D])\.\s*(.+)$", line)
            if opt_match:
                options.append(
                    AIQuestionGenOption(
                        key=opt_match.group(1),
                        text=opt_match.group(2).strip(),
                        correct=False,
                    )
                )
                continue

            ans_match = re.match(r"^\*\*Answer:\*\*\s*(.+)$", line, flags=re.IGNORECASE)
            if ans_match:
                answer_text = ans_match.group(1).strip()
                answer = answer_text
                # For MCQ answers like "B. Nucleus", preserve key only.
                mcq_ans = re.match(r"^([A-D])\b", answer_text, flags=re.IGNORECASE)
                if mcq_ans:
                    answer = mcq_ans.group(1).upper()
                continue

            if prompt_lines and not options and answer is None:
                prompt_lines.append(line)

        flush_current()
        return result

    @staticmethod
    def _heuristic_generate(payload: AIQuestionGenPreviewRequest, type_targets: dict[str, int]) -> list[AIQuestionGenQuestion]:
        keywords = AIQuestionGenService._extract_keywords(payload.source_text)
        if not keywords:
            keywords = [payload.subject, "core concept", "application"]

        question_mode = payload.source_mode == "questions"
        derive_mode = payload.derive_mode if question_mode else None
        seed_questions = [s.strip() for s in (payload.seed_questions or []) if s and s.strip()][:12]
        if question_mode and not seed_questions:
            seed_questions = [line.strip() for line in payload.source_text.splitlines() if line.strip()][:12]
        if question_mode and not seed_questions:
            seed_questions = ["Provided source question"]

        queue: list[_DraftQuestion] = []
        index = 0

        for raw_type, count in type_targets.items():
            if count <= 0:
                continue
            qtype = AIQuestionGenService._normalize_type_key(raw_type)
            for _ in range(count):
                topic = keywords[index % len(keywords)]
                seed_question = seed_questions[index % len(seed_questions)] if seed_questions else ""
                seed_short = seed_question[:90]
                index += 1

                if qtype == "MCQ":
                    if question_mode and derive_mode == "variation":
                        queue.append(
                            _DraftQuestion(
                                qtype="MCQ",
                                prompt=(
                                    f"Variation: Based on \"{seed_short}\", which revised statement about {topic} "
                                    "is most accurate under changed conditions?"
                                ),
                                options=[
                                    AIQuestionGenOption(key="A", text="A direct copy of the original conclusion without condition changes", correct=False),
                                    AIQuestionGenOption(key="B", text=f"An equivalent principle about {topic} applied to a new constraint", correct=True),
                                    AIQuestionGenOption(key="C", text="A formula fragment that omits the key variable relationship", correct=False),
                                    AIQuestionGenOption(key="D", text="An unrelated statement from a different chapter", correct=False),
                                ],
                                answer="B",
                                explanation="Variation keeps the same concept but changes scenario framing and conditions.",
                            )
                        )
                    elif question_mode and derive_mode == "extension":
                        queue.append(
                            _DraftQuestion(
                                qtype="MCQ",
                                prompt=(
                                    f"Extension: Which follow-up question best deepens reasoning about {topic} "
                                    f"from \"{seed_short}\"?"
                                ),
                                options=[
                                    AIQuestionGenOption(key="A", text="Recall only the original definition without any further inference", correct=False),
                                    AIQuestionGenOption(key="B", text=f"Require one additional inference step to solve a harder case of {topic}", correct=True),
                                    AIQuestionGenOption(key="C", text="Switch to an unrelated topic and keep the same difficulty", correct=False),
                                    AIQuestionGenOption(key="D", text="Repeat the seed question wording with no new task", correct=False),
                                ],
                                answer="B",
                                explanation="Extension mode should increase cognitive depth with a clear follow-up step.",
                            )
                        )
                    elif question_mode and derive_mode == "contrast":
                        queue.append(
                            _DraftQuestion(
                                qtype="MCQ",
                                prompt=(
                                    f"Contrast: For {topic}, which option best distinguishes the correct idea from a common "
                                    f"misconception implied by \"{seed_short}\"?"
                                ),
                                options=[
                                    AIQuestionGenOption(key="A", text=f"A plausible but incorrect shortcut claim about {topic}", correct=False),
                                    AIQuestionGenOption(key="B", text=f"A condition-aware explanation that correctly distinguishes {topic}", correct=True),
                                    AIQuestionGenOption(key="C", text="A statement that confuses necessary and sufficient conditions", correct=False),
                                    AIQuestionGenOption(key="D", text="A memorized slogan that ignores mechanism", correct=False),
                                ],
                                answer="B",
                                explanation="Contrast mode targets misconception diagnosis and discrimination quality.",
                            )
                        )
                    else:
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
                    if question_mode and derive_mode == "contrast":
                        queue.append(
                            _DraftQuestion(
                                qtype="True/False",
                                prompt=f"True or False: The common claim about {topic} in \"{seed_short}\" is universally valid without boundary conditions.",
                                options=[],
                                answer="False",
                                explanation="Contrast mode marks overgeneralized misconception claims as false.",
                            )
                        )
                    elif question_mode and derive_mode == "extension":
                        queue.append(
                            _DraftQuestion(
                                qtype="True/False",
                                prompt=f"True or False: Extending the seed question on {topic} requires an extra inference step beyond direct recall.",
                                options=[],
                                answer="True",
                                explanation="Extension mode should introduce deeper reasoning than the source item.",
                            )
                        )
                    else:
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
                    if question_mode and derive_mode == "extension":
                        queue.append(
                            _DraftQuestion(
                                qtype="Fill-blank",
                                prompt=f"Fill in the blank: To extend the seed question on {topic}, the next required concept is _______.",
                                options=[],
                                answer="reasoning step",
                                explanation="Extension style fill-in prompts ask for the next level concept.",
                            )
                        )
                    elif question_mode and derive_mode == "contrast":
                        queue.append(
                            _DraftQuestion(
                                qtype="Fill-blank",
                                prompt=f"Fill in the blank: A common misconception about {topic} often ignores _______.",
                                options=[],
                                answer="boundary conditions",
                                explanation="Contrast style highlights missing conditions behind wrong answers.",
                            )
                        )
                    else:
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
                    if question_mode and derive_mode == "contrast":
                        queue.append(
                            _DraftQuestion(
                                qtype="Essay",
                                prompt=f"Write an essay contrasting correct and incorrect reasoning patterns for {topic}, then justify which is valid.",
                                options=[],
                                answer=None,
                                explanation="Contrast essays should compare misconceptions with rigorous reasoning.",
                            )
                        )
                    elif question_mode and derive_mode == "extension":
                        queue.append(
                            _DraftQuestion(
                                qtype="Essay",
                                prompt=f"Write an essay extending \"{seed_short}\" to a harder case of {topic}, including an extra reasoning layer.",
                                options=[],
                                answer=None,
                                explanation="Extension essays should move beyond the source to deeper transfer tasks.",
                            )
                        )
                    else:
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
                    if question_mode and derive_mode == "variation":
                        queue.append(
                            _DraftQuestion(
                                qtype="Short Answer",
                                prompt=f"Use 2-3 sentences to explain how {topic} changes under a variant condition, then give one example.",
                                options=[],
                                answer=None,
                                explanation="Variation short answers should preserve concept but alter scenario conditions.",
                            )
                        )
                    elif question_mode and derive_mode == "extension":
                        queue.append(
                            _DraftQuestion(
                                qtype="Short Answer",
                                prompt=f"Use 2-3 sentences to extend \"{seed_short}\" by adding one deeper reasoning step about {topic}.",
                                options=[],
                                answer=None,
                                explanation="Extension short answers should show one extra reasoning layer.",
                            )
                        )
                    elif question_mode and derive_mode == "contrast":
                        queue.append(
                            _DraftQuestion(
                                qtype="Short Answer",
                                prompt=f"Use 2-3 sentences to contrast a correct explanation of {topic} with one common misconception.",
                                options=[],
                                answer=None,
                                explanation="Contrast short answers focus on discriminating correct vs incorrect reasoning.",
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
        sanitized = re.sub(r"\*\*Answer:\*\*\s*[^\n]+", "", sanitized, flags=re.IGNORECASE)
        sanitized = re.sub(r"\bAnswer:\s*[^\n]+", "", sanitized, flags=re.IGNORECASE)
        sanitized = sanitized.replace("**", "")
        sanitized = re.sub(r"\s+", " ", sanitized).strip(" ,.-")
        return sanitized
