from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from typing import cast
from uuid import uuid4

from openai import AsyncOpenAI
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Question, QuestionBankItem, QuestionBankOption, QuestionItem, QuestionStatus
from app.schemas.quiz_generation import GeneratedQuizItem, QuizGenerateRequest, QuizGenerateResponse


@dataclass(slots=True)
class _GeneratedQuestionContent:
    prompt: str
    answer_text: str
    explanation: str
    options: list[tuple[str, str]]


class QuizGenerationService:
    TYPE_PRIORITY = [
        "MCQ_SINGLE",
        "MCQ_MULTI",
        "TRUE_FALSE",
        "FILL_BLANK",
        "SHORT_ANSWER",
        "ESSAY",
    ]
    _client: AsyncOpenAI | None = None

    @staticmethod
    async def generate(db: AsyncSession, payload: QuizGenerateRequest, actor_id: int = 1) -> QuizGenerateResponse:
        type_targets = payload.type_targets or QuizGenerationService._default_type_targets(payload.question_count)

        bank_candidates = await QuizGenerationService._fetch_bank_candidates(
            db,
            payload,
            question_types=list(type_targets.keys()),
        )

        reused: list[QuestionBankItem] = []
        seen_prompts = [item.prompt for item in reused]
        generated: list[QuestionBankItem] = []

        for question_type in QuizGenerationService.TYPE_PRIORITY:
            target = type_targets.get(question_type, 0)
            if target <= 0:
                continue

            selected = [q for q in bank_candidates if q.question_type == question_type][:target]
            reused.extend(selected)
            seen_prompts.extend(item.prompt for item in selected)

            missing = max(0, target - len(selected))
            if missing <= 0:
                continue

            created = await QuizGenerationService._generate_and_store_bank_items(
                db=db,
                payload=payload,
                actor_id=actor_id,
                question_type=question_type,
                count=missing,
                seen_prompts=seen_prompts,
            )
            generated.extend(created)
            seen_prompts.extend(item.prompt for item in created)

        final_bank_items = []
        for question_type in QuizGenerationService.TYPE_PRIORITY:
            final_bank_items.extend([item for item in reused if item.question_type == question_type])
            final_bank_items.extend([item for item in generated if item.question_type == question_type])

        if len(final_bank_items) != payload.question_count:
            # Defensive trim/pad in case unexpected targets are provided.
            final_bank_items = final_bank_items[: payload.question_count]
            if len(final_bank_items) < payload.question_count:
                final_bank_items.extend(
                    await QuizGenerationService._generate_and_store_bank_items(
                        db=db,
                        payload=payload,
                        actor_id=actor_id,
                        question_type="SHORT_ANSWER",
                        count=payload.question_count - len(final_bank_items),
                        seen_prompts=seen_prompts,
                    )
                )
            

        question = Question(
            title=QuizGenerationService._build_title(payload),
            course_id=1,
            due_at=None,
            duration_min=payload.duration_min,
            total_score=payload.total_score,
            status=QuestionStatus.DRAFT,
            created_by=actor_id,
            created_at=datetime.utcnow(),
        )
        db.add(question)
        await db.flush()

        score_each = round(payload.total_score / max(1, payload.question_count), 2)
        response_items: list[GeneratedQuizItem] = []

        for idx, bank_item in enumerate(final_bank_items, start=1):
            db.add(
                QuestionItem(
                    question_id=question.id,
                    bank_question_id=bank_item.id,
                    order_num=idx,
                    score=score_each,
                    prompt_snapshot=bank_item.prompt,
                )
            )

            options = None
            if bank_item.question_type in {"MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE"}:
                option_rows = await db.execute(
                    select(QuestionBankOption.option_key, QuestionBankOption.option_text)
                    .where(QuestionBankOption.bank_question_id == bank_item.id)
                    .order_by(QuestionBankOption.option_key)
                )
                options = [{"key": k, "text": t} for k, t in option_rows.all()]

            response_items.append(
                GeneratedQuizItem(
                    order_num=idx,
                    question_type=cast("str", bank_item.question_type),
                    prompt=bank_item.prompt,
                    score=score_each,
                    bank_question_id=bank_item.id,
                    source_type=cast("str", bank_item.source_type),
                    source_id=bank_item.source_id,
                    options=options,
                )
            )

        await db.commit()

        return QuizGenerateResponse(
            question_id=question.id,
            title=question.title,
            status="draft",
            reused_count=len(reused),
            generated_count=len(generated),
            items=response_items,
        )

    @staticmethod
    def _default_type_targets(question_count: int) -> dict[str, int]:
        if question_count == 6:
            return {"MCQ_SINGLE": 5, "SHORT_ANSWER": 1}

        # Default mix: objective-heavy with one subjective question when possible.
        mcq_single = max(1, round(question_count * 0.5))
        true_false = max(0, round(question_count * 0.15))
        fill_blank = max(0, round(question_count * 0.15))
        short_answer = max(0, question_count - mcq_single - true_false - fill_blank)

        targets = {
            "MCQ_SINGLE": mcq_single,
            "TRUE_FALSE": true_false,
            "FILL_BLANK": fill_blank,
            "SHORT_ANSWER": short_answer,
        }

        # Ensure sum exactly equals question_count.
        diff = question_count - sum(targets.values())
        if diff > 0:
            targets["MCQ_SINGLE"] += diff
        elif diff < 0:
            targets["MCQ_SINGLE"] = max(1, targets["MCQ_SINGLE"] + diff)

        return {k: v for k, v in targets.items() if v > 0}

    @staticmethod
    async def _fetch_bank_candidates(
        db: AsyncSession,
        payload: QuizGenerateRequest,
        *,
        question_types: list[str],
    ) -> list[QuestionBankItem]:
        stmt = select(QuestionBankItem).where(
            QuestionBankItem.subject == payload.subject,
            QuestionBankItem.grade == payload.grade,
            QuestionBankItem.difficulty == payload.difficulty,
            QuestionBankItem.question_type.in_(question_types),
        )

        if payload.mode == "textbook" and payload.chapter:
            stmt = stmt.where(QuestionBankItem.chapter.like(f"{payload.chapter}%"))

        if payload.mode == "paper_mimic" and payload.source_paper_id:
            stmt = stmt.where(
                QuestionBankItem.source_type == "paper",
                QuestionBankItem.source_id == payload.source_paper_id,
            )

        stmt = stmt.order_by(func.random())

        rows = await db.execute(stmt)
        candidates = list(rows.scalars().all())
        return [item for item in candidates if not await QuizGenerationService._is_similar_to_existing(db, item.prompt, payload)]

    @staticmethod
    async def _generate_and_store_bank_items(
        db: AsyncSession,
        payload: QuizGenerateRequest,
        actor_id: int,
        question_type: str,
        count: int,
        seen_prompts: list[str],
    ) -> list[QuestionBankItem]:
        # LLM 优先，失败时降级模板，确保生成链路稳定可用。
        created: list[QuestionBankItem] = []

        for i in range(count):
            content = await QuizGenerationService._build_question_content(
                db=db,
                payload=payload,
                question_type=question_type,
                index=i + 1,
                seen_prompts=seen_prompts,
            )

            source_id = payload.textbook_id if payload.mode == "textbook" else payload.source_paper_id
            item = QuestionBankItem(
                publisher="generated",
                grade=payload.grade,
                subject=payload.subject,
                semester=None,
                question_type=question_type,
                prompt=content.prompt,
                difficulty=payload.difficulty,
                answer_text=content.answer_text,
                explanation=content.explanation,
                chapter=payload.chapter,
                source_type="ai_generated",
                source_id=source_id,
                created_by=actor_id,
                created_at=datetime.utcnow(),
            )
            db.add(item)
            await db.flush()

            if question_type in {"MCQ_SINGLE", "MCQ_MULTI"}:
                correct_keys = QuizGenerationService._parse_choice_answer_keys(question_type, content.answer_text)
                for key, text in content.options:
                    db.add(
                        QuestionBankOption(
                            bank_question_id=item.id,
                            option_key=key,
                            option_text=text,
                            is_correct=key in correct_keys,
                        )
                    )
            elif question_type == "TRUE_FALSE":
                correct = QuizGenerationService._normalize_true_false_answer(content.answer_text)
                for key, text in content.options:
                    db.add(
                        QuestionBankOption(
                            bank_question_id=item.id,
                            option_key=key,
                            option_text=text,
                            is_correct=key == correct,
                        )
                    )

            created.append(item)
            seen_prompts.append(content.prompt)

        return created

    @staticmethod
    async def _build_question_content(
        db: AsyncSession,
        payload: QuizGenerateRequest,
        question_type: str,
        index: int,
        seen_prompts: list[str],
    ) -> _GeneratedQuestionContent:
        if QuizGenerationService._llm_enabled():
            try:
                candidate = await QuizGenerationService._llm_generate_question_content(
                    payload=payload,
                    question_type=question_type,
                    index=index,
                )
                if not await QuizGenerationService._is_similar_to_existing(db, candidate.prompt, payload, seen_prompts):
                    return candidate
            except Exception:
                # fallback to template generation
                pass

        prompt = QuizGenerationService._template_prompt(
            payload.subject,
            payload.difficulty,
            question_type,
            index,
            unique_token=uuid4().hex[:8],
        )
        attempt = 0
        while await QuizGenerationService._is_similar_to_existing(db, prompt, payload, seen_prompts):
            attempt += 1
            if attempt >= 5:
                break
            prompt = QuizGenerationService._template_prompt(
                payload.subject,
                payload.difficulty,
                question_type,
                index,
                unique_token=uuid4().hex[:8],
            )

        return _GeneratedQuestionContent(
            prompt=prompt,
            answer_text=QuizGenerationService._template_answer(question_type),
            explanation="TBD",
            options=QuizGenerationService._default_options(question_type),
        )

    @staticmethod
    def _llm_enabled() -> bool:
        provider = settings.quiz_generation_provider.strip().lower()
        return provider in {"openai", "ohmygpt"} and bool(settings.ohmygpt_api_key.strip())

    @staticmethod
    def _get_client() -> AsyncOpenAI:
        if QuizGenerationService._client is None:
            QuizGenerationService._client = AsyncOpenAI(
                api_key=settings.ohmygpt_api_key,
                base_url=settings.ohmygpt_base_url,
                timeout=settings.quiz_generation_timeout_sec,
            )
        return QuizGenerationService._client

    @staticmethod
    async def _llm_generate_question_content(
        payload: QuizGenerateRequest,
        question_type: str,
        index: int,
    ) -> _GeneratedQuestionContent:
        client = QuizGenerationService._get_client()
        response = await client.chat.completions.create(
            model=settings.quiz_generation_model,
            temperature=settings.quiz_generation_temperature,
            max_tokens=settings.quiz_generation_max_tokens,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You generate school quiz items. Return strict JSON only with keys: "
                        "prompt, answer_text, explanation, options. "
                        "For MCQ_SINGLE/MCQ_MULTI return exactly 4 options A-D. "
                        "For TRUE_FALSE return T/F options. "
                        "For SHORT_ANSWER/ESSAY/FILL_BLANK options should be empty array."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"mode={payload.mode}\n"
                        f"subject={payload.subject}\n"
                        f"grade={payload.grade}\n"
                        f"difficulty={payload.difficulty}\n"
                        f"question_type={question_type}\n"
                        f"index={index}\n"
                        f"chapter={payload.chapter or ''}\n"
                        "Rules:\n"
                        "1) Prompt must be concise and clear.\n"
                        "2) answer_text must match type: single key(A-D)/multi keys(A,C)/T|F/text.\n"
                        "3) No markdown, JSON only."
                    ),
                },
            ],
        )

        raw = response.choices[0].message.content if response.choices else None
        if not raw:
            raise RuntimeError("empty LLM response")

        parsed = json.loads(raw)
        prompt = str(parsed.get("prompt", "")).strip()
        if not prompt:
            raise RuntimeError("LLM prompt is empty")

        answer_text = str(parsed.get("answer_text", "")).strip() or QuizGenerationService._template_answer(question_type)
        explanation = str(parsed.get("explanation", "")).strip() or "Generated by LLM"

        options = QuizGenerationService._normalize_options(question_type, parsed.get("options"))

        return _GeneratedQuestionContent(
            prompt=prompt,
            answer_text=answer_text,
            explanation=explanation,
            options=options,
        )

    @staticmethod
    def _normalize_options(question_type: str, raw_options: object) -> list[tuple[str, str]]:
        defaults = QuizGenerationService._default_options(question_type)
        if question_type not in {"MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE"}:
            return []
        if not isinstance(raw_options, list):
            return defaults

        normalized: list[tuple[str, str]] = []
        for i, raw in enumerate(raw_options):
            if not isinstance(raw, dict):
                continue
            key = str(raw.get("key", "")).strip().upper()
            text = str(raw.get("text", "")).strip()
            if not key:
                key = "ABCD"[i] if question_type in {"MCQ_SINGLE", "MCQ_MULTI"} and i < 4 else ("T" if i == 0 else "F")
            if not text:
                continue
            normalized.append((key, text))

        if question_type in {"MCQ_SINGLE", "MCQ_MULTI"}:
            if len(normalized) < 4:
                return defaults
            ordered = []
            by_key = {k: t for k, t in normalized}
            for key in ["A", "B", "C", "D"]:
                ordered.append((key, by_key.get(key, f"Option {key}")))
            return ordered

        by_key = {k: t for k, t in normalized}
        if "T" not in by_key or "F" not in by_key:
            return defaults
        return [("T", by_key["T"]), ("F", by_key["F"])]

    @staticmethod
    def _default_options(question_type: str) -> list[tuple[str, str]]:
        if question_type in {"MCQ_SINGLE", "MCQ_MULTI"}:
            return [("A", "Option A"), ("B", "Option B"), ("C", "Option C"), ("D", "Option D")]
        if question_type == "TRUE_FALSE":
            return [("T", "True"), ("F", "False")]
        return []

    @staticmethod
    def _parse_choice_answer_keys(question_type: str, answer_text: str) -> set[str]:
        allowed = {"A", "B", "C", "D"}
        cleaned = answer_text.replace("，", ",").replace(" ", "").upper()
        parts = [part for part in cleaned.split(",") if part]
        keys = {part for part in parts if part in allowed}
        if question_type == "MCQ_SINGLE":
            key = next(iter(keys), None)
            return {key} if key else {"A"}
        return keys or {"A", "C"}

    @staticmethod
    def _normalize_true_false_answer(answer_text: str) -> str:
        token = answer_text.strip().upper()
        if token in {"T", "TRUE", "1", "YES"}:
            return "T"
        if token in {"F", "FALSE", "0", "NO"}:
            return "F"
        return "T"

    @staticmethod
    async def _is_similar_to_existing(
        db: AsyncSession, prompt: str, payload: QuizGenerateRequest, seen_prompts: list[str] | None = None
    ) -> bool:
        stmt = select(QuestionBankItem.prompt).where(
            QuestionBankItem.subject == payload.subject,
            QuestionBankItem.grade == payload.grade,
            QuestionBankItem.difficulty == payload.difficulty,
        )
        if payload.mode == "textbook" and payload.chapter:
            stmt = stmt.where(QuestionBankItem.chapter.like(f"{payload.chapter}%"))
        if payload.mode == "paper_mimic" and payload.source_paper_id:
            stmt = stmt.where(
                QuestionBankItem.source_type == "paper",
                QuestionBankItem.source_id == payload.source_paper_id,
            )

        rows = await db.execute(stmt)
        for existing_prompt in rows.scalars().all():
            if SequenceMatcher(None, prompt.lower(), existing_prompt.lower()).ratio() > 0.9:
                return True
        for existing_prompt in seen_prompts or []:
            if SequenceMatcher(None, prompt.lower(), existing_prompt.lower()).ratio() > 0.9:
                return True
        return False

    @staticmethod
    def _build_title(payload: QuizGenerateRequest) -> str:
        base = f"{payload.subject}-{payload.grade}-{payload.difficulty}-quiz"
        return f"{base}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    @staticmethod
    def _template_prompt(subject: str, difficulty: str, question_type: str, idx: int, unique_token: str) -> str:
        if question_type == "MCQ_SINGLE":
            return f"[{subject}] ({difficulty}) MCQ_SINGLE #{idx} [{unique_token}]: template prompt"
        if question_type == "MCQ_MULTI":
            return f"[{subject}] ({difficulty}) MCQ_MULTI #{idx} [{unique_token}]: select all that apply"
        if question_type == "TRUE_FALSE":
            return f"[{subject}] ({difficulty}) TRUE_FALSE #{idx} [{unique_token}]: statement"
        if question_type == "FILL_BLANK":
            return f"[{subject}] ({difficulty}) FILL_BLANK #{idx} [{unique_token}]: complete the blank ____"
        if question_type == "ESSAY":
            return f"[{subject}] ({difficulty}) ESSAY #{idx} [{unique_token}]: long-form response"
        return f"[{subject}] ({difficulty}) SHORT_ANSWER #{idx} [{unique_token}]: template prompt"

    @staticmethod
    def _template_answer(question_type: str) -> str:
        if question_type == "MCQ_SINGLE":
            return "A"
        if question_type == "MCQ_MULTI":
            return "A,C"
        if question_type == "TRUE_FALSE":
            return "T"
        if question_type == "FILL_BLANK":
            return "placeholder"
        return "TBD"
