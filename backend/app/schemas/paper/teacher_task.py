from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TaskItemPayload(BaseModel):
    order: int = Field(ge=1)
    section_label: str | None = None
    question_type: str = Field(min_length=1)
    score: float = Field(ge=0)
    source_kind: str = Field(min_length=1)
    bank_question_id: int | None = None
    ref_paper_id: int | None = None
    ref_paper_question_id: int | None = None
    snapshot: dict = Field(default_factory=dict)


class TaskCreateRequest(BaseModel):
    title: str = Field(min_length=1)
    course_id: int | None = None
    grade: str = Field(min_length=1)
    subject: str = Field(min_length=1)
    semester: str | None = None
    task_kind: str = Field(min_length=1)
    total_score: int = Field(ge=0)
    duration_min: int = Field(ge=0)
    items: list[TaskItemPayload] = Field(default_factory=list)


TaskUpdateRequest = TaskCreateRequest


class TaskListItem(BaseModel):
    task_id: int
    title: str
    course_id: int
    course_name: str
    grade: str
    subject: str
    semester: str | None
    task_kind: str
    status: str
    is_owner: bool
    total_score: int
    duration_min: int
    question_count: int
    created_at: datetime
    published_at: datetime | None


class TaskListResponse(BaseModel):
    items: list[TaskListItem]
    page: int
    page_size: int
    total: int


class TaskItemView(BaseModel):
    order: int
    section_label: str | None
    question_type: str
    score: float
    source_kind: str
    bank_question_id: int | None
    ref_paper_id: int | None
    ref_paper_question_id: int | None
    snapshot: dict


class TaskDetailResponse(BaseModel):
    task_id: int
    title: str
    course_id: int
    course_name: str
    grade: str
    subject: str
    semester: str | None
    task_kind: str
    status: str
    is_owner: bool
    total_score: int
    duration_min: int
    question_count: int
    created_at: datetime
    published_at: datetime | None
    items: list[TaskItemView]


class TaskMutationResponse(BaseModel):
    task_id: int
    title: str
    status: str
    question_count: int
    created_at: datetime


class TaskStatusMutationResponse(BaseModel):
    task_id: int
    status: str
    changed_at: datetime
