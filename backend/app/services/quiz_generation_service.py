from __future__ import annotations

from datetime import datetime
from difflib import SequenceMatcher
from typing import cast
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Question, QuestionBankItem, QuestionBankOption, QuestionItem, QuestionStatus
from app.schemas.quiz_generation import GeneratedQuizItem, QuizGenerateRequest, QuizGenerateResponse


class QuizGenerationService:
    TYPE_PRIORITY = [
        "MCQ_SINGLE",
        "MCQ_MULTI",
        "TRUE_FALSE",
        "FILL_BLANK",
        "SHORT_ANSWER",
        "ESSAY",
    ]

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
        # 首版占位：无 AI 客户端时，使用模板题补齐，仍严格先入题库再组题
        created: list[QuestionBankItem] = []

        for i in range(count):
            prompt = QuizGenerationService._template_prompt(
                payload.subject,
                payload.difficulty,
                question_type,
                i + 1,
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
                    i + 1,
                    unique_token=uuid4().hex[:8],
                )

            source_id = payload.textbook_id if payload.mode == "textbook" else payload.source_paper_id
            item = QuestionBankItem(
                publisher="generated",
                grade=payload.grade,
                subject=payload.subject,
                semester=None,
                question_type=question_type,
                prompt=prompt,
                difficulty=payload.difficulty,
                answer_text=QuizGenerationService._template_answer(question_type),
                explanation="TBD",
                chapter=payload.chapter,
                source_type="ai_generated",
                source_id=source_id,
                created_by=actor_id,
                created_at=datetime.utcnow(),
            )
            db.add(item)
            await db.flush()

            if question_type in {"MCQ_SINGLE", "MCQ_MULTI"}:
                correct_keys = {"A"} if question_type == "MCQ_SINGLE" else {"A", "C"}
                for key, text in [("A", "Option A"), ("B", "Option B"), ("C", "Option C"), ("D", "Option D")]:
                    db.add(
                        QuestionBankOption(
                            bank_question_id=item.id,
                            option_key=key,
                            option_text=text,
                            is_correct=key in correct_keys,
                        )
                    )
            elif question_type == "TRUE_FALSE":
                for key, text in [("T", "True"), ("F", "False")]:
                    db.add(
                        QuestionBankOption(
                            bank_question_id=item.id,
                            option_key=key,
                            option_text=text,
                            is_correct=key == "T",
                        )
                    )

            created.append(item)
            seen_prompts.append(prompt)

        return created

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
