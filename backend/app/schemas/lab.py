from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


# Enums
class SubjectLab(str, Enum):
    MATH = "math"
    PHYSICS = "physics"
    CHEMISTRY = "chemistry"
    BIOLOGY = "biology"
    DYNAMIC = "dynamic"


class Dimension(str, Enum):
    DIM_2D = "2d"
    DIM_3D = "3d"


class LabType(str, Enum):
    BUILTIN = "builtin"
    AI_GENERATED = "ai_generated"


class LabStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    DEPRECATED = "deprecated"


class SessionMode(str, Enum):
    DRIVE = "drive"
    GENERATE = "generate"


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


# Lab Definition Schemas
class LabDefinitionBase(BaseModel):
    registry_key: str = Field(..., description="唯一标识，如 physics.circuit_001")
    title: str
    description: str | None = None
    subject_lab: SubjectLab
    renderer_profile: str = Field(..., description="如 circuit_2d, function_2d, geometry_3d")
    dimension: Dimension
    initial_state: dict = Field(default_factory=dict)
    reducer_spec: dict | None = None
    lab_metadata: dict | None = None
    lab_type: LabType
    status: LabStatus = LabStatus.DRAFT
    visual_profile: str | None = Field(
        default=None,
        description="指定 DynamicLabHost 内置可视化模板，如 ph_slider、snells_law",
    )


class LabDefinitionCreate(LabDefinitionBase):
    teacher_id: int | None = None


class LabDefinitionUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: LabStatus | None = None
    lab_metadata: dict | None = None
    subject_lab: SubjectLab | None = None
    renderer_profile: str | None = None
    dimension: Dimension | None = None
    initial_state: dict | None = None
    reducer_spec: dict | None = None
    lab_type: LabType | None = None
    visual_profile: str | None = None


class LabDefinitionResponse(LabDefinitionBase):
    id: int
    teacher_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LabDefinitionSaveRequest(LabDefinitionBase):
    """保存草稿或发布：按 registry_key upsert，save_draft 时可检测内容是否与库中一致。"""

    action: Literal["save_draft", "publish"] = Field(
        default="save_draft",
        description="save_draft：写入草稿并可返回 content_unchanged；publish：更新内容并设为已发布",
    )


class LabDefinitionSaveResult(LabDefinitionResponse):
    """含是否跳过写入（内容相同）的保存结果。"""

    content_unchanged: bool = Field(
        default=False,
        description="save_draft 且库中已存在时：true 表示正文与库中一致未写库；publish 恒为 false",
    )


class LabListItem(LabDefinitionResponse):
    pass


# Pagination
class PaginatedLabList(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[LabListItem]


# Session Schemas
class SessionCreate(BaseModel):
    mode: SessionMode
    registry_key: str | None = Field(
        None,
        description="drive 模式必填；generate 模式可选，传入则基于该实验迭代（需库中存在）",
    )


class SessionResponse(BaseModel):
    id: int
    teacher_id: int
    lab_definition_id: int | None
    mode: SessionMode
    created_at: datetime
    ended_at: datetime | None

    model_config = {"from_attributes": True}


# Message Schemas
class ChatMessageResponse(BaseModel):
    id: int
    session_id: int
    role: MessageRole
    content: str
    commands: dict | None = None
    definition: dict | None = None
    token_used: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SSEEvent(BaseModel):
    event: str
    data: str
