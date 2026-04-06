"""
Lab Service — 核心业务逻辑层

职责：
1. 根据 RenderCodeAgent 布局分析结果确定数据库同步内容
2. 支持 Drive/Generate/Regenerate 三种会话模式
3. 与 RenderCodeAgent 交互进行 render_code 验证和校正

分层架构：
- lab_service: 业务逻辑编排，协调 Agent 和 Repository
- RenderCodeAgent: render_code 验证和自我反省
- Repository: 数据访问（由 API 层直接管理 Session）
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, AsyncGenerator, Awaitable, Callable, TypedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lab import (
    LabChatMessage,
    LabDefinition,
    LabGenerationSession,
    LabStatus as OrmLabStatus,
    MessageRole,
    SessionMode,
)
from app.schemas.lab import (
    LabDefinitionCreate,
    LabDefinitionSaveRequest,
    LabStatus,
    LabType,
    SessionMode as SchemaSessionMode,
    SubjectLab,
)
from app.config import settings
from app.services.lab_prompts import RenderCodeAgent, ReflectionReport
from app.services.lab_prompts.render_code_agent import LayoutPlan

logger = logging.getLogger(__name__)


# ============================================================================
# 异常定义
# ============================================================================


class LabServiceError(Exception):
    """服务层异常基类"""

    def __init__(self, message: str, code: str = "LAB_SERVICE_ERROR"):
        self.message = message
        self.code = code
        super().__init__(self.message)


class LabNotFoundError(LabServiceError):
    """实验不存在"""

    def __init__(self, identifier: str):
        super().__init__(
            message=f"Lab with identifier '{identifier}' not found",
            code="LAB_NOT_FOUND",
        )


class SessionNotFoundError(LabServiceError):
    """会话不存在"""

    def __init__(self, session_id: int):
        super().__init__(
            message=f"Session {session_id} not found",
            code="SESSION_NOT_FOUND",
        )


class InvalidModeError(LabServiceError):
    """无效的会话模式"""

    def __init__(self, mode: str):
        super().__init__(
            message=f"Invalid session mode: {mode}",
            code="INVALID_MODE",
        )


class RenderCodeValidationError(LabServiceError):
    """render_code 验证失败"""

    def __init__(self, message: str, issues: list[dict] | None = None):
        super().__init__(message=message, code="RENDER_CODE_INVALID")
        self.issues = issues or []


class LayoutAnalysisError(LabServiceError):
    """布局分析失败"""

    def __init__(self, message: str):
        super().__init__(message=message, code="LAYOUT_ANALYSIS_ERROR")


# ============================================================================
# 数据结构
# ============================================================================


class ChatMode(str, Enum):
    """对话模式枚举"""

    DRIVE = "drive"
    GENERATE = "generate"
    REGENERATE = "regenerate"


@dataclass
class DriveContext:
    """Drive 模式的上下文信息"""

    lab_definition: LabDefinition
    initial_state: dict[str, Any]
    renderer_profile: str
    visual_hint: dict[str, Any] | None
    render_code: str | None


@dataclass
class GenerateContext:
    """Generate 模式的上下文信息"""

    session: LabGenerationSession
    base_lab: LabDefinition | None = None  # 可选的基准实验（用于迭代）
    base_registry_key: str | None = None


@dataclass
class RegenerateContext:
    """Regenerate 模式的上下文信息"""

    lab_definition: LabDefinition
    teacher_message: str | None = None
    regeneration_type: str = "render_code"  # render_code / visual_hint / full


@dataclass
class LayoutSyncSpec:
    """
    布局分析结果到数据库字段的映射规范

    描述：根据 LayoutPlan 分析结果，需要同步到 lab_definitions 表的字段
    """

    # 视觉配置
    visual_profile: str | None = None
    visual_hint: dict[str, Any] | None = None

    # 渲染代码
    render_code: str | None = None

    # 元数据
    lab_metadata: dict[str, Any] = field(default_factory=dict)

    # 布局相关信息
    layout_canvas_size: str | None = None
    layout_components: list[str] = field(default_factory=list)
    layout_strategy: str | None = None

    @classmethod
    def from_layout_plan(
        cls,
        plan: LayoutPlan,
        *,
        visual_hint_updates: dict[str, Any] | None = None,
        render_code: str | None = None,
    ) -> "LayoutSyncSpec":
        """从 LayoutPlan 创建同步规范"""
        spec = cls()

        # 从 LayoutPlan 提取信息
        if plan.canvas_size:
            spec.layout_canvas_size = plan.canvas_size
        if plan.components:
            spec.layout_components = plan.components
        if plan.layout_strategy:
            spec.layout_strategy = plan.layout_strategy

        # 更新 visual_hint
        if visual_hint_updates or plan.to_markdown():
            vh = dict(visual_hint_updates) if visual_hint_updates else {}
            if not vh.get("renderSpec"):
                vh["renderSpec"] = {}
            vh["renderSpec"]["_layoutAnalysis"] = {
                "canvas_size": plan.canvas_size,
                "strategy": plan.layout_strategy,
                "components": plan.components,
                "layers": plan.layers,
                "physics_calculations": plan.physics_calculations,
                "interaction_elements": plan.interaction_elements,
                "accessibility_notes": plan.accessibility_notes,
            }
            spec.visual_hint = vh

        if render_code:
            spec.render_code = render_code

        return spec

    def apply_to_definition(self, lab: LabDefinition) -> None:
        """将同步规范应用到 LabDefinition"""
        if self.visual_profile is not None:
            lab.visual_profile = self.visual_profile

        if self.visual_hint is not None:
            lab.visual_hint = self.visual_hint

        if self.render_code is not None:
            lab.render_code = self.render_code

        if self.lab_metadata:
            existing = lab.lab_metadata or {}
            lab.lab_metadata = {**existing, **self.lab_metadata}


@dataclass
class ValidationResult:
    """验证结果"""

    is_valid: bool
    issues: list[dict[str, Any]]
    corrected_render_code: str | None = None
    reflection_report: ReflectionReport | None = None


# ============================================================================
# Stream 函数类型
# ============================================================================

LLMStreamFn = Callable[[list[dict[str, str]]], Awaitable[str]]


# ============================================================================
# Lab Service 核心类
# ============================================================================


class LabService:
    """
    Lab 业务逻辑服务

    协调 RenderCodeAgent、数据库操作和 AI 对话流程
    """

    def __init__(self, render_code_agent: RenderCodeAgent | None = None):
        self._agent = render_code_agent or RenderCodeAgent()

    # ------------------------------------------------------------------------
    # Drive 模式
    # ------------------------------------------------------------------------

    async def get_drive_context(
        self,
        db: AsyncSession,
        registry_key: str,
    ) -> DriveContext:
        """
        获取 Drive 模式的上下文

        Raises:
            LabNotFoundError: 实验不存在
        """
        result = await db.execute(
            select(LabDefinition).where(LabDefinition.registry_key == registry_key)
        )
        lab = result.scalar_one_or_none()

        if lab is None:
            raise LabNotFoundError(registry_key)

        return DriveContext(
            lab_definition=lab,
            initial_state=lab.initial_state or {},
            renderer_profile=lab.renderer_profile,
            visual_hint=lab.visual_hint,
            render_code=lab.render_code,
        )

    def build_drive_system_prompt(self, context: DriveContext) -> str:
        """
        构建 Drive 模式的系统提示

        Drive 模式下，AI 只能生成命令（commands）来控制实验状态，
        不能生成新的实验定义
        """
        return f"""\
