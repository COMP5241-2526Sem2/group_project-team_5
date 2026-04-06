from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Course, User
from app.models.assessment import Paper, PaperQuestion, PaperQuestionOption, PaperSection, PaperStatus
from app.models.user import AccountType
from app.schemas.paper import (
    PaperDetailResponse,
    PaperListItem,
    PaperListResponse,
    PaperQuestionOptionView,
    PaperQuestionView,
    PaperSectionView,
    PaperStatusMutationResponse,
)


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
        base_stmt = PaperService._apply_scope(base_stmt, actor)
        base_stmt = PaperService._apply_filters(base_stmt, filters)

        count_stmt = select(func.count()).select_from(Paper).join(Course, Course.id == Paper.course_id)
        count_stmt = PaperService._apply_scope(count_stmt, actor)
        count_stmt = PaperService._apply_filters(count_stmt, filters)

        total = int((await db.scalar(count_stmt)) or 0)

        rows = await db.execute(
            base_stmt
            .order_by(Paper.created_at.desc(), Paper.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        items = [PaperService._to_list_item(paper, course) for paper, course in rows.all()]
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
        PaperService._assert_scope(actor, course)

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
                    PaperQuestionOptionView(key=str(opt.option_key), text=str(opt.option_text))
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
            total_score=paper.total_score,
            duration_min=paper.duration_min,
            question_count=paper.question_count,
            quality_score=paper.quality_score,
            published_at=paper.published_at,
            created_at=paper.created_at,
            sections=section_views,
        )

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
    def _apply_scope(stmt, actor: User):
        if actor.account_type == AccountType.TEACHER:
            return stmt.where(Course.teacher_id == actor.id)
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
    def _to_list_item(paper: Paper, course: Course) -> PaperListItem:
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
            total_score=paper.total_score,
            duration_min=paper.duration_min,
            question_count=paper.question_count,
            quality_score=paper.quality_score,
            published_at=paper.published_at,
            created_at=paper.created_at,
        )
