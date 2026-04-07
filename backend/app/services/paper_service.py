from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Course, User
from app.models.assessment import (
    Paper,
    PaperQuestion,
    PaperQuestionOption,
    PaperSection,
    PaperStatus,
    QuestionBankItem,
    QuestionBankOption,
    QuestionItem,
)
from app.models.user import AccountType
from app.schemas.paper import (
    PaperCreateQuestion,
    PaperCreateRequest,
    PaperCreateResponse,
    PaperDetailResponse,
    PaperListItem,
    PaperListResponse,
    PaperQuestionOptionView,
    PaperQuestionView,
    PaperSectionView,
    PaperStatusMutationResponse,
)
from app.services.paper_export import render_paper_html, render_paper_txt, sanitize_download_filename


@dataclass(slots=True)
class _PaperQueryFilters:
    status: str | None
    subject: str | None
    grade: str | None
    semester: str | None
    exam_type: str | None
    q: str | None


class PaperService:
    @staticmethod
    async def _populate_paper_questions(
        db: AsyncSession,
        paper: Paper,
        payload: PaperCreateRequest,
        actor_id: int,
    ) -> None:
        question_count = len(payload.questions)
        default_score_each = round(payload.total_score / max(1, question_count), 2)

        sections_by_type: dict[str, list[PaperCreateQuestion]] = {}
        for item in payload.questions:
            normalized_type = PaperService._normalize_question_type(item.type)
            sections_by_type.setdefault(normalized_type, []).append(item)

        section_order = 1
        question_order = 1

        for question_type, items in sections_by_type.items():
            score_each = round(sum((q.score if q.score is not None else default_score_each) for q in items) / len(items), 2)
            section = PaperSection(
                paper_id=paper.id,
                title=PaperService._section_title(question_type),
                section_order=section_order,
                question_type=question_type,
                question_count=len(items),
                score_each=score_each,
                total_score=round(sum((q.score if q.score is not None else default_score_each) for q in items), 2),
            )
            db.add(section)
            await db.flush()

            for item in items:
                score = round(item.score if item.score is not None else default_score_each, 2)
                answer_text = PaperService._resolve_answer_text(item)

                bank = QuestionBankItem(
                    publisher="generated",
                    grade=payload.grade,
                    subject=payload.subject,
                    semester=payload.semester,
                    question_type=question_type,
                    prompt=item.prompt,
                    difficulty=item.difficulty,
                    answer_text=answer_text,
                    explanation=item.explanation,
                    chapter=None,
                    source_type="ai_generated",
                    source_id=paper.id,
                    created_by=actor_id,
                )
                db.add(bank)
                await db.flush()

                for opt in item.options:
                    db.add(
                        QuestionBankOption(
                            bank_question_id=bank.id,
                            option_key=opt.key,
                            option_text=opt.text,
                            is_correct=opt.is_correct,
                        )
                    )

                paper_question = PaperQuestion(
                    paper_id=paper.id,
                    section_id=section.id,
                    order_num=question_order,
                    question_type=question_type,
                    prompt=item.prompt,
                    difficulty=item.difficulty,
                    score=score,
                    bank_question_id=bank.id,
                    answer_text=answer_text,
                    explanation=item.explanation,
                    chapter=None,
                )
                db.add(paper_question)
                await db.flush()

                for opt in item.options:
                    db.add(
                        PaperQuestionOption(
                            question_id=paper_question.id,
                            option_key=opt.key,
                            option_text=opt.text,
                            is_correct=opt.is_correct,
                        )
                    )

                question_order += 1

            section_order += 1

    @staticmethod
    async def _delete_paper_questions_and_bank(db: AsyncSession, paper_id: int) -> None:
        pq_rows = await db.execute(
            select(PaperQuestion.id, PaperQuestion.bank_question_id).where(PaperQuestion.paper_id == paper_id)
        )
        rows = pq_rows.all()
        bank_ids = [r[1] for r in rows if r[1] is not None]
        qids = [r[0] for r in rows]

        if bank_ids:
            qi_count = await db.scalar(
                select(func.count()).select_from(QuestionItem).where(QuestionItem.bank_question_id.in_(bank_ids))
            )
            if int(qi_count or 0) > 0:
                raise HTTPException(
                    status_code=409,
                    detail="question bank rows are linked to course quizzes; cannot replace paper content",
                )

        if qids:
            await db.execute(delete(PaperQuestionOption).where(PaperQuestionOption.question_id.in_(qids)))
        await db.execute(delete(PaperQuestion).where(PaperQuestion.paper_id == paper_id))
        await db.execute(delete(PaperSection).where(PaperSection.paper_id == paper_id))

        if bank_ids:
            await db.execute(delete(QuestionBankOption).where(QuestionBankOption.bank_question_id.in_(bank_ids)))
            await db.execute(delete(QuestionBankItem).where(QuestionBankItem.id.in_(bank_ids)))
        await db.flush()

    @staticmethod
    async def create_paper(
        db: AsyncSession,
        actor_id: int,
        payload: PaperCreateRequest,
    ) -> PaperCreateResponse:
        actor = await PaperService._require_teacher_or_admin(db, actor_id)
        course = await PaperService._resolve_course_for_create(db, actor, payload.course_id)

        question_count = len(payload.questions)
        if question_count <= 0:
            raise HTTPException(status_code=400, detail="questions must not be empty")

        paper = Paper(
            title=payload.title,
            course_id=course.id,
            grade=payload.grade,
            subject=payload.subject,
            semester=payload.semester,
            exam_type=payload.exam_type,
            total_score=payload.total_score,
            duration_min=payload.duration_min,
            question_count=question_count,
            quality_score=None,
            status=PaperStatus.DRAFT,
            created_by=actor_id,
        )
        db.add(paper)
        await db.flush()

        await PaperService._populate_paper_questions(db, paper, payload, actor_id)

        await db.commit()
        await db.refresh(paper)

        return PaperCreateResponse(
            paper_id=paper.id,
            title=paper.title,
            status=PaperService._map_status(paper.status),
            question_count=paper.question_count,
            created_at=paper.created_at,
        )

    @staticmethod
    async def update_draft_paper(
        db: AsyncSession,
        actor_id: int,
        paper_id: int,
        payload: PaperCreateRequest,
    ) -> PaperCreateResponse:
        paper = await PaperService._get_paper_for_teacher_or_admin(db, actor_id, paper_id)
        actor = await PaperService._require_teacher_or_admin(db, actor_id)

        if paper.status != PaperStatus.DRAFT:
            raise HTTPException(status_code=400, detail="only draft papers can be updated")

        question_count = len(payload.questions)
        if question_count <= 0:
            raise HTTPException(status_code=400, detail="questions must not be empty")

        if payload.course_id is not None:
            course = await PaperService._resolve_course_for_create(db, actor, payload.course_id)
            paper.course_id = course.id
        else:
            course = await db.get(Course, paper.course_id)
            if course is None:
                raise HTTPException(status_code=404, detail="course not found")
            PaperService._assert_scope(actor, course)

        await PaperService._delete_paper_questions_and_bank(db, paper.id)

        paper.title = payload.title
        paper.grade = payload.grade
        paper.subject = payload.subject
        paper.semester = payload.semester
        paper.exam_type = payload.exam_type
        paper.total_score = payload.total_score
        paper.duration_min = payload.duration_min
        paper.question_count = question_count

        await db.flush()
        await PaperService._populate_paper_questions(db, paper, payload, actor_id)

        await db.commit()
        await db.refresh(paper)

        return PaperCreateResponse(
            paper_id=paper.id,
            title=paper.title,
            status=PaperService._map_status(paper.status),
            question_count=paper.question_count,
            created_at=paper.created_at,
        )

    @staticmethod
    async def publish_paper(db: AsyncSession, actor_id: int, paper_id: int) -> PaperStatusMutationResponse:
        paper = await PaperService._get_paper_for_teacher_or_admin(db, actor_id, paper_id)

        question_count = await db.scalar(
            select(func.count()).select_from(PaperQuestion).where(PaperQuestion.paper_id == paper.id)
        )
        if not question_count:
            raise HTTPException(status_code=400, detail="paper has no questions")

        if paper.status != PaperStatus.PUBLISHED:
            paper.status = PaperStatus.PUBLISHED
            paper.published_at = datetime.now(timezone.utc)
            await db.commit()

        return PaperStatusMutationResponse(
            paper_id=paper.id,
            status=PaperService._map_status(paper.status),
            changed_at=datetime.now(timezone.utc),
        )

    @staticmethod
    async def close_paper(db: AsyncSession, actor_id: int, paper_id: int) -> PaperStatusMutationResponse:
        paper = await PaperService._get_paper_for_teacher_or_admin(db, actor_id, paper_id)
        if paper.status == PaperStatus.DRAFT:
            raise HTTPException(status_code=400, detail="draft paper cannot be closed")

        if paper.status != PaperStatus.ARCHIVED:
            paper.status = PaperStatus.ARCHIVED
            await db.commit()

        return PaperStatusMutationResponse(
            paper_id=paper.id,
            status=PaperService._map_status(paper.status),
            changed_at=datetime.now(timezone.utc),
        )

    @staticmethod
    async def unpublish_paper(db: AsyncSession, actor_id: int, paper_id: int) -> PaperStatusMutationResponse:
        """Rollback a published paper back to draft (owner/admin only)."""
        paper = await PaperService._get_paper_for_write(db, actor_id, paper_id)
        if paper.status != PaperStatus.PUBLISHED:
            raise HTTPException(status_code=400, detail="only published papers can be rolled back to draft")

        paper.status = PaperStatus.DRAFT
        paper.published_at = None
        await db.commit()

        return PaperStatusMutationResponse(
            paper_id=paper.id,
            status=PaperService._map_status(paper.status),
            changed_at=datetime.now(timezone.utc),
        )

    @staticmethod
    async def delete_paper(db: AsyncSession, actor_id: int, paper_id: int) -> None:
        """Delete a paper (owner/admin only).

        Safety rules:
        - If the paper has attempts, do not delete.
        - If any question-bank rows are linked to course quizzes, do not delete.
        """
        paper = await PaperService._get_paper_for_write(db, actor_id, paper_id)

        attempt_count = await db.scalar(
            select(func.count()).select_from(PaperAttempt).where(PaperAttempt.paper_id == paper.id)
        )
        if int(attempt_count or 0) > 0:
            raise HTTPException(status_code=409, detail="paper has attempts; cannot delete")

        # Reuse the same guard as draft update (prevents deleting bank items if they are linked to quizzes).
        await PaperService._delete_paper_questions_and_bank(db, paper.id)
        await db.execute(delete(Paper).where(Paper.id == paper.id))
        await db.commit()

    @staticmethod
    async def reopen_paper(db: AsyncSession, actor_id: int, paper_id: int) -> PaperStatusMutationResponse:
        paper = await PaperService._get_paper_for_teacher_or_admin(db, actor_id, paper_id)
        if paper.status == PaperStatus.DRAFT:
            raise HTTPException(status_code=400, detail="draft paper cannot be reopened")

        if paper.status != PaperStatus.PUBLISHED:
            paper.status = PaperStatus.PUBLISHED
            if paper.published_at is None:
                paper.published_at = datetime.now(timezone.utc)
            await db.commit()

        return PaperStatusMutationResponse(
            paper_id=paper.id,
            status=PaperService._map_status(paper.status),
            changed_at=datetime.now(timezone.utc),
        )

    @staticmethod
    async def list_papers(
        db: AsyncSession,
        actor_id: int,
        *,
        status: str | None,
        subject: str | None,
        grade: str | None,
        semester: str | None,
        exam_type: str | None,
        q: str | None,
        page: int,
        page_size: int,
    ) -> PaperListResponse:
        actor = await PaperService._require_teacher_or_admin(db, actor_id)
        filters = _PaperQueryFilters(
            status=status,
            subject=subject,
            grade=grade,
            semester=semester,
            exam_type=exam_type,
            q=q,
        )

        base_stmt = select(Paper, Course).join(Course, Course.id == Paper.course_id)
        base_stmt = PaperService._apply_visibility_scope(base_stmt, actor)
        base_stmt = PaperService._apply_filters(base_stmt, filters)

        count_stmt = select(func.count()).select_from(Paper).join(Course, Course.id == Paper.course_id)
        count_stmt = PaperService._apply_visibility_scope(count_stmt, actor)
        count_stmt = PaperService._apply_filters(count_stmt, filters)

        total = int((await db.scalar(count_stmt)) or 0)

        rows = await db.execute(
            base_stmt
            .order_by(Paper.created_at.desc(), Paper.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        items = [PaperService._to_list_item(paper, course, actor) for paper, course in rows.all()]
        return PaperListResponse(items=items, page=page, page_size=page_size, total=total)

    @staticmethod
    async def get_paper_detail(db: AsyncSession, actor_id: int, paper_id: int) -> PaperDetailResponse:
        actor = await PaperService._require_teacher_or_admin(db, actor_id)

        row = await db.execute(
            select(Paper, Course)
            .join(Course, Course.id == Paper.course_id)
            .where(Paper.id == paper_id)
        )
        resolved = row.first()
        if resolved is None:
            raise HTTPException(status_code=404, detail="paper not found")

        paper, course = resolved
        PaperService._assert_visibility(actor, paper, course)

        section_rows = await db.execute(
            select(PaperSection)
            .where(PaperSection.paper_id == paper.id)
            .order_by(PaperSection.section_order.asc(), PaperSection.id.asc())
        )
        sections = section_rows.scalars().all()

        question_rows = await db.execute(
            select(PaperQuestion)
            .where(PaperQuestion.paper_id == paper.id)
            .order_by(PaperQuestion.order_num.asc(), PaperQuestion.id.asc())
        )
        questions = question_rows.scalars().all()

        question_ids = [q.id for q in questions]
        options_map: dict[int, list[PaperQuestionOptionView]] = {}
        if question_ids:
            option_rows = await db.execute(
                select(PaperQuestionOption)
                .where(PaperQuestionOption.question_id.in_(question_ids))
                .order_by(PaperQuestionOption.question_id.asc(), PaperQuestionOption.option_key.asc())
            )
            for opt in option_rows.scalars().all():
                options_map.setdefault(opt.question_id, []).append(
                    PaperQuestionOptionView(
                        key=str(opt.option_key),
                        text=str(opt.option_text),
                        is_correct=opt.is_correct,
                    )
                )

        by_section: dict[int, list[PaperQuestionView]] = {}
        for q in questions:
            by_section.setdefault(q.section_id, []).append(
                PaperQuestionView(
                    paper_question_id=q.id,
                    order=q.order_num,
                    type=q.question_type,
                    prompt=q.prompt,
                    difficulty=q.difficulty,
                    score=float(q.score),
                    answer=q.answer_text,
                    explanation=q.explanation,
                    options=options_map.get(q.id, []),
                )
            )

        section_views = [
            PaperSectionView(
                section_id=s.id,
                order=s.section_order,
                title=s.title,
                question_type=s.question_type,
                question_count=s.question_count,
                score_each=float(s.score_each),
                total_score=float(s.total_score),
                questions=by_section.get(s.id, []),
            )
            for s in sections
        ]

        return PaperDetailResponse(
            paper_id=paper.id,
            title=paper.title,
            course_id=course.id,
            course_name=course.name,
            grade=paper.grade,
            subject=paper.subject,
            semester=paper.semester,
            exam_type=paper.exam_type,
            status=PaperService._map_status(paper.status),
            is_owner=PaperService._is_owner(actor, course),
            total_score=paper.total_score,
            duration_min=paper.duration_min,
            question_count=paper.question_count,
            quality_score=paper.quality_score,
            published_at=paper.published_at,
            created_at=paper.created_at,
            has_source_pdf=bool(paper.source_pdf and len(paper.source_pdf) > 0),
            sections=section_views,
        )

    @staticmethod
    async def export_paper_file(
        db: AsyncSession,
        actor_id: int,
        paper_id: int,
        export_format: str | None = None,
    ) -> tuple[bytes, str, str]:
        """Return (body, media_type, download_filename).

        export_format: None = legacy (PDF if stored, else HTML); html | pdf | txt = explicit format.
        """
        paper = await PaperService._get_paper_for_read(db, actor_id, paper_id)
        has_pdf = bool(paper.source_pdf and len(paper.source_pdf) > 0)

        if export_format is None:
            if has_pdf:
                raw_name = (paper.source_file_name or "").strip() or f"paper_{paper.id}.pdf"
                fname = sanitize_download_filename(raw_name, f"paper_{paper.id}.pdf")
                if not fname.lower().endswith(".pdf"):
                    fname = f"{fname}.pdf"
                return bytes(paper.source_pdf), "application/pdf", fname
            detail = await PaperService.get_paper_detail(db, actor_id, paper_id)
            html_doc = render_paper_html(detail)
            base = sanitize_download_filename(detail.title, f"paper_{paper_id}")
            return html_doc.encode("utf-8"), "text/html; charset=utf-8", f"{base}.html"

        fmt = export_format.strip().lower()
        if fmt == "pdf":
            if not has_pdf:
                raise HTTPException(status_code=400, detail="original PDF is not available for this paper")
            raw_name = (paper.source_file_name or "").strip() or f"paper_{paper.id}.pdf"
            fname = sanitize_download_filename(raw_name, f"paper_{paper.id}.pdf")
            if not fname.lower().endswith(".pdf"):
                fname = f"{fname}.pdf"
            return bytes(paper.source_pdf), "application/pdf", fname

        detail = await PaperService.get_paper_detail(db, actor_id, paper_id)
        base = sanitize_download_filename(detail.title, f"paper_{paper_id}")

        if fmt == "html":
            html_doc = render_paper_html(detail)
            return html_doc.encode("utf-8"), "text/html; charset=utf-8", f"{base}.html"
        if fmt == "txt":
            txt_doc = render_paper_txt(detail)
            return txt_doc.encode("utf-8"), "text/plain; charset=utf-8", f"{base}.txt"

        raise HTTPException(status_code=400, detail="invalid export format (use html, pdf, or txt)")

    @staticmethod
    async def _require_teacher_or_admin(db: AsyncSession, actor_id: int) -> User:
        actor = await db.get(User, actor_id)
        if actor is None:
            raise HTTPException(status_code=404, detail="user not found")
        if actor.account_type not in {AccountType.TEACHER, AccountType.ADMIN}:
            raise HTTPException(status_code=403, detail="teacher/admin role required")
        return actor

    @staticmethod
    async def _get_paper_for_teacher_or_admin(db: AsyncSession, actor_id: int, paper_id: int) -> Paper:
        # Backward-compat helper: mutations still require ownership scope.
        return await PaperService._get_paper_for_write(db, actor_id, paper_id)

    @staticmethod
    async def _get_paper_for_read(db: AsyncSession, actor_id: int, paper_id: int) -> Paper:
        actor = await PaperService._require_teacher_or_admin(db, actor_id)
        row = await db.execute(
            select(Paper, Course)
            .join(Course, Course.id == Paper.course_id)
            .where(Paper.id == paper_id)
        )
        resolved = row.first()
        if resolved is None:
            raise HTTPException(status_code=404, detail="paper not found")
        paper, course = resolved
        PaperService._assert_visibility(actor, paper, course)
        return paper

    @staticmethod
    async def _get_paper_for_write(db: AsyncSession, actor_id: int, paper_id: int) -> Paper:
        actor = await PaperService._require_teacher_or_admin(db, actor_id)
        row = await db.execute(
            select(Paper, Course)
            .join(Course, Course.id == Paper.course_id)
            .where(Paper.id == paper_id)
        )
        resolved = row.first()
        if resolved is None:
            raise HTTPException(status_code=404, detail="paper not found")
        paper, course = resolved
        PaperService._assert_scope(actor, course)
        return paper

    @staticmethod
    def _assert_scope(actor: User, course: Course) -> None:
        if actor.account_type == AccountType.TEACHER and course.teacher_id != actor.id:
            raise HTTPException(status_code=403, detail="forbidden for this course")

    @staticmethod
    def _assert_visibility(actor: User, paper: Paper, course: Course) -> None:
        """Visibility rules:
        - draft/archived: only owning teacher (or admin) can access
        - published: any teacher/admin can access
        """
        if actor.account_type == AccountType.ADMIN:
            return
        if actor.account_type == AccountType.TEACHER and paper.status == PaperStatus.PUBLISHED:
            return
        PaperService._assert_scope(actor, course)

    @staticmethod
    def _apply_visibility_scope(stmt, actor: User):
        if actor.account_type == AccountType.TEACHER:
            # Teachers can see:
            # - any published paper (shared across teachers)
            # - any paper within their own course scope (draft/archived/published)
            return stmt.where((Course.teacher_id == actor.id) | (Paper.status == PaperStatus.PUBLISHED))
        return stmt

    @staticmethod
    def _apply_filters(stmt, filters: _PaperQueryFilters):
        if filters.status == "draft":
            stmt = stmt.where(Paper.status == PaperStatus.DRAFT)
        elif filters.status == "published":
            stmt = stmt.where(Paper.status == PaperStatus.PUBLISHED)
        elif filters.status == "closed":
            stmt = stmt.where(Paper.status == PaperStatus.ARCHIVED)

        if filters.subject:
            stmt = stmt.where(Paper.subject == filters.subject)
        if filters.grade:
            stmt = stmt.where(Paper.grade == filters.grade)
        if filters.semester:
            stmt = stmt.where(Paper.semester == filters.semester)
        if filters.exam_type:
            stmt = stmt.where(Paper.exam_type == filters.exam_type)
        if filters.q:
            stmt = stmt.where(Paper.title.ilike(f"%{filters.q}%"))

        return stmt

    @staticmethod
    def _map_status(status: PaperStatus) -> str:
        if status == PaperStatus.ARCHIVED:
            return "closed"
        return status.value

    @staticmethod
    def _to_list_item(paper: Paper, course: Course, actor: User) -> PaperListItem:
        return PaperListItem(
            paper_id=paper.id,
            title=paper.title,
            course_id=course.id,
            course_name=course.name,
            grade=paper.grade,
            subject=paper.subject,
            semester=paper.semester,
            exam_type=paper.exam_type,
            status=PaperService._map_status(paper.status),
            is_owner=PaperService._is_owner(actor, course),
            total_score=paper.total_score,
            duration_min=paper.duration_min,
            question_count=paper.question_count,
            quality_score=paper.quality_score,
            published_at=paper.published_at,
            created_at=paper.created_at,
            has_source_pdf=bool(paper.source_pdf and len(paper.source_pdf) > 0),
        )

    @staticmethod
    def _is_owner(actor: User, course: Course) -> bool:
        return actor.account_type == AccountType.ADMIN or (
            actor.account_type == AccountType.TEACHER and course.teacher_id == actor.id
        )

    @staticmethod
    async def _resolve_course_for_create(db: AsyncSession, actor: User, course_id: int | None) -> Course:
        if course_id is not None:
            course = await db.get(Course, course_id)
            if course is None:
                raise HTTPException(status_code=404, detail="course not found")
            PaperService._assert_scope(actor, course)
            return course

        stmt = select(Course).order_by(Course.id.asc())
        if actor.account_type == AccountType.TEACHER:
            stmt = stmt.where(Course.teacher_id == actor.id)

        course = (await db.execute(stmt.limit(1))).scalars().first()
        if course is None:
            raise HTTPException(status_code=400, detail="no available course for actor")
        return course

    @staticmethod
    def _normalize_question_type(question_type: str) -> str:
        raw = (question_type or "").strip().upper().replace("/", "_").replace("-", "_").replace(" ", "_")
        mapping = {
            "MCQ": "MCQ_SINGLE",
            "MCQ_SINGLE": "MCQ_SINGLE",
            "MCQ_MULTI": "MCQ_MULTI",
            "TRUE_FALSE": "TRUE_FALSE",
            "TF": "TRUE_FALSE",
            "FILL_BLANK": "FILL_BLANK",
            "FILL_IN_THE_BLANK": "FILL_BLANK",
            "SHORT_ANSWER": "SHORT_ANSWER",
            "ESSAY": "ESSAY",
        }
        return mapping.get(raw, "SHORT_ANSWER")

    @staticmethod
    def _section_title(question_type: str) -> str:
        mapping = {
            "MCQ_SINGLE": "Multiple Choice",
            "MCQ_MULTI": "Multiple Choice (Multi)",
            "TRUE_FALSE": "True / False",
            "FILL_BLANK": "Fill in the Blank",
            "SHORT_ANSWER": "Short Answer",
            "ESSAY": "Essay",
        }
        return mapping.get(question_type, "Mixed")

    @staticmethod
    def _resolve_answer_text(item: PaperCreateQuestion) -> str | None:
        if item.answer:
            return item.answer
        correct_keys = [opt.key for opt in item.options if opt.is_correct]
        if not correct_keys:
            return None
        return ",".join(correct_keys)
