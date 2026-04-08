from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Course, User
from app.models.assessment import TeacherTask, TeacherTaskItem, TeacherTaskStatus
from app.models.user import AccountType
from app.schemas.paper.teacher_task import (
    TaskCreateRequest,
    TaskDetailResponse,
    TaskItemPayload,
    TaskItemView,
    TaskListItem,
    TaskListResponse,
    TaskMutationResponse,
    TaskStatusMutationResponse,
)


@dataclass(slots=True)
class _TaskQueryFilters:
    status: str | None
    subject: str | None
    grade: str | None
    semester: str | None
    task_kind: str | None
    q: str | None


class TaskService:
    """Persists teacher tasks only in teacher_tasks / teacher_task_items. Does not touch papers or question_bank_items."""

    @staticmethod
    async def _require_teacher_or_admin(db: AsyncSession, actor_id: int) -> User:
        actor = await db.get(User, actor_id)
        if actor is None:
            raise HTTPException(status_code=404, detail="user not found")
        if actor.account_type not in {AccountType.TEACHER, AccountType.ADMIN}:
            raise HTTPException(status_code=403, detail="teacher/admin role required")
        return actor

    @staticmethod
    def _assert_scope(actor: User, course: Course) -> None:
        if actor.account_type == AccountType.TEACHER and course.teacher_id != actor.id:
            raise HTTPException(status_code=403, detail="forbidden for this course")

    @staticmethod
    def _assert_visibility(actor: User, task: TeacherTask, course: Course) -> None:
        if actor.account_type == AccountType.ADMIN:
            return
        if actor.account_type == AccountType.TEACHER and task.status == TeacherTaskStatus.PUBLISHED.value:
            return
        TaskService._assert_scope(actor, course)

    @staticmethod
    async def _resolve_course_for_create(db: AsyncSession, actor: User, course_id: int | None) -> Course:
        if course_id is not None:
            course = await db.get(Course, course_id)
            if course is None:
                raise HTTPException(status_code=404, detail="course not found")
            TaskService._assert_scope(actor, course)
            return course

        stmt = select(Course).order_by(Course.id.asc())
        if actor.account_type == AccountType.TEACHER:
            stmt = stmt.where(Course.teacher_id == actor.id)

        course = (await db.execute(stmt.limit(1))).scalars().first()
        if course is None:
            raise HTTPException(status_code=400, detail="no available course for actor")
        return course

    @staticmethod
    def _map_status(s: str) -> str:
        if s == TeacherTaskStatus.ARCHIVED.value:
            return "closed"
        return s

    @staticmethod
    def _to_list_item(task: TeacherTask, course: Course, actor: User) -> TaskListItem:
        return TaskListItem(
            task_id=task.id,
            title=task.title,
            course_id=course.id,
            course_name=course.name,
            grade=task.grade,
            subject=task.subject,
            semester=task.semester,
            task_kind=task.task_kind,
            status=TaskService._map_status(task.status),
            is_owner=TaskService._is_owner(actor, course),
            total_score=task.total_score,
            duration_min=task.duration_min,
            question_count=task.question_count,
            created_at=task.created_at,
            published_at=task.published_at,
        )

    @staticmethod
    def _is_owner(actor: User, course: Course) -> bool:
        return actor.account_type == AccountType.ADMIN or (
            actor.account_type == AccountType.TEACHER and course.teacher_id == actor.id
        )

    @staticmethod
    def _apply_filters(stmt, filters: _TaskQueryFilters):
        if filters.status == "draft":
            stmt = stmt.where(TeacherTask.status == TeacherTaskStatus.DRAFT.value)
        elif filters.status == "published":
            stmt = stmt.where(TeacherTask.status == TeacherTaskStatus.PUBLISHED.value)
        elif filters.status == "closed":
            stmt = stmt.where(TeacherTask.status == TeacherTaskStatus.ARCHIVED.value)

        if filters.subject:
            stmt = stmt.where(TeacherTask.subject == filters.subject)
        if filters.grade:
            stmt = stmt.where(TeacherTask.grade == filters.grade)
        if filters.semester:
            stmt = stmt.where(TeacherTask.semester == filters.semester)
        if filters.task_kind:
            stmt = stmt.where(TeacherTask.task_kind == filters.task_kind)
        if filters.q:
            stmt = stmt.where(TeacherTask.title.ilike(f"%{filters.q}%"))
        return stmt

    @staticmethod
    def _apply_visibility_scope(stmt, actor: User):
        if actor.account_type == AccountType.TEACHER:
            return stmt.where((Course.teacher_id == actor.id) | (TeacherTask.status == TeacherTaskStatus.PUBLISHED.value))
        return stmt

    @staticmethod
    async def list_tasks(
        db: AsyncSession,
        actor_id: int,
        status: str | None,
        subject: str | None,
        grade: str | None,
        semester: str | None,
        task_kind: str | None,
        q: str | None,
        page: int,
        page_size: int,
    ) -> TaskListResponse:
        actor = await TaskService._require_teacher_or_admin(db, actor_id)
        filters = _TaskQueryFilters(
            status=status,
            subject=subject,
            grade=grade,
            semester=semester,
            task_kind=task_kind,
            q=q,
        )

        base_stmt = select(TeacherTask, Course).join(Course, Course.id == TeacherTask.course_id)
        base_stmt = TaskService._apply_visibility_scope(base_stmt, actor)
        base_stmt = TaskService._apply_filters(base_stmt, filters)

        count_stmt = select(func.count()).select_from(TeacherTask).join(Course, Course.id == TeacherTask.course_id)
        count_stmt = TaskService._apply_visibility_scope(count_stmt, actor)
        count_stmt = TaskService._apply_filters(count_stmt, filters)

        total = int((await db.execute(count_stmt)).scalar() or 0)

        offset = (page - 1) * page_size
        rows = await db.execute(
            base_stmt.order_by(TeacherTask.created_at.desc()).offset(offset).limit(page_size)
        )
        items = [TaskService._to_list_item(t, c, actor) for t, c in rows.all()]

        return TaskListResponse(items=items, page=page, page_size=page_size, total=total)

    @staticmethod
    async def get_task_detail(db: AsyncSession, actor_id: int, task_id: int) -> TaskDetailResponse:
        actor = await TaskService._require_teacher_or_admin(db, actor_id)
        row = await db.execute(
            select(TeacherTask, Course)
            .join(Course, Course.id == TeacherTask.course_id)
            .where(TeacherTask.id == task_id)
        )
        resolved = row.first()
        if resolved is None:
            raise HTTPException(status_code=404, detail="task not found")
        task, course = resolved
        TaskService._assert_visibility(actor, task, course)

        item_rows = await db.execute(
            select(TeacherTaskItem).where(TeacherTaskItem.task_id == task_id).order_by(TeacherTaskItem.order_num.asc())
        )
        items: list[TaskItemView] = []
        for it in item_rows.scalars().all():
            items.append(
                TaskItemView(
                    order=it.order_num,
                    section_label=it.section_label,
                    question_type=it.question_type,
                    score=float(it.score),
                    source_kind=it.source_kind,
                    bank_question_id=it.bank_question_id,
                    ref_paper_id=it.ref_paper_id,
                    ref_paper_question_id=it.ref_paper_question_id,
                    snapshot=dict(it.snapshot_json) if it.snapshot_json else {},
                )
            )

        return TaskDetailResponse(
            task_id=task.id,
            title=task.title,
            course_id=course.id,
            course_name=course.name,
            grade=task.grade,
            subject=task.subject,
            semester=task.semester,
            task_kind=task.task_kind,
            status=TaskService._map_status(task.status),
            is_owner=TaskService._is_owner(actor, course),
            total_score=task.total_score,
            duration_min=task.duration_min,
            question_count=task.question_count,
            created_at=task.created_at,
            published_at=task.published_at,
            items=items,
        )

    @staticmethod
    def _build_items_from_payload(
        rows: list[TaskItemPayload],
    ) -> list[TeacherTaskItem]:
        out: list[TeacherTaskItem] = []
        for row in rows:
            snap = dict(row.snapshot) if row.snapshot else {}
            out.append(
                TeacherTaskItem(
                    order_num=row.order,
                    section_label=row.section_label,
                    question_type=row.question_type,
                    score=row.score,
                    source_kind=row.source_kind,
                    bank_question_id=row.bank_question_id,
                    ref_paper_id=row.ref_paper_id,
                    ref_paper_question_id=row.ref_paper_question_id,
                    snapshot_json=snap,
                )
            )
        return out

    @staticmethod
    async def create_task(db: AsyncSession, actor_id: int, payload: TaskCreateRequest) -> TaskMutationResponse:
        actor = await TaskService._require_teacher_or_admin(db, actor_id)
        course = await TaskService._resolve_course_for_create(db, actor, payload.course_id)

        n = len(payload.items)
        task = TeacherTask(
            title=payload.title.strip(),
            course_id=course.id,
            grade=payload.grade.strip(),
            subject=payload.subject.strip(),
            semester=payload.semester,
            task_kind=payload.task_kind,
            total_score=payload.total_score,
            duration_min=payload.duration_min,
            question_count=n,
            status=TeacherTaskStatus.DRAFT.value,
            created_by=actor_id,
        )
        db.add(task)
        await db.flush()

        for it in TaskService._build_items_from_payload(payload.items):
            it.task_id = task.id
            db.add(it)

        await db.commit()
        await db.refresh(task)

        return TaskMutationResponse(
            task_id=task.id,
            title=task.title,
            status=TaskService._map_status(task.status),
            question_count=task.question_count,
            created_at=task.created_at,
        )

    @staticmethod
    async def update_task(db: AsyncSession, actor_id: int, task_id: int, payload: TaskCreateRequest) -> TaskMutationResponse:
        actor = await TaskService._require_teacher_or_admin(db, actor_id)
        row = await db.execute(
            select(TeacherTask, Course)
            .join(Course, Course.id == TeacherTask.course_id)
            .where(TeacherTask.id == task_id)
        )
        resolved = row.first()
        if resolved is None:
            raise HTTPException(status_code=404, detail="task not found")
        task, course = resolved
        TaskService._assert_scope(actor, course)

        if task.status != TeacherTaskStatus.DRAFT.value:
            raise HTTPException(status_code=400, detail="only draft tasks can be updated")

        if payload.course_id is not None:
            new_course = await TaskService._resolve_course_for_create(db, actor, payload.course_id)
            task.course_id = new_course.id

        n = len(payload.items)
        task.title = payload.title.strip()
        task.grade = payload.grade.strip()
        task.subject = payload.subject.strip()
        task.semester = payload.semester
        task.task_kind = payload.task_kind
        task.total_score = payload.total_score
        task.duration_min = payload.duration_min
        task.question_count = n

        await db.execute(delete(TeacherTaskItem).where(TeacherTaskItem.task_id == task.id))
        await db.flush()

        for it in TaskService._build_items_from_payload(payload.items):
            it.task_id = task.id
            db.add(it)

        await db.commit()
        await db.refresh(task)

        return TaskMutationResponse(
            task_id=task.id,
            title=task.title,
            status=TaskService._map_status(task.status),
            question_count=task.question_count,
            created_at=task.created_at,
        )

    @staticmethod
    async def delete_task(db: AsyncSession, actor_id: int, task_id: int) -> None:
        actor = await TaskService._require_teacher_or_admin(db, actor_id)
        row = await db.execute(
            select(TeacherTask, Course)
            .join(Course, Course.id == TeacherTask.course_id)
            .where(TeacherTask.id == task_id)
        )
        resolved = row.first()
        if resolved is None:
            raise HTTPException(status_code=404, detail="task not found")
        task, course = resolved
        TaskService._assert_scope(actor, course)

        await db.delete(task)
        await db.commit()

    @staticmethod
    async def publish_task(db: AsyncSession, actor_id: int, task_id: int) -> TaskStatusMutationResponse:
        actor = await TaskService._require_teacher_or_admin(db, actor_id)
        row = await db.execute(
            select(TeacherTask, Course)
            .join(Course, Course.id == TeacherTask.course_id)
            .where(TeacherTask.id == task_id)
        )
        resolved = row.first()
        if resolved is None:
            raise HTTPException(status_code=404, detail="task not found")
        task, course = resolved
        TaskService._assert_scope(actor, course)

        if task.question_count <= 0:
            raise HTTPException(status_code=400, detail="task has no items")

        if task.status != TeacherTaskStatus.PUBLISHED.value:
            task.status = TeacherTaskStatus.PUBLISHED.value
            task.published_at = datetime.now(timezone.utc)
            await db.commit()

        return TaskStatusMutationResponse(
            task_id=task.id,
            status=TaskService._map_status(task.status),
            changed_at=datetime.now(timezone.utc),
        )

    @staticmethod
    async def unpublish_task(db: AsyncSession, actor_id: int, task_id: int) -> TaskStatusMutationResponse:
        """Revert a published task to draft so it can be edited again (owner/admin)."""
        actor = await TaskService._require_teacher_or_admin(db, actor_id)
        row = await db.execute(
            select(TeacherTask, Course)
            .join(Course, Course.id == TeacherTask.course_id)
            .where(TeacherTask.id == task_id)
        )
        resolved = row.first()
        if resolved is None:
            raise HTTPException(status_code=404, detail="task not found")
        task, course = resolved
        TaskService._assert_scope(actor, course)

        if task.status != TeacherTaskStatus.PUBLISHED.value:
            raise HTTPException(status_code=400, detail="only published tasks can be reverted to draft")

        task.status = TeacherTaskStatus.DRAFT.value
        task.published_at = None
        await db.commit()

        return TaskStatusMutationResponse(
            task_id=task.id,
            status=TaskService._map_status(task.status),
            changed_at=datetime.now(timezone.utc),
        )
