from __future__ import annotations

from datetime import datetime
from difflib import SequenceMatcher
from uuid import uuid4
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Question, QuestionBankItem, QuestionBankOption, QuestionItem, QuestionStatus
from app.schemas.quiz_generation import GeneratedQuizItem, QuizGenerateRequest, QuizGenerateResponse


class QuizGenerationService:
    @staticmethod
    async def generate(db: AsyncSession, payload: QuizGenerateRequest, actor_id: int = 1) -> QuizGenerateResponse:
        # 首版规则：固定 5 道单选 + 1 道简答；若 question_count != 6 则按 80/20 兜底
        mcq_target, sa_target = QuizGenerationService._split_types(payload.question_count)

        bank_candidates = await QuizGenerationService._fetch_bank_candidates(db, payload)

        selected_mcq = [q for q in bank_candidates if q.question_type == "MCQ_SINGLE"][:mcq_target]
        selected_sa = [q for q in bank_candidates if q.question_type == "SHORT_ANSWER"][:sa_target]

        reused = selected_mcq + selected_sa
        missing_mcq = max(0, mcq_target - len(selected_mcq))
        missing_sa = max(0, sa_target - len(selected_sa))
        seen_prompts = [item.prompt for item in reused]

        generated = []
        if missing_mcq > 0:
            generated.extend(
                await QuizGenerationService._generate_and_store_bank_items(
                    db=db,
                    payload=payload,
                    actor_id=actor_id,
                    question_type="MCQ_SINGLE",
                    count=missing_mcq,
                    seen_prompts=seen_prompts,
                )
            )
            seen_prompts.extend(item.prompt for item in generated)
        if missing_sa > 0:
            generated.extend(
                await QuizGenerationService._generate_and_store_bank_items(
                    db=db,
                    payload=payload,
                    actor_id=actor_id,
                    question_type="SHORT_ANSWER",
                    count=missing_sa,
                    seen_prompts=seen_prompts,
                )
            )

        final_bank_items = reused + generated

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
            if bank_item.question_type == "MCQ_SINGLE":
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
    def _split_types(question_count: int) -> tuple[int, int]:
        if question_count == 6:
            return 5, 1
        mcq = max(1, round(question_count * 0.8))
        sa = max(0, question_count - mcq)
        return mcq, sa

    @staticmethod
    async def _fetch_bank_candidates(db: AsyncSession, payload: QuizGenerateRequest) -> list[QuestionBankItem]:
        stmt = select(QuestionBankItem).where(
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

            source_type = "textbook" if payload.mode == "textbook" else "paper"
            source_id = payload.textbook_id if payload.mode == "textbook" else payload.source_paper_id
            item = QuestionBankItem(
                publisher="generated",
                grade=payload.grade,
                subject=payload.subject,
                semester=None,
                question_type=question_type,
                prompt=prompt,
                difficulty=payload.difficulty,
                answer_text="TBD",
                explanation="TBD",
                chapter=payload.chapter,
                source_type=source_type,
                source_id=source_id,
                created_by=actor_id,
                created_at=datetime.utcnow(),
            )
            db.add(item)
            await db.flush()

            if question_type == "MCQ_SINGLE":
                for key, text in [("A", "Option A"), ("B", "Option B"), ("C", "Option C"), ("D", "Option D")]:
                    db.add(
                        QuestionBankOption(
                            bank_question_id=item.id,
                            option_key=key,
                            option_text=text,
                            is_correct=True if key == "A" else False,
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
            return f"[{subject}] ({difficulty}) MCQ #{idx} [{unique_token}]: template prompt"
        return f"[{subject}] ({difficulty}) SHORT_ANSWER #{idx} [{unique_token}]: template prompt"
