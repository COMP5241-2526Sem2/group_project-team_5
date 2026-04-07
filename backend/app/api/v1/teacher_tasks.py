from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.paper.teacher_task import (
    TaskCreateRequest,
    TaskDetailResponse,
    TaskListResponse,
    TaskMutationResponse,
    TaskStatusMutationResponse,
    TaskUpdateRequest,
)
from app.services.paper.teacher.task_service import TaskService

router = APIRouter(tags=["teacher-tasks"])


def _require_user_id(x_user_id: int | None) -> int:
    if x_user_id is None:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    return x_user_id


@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    status: Literal["draft", "published", "closed"] | None = Query(default=None),
    subject: str | None = Query(default=None),
    grade: str | None = Query(default=None),
    semester: str | None = Query(default=None),
    task_kind: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> TaskListResponse:
    actor_id = _require_user_id(x_user_id)
    return await TaskService.list_tasks(
        db=db,
        actor_id=actor_id,
        status=status,
        subject=subject,
        grade=grade,
        semester=semester,
        task_kind=task_kind,
        q=q,
        page=page,
        page_size=page_size,
    )


@router.post("/tasks", response_model=TaskMutationResponse)
async def create_task(
    payload: TaskCreateRequest,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> TaskMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await TaskService.create_task(db=db, actor_id=actor_id, payload=payload)


@router.get("/tasks/{task_id}", response_model=TaskDetailResponse)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> TaskDetailResponse:
    actor_id = _require_user_id(x_user_id)
    return await TaskService.get_task_detail(db=db, actor_id=actor_id, task_id=task_id)


@router.put("/tasks/{task_id}", response_model=TaskMutationResponse)
async def update_task(
    task_id: int,
    payload: TaskUpdateRequest,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> TaskMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await TaskService.update_task(db=db, actor_id=actor_id, task_id=task_id, payload=payload)


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> None:
    actor_id = _require_user_id(x_user_id)
    await TaskService.delete_task(db=db, actor_id=actor_id, task_id=task_id)


@router.post("/tasks/{task_id}/publish", response_model=TaskStatusMutationResponse)
async def publish_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> TaskStatusMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await TaskService.publish_task(db=db, actor_id=actor_id, task_id=task_id)