你是一个物理实验交互助手，专注于**驱动**现有的实验。

## 当前实验信息
- 标题: {context.lab_definition.title}
- registry_key: {context.lab_definition.registry_key}
- renderer_profile: {context.renderer_profile}
- 实验类型: {context.lab_definition.subject_lab}

## 当前状态 (initial_state)
```json
{json.dumps(context.initial_state, ensure_ascii=False, indent=2)}
```

## 视觉配置 (visual_hint)
```json
{json.dumps(context.visual_hint or {}, ensure_ascii=False, indent=2)}
```

## 你的职责
1. 理解用户的自然语言请求
2. 生成对应的命令 (LabCommand) 来调整实验参数
3. 解释实验现象和物理原理
4. **不要生成新的实验定义**

## 命令格式
只输出 JSON 数组，每个命令格式：
```json
[
  {{"type": "SET_PARAM", "payload": {{"key": "电压", "value": 12}}}},
  {{"type": "TOGGLE_SWITCH", "payload": {{"switch_id": "S1", "closed": true}}}}
]
```

## 重要约束
- 只能修改 initial_state 中已有的键
- 命令类型必须与实验类型匹配
- 不要输出任何非命令的内容（不要有解释性文字）
"""

    # ------------------------------------------------------------------------
    # Generate 模式
    # ------------------------------------------------------------------------

    async def get_generate_context(
        self,
        db: AsyncSession,
        session_id: int,
        base_registry_key: str | None = None,
    ) -> GenerateContext:
        """
        获取 Generate 模式的上下文

        Raises:
            SessionNotFoundError: 会话不存在
            LabNotFoundError: 基准实验不存在
        """
        result = await db.execute(
            select(LabGenerationSession).where(LabGenerationSession.id == session_id)
        )
        session = result.scalar_one_or_none()

        if session is None:
            raise SessionNotFoundError(session_id)

        base_lab: LabDefinition | None = None
        if base_registry_key:
            result = await db.execute(
                select(LabDefinition).where(
                    LabDefinition.registry_key == base_registry_key
                )
            )
            base_lab = result.scalar_one_or_none()
            if base_lab is None:
                raise LabNotFoundError(base_registry_key)

        return GenerateContext(
            session=session,
            base_lab=base_lab,
            base_registry_key=base_registry_key,
        )

    def build_generate_system_prompt(
        self,
        context: GenerateContext,
    ) -> str:
        """
        构建 Generate 模式的系统提示

        Generate 模式下，AI 可以：
        1. 生成新的 LabDefinition JSON
        2. 输出解释性文字
        3. 可选的生成命令（但不是主要职责）
        """
        base_context = ""
        if context.base_lab:
            base_context = f"""

## 基准实验（用于迭代改进）
- 标题: {context.base_lab.title}
- registry_key: {context.base_lab.registry_key}
- renderer_profile: {context.base_lab.renderer_profile}
- 当前 render_code 片段:
```tsx
{context.base_lab.render_code[:500] if context.base_lab.render_code else "(无)"}
...
```

