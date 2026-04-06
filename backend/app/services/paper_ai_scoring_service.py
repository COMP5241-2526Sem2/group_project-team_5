from __future__ import annotations

from dataclasses import dataclass
import json

from fastapi import HTTPException
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Course, User
from app.models.assessment import (
    Paper,
    PaperAIAdoptionAudit,
    PaperAttempt,
    PaperAttemptAnswer,
    PaperAttemptAIScore,
    PaperAttemptStatus,
    PaperQuestion,
)
from app.models.user import AccountType
from app.schemas.paper_ai_scoring import (
    PaperAIAdoptBatchItem,
    PaperAIAdoptBatchResponse,
    PaperAIAdoptResponse,
    PaperAISuggestionItem,
    PaperAISuggestionsResponse,
)
from app.schemas.paper_attempts import PaperGradeBatchItem
from app.services.paper_attempt_service import OBJECTIVE_TYPES, PaperAttemptService


@dataclass(slots=True)
class _SuggestionResult:
    score: float
    feedback: str
    confidence: float
    rationale: str
    model_name: str
    status: str
    error_message: str | None


class PaperAIScoringService:
    DEFAULT_PROMPT_VERSION = "v1"
    DEFAULT_MODEL_NAME = "heuristic-v1"
    _client: AsyncOpenAI | None = None

    @staticmethod
    async def generate_suggestions(
        db: AsyncSession,
        actor_id: int,
        attempt_id: int,
        *,
        prompt_version: str | None = None,
    ) -> PaperAISuggestionsResponse:
        attempt = await PaperAIScoringService._get_attempt_for_teacher_or_admin(db, attempt_id, actor_id)
        version = (prompt_version or PaperAIScoringService.DEFAULT_PROMPT_VERSION).strip()
        if not version:
            version = PaperAIScoringService.DEFAULT_PROMPT_VERSION

        question_rows = await db.execute(
            select(PaperQuestion).where(PaperQuestion.paper_id == attempt.paper_id).order_by(PaperQuestion.order_num.asc())
        )
        questions = [q for q in question_rows.scalars().all() if q.question_type not in OBJECTIVE_TYPES]

        stored_answers = await db.execute(
            select(PaperAttemptAnswer).where(PaperAttemptAnswer.attempt_id == attempt.id)
        )
        answer_map = {ans.question_id: ans for ans in stored_answers.scalars().all()}

        items: list[PaperAISuggestionItem] = []
        for question in questions:
            answer = answer_map.get(question.id)
            suggestion = await PaperAIScoringService._suggest_for_question(
                question=question,
                answer_text=answer.text_answer if answer else None,
                prompt_version=version,
            )

            row = await db.scalar(
                select(PaperAttemptAIScore).where(
                    PaperAttemptAIScore.attempt_id == attempt.id,
                    PaperAttemptAIScore.question_id == question.id,
                    PaperAttemptAIScore.prompt_version == version,
                )
            )
            if row is None:
                row = PaperAttemptAIScore(
                    attempt_id=attempt.id,
                    question_id=question.id,
                    model_name=PaperAIScoringService.DEFAULT_MODEL_NAME,
                    prompt_version=version,
                )
                db.add(row)

            row.suggested_score = suggestion.score
            row.suggested_feedback = suggestion.feedback
            row.confidence = suggestion.confidence
            row.rationale = suggestion.rationale
            row.model_name = suggestion.model_name
            row.status = suggestion.status
            row.error_message = suggestion.error_message

        await db.commit()

        rows = await db.execute(
            select(PaperAttemptAIScore)
            .where(PaperAttemptAIScore.attempt_id == attempt.id, PaperAttemptAIScore.prompt_version == version)
            .order_by(PaperAttemptAIScore.question_id.asc(), PaperAttemptAIScore.id.asc())
        )
        for row in rows.scalars().all():
            items.append(PaperAISuggestionItem(**PaperAIScoringService._to_item_dict(row)))

        return PaperAISuggestionsResponse(attempt_id=attempt.id, items=items)

    @staticmethod
    async def list_suggestions(
        db: AsyncSession,
        actor_id: int,
        attempt_id: int,
        *,
        prompt_version: str | None = None,
    ) -> PaperAISuggestionsResponse:
        attempt = await PaperAIScoringService._get_attempt_for_teacher_or_admin(db, attempt_id, actor_id)
        version = (prompt_version or PaperAIScoringService.DEFAULT_PROMPT_VERSION).strip()
        if not version:
            version = PaperAIScoringService.DEFAULT_PROMPT_VERSION

        rows = await db.execute(
            select(PaperAttemptAIScore)
            .where(PaperAttemptAIScore.attempt_id == attempt.id, PaperAttemptAIScore.prompt_version == version)
            .order_by(PaperAttemptAIScore.question_id.asc(), PaperAttemptAIScore.id.asc())
        )

        items = [PaperAISuggestionItem(**PaperAIScoringService._to_item_dict(row)) for row in rows.scalars().all()]
        return PaperAISuggestionsResponse(attempt_id=attempt.id, items=items)

    @staticmethod
    async def adopt_suggestion(
        db: AsyncSession,
        actor_id: int,
        attempt_id: int,
        question_id: int,
        *,
        override_score: float | None,
        override_feedback: str | None,
        prompt_version: str | None = None,
    ) -> PaperAIAdoptResponse:
        attempt = await PaperAIScoringService._get_attempt_for_teacher_or_admin(db, attempt_id, actor_id)
        version = (prompt_version or PaperAIScoringService.DEFAULT_PROMPT_VERSION).strip() or PaperAIScoringService.DEFAULT_PROMPT_VERSION

        suggestion = await PaperAIScoringService._get_suggestion_or_404(db, attempt.id, question_id, version)
        if suggestion.status != "success":
            raise HTTPException(status_code=400, detail="ai suggestion not ready")

        adopted_score = override_score if override_score is not None else float(suggestion.suggested_score or 0)
        adopted_feedback = override_feedback if override_feedback is not None else suggestion.suggested_feedback

        graded = await PaperAttemptService.grade_answer(
            db=db,
            actor_id=actor_id,
            attempt_id=attempt.id,
            question_id=question_id,
            awarded_score=adopted_score,
            teacher_feedback=adopted_feedback,
            is_correct=None,
            auto_commit=False,
        )

        db.add(
            PaperAIAdoptionAudit(
                attempt_id=attempt.id,
                question_id=question_id,
                actor_id=actor_id,
                source_ai_score_id=suggestion.id,
                adopted_score=adopted_score,
                adopted_feedback=adopted_feedback,
                action="override" if (override_score is not None or override_feedback is not None) else "adopt",
            )
        )
        await db.commit()

        return PaperAIAdoptResponse(
            attempt_id=attempt.id,
            question_id=question_id,
            adopted_score=adopted_score,
            attempt_status=graded.attempt_status,
            total_score=graded.total_score,
        )

    @staticmethod
    async def adopt_suggestions_batch(
        db: AsyncSession,
        actor_id: int,
        attempt_id: int,
        items: list[PaperAIAdoptBatchItem],
        *,
        prompt_version: str | None = None,
    ) -> PaperAIAdoptBatchResponse:
        attempt = await PaperAIScoringService._get_attempt_for_teacher_or_admin(db, attempt_id, actor_id)
        version = (prompt_version or PaperAIScoringService.DEFAULT_PROMPT_VERSION).strip() or PaperAIScoringService.DEFAULT_PROMPT_VERSION

        suggestions: dict[int, PaperAttemptAIScore] = {}
        grade_items: list[PaperGradeBatchItem] = []

        for item in items:
            suggestion = await PaperAIScoringService._get_suggestion_or_404(db, attempt.id, item.question_id, version)
            if suggestion.status != "success":
                raise HTTPException(status_code=400, detail="ai suggestion not ready")
            suggestions[item.question_id] = suggestion

            adopted_score = item.override_score if item.override_score is not None else float(suggestion.suggested_score or 0)
            adopted_feedback = item.override_feedback if item.override_feedback is not None else suggestion.suggested_feedback
            grade_items.append(
                PaperGradeBatchItem(
                    question_id=item.question_id,
                    awarded_score=adopted_score,
                    teacher_feedback=adopted_feedback,
                    is_correct=None,
                )
            )

        graded = await PaperAttemptService.grade_answers_batch(
            db=db,
            actor_id=actor_id,
            attempt_id=attempt.id,
            items=grade_items,
        )

        response_items: list[PaperAIAdoptResponse] = []
        for req_item, res_item in zip(items, graded.items, strict=False):
            suggestion = suggestions[req_item.question_id]
            db.add(
                PaperAIAdoptionAudit(
                    attempt_id=attempt.id,
                    question_id=req_item.question_id,
                    actor_id=actor_id,
                    source_ai_score_id=suggestion.id,
                    adopted_score=res_item.awarded_score,
                    adopted_feedback=req_item.override_feedback if req_item.override_feedback is not None else suggestion.suggested_feedback,
                    action="override" if (req_item.override_score is not None or req_item.override_feedback is not None) else "adopt",
                )
            )
            response_items.append(
                PaperAIAdoptResponse(
                    attempt_id=attempt.id,
                    question_id=req_item.question_id,
                    adopted_score=res_item.awarded_score,
                    attempt_status=graded.attempt_status,
                    total_score=graded.total_score,
                )
            )

        await db.commit()

        return PaperAIAdoptBatchResponse(
            attempt_id=attempt.id,
            attempt_status=graded.attempt_status,
            total_score=graded.total_score,
            items=response_items,
        )

    @staticmethod
    def _heuristic_suggest(question: PaperQuestion, answer_text: str | None) -> _SuggestionResult:
        max_score = float(question.score)
        text = (answer_text or "").strip()

        if not text:
            return _SuggestionResult(
                score=0.0,
                feedback="答案为空，建议给 0 分。",
                confidence=0.95,
                rationale="学生未提供可评分文本。",
                model_name=PaperAIScoringService.DEFAULT_MODEL_NAME,
                status="success",
                error_message=None,
            )

        length_factor = min(len(text) / 120.0, 1.0)
        keyword_bonus = 0.15 if question.answer_text and question.answer_text.strip() and question.answer_text.strip() in text else 0.0
        raw = (0.45 + 0.4 * length_factor + keyword_bonus) * max_score
        score = round(min(max(raw, 0), max_score), 2)

        if score >= 0.8 * max_score:
            feedback = "答案结构较完整，覆盖要点较多，可给高分。"
            confidence = 0.72
        elif score >= 0.5 * max_score:
            feedback = "答案覆盖部分要点，建议中等分并补充关键术语。"
            confidence = 0.62
        else:
            feedback = "答案要点覆盖不足，建议低分并提示补充核心概念。"
            confidence = 0.58

        rationale = f"基于文本长度与要点覆盖的启发式评分，最大分 {max_score}。"
        return _SuggestionResult(
            score=score,
            feedback=feedback,
            confidence=confidence,
            rationale=rationale,
            model_name=PaperAIScoringService.DEFAULT_MODEL_NAME,
            status="success",
            error_message=None,
        )

    @staticmethod
    async def _suggest_for_question(
        question: PaperQuestion,
        answer_text: str | None,
        prompt_version: str,
    ) -> _SuggestionResult:
        if not PaperAIScoringService._llm_enabled():
            return PaperAIScoringService._heuristic_suggest(question, answer_text)

        try:
            return await PaperAIScoringService._llm_suggest(question, answer_text, prompt_version)
        except Exception as exc:  # fallback is deliberate for production resiliency
            heuristic = PaperAIScoringService._heuristic_suggest(question, answer_text)
            return _SuggestionResult(
                score=heuristic.score,
                feedback=heuristic.feedback,
                confidence=heuristic.confidence,
                rationale=heuristic.rationale,
                model_name=heuristic.model_name,
                status="fallback",
                error_message=str(exc)[:500],
            )

    @staticmethod
    def _llm_enabled() -> bool:
        provider = settings.ai_scoring_provider.strip().lower()
        return provider in {"openai", "ohmygpt"} and bool(settings.ohmygpt_api_key.strip())

    @staticmethod
    def _get_client() -> AsyncOpenAI:
        if PaperAIScoringService._client is None:
            PaperAIScoringService._client = AsyncOpenAI(
                api_key=settings.ohmygpt_api_key,
                base_url=settings.ohmygpt_base_url,
                timeout=settings.ai_scoring_timeout_sec,
            )
        return PaperAIScoringService._client

    @staticmethod
    async def _llm_suggest(
        question: PaperQuestion,
        answer_text: str | None,
        prompt_version: str,
    ) -> _SuggestionResult:
        max_score = float(question.score)
        text = (answer_text or "").strip()

        if not text:
            return PaperAIScoringService._heuristic_suggest(question, answer_text)

        client = PaperAIScoringService._get_client()
        resp = await client.chat.completions.create(
            model=settings.ai_scoring_model,
            temperature=settings.ai_scoring_temperature,
            max_tokens=settings.ai_scoring_max_tokens,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a strict but fair grading assistant for school exams. "
                        "Return only valid JSON with keys: score, feedback, confidence, rationale."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"prompt_version={prompt_version}\n"
                        f"question_type={question.question_type}\n"
                        f"max_score={max_score}\n"
                        f"question_prompt={question.prompt}\n"
                        f"reference_answer={question.answer_text or ''}\n"
                        f"student_answer={text}\n"
                        "Scoring requirements:\n"
                        "1) score must be between 0 and max_score\n"
                        "2) confidence must be between 0 and 1\n"
                        "3) feedback should be concise and actionable\n"
                        "4) rationale should briefly explain score basis"
                    ),
                },
            ],
        )

        content = resp.choices[0].message.content if resp.choices else None
        if not content:
            raise RuntimeError("empty LLM response")

        payload = json.loads(content)
        raw_score = float(payload.get("score", 0.0))
        raw_confidence = float(payload.get("confidence", 0.6))
        score = round(min(max(raw_score, 0.0), max_score), 2)
        confidence = min(max(raw_confidence, 0.0), 1.0)
        feedback = str(payload.get("feedback", "")).strip() or "建议按关键要点评估后给分。"
        rationale = str(payload.get("rationale", "")).strip() or "基于题目与作答语义匹配生成建议。"

        return _SuggestionResult(
            score=score,
            feedback=feedback,
            confidence=confidence,
            rationale=rationale,
            model_name=settings.ai_scoring_model,
            status="success",
            error_message=None,
        )

    @staticmethod
    async def _get_attempt_for_teacher_or_admin(db: AsyncSession, attempt_id: int, actor_id: int) -> PaperAttempt:
        actor = await PaperAIScoringService._require_teacher_or_admin(db, actor_id)
        row = await db.execute(
            select(PaperAttempt, Course)
            .join(Paper, Paper.id == PaperAttempt.paper_id)
            .join(Course, Course.id == Paper.course_id)
            .where(PaperAttempt.id == attempt_id)
        )
        resolved = row.first()
        if resolved is None:
            raise HTTPException(status_code=404, detail="attempt not found")

        attempt, course = resolved
        if actor.account_type == AccountType.TEACHER and course.teacher_id != actor.id:
            raise HTTPException(status_code=403, detail="forbidden for this course")
        return attempt

    @staticmethod
    async def _require_teacher_or_admin(db: AsyncSession, actor_id: int) -> User:
        user = await db.get(User, actor_id)
        if user is None:
            raise HTTPException(status_code=404, detail="user not found")
        if user.account_type not in {AccountType.TEACHER, AccountType.ADMIN}:
            raise HTTPException(status_code=403, detail="teacher/admin role required")
        return user

    @staticmethod
    async def _get_suggestion_or_404(
        db: AsyncSession,
        attempt_id: int,
        question_id: int,
        prompt_version: str,
    ) -> PaperAttemptAIScore:
        row = await db.scalar(
            select(PaperAttemptAIScore).where(
                PaperAttemptAIScore.attempt_id == attempt_id,
                PaperAttemptAIScore.question_id == question_id,
                PaperAttemptAIScore.prompt_version == prompt_version,
            )
        )
        if row is None:
            raise HTTPException(status_code=404, detail="ai suggestion not found")
        return row

    @staticmethod
    def _to_item_dict(row: PaperAttemptAIScore) -> dict:
        return {
            "ai_score_id": row.id,
            "question_id": row.question_id,
            "suggested_score": float(row.suggested_score) if row.suggested_score is not None else None,
            "suggested_feedback": row.suggested_feedback,
            "confidence": float(row.confidence) if row.confidence is not None else None,
            "rationale": row.rationale,
            "model_name": row.model_name,
            "prompt_version": row.prompt_version,
            "status": row.status,
            "error_message": row.error_message,
            "created_at": row.created_at,
        }
