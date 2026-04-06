import logging
from datetime import datetime
from enum import Enum
from typing import Any, Literal, Self

from pydantic import BaseModel, Field, field_validator, model_validator

logger = logging.getLogger(__name__)


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


# Lab Definition Schemas — 与前端 parseLabDefinition / RendererProfile 对齐
CANONICAL_RENDERER_PROFILES: frozenset[str] = frozenset({
    "circuit_2d",
    "function_2d",
    "geometry_3d",
    "molecule_3d",
    "cell_3d",
    "mechanics_3d",
    "generic_2d",
})

_RENDERER_PROFILE_ALIASES: dict[str, str] = {
    "circuit": "circuit_2d",
    "function": "function_2d",
    "generic": "generic_2d",
    "geometry": "geometry_3d",
    "molecule": "molecule_3d",
    "cell": "cell_3d",
    "mechanics": "mechanics_3d",
    # LLM 常见自造名 → 归入最接近的合法 profile（多为 render_code + generic_2d）
    "optics_2d": "generic_2d",
    "optics": "generic_2d",
    "bio_2d": "generic_2d",
    "biology_2d": "generic_2d",
    "chemistry_2d": "generic_2d",
    "physics_2d": "generic_2d",
    "math_2d": "function_2d",
}


def coerce_renderer_profile_value(v: object) -> object:
    """将 LLM 输出的 renderer_profile 规范为 7 个合法值之一；未知值回退为 generic_2d。"""
    if not isinstance(v, str):
        return v
    raw = v.strip()
    key = raw.lower().replace("-", "_")
    if not key:
        logger.warning("Empty renderer_profile, using generic_2d")
        return "generic_2d"
    if key in _RENDERER_PROFILE_ALIASES:
        out = _RENDERER_PROFILE_ALIASES[key]
        if raw != out:
            logger.info("renderer_profile alias: %r -> %r", raw, out)
        return out
    if key in CANONICAL_RENDERER_PROFILES:
        return key
    logger.warning("Unknown renderer_profile %r, coercing to generic_2d", raw)
    return "generic_2d"


CANONICAL_SUBJECT_LABS: frozenset[str] = frozenset({
    "math", "physics", "chemistry", "biology", "dynamic",
})

_SUBJECT_LAB_ALIASES: dict[str, str] = {
    "bio": "biology",
    "chem": "chemistry",
    "phys": "physics",
    "maths": "math",
}


def coerce_subject_lab_value(v: object) -> str:
    """与前端 subject_lab 五选一一致；无法识别时回退 dynamic。"""
    if not isinstance(v, str):
        return "dynamic"
    key = v.strip().lower()
    if not key:
        return "dynamic"
    key = _SUBJECT_LAB_ALIASES.get(key, key)
    if key in CANONICAL_SUBJECT_LABS:
        return key
    logger.warning("Unknown subject_lab %r, coercing to dynamic", v)
    return "dynamic"


def dimension_for_renderer_profile(renderer_profile: str) -> Literal["2d", "3d"]:
    """与 lab_prompts/enums DIMENSION_BLOCK 一致：*_2d → 2d，*_3d → 3d。"""
    rp = (renderer_profile or "").strip().lower()
    if rp.endswith("_3d"):
        return "3d"
    return "2d"


def normalize_lab_definition_dict(raw: dict[str, Any]) -> dict[str, Any]:
    """
    就地规范化 LLM 解析出的实验定义 dict，使 SSE / 存库与前端 parseLabDefinitionJson 一致。

    - renderer_profile：别名与未知值归一
    - dimension：与 renderer_profile 后缀对齐
    - subject_lab：别名与未知值归一
    """
    before_rp = raw.get("renderer_profile")
    raw["renderer_profile"] = str(coerce_renderer_profile_value(before_rp if before_rp is not None else ""))

    rp = raw["renderer_profile"]
    expected_dim = dimension_for_renderer_profile(rp)
    cur = raw.get("dimension")
    cur_s = str(cur).strip().lower() if cur is not None else ""
    if cur_s not in ("2d", "3d") or cur_s != expected_dim:
        if cur_s and cur_s != expected_dim:
            logger.info(
                "dimension adjusted: %r -> %r (renderer_profile=%s)",
                cur,
                expected_dim,
                rp,
            )
        raw["dimension"] = expected_dim

    before_sl = raw.get("subject_lab")
    raw["subject_lab"] = coerce_subject_lab_value(before_sl if before_sl is not None else "")
    return raw


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
    visual_hint: dict | None = Field(
        default=None,
        description="AI 设计的渲染蓝图，含 renderSpec、type、colors 等，用于前端结构化渲染",
    )
    render_code: str | None = Field(
        default=None,
        description="AI 生成的完整 TSX 渲染组件代码，优先级高于 renderSpec，前端通过 new Function() 执行",
    )

    @field_validator("renderer_profile", mode="before")
    @classmethod
    def normalize_renderer_profile(cls, v: object) -> object:
        """LLM 常输出 circuit / generic 等简写，统一为 *_2d 等合法 profile。"""
        return coerce_renderer_profile_value(v)

    @field_validator("subject_lab", mode="before")
    @classmethod
    def normalize_subject_lab_field(cls, v: object) -> object:
        return coerce_subject_lab_value(v)

    @field_validator("dimension", mode="before")
    @classmethod
    def normalize_dimension_coerce(cls, v: object) -> object:
        if v is None:
            return "2d"
        s = str(v).strip().lower()
        if s in ("2d", "3d"):
            return s
        logger.warning("Invalid dimension %r, coercing to 2d", v)
        return "2d"

    @model_validator(mode="after")
    def align_dimension_with_renderer_profile(self) -> Self:
        expected = dimension_for_renderer_profile(self.renderer_profile)
        cur = self.dimension.value
        if cur != expected:
            object.__setattr__(self, "dimension", Dimension(expected))
        return self


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
    visual_hint: dict | None = None
    render_code: str | None = None

    @field_validator("renderer_profile", mode="before")
    @classmethod
    def normalize_renderer_profile_patch(cls, v: object) -> object:
        return coerce_renderer_profile_value(v)

    @field_validator("subject_lab", mode="before")
    @classmethod
    def normalize_subject_lab_patch(cls, v: object) -> object:
        if v is None:
            return v
        return coerce_subject_lab_value(v)


class LabDefinitionResponse(LabDefinitionBase):
    id: int
    teacher_id: int | None
    # Some legacy rows may have null timestamps; tolerate in API responses.
    created_at: datetime | None = None
    updated_at: datetime | None = None

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