用户可能希望你在保持实验主题的同时改进可视化和交互。
"""

        return f"""\
你是一个专业的中学物理实验可视化设计师。

## 你的职责
1. 根据教师的描述生成完整的实验定义 (LabDefinition)
2. 生成高质量的 SVG render_code
3. 解释实验原理和设计思路

## 输出格式
必须同时输出：
1. **lab_definition JSON**: 完整的实验定义（见下方格式）
2. **解释文字**: 面向教师的说明

### lab_definition 格式
```json
{{
  "registry_key": "physics.circuit_ohm_series_001",
  "title": "欧姆定律-串联电路",
  "description": "探究串联电路中电压、电阻与电流的关系",
  "subject_lab": "physics",
  "renderer_profile": "circuit_2d",
  "dimension": "2d",
  "initial_state": {{
    "voltage": 12,
    "r1": 100,
    "r2": 200,
    "showCurrent": true,
    "showValues": true
  }},
  "visual_hint": {{
    "type": "circuit",
    "primary_concept": "欧姆定律",
    "renderSpec": {{
      "topology": "series",
      "components": [
        {{"id": "bat1", "type": "battery", "label": "E", "value_key": "voltage"}},
        {{"id": "r1", "type": "resistor", "label": "R1", "value_key": "r1"}},
        {{"id": "r2", "type": "resistor", "label": "R2", "value_key": "r2"}}
      ],
      "wires": [
        {{"from": "bat1.pos", "to": "r1"}},
        {{"from": "r1", "to": "r2"}},
        {{"from": "r2", "to": "bat1.neg"}}
      ]
    }}
  }},
  "render_code": `export default function LabRenderer(props) {{
    const {{state, onStateChange, readonly, t}} = props;
    function rv(k, d) {{ var v = state[k]; if (typeof v === 'number' && isFinite(v)) return v; return d; }}
    // ... SVG 渲染代码 ...
  }}`
}}
```

## 质量要求
- initial_state 必须是扁平结构（标量值）
- render_code 必须使用 SVG createElement
- 电路图必须包含电池符号（长短线）、电阻符号（锯齿 polyline）
- 必须有物理计算面板显示 I、V、R 等值
- 使用暗色主题 (#0b1120 背景)
{base_context}
"""

    # ------------------------------------------------------------------------
    # Regenerate 模式
    # ------------------------------------------------------------------------

    async def get_regenerate_context(
        self,
        db: AsyncSession,
        lab_id: int,
        teacher_message: str | None = None,
    ) -> RegenerateContext:
        """
        获取 Regenerate 模式的上下文

        Raises:
            LabNotFoundError: 实验不存在
        """
        result = await db.execute(
            select(LabDefinition).where(LabDefinition.id == lab_id)
        )
        lab = result.scalar_one_or_none()

        if lab is None:
            raise LabNotFoundError(f"id={lab_id}")

        return RegenerateContext(
            lab_definition=lab,
            teacher_message=teacher_message,
            regeneration_type="render_code",  # 默认只重新生成 render_code
        )

    async def regenerate_render_code(
        self,
        context: RegenerateContext,
        stream_fn: LLMStreamFn,
    ) -> tuple[str | None, ReflectionReport]:
        """
        重新生成实验的 render_code

        Returns:
            (修正后的 render_code, 反省报告)
        """
        lab = context.lab_definition

        corrected_rc, report, _plan = await self._agent.validate_and_enhance(
            render_code=lab.render_code,
            initial_state=lab.initial_state,
            visual_hint=lab.visual_hint,
            subject=str(lab.subject_lab.value if hasattr(lab.subject_lab, 'value') else lab.subject_lab),
            renderer_profile=lab.renderer_profile,
            stream_fn=stream_fn,
            definition_id=lab.registry_key,
            teacher_message=context.teacher_message,
        )

        return corrected_rc, report

    # ------------------------------------------------------------------------
    # render_code 验证和校正
    # ------------------------------------------------------------------------

    async def validate_render_code(
        self,
        render_code: str | None,
        initial_state: dict[str, Any] | None,
        visual_hint: dict[str, Any] | None,
        subject: str,
        renderer_profile: str | None,
        stream_fn: LLMStreamFn,
        definition_id: str | None = None,
    ) -> ValidationResult:
        """
        验证并校正 render_code

        与 RenderCodeAgent 交互，执行自我反省循环直到生成有效的代码
        """
        # 初步检测
        issues = self._agent.detect_issues(
            render_code, initial_state, visual_hint
        )
        is_valid = self._agent.is_valid(render_code, initial_state, visual_hint)

        if is_valid and not issues:
            return ValidationResult(
                is_valid=True,
                issues=[],
                corrected_render_code=render_code,
            )

        # 需要修正
        corrected_rc, report, _plan = await self._agent.validate_and_enhance(
            render_code=render_code,
            initial_state=initial_state,
            visual_hint=visual_hint,
            subject=subject,
            renderer_profile=renderer_profile,
            stream_fn=stream_fn,
            definition_id=definition_id,
        )

        final_issues = []
        if corrected_rc:
            final_issues = self._agent.detect_issues(
                corrected_rc, initial_state, visual_hint
            )

        return ValidationResult(
            is_valid=corrected_rc is not None and len(final_issues) == 0,
            issues=[{"code": i.code, "description": i.description} for i in final_issues],
            corrected_render_code=corrected_rc,
            reflection_report=report,
        )

    def extract_layout_plan_from_response(
        self,
        response: str,
    ) -> LayoutPlan | None:
        """从 LLM 响应中提取 LayoutPlan"""
        return LayoutPlan.from_llm_response(response)

    def sync_layout_to_definition(
        self,
        lab: LabDefinition,
        plan: LayoutPlan,
        render_code: str | None = None,
    ) -> LayoutSyncSpec:
        """
        将 LayoutPlan 分析结果同步到 LabDefinition

        根据布局分析结果：
        1. 更新 visual_hint 中的 renderSpec
        2. 应用 render_code
        3. 更新元数据
        """
        spec = LayoutSyncSpec.from_layout_plan(
            plan,
            visual_hint_updates=lab.visual_hint,
            render_code=render_code or lab.render_code,
        )
        spec.apply_to_definition(lab)
        return spec

    # ------------------------------------------------------------------------
    # 辅助方法
    # ------------------------------------------------------------------------

    @staticmethod
    def is_valid_render_code(
        render_code: str | None,
        initial_state: dict[str, Any] | None = None,
        visual_hint: dict[str, Any] | None = None,
    ) -> bool:
        """验证 render_code 是否有效（便捷函数）"""
        return RenderCodeAgent().is_valid(render_code, initial_state, visual_hint)

    @staticmethod
    def detect_render_code_issues(
        render_code: str | None,
        initial_state: dict[str, Any] | None = None,
        visual_hint: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """检测 render_code 问题（便捷函数）"""
        issues = RenderCodeAgent().detect_issues(render_code, initial_state, visual_hint)
        return [{"code": i.code, "description": i.description, "location": i.location} for i in issues]


# ============================================================================
# 便捷函数
# ============================================================================

async def validate_render_code_with_agent(
    render_code: str | None,
    initial_state: dict[str, Any] | None,
    visual_hint: dict[str, Any] | None,
    subject: str,
    renderer_profile: str | None,
    stream_fn: LLMStreamFn,
    definition_id: str | None = None,
    teacher_message: str | None = None,
) -> tuple[str | None, ReflectionReport, "LayoutPlan | None"]:
    """
    验证并校正 render_code（便捷函数）

    Returns:
        (render_code, ReflectionReport, LayoutPlan)
        - render_code: 校正后的代码
        - ReflectionReport: 反省报告
        - LayoutPlan: 布局方案（可能为 None）
    """
    from app.services.lab_prompts.render_code_agent import LayoutPlan

    agent = RenderCodeAgent()
    return await agent.validate_and_enhance(
        render_code=render_code,
        initial_state=initial_state,
        visual_hint=visual_hint,
        subject=subject,
        renderer_profile=renderer_profile,
        stream_fn=stream_fn,
        definition_id=definition_id,
        teacher_message=teacher_message,
    )


def apply_reflection_report_to_definition(
    definition: dict[str, Any],
    report: ReflectionReport,
) -> dict[str, Any]:
    """
    将 ReflectionReport 的分析结果应用到 definition

    根据反省报告更新：
    1. visual_hint（包含布局分析结果）
    2. 记录反省历史到 lab_metadata
    """
    # 更新 visual_hint
    if not definition.get("visual_hint"):
        definition["visual_hint"] = {}

    vh = definition["visual_hint"]
    if not vh.get("renderSpec"):
        vh["renderSpec"] = {}

    # 记录布局分析结果
    if report.layout_plan:
        vh["renderSpec"]["_lastLayoutAnalysis"] = {
            "at": report.generated_at.isoformat(),
            "plan": report.layout_plan,
            "attempt_count": report.attempt_count,
        }

    # 记录问题历史
    if report.issues_detected:
        vh["renderSpec"]["_issueHistory"] = [
            {"code": i.code, "description": i.description}
            for i in report.issues_detected[-5:]  # 只保留最近 5 个
        ]

    # 更新元数据
    metadata = definition.get("lab_metadata") or {}
    metadata["_reflection"] = {
        "last_attempt": report.attempt_count,
        "used_fallback": report.used_fallback,
        "summary": report.summary,
        "corrections": report.corrections_applied[-3:],  # 最近 3 次修正
    }
    definition["lab_metadata"] = metadata

    return definition


# ============================================================================
# 向后兼容的导出
# ============================================================================

__all__ = [
    # 异常
    "LabServiceError",
    "LabNotFoundError",
    "SessionNotFoundError",
    "InvalidModeError",
    "RenderCodeValidationError",
    "LayoutAnalysisError",
    # 数据结构
    "ChatMode",
    "DriveContext",
    "GenerateContext",
    "RegenerateContext",
    "LayoutSyncSpec",
    "ValidationResult",
    # 核心类
    "LabService",
    # 便捷函数
    "validate_render_code_with_agent",
    "apply_reflection_report_to_definition",
    # LLM 交互
    "stream_ohmygpt",
    "build_session_messages",
    "parse_assistant_raw_response",
    "normalize_drive_commands_for_frontend",
    # 保存 payload 辅助
    "apply_save_payload_to_lab",
    "signature_from_save_payload",
    "signature_from_orm_lab",
    "augment_generate_assistant_content_for_llm",
    "enforce_generate_base_definition",
]


# ============================================================================
# LLM 交互函数
# ============================================================================


def augment_generate_assistant_content_for_llm(
    content: str | None,
    definition: dict[str, Any] | None,
    *,
    render_code_max_chars: int = 16_000,
) -> str:
    """
    Generate 模式多轮对话：把已落库的 LabDefinition 注入助手历史，供下一轮 LLM 使用。

    仅 ``content`` 时，模型在第二轮常见短指令（如「生成实验」）下看不到上一轮 JSON，
    导致只输出说明、不输出 lab_definition。注入后模型可继续迭代或按指令输出完整 JSON。
    """
    base = (content or "").strip()
    if not definition or not isinstance(definition, dict):
        return base

    try:
        compact = json.loads(json.dumps(definition, ensure_ascii=False))
    except (TypeError, ValueError):
        compact = dict(definition)

    rc = compact.get("render_code")
    if isinstance(rc, str) and len(rc) > render_code_max_chars:
        compact["render_code"] = (
            rc[:render_code_max_chars]
            + "\n// ... truncated in multi-turn context; regenerate full render_code if needed ..."
        )

    block = json.dumps(compact, ensure_ascii=False)
    anchor = (
        "\n\n---\n"
        "【多轮上下文】以下为上一轮助手已生成并保存的 LabDefinition（JSON）。"
        "若用户仅说「生成实验」「按上文输出」「给出 JSON」等，你必须输出完整 lab_definition "
        "代码块（含 render_code），或在其基础上按用户要求修改；不要只回复概念说明而不给 JSON。\n"
        "```json\n"
        f"{block}\n"
        "```"
    )
    return base + anchor if base else anchor.lstrip()


def enforce_generate_base_definition(
    definition: dict[str, Any],
    *,
    base_lab: LabDefinition,
) -> dict[str, Any]:
    """
    Generate 多轮迭代：强制围绕已选实验进行“同 key 覆盖式改写”，避免生成新实验。

    约束：
    - registry_key 必须等于 base_lab.registry_key
    - subject_lab / renderer_profile / dimension 默认对齐 base_lab（允许模型输出但会被收敛）
    - 若 render_code 缺失/为空，回退为 base_lab.render_code（保证前端可预览）
    - 若 initial_state 缺失，回退为 base_lab.initial_state（保证 reducer/渲染一致）
    """
    if not isinstance(definition, dict):
        return {"registry_key": base_lab.registry_key}

    definition["registry_key"] = base_lab.registry_key

    # Align core identity fields to the selected base lab
    try:
        definition["subject_lab"] = (
            base_lab.subject_lab.value
            if hasattr(base_lab.subject_lab, "value")
            else str(base_lab.subject_lab)
        )
    except Exception:
        definition["subject_lab"] = definition.get("subject_lab") or "dynamic"

    definition["renderer_profile"] = base_lab.renderer_profile
    definition["dimension"] = (
        base_lab.dimension.value if hasattr(base_lab.dimension, "value") else base_lab.dimension
    )

    if not isinstance(definition.get("initial_state"), dict):
        definition["initial_state"] = base_lab.initial_state or {}

    rc = definition.get("render_code")
    if not isinstance(rc, str) or not rc.strip():
        if base_lab.render_code:
            definition["render_code"] = base_lab.render_code

    # Preserve visual_hint if the model provided one; otherwise keep base
    if definition.get("visual_hint") is None and base_lab.visual_hint is not None:
        definition["visual_hint"] = base_lab.visual_hint

    return definition


async def stream_ohmygpt(messages: list[dict[str, str]]) -> AsyncGenerator[str, None]:  # type: ignore[misc]
    """
    调用 OhMyGPT API 并返回流式响应

    Yields:
        str: 响应内容片段
    """
    from typing import AsyncGenerator

    import httpx

    # 使用 settings 配置
    api_key = settings.ohmygpt_api_key
    base_url = settings.ohmygpt_base_url
    model = settings.ohmygpt_model
    temperature = settings.ohmygpt_temperature

    if not api_key:
        logger.warning("[OhMyGPT] API key not configured, returning empty response")
        return

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "temperature": temperature,
    }

    logger.info("[OhMyGPT] Calling model=%s, temperature=%s", model, temperature)

    logger.info("[OhMyGPT] Preparing request payload: model=%s, msg_count=%d", model, len(messages))

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            logger.info("[OhMyGPT] Sending request to %s", f"{base_url}/chat/completions")
            
            # 使用 stream 上下文管理器
            async with client.stream("POST", f"{base_url}/chat/completions", headers=headers, json=payload) as response:
                logger.info("[OhMyGPT] Response status: %s", response.status_code)
                
                if response.status_code >= 400:
                    try:
                        error_body = response.text
                        logger.error("[OhMyGPT] HTTP Error: %s - %s", response.status_code, error_body[:500])
                    except Exception:
                        pass
                    return
                
                # 使用 aiter_lines() 逐行迭代
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            import json as _json
                            chunk = _json.loads(data)
                            content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if content:
                                yield content
                        except Exception:
                            continue
    except httpx.HTTPStatusError as e:
        logger.error("[OhMyGPT] HTTP %s Error: %s", e.response.status_code, str(e))
        return
    except Exception as e:
        logger.error("[OhMyGPT] Unexpected Error: %s", str(e), exc_info=True)
        return


async def build_session_messages(
    db: AsyncSession,
    session: LabGenerationSession,
    new_message: str,
) -> tuple[list[dict[str, str]], dict[str, Any] | None, dict[str, Any] | None]:
    """
    构建发送给 LLM 的消息列表

    根据会话模式构建系统提示和历史消息

    Returns:
        (messages, drive_context, generate_context)
    """
    messages: list[dict[str, str]] = []

    # 加载历史消息
    result = await db.execute(
        select(LabChatMessage)
        .where(LabChatMessage.session_id == session.id)
        .order_by(LabChatMessage.created_at)
    )
    history = list(result.scalars().all())

    # 确定模式
    session_mode = session.mode
    if hasattr(session_mode, 'value'):
        session_mode = session_mode.value

    if session_mode == "drive" and session.lab_definition_id is not None:
        # Drive 模式：加载实验上下文
        result = await db.execute(
            select(LabDefinition).where(LabDefinition.id == session.lab_definition_id)
        )
        lab = result.scalar_one_or_none()

        if lab is None:
            raise ValueError(f"Lab definition {session.lab_definition_id} not found")

        # 构建 Drive 模式系统提示
        system_prompt = f"""\
你是一个物理实验交互助手，专注于**驱动**现有的实验。

## 当前实验信息
- 标题: {lab.title}
- registry_key: {lab.registry_key}
- renderer_profile: {lab.renderer_profile}
- 实验类型: {lab.subject_lab}

## 当前状态 (initial_state)
```json
{json.dumps(lab.initial_state or {}, ensure_ascii=False, indent=2)}
```

## 视觉配置 (visual_hint)
```json
{json.dumps(lab.visual_hint or {}, ensure_ascii=False, indent=2)}
```

## 你的职责
1. 理解用户的自然语言请求
2. 生成对应的命令 (LabCommand) 来调整实验参数
3. 解释实验现象和物理原理
4. **不要生成新的实验定义**

## 命令格式
只输出 JSON 数组，每个命令格式：
```json
[
  {{"type": "SET_PARAM", "payload": {{"key": "voltage", "value": 12}}}},
  {{"type": "TOGGLE_SWITCH", "payload": {{"switch_id": "S1", "closed": true}}}}
]
```

## 重要约束
- 只能修改 initial_state 中已有的键
- 命令类型必须与实验类型匹配
- 不要输出任何非命令的内容（不要有解释性文字）
"""
        messages.append({"role": "system", "content": system_prompt})

        drive_context = {
            "lab_id": lab.id,
            "registry_key": lab.registry_key,
            "initial_state": lab.initial_state or {},
        }
        generate_context = None
    else:
        # Generate 模式
        def _format_generate_base_anchor(base_lab: LabDefinition) -> str:
            """
            生成“基准实验 JSON 注入块”（严格字段对齐）。

            约束目标：
            - 让 LLM 明确这是“同一个实验的迭代”，不是新建实验
            - 让 LLM 以“在原 JSON 上微调”的方式工作（最小改动）
            - 字段命名与后端 schema/DB 字段一致（snake_case）
            """
            base_def: dict[str, Any] = {
                "registry_key": base_lab.registry_key,
                "title": base_lab.title,
                "description": base_lab.description,
                "subject_lab": (
                    base_lab.subject_lab.value
                    if hasattr(base_lab.subject_lab, "value")
                    else str(base_lab.subject_lab)
                ),
                "renderer_profile": base_lab.renderer_profile,
                "dimension": (
                    base_lab.dimension.value
                    if hasattr(base_lab.dimension, "value")
                    else str(base_lab.dimension)
                ),
                "initial_state": base_lab.initial_state or {},
                "visual_hint": base_lab.visual_hint or {},
                # 注意：render_code 可能较长；历史注入中会截断，这里保持原样（由后续注入函数控制截断）
                "render_code": base_lab.render_code or "",
            }

            # 统一要求输出：只允许对“可变字段”做微调
            frozen_fields = ["registry_key", "subject_lab", "renderer_profile", "dimension"]
            editable_fields = [
                "title",
                "description",
                "initial_state",
                "visual_hint",
                "render_code",
                "lab_metadata",
            ]

            return (
                "\n\n## 已选中基准实验（必须围绕此实验迭代，禁止新建）\n"
                f"- registry_key: `{base_lab.registry_key}`\n"
                f"- title: {base_lab.title}\n\n"
                "### 冻结字段（必须保持与基准实验一致，不得变更）\n"
                + "\n".join([f"- `{f}`" for f in frozen_fields])
                + "\n\n"
                "### 可编辑字段（仅在确有需要时做最小改动；不要无意义重写）\n"
                + "\n".join([f"- `{f}`" for f in editable_fields])
                + "\n\n"
                "### 迭代工作方式（必须遵守）\n"
                "- 先在下面的 JSON 里**定位**你要修改的字段/位置，再做**微调**，不要整体重写。\n"
                "- 若用户新增需求与现有字段冲突：优先修改 `visual_hint.renderSpec` 与 `render_code` 来满足交互/动画；必要时再补 `initial_state` 新参数。\n"
                "- 若用户只给简短指令（如“生成实验/按上文输出/给出 JSON/再优化一下”）：你必须输出完整 `lab_definition` JSON 代码块（含 `render_code`）。\n"
                "\n"
                "### 当前基准实验定义（作为改写输入；你输出时字段名必须与此一致）\n"
                "```json\n"
                f"{json.dumps(base_def, ensure_ascii=False)}\n"
                "```\n"
            )

        base_anchor = ""
        if session.lab_definition_id is not None:
            lr = await db.execute(
                select(LabDefinition).where(LabDefinition.id == session.lab_definition_id)
            )
            base_lab = lr.scalar_one_or_none()
            if base_lab is not None:
                base_anchor = _format_generate_base_anchor(base_lab)

        system_prompt = """\
你是一个专业的中学物理实验可视化设计师。

## 你的职责
1. 根据教师的描述生成完整的实验定义 (LabDefinition)
2. 生成高质量的 SVG render_code
3. 解释实验原理和设计思路

## 输出格式
必须同时输出：
1. **lab_definition JSON**: 完整的实验定义
2. **解释文字**: 面向教师的说明

### lab_definition 格式
```json
{
  "registry_key": "physics.circuit_ohm_series_001",
  "title": "欧姆定律-串联电路",
  "description": "探究串联电路中电压、电阻与电流的关系",
  "subject_lab": "physics",
  "renderer_profile": "circuit_2d",
  "dimension": "2d",
  "initial_state": {"voltage": 12, "r1": 100, "r2": 200, "showCurrent": true},
  "visual_hint": {"type": "circuit", "primary_concept": "欧姆定律", "renderSpec": {"topology": "series", "components": [], "wires": []}},
  "render_code": "export default function LabRenderer(props) { ... }"
}
```

## 质量要求
- initial_state 必须是扁平结构（标量值）
- render_code 必须使用 SVG createElement
- 电路图必须包含电池符号、电阻符号
- 使用暗色主题 (#0b1120 背景)

## 多轮对话
若历史中出现「【多轮上下文】」附带的 JSON，说明上一轮已生成实验定义；用户简短指令（如「生成实验」）时须输出完整 lab_definition，不得省略 JSON 代码块。
若已选中“基准实验”，本轮属于迭代：你必须先在基准 JSON 中定位改动点，再做最小改动，且冻结字段必须保持一致。
""" + base_anchor
        messages.append({"role": "system", "content": system_prompt})

        drive_context = None
        generate_context = {
            "session_id": session.id,
            "mode": session_mode,
        }

    # 添加历史消息
    for msg in history:
        # ORM 层 role 字段为 String(20)，测试/SQLite 下常直接返回 str；生产环境也可能返回 Enum。
        raw_role = msg.role.value if hasattr(msg.role, "value") else msg.role
        role = "user" if raw_role == "user" else "assistant"
        if role == "assistant" and session_mode != "drive":
            body = augment_generate_assistant_content_for_llm(msg.content, msg.definition)
            messages.append({"role": role, "content": body})
        else:
            messages.append({"role": role, "content": msg.content or ""})

    # 添加新消息
    messages.append({"role": "user", "content": new_message})

    return messages, drive_context, generate_context


def parse_assistant_raw_response(full_text: str) -> tuple[str, list[dict] | None, list[dict] | None]:
    """
    解析 LLM 原始响应

    从完整响应文本中提取：
    - 叙事文字（去除 JSON 代码块）
    - 命令列表
    - 实验定义列表

    Returns:
        (parsed_text, commands, definitions)
    """
    import json

    commands: list[dict] | None = None
    definitions: list[dict] | None = None
    parsed_text = full_text

    # 尝试提取 JSON 代码块
    json_blocks: list[str] = []
    code_block_pattern = re.compile(r"```(?:json|tsx|typescript)?\s*\n?(.*?)\n?```", re.DOTALL)

    for match in code_block_pattern.finditer(full_text):
        block_content = match.group(1).strip()
        json_blocks.append(block_content)

    # 分析每个 JSON 块
    text_parts: list[str] = []
    for i, block in enumerate(json_blocks):
        block = block.strip()
        if not block:
            continue

        # 尝试解析为 JSON
        try:
            parsed = json.loads(block)

            # 检测是否为命令数组
            if isinstance(parsed, list) and all(
                isinstance(item, dict) and "type" in item for item in parsed
            ):
                commands = parsed
                continue

            # 检测是否为实验定义
            if isinstance(parsed, dict) and "registry_key" in parsed:
                if definitions is None:
                    definitions = []
                definitions.append(parsed)
                continue

            # 检测是否为命令包装
            if isinstance(parsed, dict):
                if "commands" in parsed and isinstance(parsed["commands"], list):
                    commands = parsed["commands"]
                if "definition" in parsed:
                    if definitions is None:
                        definitions = []
                    def_data = parsed["definition"]
                    if isinstance(def_data, dict):
                        definitions.append(def_data)

        except json.JSONDecodeError:
            # 不是有效 JSON，可能是普通文本
            pass

        # 收集为叙事文字
        text_parts.append(block)

    # 构建解析后的文本（去除 JSON 部分）
    for block in json_blocks:
        parsed_text = parsed_text.replace(f"```json\n{block}\n```", "")
        parsed_text = parsed_text.replace(f"```json\n{block}```", "")
        parsed_text = parsed_text.replace(f"```\n{block}\n```", "")
        parsed_text = parsed_text.replace(f"```\n{block}```", "")

    # 清理多余空白
    parsed_text = re.sub(r"\n{3,}", "\n\n", parsed_text)
    parsed_text = parsed_text.strip()

    return parsed_text, commands, definitions


def normalize_drive_commands_for_frontend(
    commands: list[dict],
    initial_state: dict[str, Any],
) -> list[dict] | None:
    """
    规范化 Drive 命令以适配前端

    确保命令格式符合前端期望

    Returns:
        规范化后的命令列表，如果无需规范化则返回 None
    """
    if not commands:
        return None

    normalized: list[dict] = []
    valid_keys = set(initial_state.keys()) if initial_state else set()

    for cmd in commands:
        if not isinstance(cmd, dict):
            continue

        cmd_type = cmd.get("type", "")
        payload = cmd.get("payload") or {}

        # 规范化 SET_PARAM 命令
        if cmd_type == "SET_PARAM":
            key = payload.get("key") or payload.get("param")
            value = payload.get("value")

            # 跳过无效键（如果 initial_state 已知）
            if valid_keys and key not in valid_keys:
                logger.warning(f"[normalize] SET_PARAM key '{key}' not in initial_state, keeping anyway")

            normalized.append({
                "type": "SET_PARAM",
                "payload": {"key": key, "value": value},
            })
            continue

        # 保留其他类型的命令
        normalized.append(cmd)

    return normalized if normalized else None


# ============================================================================
# 保存 Payload 辅助函数
# ============================================================================


def signature_from_save_payload(payload: LabDefinitionSaveRequest) -> str:
    """
    计算保存请求的签名

    用于检测内容是否变化

    Returns:
        内容签名（MD5）
    """
    import hashlib

    sig_data = {
        "title": payload.title,
        "description": payload.description,
        "subject_lab": payload.subject_lab.value if hasattr(payload.subject_lab, 'value') else str(payload.subject_lab),
        "renderer_profile": payload.renderer_profile,
        "dimension": payload.dimension.value if hasattr(payload.dimension, 'value') else str(payload.dimension),
        "initial_state": payload.initial_state,
        "reducer_spec": payload.reducer_spec,
        "visual_hint": payload.visual_hint,
        "render_code": payload.render_code,
    }

    sig_str = json.dumps(sig_data, sort_keys=True, ensure_ascii=False)
    return hashlib.md5(sig_str.encode()).hexdigest()


def signature_from_orm_lab(lab: LabDefinition) -> str:
    """
    从 ORM 对象计算签名

    Returns:
        内容签名（MD5）
    """
    import hashlib

    sig_data = {
        "title": lab.title,
        "description": lab.description,
        "subject_lab": lab.subject_lab.value if hasattr(lab.subject_lab, 'value') else str(lab.subject_lab),
        "renderer_profile": lab.renderer_profile,
        "dimension": lab.dimension.value if hasattr(lab.dimension, 'value') else str(lab.dimension),
        "initial_state": lab.initial_state,
        "reducer_spec": lab.reducer_spec,
        "visual_hint": lab.visual_hint,
        "render_code": lab.render_code,
    }

    sig_str = json.dumps(sig_data, sort_keys=True, ensure_ascii=False)
    return hashlib.md5(sig_str.encode()).hexdigest()


def apply_save_payload_to_lab(
    lab: LabDefinition,
    payload: LabDefinitionSaveRequest,
    *,
    target_status: OrmLabStatus | None = None,
) -> None:
    """
    将保存请求应用到 LabDefinition 对象

    更新对象的字段，可选地设置目标状态
    """
    if payload.title is not None:
        lab.title = payload.title
    if payload.description is not None:
        lab.description = payload.description
    if payload.subject_lab is not None:
        lab.subject_lab = payload.subject_lab.value if hasattr(payload.subject_lab, 'value') else payload.subject_lab
    if payload.renderer_profile is not None:
        lab.renderer_profile = payload.renderer_profile
    if payload.dimension is not None:
        lab.dimension = payload.dimension.value if hasattr(payload.dimension, 'value') else payload.dimension
    if payload.initial_state is not None:
        lab.initial_state = payload.initial_state
    if payload.reducer_spec is not None:
        lab.reducer_spec = payload.reducer_spec
    if payload.lab_metadata is not None:
        lab.lab_metadata = payload.lab_metadata
    if payload.visual_hint is not None:
        lab.visual_hint = payload.visual_hint
    if payload.render_code is not None:
        lab.render_code = payload.render_code
    if payload.visual_profile is not None:
        lab.visual_profile = payload.visual_profile
    if payload.lab_type is not None:
        lab.lab_type = payload.lab_type.value if hasattr(payload.lab_type, 'value') else payload.lab_type

    if target_status is not None:
        lab.status = target_status.value if hasattr(target_status, 'value') else target_status


# 类型别名用于循环导入
