"""
Render Code Agent - render_code 验证与自我反省模块

从 lab_service.py 提取的 render_code 生成逻辑，具备：
1. 调用 lab_prompts/ 下所有文件作为知识库
2. 自我反省循环直到生成有效的 SVG 渲染代码
3. 输出包含诊断过程和最终结果的文档
"""

import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Awaitable

from . import rules as lp_rules
from . import examples as lp_examples

# ---------------------------------------------------------------------------
# 实验类型关键词 - 统一管理，避免重复定义
# ---------------------------------------------------------------------------

EXPERIMENT_KEYWORDS: dict[str, list[str]] = {
    "circuit": [
        "circuit", "ohm", "parallel", "series", "电阻", "电流", "电压",
        "串联", "并联", "battery", "resistor", "capacitor", "inductor",
    ],
    "optics": [
        "lens", "mirror", "refraction", "snell", "光", "折射", "反射",
        "透镜", "光线", "prism", "wave_source", "ray",
    ],
    "mechanics": [
        "pendulum", "spring", "projectile", "falling", "钟摆", "弹簧",
        "抛体", "力学", "gravity", "mass", "velocity", "trajectory",
        # force diagram / incline + friction
        "incline", "inclined", "slope", "ramp", "friction", "normal", "free body",
        "斜面", "坡面", "摩擦", "摩擦系数", "受力", "受力分析", "法向", "支持力", "分力", "滑动", "临界",
    ],
    "chemistry": [
        "titration", "reaction", "ph", "酸碱", "反应", "滴定", "pH",
        "concentration", "indicator", "acid", "base",
    ],
    "biology": [
        "cell", "dna", "organism", "细胞", "生物", "克隆", "organelle",
        "nucleus", "mitochondria", "membrane", "核", "线粒体",
    ],
    "wave": [
        "wave", "interference", "波", "干涉", "衍射", "diffraction",
        "frequency", "amplitude", "wavelength",
    ],
    "field": [
        "field", "electric", "magnetic", "场", "电场", "磁场",
        "charge", "magnet", "flux",
    ],
}


def is_incline_force_diagram_intent(
    *,
    visual_hint: dict[str, Any] | None,
    teacher_message: str | None = None,
    registry_key: str | None = None,
) -> bool:
    """
    是否属于“斜面受力/摩擦”的 2D 受力分析示意图意图。

    用于在 prompt 中追加通用、可复用的布局与标注约束，提升作图一致性。
    """
    vh = visual_hint if isinstance(visual_hint, dict) else {}
    blob = " ".join(
        [
            str(vh.get("primary_concept", "")),
            str(vh.get("title", "")),
            str(teacher_message or ""),
            str(registry_key or ""),
        ]
    ).lower()
    zh_hits = ["斜面", "坡面", "受力", "受力分析", "摩擦", "摩擦系数", "法向", "支持力", "分力", "临界", "下滑"]
    en_hits = ["incline", "ramp", "slope", "friction", "normal", "free body"]
    return any(h in blob for h in zh_hits) or any(h in blob for h in en_hits)


def is_chemistry_reaction_intent(
    *,
    visual_hint: dict[str, Any] | None,
    teacher_message: str | None = None,
    registry_key: str | None = None,
    initial_state: dict[str, Any] | None = None,
) -> bool:
    """
    是否属于“化学反应（2D 示意/过程动画）”意图。

    主要用于在 LLM 生成 render_code 失败时，选择更贴合化学反应的 fallback 模板，
    避免落到通用的“圆点+滑杆”渲染导致用户误以为“化学反应不支持”。
    """
    vh = visual_hint if isinstance(visual_hint, dict) else {}
    st = initial_state if isinstance(initial_state, dict) else {}
    blob = " ".join(
        [
            str(vh.get("primary_concept", "")),
            str(vh.get("title", "")),
            str(teacher_message or ""),
            str(registry_key or ""),
            " ".join(st.keys()),
        ]
    ).lower()
    # Broad reaction cues
    cues = [
        "reaction",
        "exotherm",
        "endotherm",
        "thermite",
        "oxidation",
        "combustion",
        "放热",
        "吸热",
        "氧化",
        "燃烧",
        "铝热",
        "铝热反应",
        "氧化铁",
        "氧化铁(iii)",
        "fe2o3",
        "aluminum",
        "aluminium",
    ]
    return any(c in blob for c in cues)

# ---------------------------------------------------------------------------
# 禁止的 API 关键词 - 用于检测不安全代码
# ---------------------------------------------------------------------------

FORBIDDEN_APIS: list[str] = [
    "getContext", "getContext('2d')", "getContext('webgl')",
    "useRef<HTMLCanvasElement>", "useRef<CanvasElement>",
    "eval(", "new Function(", "newFunction",
    "fetch(", "XMLHttpRequest", "axios", "http.request",
    "document.write", "innerHTML", "outerHTML",
    # 浏览器 DOM API；前端 AILabRuntime 仅执行 React createElement，返回真实 SVG/DOM 会无法渲染
    "document.createElement",
]

# ---------------------------------------------------------------------------
# 渲染元素关键词 - 从 initial_state 键名推断需要的 SVG 控件
# ---------------------------------------------------------------------------

RENDER_ELEMENT_KEYWORDS: dict[str, dict[str, Any]] = {
    "voltage": {"type": "range", "min": 0.1, "max": 24.0, "color": "#60a5fa", "unit": "V"},
    "current": {"type": "range", "min": 0.01, "max": 10.0, "color": "#34d399", "unit": "A"},
    "resistance": {"type": "range", "min": 1.0, "max": 500.0, "color": "#fbbf24", "unit": "Ω"},
    "angle": {"type": "range", "min": 0.0, "max": 180.0, "color": "#10b981", "unit": "°"},
    "theta": {"type": "range", "min": 0.0, "max": 180.0, "color": "#10b981", "unit": "°"},
    "length": {"type": "range", "min": 0.1, "max": 5.0, "color": "#60a5fa", "unit": "m"},
    "mass": {"type": "range", "min": 0.1, "max": 20.0, "color": "#fbbf24", "unit": "kg"},
    "gravity": {"type": "range", "min": 0.1, "max": 20.0, "color": "#94a3b8", "unit": "m/s²"},
    "frequency": {"type": "range", "min": 0.1, "max": 10.0, "color": "#a78bfa", "unit": "Hz"},
    "amplitude": {"type": "range", "min": 0.1, "max": 5.0, "color": "#f97316", "unit": "m"},
    "n": {"type": "range", "min": 0.5, "max": 3.0, "color": "#60a5fa", "unit": ""},
    "ph": {"type": "range", "min": 0.0, "max": 14.0, "color": "#8b5cf6", "unit": ""},
    "temperature": {"type": "range", "min": -50.0, "max": 300.0, "color": "#ef4444", "unit": "°C"},
    "pressure": {"type": "range", "min": 0.0, "max": 200.0, "color": "#64748b", "unit": "kPa"},
    "damping": {"type": "range", "min": 0.0, "max": 1.0, "color": "#94a3b8", "unit": ""},
}

# ---------------------------------------------------------------------------
# 问题代码常量
# ---------------------------------------------------------------------------

ISSUE_EMPTY = "ISSUE_EMPTY"
ISSUE_CANVAS_API = "ISSUE_CANVAS_API"
ISSUE_EVAL_USED = "ISSUE_EVAL_USED"
ISSUE_UNCLOSED_ELEMENT = "ISSUE_UNCLOSED_ELEMENT"
ISSUE_MISSING_ANIMATION = "ISSUE_MISSING_ANIMATION"
ISSUE_WRONG_QUOTE = "ISSUE_WRONG_QUOTE"
ISSUE_SYNTAX_ERROR = "ISSUE_SYNTAX_ERROR"
ISSUE_MISSING_CREATE_ELEMENT = "ISSUE_MISSING_CREATE_ELEMENT"
ISSUE_TOPOLOGY_INTENT = "ISSUE_TOPOLOGY_INTENT"
ISSUE_MISSING_INTERACTION = "ISSUE_MISSING_INTERACTION"


# ---------------------------------------------------------------------------
# 并联电路 / 教师意图（布局分析用）
# ---------------------------------------------------------------------------

PARALLEL_CIRCUIT_VISUAL_SPEC_ZH = """\
### 并联电路（parallel）教科书式布线（**必须遵守**）
- **禁止**仅把电池放在一角、用两条对角线分别连到上下两个电阻，画成「三角形 / 楔形」——那**不是**可辨认的并联拓扑。
- **上母线**：一条**水平**粗导线（结点 A），连接：电池正极出线端、R1 上端、R2 上端（三者在同一水平线上汇合）。
- **下母线**：一条**水平**粗导线（结点 B），连接：电池负极回线端、R1 下端、R2 下端。
- **左区**：电池**竖直**跨在上下母线之间（或置于左侧，使正负极分别接到上下母线）。
- **右区**：R1、R2 **竖直、并排**，上端接**同一**上母线，下端接**同一**下母线。
- **电流虚线**：每条支路**各自**沿支路方向流动；不要只用一条从电池分叉的对角线代表两支路。
- LayoutPlan 的「布局策略」必须明确写出：上下两条水平母线 + 左右分区 + 两电阻并联支路。"""

SERIES_PARALLEL_CIRCUIT_VISUAL_SPEC_ZH = """\
### 串并联综合电路（series_parallel）教科书式布线（**必须遵守**）
- 目标结构：**电源 → 串联主干段（开关/主干电阻）→ 分流节点 A → 两条并联支路（每条支路至少 2 个电阻串联）→ 汇流节点 B → 回到电源**。
- **禁止**把所有电阻画成同一条直线、或把并联支路画成对角线——必须能一眼识别「主干串联 + 双支路并联」。
- **上母线**：从节点 A 到右侧的一条**水平**粗导线（上母线），两条支路上端分别接入该母线。
- **下母线**：从节点 B 到右侧的一条**水平**粗导线（下母线），两条支路下端分别接入该母线。
- **支路 1/2**：每条支路至少包含 **2 个电阻串联**（例如 R2→R3、R4→R5），并用竖向/折线导线连接上下母线。
- **读数面板必须包含**：Req_total、I_total、I_branch1、I_branch2、支路端电压（并联两端电压相等的验证）。
- **交互必须包含**：电压 slider、至少 3 个电阻 slider、开关（闭合/断开）或等价控制。"""


def is_parallel_circuit_intent(
    visual_hint: dict[str, Any] | None,
    teacher_message: str | None = None,
    registry_key: str | None = None,
) -> bool:
    """
    是否应按「并联电路」做拓扑与绘图约束。
    依据：renderSpec.topology、教师原话、primary_concept、registry_key 等。
    """
    vh = visual_hint if isinstance(visual_hint, dict) else {}
    rs = vh.get("renderSpec") if isinstance(vh.get("renderSpec"), dict) else {}
    if str(rs.get("topology", "")).lower() == "parallel":
        return True
    blob = " ".join(
        [
            str(vh.get("primary_concept", "")),
            str(vh.get("title", "")),
            str(teacher_message or ""),
            str(registry_key or ""),
        ]
    ).lower()
    if "并联" in blob:
        return True
    if "parallel" in blob and "circuit" in blob:
        return True
    if "parallel" in (registry_key or "").lower():
        return True
    return False


def is_series_parallel_circuit_intent(
    visual_hint: dict[str, Any] | None,
    teacher_message: str | None = None,
    registry_key: str | None = None,
) -> bool:
    """是否应按「串并联综合」做拓扑与绘图约束。"""
    vh = visual_hint if isinstance(visual_hint, dict) else {}
    rs = vh.get("renderSpec") if isinstance(vh.get("renderSpec"), dict) else {}
    topo = str(rs.get("topology", "")).lower()
    if topo in ("series_parallel", "series-parallel", "mixed"):
        return True
    blob = " ".join(
        [
            str(vh.get("primary_concept", "")),
            str(vh.get("title", "")),
            str(teacher_message or ""),
            str(registry_key or ""),
        ]
    ).lower()
    if "串并联" in blob:
        return True
    if "series" in blob and "parallel" in blob and "circuit" in blob:
        return True
    if "series_parallel" in (registry_key or "").lower() or "mixed" in (registry_key or "").lower():
        return True
    return False


def is_circuit_2d_profile(renderer_profile: str | None) -> bool:
    rp = (renderer_profile or "").strip().lower()
    return "circuit" in rp and "2d" in rp


# ---------------------------------------------------------------------------
# 数据结构
# ---------------------------------------------------------------------------

@dataclass
class RenderCodeIssue:
    """检测到的问题"""
    code: str  # 问题代码
    description: str  # 问题描述
    location: str | None = None  # 问题位置


@dataclass
class LayoutPlan:
    """布局设计方案（第一步分析结果）"""
    canvas_size: str = ""          # 画布尺寸，如 "620 x 240"
    layout_strategy: str = ""       # 布局策略，如 "gx/gy 网格，回路占满画布"
    components: list[str] = field(default_factory=list)   # 需要的 SVG 组件列表
    layers: list[str] = field(default_factory=list)      # 层次/叠层描述
    physics_calculations: list[str] = field(default_factory=list)  # 需要的物理计算
    interaction_elements: list[str] = field(default_factory=list)  # 交互元素（开关、滑块等）
    accessibility_notes: str = ""   # 无障碍/标签注意事项

    def to_markdown(self) -> str:
        """格式化为反省 prompt 中可读的文本"""
        parts = []
        if self.canvas_size:
            parts.append(f"- **画布**: {self.canvas_size}")
        if self.layout_strategy:
            parts.append(f"- **布局策略**: {self.layout_strategy}")
        if self.components:
            parts.append(f"- **SVG 组件**: {', '.join(self.components)}")
        if self.layers:
            parts.append(f"- **层次/叠层**: {' → '.join(self.layers)}")
        if self.physics_calculations:
            parts.append(f"- **物理计算**: {', '.join(self.physics_calculations)}")
        if self.interaction_elements:
            parts.append(f"- **交互元素**: {', '.join(self.interaction_elements)}")
        if self.accessibility_notes:
            parts.append(f"- **注意事项**: {self.accessibility_notes}")
        return "\n".join(parts) if parts else "（无详细布局方案）"

    @classmethod
    def from_llm_response(cls, response: str) -> "LayoutPlan":
        """从 LLM 布局分析响应中解析出 LayoutPlan"""
        plan = cls()
        lines = response.strip().split("\n")
        current_section = None
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            lower = line.lower()
            if "canvas" in lower or "画布" in lower or "尺寸" in lower:
                current_section = "canvas_size"
                plan.canvas_size = line.split(":", 1)[-1].strip() if ":" in line else line
            elif "layout" in lower or "布局策略" in lower or "策略" in lower:
                current_section = "layout_strategy"
                plan.layout_strategy = line.split(":", 1)[-1].strip() if ":" in line else line
            elif "component" in lower or "svg 组件" in lower or "元件" in lower:
                current_section = "components"
                val = line.split(":", 1)[-1].strip() if ":" in line else line
                if val:
                    plan.components.extend([v.strip() for v in val.replace(",", "、").split() if v.strip()])
            elif "layer" in lower or "层次" in lower or "叠层" in lower:
                current_section = "layers"
                val = line.split(":", 1)[-1].strip() if ":" in line else line
                if val:
                    plan.layers.extend([v.strip() for v in val.replace("→", ",").replace("->", ",").split(",") if v.strip()])
            elif "physics" in lower or "物理" in lower or "计算" in lower:
                current_section = "physics_calculations"
                val = line.split(":", 1)[-1].strip() if ":" in line else line
                if val:
                    plan.physics_calculations.append(val)
            elif "interaction" in lower or "交互" in lower or "控件" in lower:
                current_section = "interaction_elements"
                val = line.split(":", 1)[-1].strip() if ":" in line else line
                if val:
                    plan.interaction_elements.extend([v.strip() for v in val.replace(",", "、").split() if v.strip()])
            elif "note" in lower or "注意" in lower or "accessibility" in lower:
                current_section = "accessibility_notes"
                plan.accessibility_notes = line.split(":", 1)[-1].strip() if ":" in line else line
            elif current_section and line and not line.startswith("-"):
                # 续写当前 section
                val = line.lstrip("-:：*").strip()
                if val:
                    if current_section == "canvas_size":
                        plan.canvas_size += " " + val
                    elif current_section == "layout_strategy":
                        plan.layout_strategy += " " + val
                    elif current_section == "accessibility_notes":
                        plan.accessibility_notes += " " + val
        return plan


@dataclass
class LabDefinitionOutput:
    """
    第一步输出：实验定义字段（用于保存到 lab_definitions 表）

    不包含 render_code（第二步单独生成）
    """
    title: str = ""
    description: str = ""
    subject_lab: str = ""          # math/physics/chemistry/biology/dynamic
    renderer_profile: str = ""     # circuit_2d/function_2d/generic_2d 等
    dimension: str = "2d"           # 2d/3d
    initial_state: dict = field(default_factory=dict)
    reducer_spec: dict | None = None
    lab_metadata: dict | None = None
    visual_hint: dict = field(default_factory=dict)  # 包含 renderSpec
    layout_plan: str = ""           # 布局方案描述

    def to_markdown(self) -> str:
        """格式化为可读文本"""
        parts = []
        parts.append(f"- **标题**: {self.title}")
        parts.append(f"- **描述**: {self.description}")
        parts.append(f"- **学科**: {self.subject_lab}")
        parts.append(f"- **渲染配置**: {self.renderer_profile}")
        parts.append(f"- **维度**: {self.dimension}")
        if self.initial_state:
            parts.append(f"- **初始状态**: {list(self.initial_state.keys())}")
        if self.visual_hint:
            vh_str = str(self.visual_hint)[:300]
            parts.append(f"- **视觉提示**: {vh_str}...")
        if self.layout_plan:
            parts.append(f"- **布局方案**: {self.layout_plan[:200]}...")
        return "\n".join(parts)

    @classmethod
    def from_llm_response(cls, response: str) -> "LabDefinitionOutput":
        """从 LLM 响应中解析实验定义字段"""
        plan = cls()

        # 尝试解析 JSON 代码块
        json_match = re.search(r"```(?:json)?\s*\n?({.*?})\n?```", response, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group(1))
                plan.title = str(data.get("title", ""))
                plan.description = str(data.get("description", ""))
                plan.subject_lab = str(data.get("subject_lab", ""))
                plan.renderer_profile = str(data.get("renderer_profile", ""))
                plan.dimension = str(data.get("dimension", "2d"))
                plan.initial_state = data.get("initial_state", {})
                plan.reducer_spec = data.get("reducer_spec")
                plan.lab_metadata = data.get("lab_metadata")
                plan.visual_hint = data.get("visual_hint", {})
                plan.layout_plan = data.get("layout_plan", "")
                return plan
            except Exception:
                pass

        # 从 Markdown 格式解析（简化版本）
        lines = response.strip().split("\n")
        for line in lines:
            lower = line.lower().strip()
            if "title" in lower and ":" in line:
                plan.title = line.split(":", 1)[-1].strip().strip('"').strip("'")
            elif "description" in lower and ":" in line:
                plan.description = line.split(":", 1)[-1].strip().strip('"').strip("'")
            elif "subject" in lower and "lab" in lower and ":" in line:
                plan.subject_lab = line.split(":", 1)[-1].strip().lower()
            elif "renderer" in lower and ":" in line:
                plan.renderer_profile = line.split(":", 1)[-1].strip().lower()
            elif "dimension" in lower and ":" in line:
                plan.dimension = line.split(":", 1)[-1].strip().lower()

        return plan

    def to_db_dict(self) -> dict[str, Any]:
        """转换为可写入数据库的字典（用于 LabDefinitionCreate）"""
        return {
            "title": self.title,
            "description": self.description or None,
            "subject_lab": self.subject_lab,
            "renderer_profile": self.renderer_profile,
            "dimension": self.dimension,
            "initial_state": self.initial_state,
            "reducer_spec": self.reducer_spec,
            "lab_metadata": self.lab_metadata,
            "visual_hint": self.visual_hint,
            "lab_type": "ai_generated",
            "status": "draft",
        }


@dataclass
class ReflectionReport:
    """反省报告文档"""
    definition_id: str
    generated_at: datetime
    attempt_count: int = 0
    issues_detected: list[RenderCodeIssue] = field(default_factory=list)
    corrections_applied: list[str] = field(default_factory=list)
    final_render_code: str | None = None
    used_fallback: bool = False
    summary: str = ""
    layout_plan: str = ""  # 第二步的布局方案描述
    lab_definition_output: LabDefinitionOutput | None = None  # 第一步的实验定义

    def to_dict(self) -> dict[str, Any]:
        """转换为字典格式，用于日志输出"""
        return {
            "definition_id": self.definition_id,
            "generated_at": self.generated_at.isoformat(),
            "attempt_count": self.attempt_count,
            "issues_detected": [
                {"code": i.code, "description": i.description, "location": i.location}
                for i in self.issues_detected
            ],
            "corrections_applied": self.corrections_applied,
            "final_render_code": (
                self.final_render_code[:100] + "..."
                if self.final_render_code and len(self.final_render_code) > 100
                else self.final_render_code
            ),
            "used_fallback": self.used_fallback,
            "summary": self.summary,
            "layout_plan": self.layout_plan,
            "lab_definition_title": self.lab_definition_output.title if self.lab_definition_output else None,
        }


# ---------------------------------------------------------------------------
# RenderCodeAgent
# ---------------------------------------------------------------------------

class RenderCodeAgent:
    """
    render_code 验证与自我反省 Agent

    职责：
    1. 验证 render_code 是否符合规范
    2. 检测常见问题（Canvas API、eval、未闭合标签等）
    3. 自我反省循环修正问题
    4. 生成反省报告文档
    """

    def __init__(self, max_retries: int = 3):
        self._max_retries = max_retries
        self._rules = lp_rules
        self._examples = lp_examples

    def detect_experiment_type(
        self,
        primary_concept: str,
        renderer_profile: str | None = None,
    ) -> str | None:
        """
        根据 primary_concept 和 renderer_profile 识别实验类型

        Returns:
            实验类型字符串 (circuit/optics/mechanics/chemistry/biology/wave/field)
            或 None 如果无法识别
        """
        text = (primary_concept + " " + (renderer_profile or "")).lower()

        for exp_type, keywords in EXPERIMENT_KEYWORDS.items():
            if any(kw.lower() in text for kw in keywords):
                return exp_type
        return None

    def detect_issues(
        self,
        render_code: str | None,
        initial_state: dict[str, Any] | None = None,
        visual_hint: dict[str, Any] | None = None,
    ) -> list[RenderCodeIssue]:
        """
        检测 render_code 中的问题

        Returns:
            问题列表
        """
        issues: list[RenderCodeIssue] = []
        rc = render_code

        # 检查是否为空
        if not isinstance(rc, str) or not rc.strip():
            issues.append(RenderCodeIssue(
                code=ISSUE_EMPTY,
                description="render_code 为空或 None",
            ))
            return issues

        # 检查禁止的 API
        for api in FORBIDDEN_APIS:
            if api in rc:
                issues.append(RenderCodeIssue(
                    code=ISSUE_CANVAS_API if "getContext" in api else ISSUE_EVAL_USED,
                    description=f"使用了禁止的 API: {api}",
                ))

        # 未加引号的 SVG 属性键（如 marker-end:）在 JS 中会解析为减法，前端报 Unexpected token '-'
        if re.search(r"(?<![\"'])marker-end\s*:", rc):
            issues.append(RenderCodeIssue(
                code=ISSUE_SYNTAX_ERROR,
                description="对象字面量中 SVG 属性须加引号，例如 'marker-end': 'url(#id)'，禁止写 marker-end:",
            ))

        # 检查 createElement 是否正确闭合
        open_count = rc.count("createElement(")
        close_count = rc.count(")")
        if open_count > 0 and close_count < open_count:
            issues.append(RenderCodeIssue(
                code=ISSUE_UNCLOSED_ELEMENT,
                description=f"createElement 可能未正确闭合 (open: {open_count}, close: {close_count})",
            ))

        # 检查是否为 React 式 createElement('div'|'svg'|…)
        #
        # 兼容常见别名写法：
        # - const { createElement: h } = props;  h('svg', ...)
        # - const h = createElement;            h('svg', ...)
        elem_fn: str | None = None
        if re.search(r"(?<!\.)\bcreateElement\s*\(\s*['\"]", rc):
            elem_fn = "createElement"
        else:
            m1 = re.search(r"\bcreateElement\s*:\s*([A-Za-z_]\w*)\b", rc)
            m2 = re.search(r"\bconst\s+([A-Za-z_]\w*)\s*=\s*createElement\b", rc)
            alias = (m1.group(1) if m1 else None) or (m2.group(1) if m2 else None)
            if alias and re.search(rf"(?<!\.)\b{re.escape(alias)}\s*\(\s*['\"]", rc):
                elem_fn = alias

        if not elem_fn:
            issues.append(RenderCodeIssue(
                code=ISSUE_MISSING_CREATE_ELEMENT,
                description="未找到 React 式 createElement('tag', …) 调用（禁止仅用 document.createElementNS）",
            ))

        # 检查是否使用 t 驱动动画（强制：每个实验至少 1 个可见动态效果）
        vh = visual_hint if isinstance(visual_hint, dict) else {}
        state = initial_state if isinstance(initial_state, dict) else {}

        # Heuristic: require at least one usage of `t` in an expression that affects visuals.
        # It's not enough to only destructure `{ ..., t }`.
        #
        # Compatibility notes:
        # - Allow both camelCase and kebab-case svg style keys (e.g. strokeDashoffset vs 'stroke-dashoffset')
        # - Allow indirect usage: `const anim = t; ... strokeDashoffset: -((anim*28)%28)`
        has_any_t = re.search(r"\bt\b", rc) is not None or "props.t" in rc

        # Extract simple aliases derived from t (best-effort).
        # Examples:
        # - var anim = t;
        # - const anim = (typeof t === 'number') ? t : 0;
        # - let pulse = 0.55 + 0.35*Math.sin(t*2);
        t_aliases: set[str] = set()
        for m in re.finditer(
            r"\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*[^;\n]*\bt\b[^;\n]*[;\n]",
            rc,
        ):
            t_aliases.add(m.group(1))
        t_symbol = r"(?:t|props\.t"
        if t_aliases:
            t_symbol += r"|" + r"|".join(re.escape(a) for a in sorted(t_aliases))
        t_symbol += r")"

        has_visual_time_usage = any(
            re.search(pat, rc)
            for pat in [
                # style object keys (camelCase)
                rf"strokeDashoffset\s*:\s*[^,\n]*\b{t_symbol}\b",
                rf"opacity\s*:\s*[^,\n]*\b{t_symbol}\b",
                rf"transform\s*:\s*[^,\n]*\b{t_symbol}\b",
                # style object keys (kebab-case in quotes)
                rf"['\"]stroke-dashoffset['\"]\s*:\s*[^,\n]*\b{t_symbol}\b",
                rf"['\"]opacity['\"]\s*:\s*[^,\n]*\b{t_symbol}\b",
                rf"['\"]transform['\"]\s*:\s*[^,\n]*\b{t_symbol}\b",
                # math usage
                rf"Math\.(?:sin|cos)\s*\(\s*[^)]*\b{t_symbol}\b",
                rf"\b{t_symbol}\b\s*[*\/+\-]\s*\d",
                rf"\d\s*[*\/+\-]\s*\b{t_symbol}\b",
            ]
        )

        # Special-case: if state exposes `showCurrent`, we *prefer* current-flow dash animation.
        # But do not hard-fail if there's another visible t-driven animation (avoid false negatives).
        has_show_current_key = any(
            k.lower() in ("showcurrent", "show_current", "showcurrentflow") for k in state.keys()
        )
        if has_show_current_key and ("strokeDashoffset" not in rc and "stroke-dashoffset" not in rc):
            # Keep has_visual_time_usage as-is; it may already be satisfied via opacity/transform/etc.
            pass

        if not has_any_t or not has_visual_time_usage:
            issues.append(RenderCodeIssue(
                code=ISSUE_MISSING_ANIMATION,
                description="render_code 必须包含至少 1 处由 t 驱动的可见动态效果（如 strokeDashoffset/opacity/transform），不能只解构 t 却不使用",
            ))

        # 检查交互（强制：每个实验至少 1 个可用控件，并通过 onStateChange 写回 state）
        # Heuristic: require both (a) an interactive HTML control and (b) a call to onStateChange({...}).
        # Accept minimal patterns: input(range/checkbox) or button with onClick, plus onStateChange patch.
        fn_pat = re.escape(elem_fn) if elem_fn else r"createElement"
        # Accept string literals OR tag aliases like: const INPUT = 'input'; createElement(INPUT, ...)
        tag_aliases: dict[str, str] = {}
        for m in re.finditer(
            r"\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*['\"](input|button)['\"]\s*[;\n]",
            rc,
            flags=re.IGNORECASE,
        ):
            tag_aliases[m.group(1)] = m.group(2).lower()
        input_vars = [re.escape(v) for v, tname in tag_aliases.items() if tname == "input"]
        button_vars = [re.escape(v) for v, tname in tag_aliases.items() if tname == "button"]
        input_arg = r"(?:['\"]input['\"]" + (r"|" + r"|".join(input_vars) if input_vars else "") + r")"
        button_arg = r"(?:['\"]button['\"]" + (r"|" + r"|".join(button_vars) if button_vars else "") + r")"

        # Match call form: fn('input', ...) / fn(INPUT, ...) and avoid \b after quotes.
        has_control_element = (
            re.search(rf"{fn_pat}\s*\(\s*{input_arg}\s*,", rc) is not None
            or re.search(rf"{fn_pat}\s*\(\s*{button_arg}\s*,", rc) is not None
        )
        has_input_type = re.search(r"\btype\s*:\s*['\"](?:range|checkbox)['\"]", rc) is not None
        has_event_handler = re.search(r"\bon(Change|Input|Click)\s*:", rc) is not None
        has_on_state_change_ref = "onStateChange" in rc
        has_on_state_change_call = re.search(r"\bonStateChange\s*\(\s*\{", rc) is not None

        # If render_code has no controls or never calls onStateChange, it's not interactive.
        if not (
            has_on_state_change_ref
            and has_control_element
            and (has_input_type or "onClick" in rc)
            and has_event_handler
            and has_on_state_change_call
        ):
            issues.append(
                RenderCodeIssue(
                    code=ISSUE_MISSING_INTERACTION,
                    description="render_code 必须包含至少 1 个交互控件（input range/checkbox 或 button）并通过 onStateChange({key: value}) 写回 state；不能只画静态 SVG",
                )
            )

        return issues

    def is_valid(
        self,
        render_code: str | None,
        initial_state: dict[str, Any] | None = None,
        visual_hint: dict[str, Any] | None = None,
    ) -> bool:
        """
        验证 render_code 是否符合规范

        Returns:
            True 如果有效，否则 False
        """
        if not isinstance(render_code, str) or not render_code.strip():
            return False

        # 检查是否有禁止的 API
        for api in FORBIDDEN_APIS:
            if api in render_code:
                return False

        # 须为 React 式 createElement('tag'…)，勿仅用 document.createElementNS（已被 FORBIDDEN 拦截）
        if not re.search(r"(?<!\.)\bcreateElement\s*\(\s*['\"]", render_code):
            return False

        return True

    def extract_render_code_from_response(self, response: str) -> str | None:
        """
        从 LLM 响应中提取 render_code

        策略：
        1. 查找 ```tsx 或 ```typescript 代码块
        2. 查找 ``` 代码块
        3. 查找 `export default function...` 开始的内容
        """
        if not response:
            return None

        # 查找 TSX/TS 代码块
        tsx_match = re.search(
            r"```(?:tsx|typescript|ts)\s*\n?(.*?)```",
            response,
            re.DOTALL,
        )
        if tsx_match:
            return tsx_match.group(1).strip()

        # 查找普通代码块
        code_match = re.search(
            r"```\s*\n?(.*?)```",
            response,
            re.DOTALL,
        )
        if code_match:
            content = code_match.group(1).strip()
            if "createElement" in content or "export default function" in content:
                return content

        # 查找 export default function 开始的内容
        func_match = re.search(
            r"(export default function \w+[^{]*\{.*)",
            response,
            re.DOTALL,
        )
        if func_match:
            return func_match.group(1).strip()

        # 查找 render_code 字段
        rc_match = re.search(
            r'"render_code"\s*:\s*[`"]([^`"]+)["`]',
            response,
            re.DOTALL,
        )
        if rc_match:
            return rc_match.group(1).strip()

        return None

    def _global_render_code_hard_constraints(self) -> str:
        """
        Global hard constraints for ALL experiments' render_code generation.

        目的：把“只允许 SVG createElement”前置成强约束模板，
        降低模型在第一轮/中间轮输出 Canvas/DOM 的概率。
        """
        forbidden_list = "\n".join(f"- `{api}`" for api in FORBIDDEN_APIS)
        # Extra common pitfalls not always covered by FORBIDDEN_APIS exact substrings
        extra = "\n".join(
            [
                "- `document.` / `window.` / `globalThis.` / `HTMLElement` / `SVGElement`",
                "- `createElementNS` / `appendChild` / `insertBefore` / `innerText`",
                "- `canvas` / `WebGL` / `three.js` / `pixi` / `d3.select(...)`",
            ]
        )
        return f"""\
## 全局硬性约束（适用于所有实验，违反即判失败）
你输出的 `render_code` 将被自动验证；只要包含以下任一模式，就会被判定为无效并要求你重写：

### 绝对禁止（Canvas / DOM / 动态执行 / 网络）
{forbidden_list}
{extra}

### 唯一合法渲染方式（必须）
- 只能用 `createElement('svg'|'g'|'path'|'line'|'text'|...)` 构造 **SVG 虚拟节点树**
- **禁止**返回真实 DOM 节点（例如 `document.createElement(...)` 的结果）
- **禁止**任何命令式 DOM 拼接（例如 `svg.appendChild(...)`）

### 最小合规门槛（必须同时满足）
- 必须包含至少 1 个交互控件（slider/checkbox/button），并通过 `onStateChange({{...}})` 写回 `state`
- 必须包含至少 1 处由 `t` 驱动的**可见**动画（如 dashoffset/opacity/transform）
"""

    def build_reflection_prompt(
        self,
        current_code: str | None,
        issues: list[RenderCodeIssue],
        initial_state: dict[str, Any],
        visual_hint: dict[str, Any],
        subject: str,
        renderer_profile: str,
        previous_attempt: int = 0,
        teacher_message: str | None = None,
        registry_key: str | None = None,
    ) -> str:
        """
        构建反省提示词，包含完整的 render_code 规范
        """
        vh = visual_hint if isinstance(visual_hint, dict) else {}
        primary_concept = str(vh.get("primary_concept", "")).lower()
        exp_type = self.detect_experiment_type(
            vh.get("primary_concept", ""),
            renderer_profile,
        )

        # 构建问题描述
        issues_text = "\n".join(
            f"{i+1}. {issue.code}: {issue.description}"
            for i, issue in enumerate(issues)
        ) if issues else "无"

        # 获取相关示例
        example_blocks = self._get_relevant_examples(exp_type)

        # 实验类型对应的渲染指导（含教师原话 / 并联拓扑补充）
        rendering_guidance = self._get_rendering_guidance(
            exp_type,
            initial_state,
            visual_hint,
            teacher_message=teacher_message,
            registry_key=registry_key,
        )

        teacher_block = ""
        if teacher_message and str(teacher_message).strip():
            teacher_block = f"""
## 教师本次请求（原话，须与绘图拓扑一致）
> {str(teacher_message).strip()[:800]}

"""

        missing_animation = any(i.code == ISSUE_MISSING_ANIMATION for i in issues)
        missing_interaction = any(i.code == ISSUE_MISSING_INTERACTION for i in issues)
        animation_must_block = ""
        if missing_animation:
            animation_must_block = """\
## 本次修正的硬性门槛：必须补齐“动态效果”
- 你输出的 `render_code` **必须**包含至少 1 处由 `t`（或 `props.t`）驱动的**可见**动态变化，并且该变化必须真正作用在 SVG 可视属性上。
- **可接受的最小形式**（任选其一，放到实际 SVG 元素 style/attrs 上）：
  - `strokeDasharray` + `strokeDashoffset: -((t*28)%28)`（电流流动虚线最推荐）
  - `opacity: 0.55 + 0.35*Math.sin(t*2)`
  - `transform: 'translate(' + (Math.sin(t)*4) + ',0)'` 或 `rotate(...)`
- **不可接受**：
  - 只写 `const { t } = props` 但没有任何属性使用 `t`
  - 把 `t` 只用于日志/无关变量，不影响任何可见元素
  - 动画写在注释里或不在返回树中
"""

        interaction_must_block = ""
        if missing_interaction:
            interaction_must_block = """\
## 本次修正的硬性门槛：必须补齐“交互控件”
- 你输出的 `render_code` **必须**包含至少 1 个可用交互控件，并且必须真实修改 `state`：
  - `createElement('input', { type: 'range' | 'checkbox', ... onChange/onInput: (e)=>onStateChange({ key: value }) })`
  - 或 `createElement('button', { onClick: ()=>onStateChange({ key: newValue }) }, '...')`
- **不可接受**：
  - 只声明了 `initial_state`，但代码里没有 `input`/`button` 控件
  - 有控件但不调用 `onStateChange({ ... })`（交互不会生效）
  - 把交互写在注释/死代码里，或 `readonly` 下永远渲染 null
"""

        prompt = f"""\
## 问题诊断
检测到以下 render_code 问题：

{issues_text}
{teacher_block}
## 当前实验信息
- subject: {subject}
- renderer_profile: {renderer_profile}
- 实验类型: {exp_type or 'unknown'}
- initial_state 键: {list((initial_state or {{}}).keys())}
- visual_hint.type: {vh.get('type', 'unknown')}
- primary_concept: {vh.get('primary_concept', '')}
- renderSpec.topology: {(vh.get('renderSpec') or {}).get('topology', 'unknown')}

{self._global_render_code_hard_constraints()}

## render_code 完整规范
{lp_rules.RENDER_CODE_RULES}

## 实验类型渲染指导
{rendering_guidance}

{animation_must_block}
{interaction_must_block}
## 可用示例 (来自 lab_prompts/examples.py)
{example_blocks}

## 修正要求
请基于以上示例和规则，重新生成完整的 render_code：

1. **必须使用 createElement**：所有组件均通过 `createElement('svg', {{...}}, ...)` 构建
2. **禁止使用 Canvas API**：禁止 `getContext`、`useRef<HTMLCanvasElement>`
3. **禁止使用 eval/Function**：禁止动态代码执行
4. **SVG 动画**：使用 `props.t` 参数驱动动画（如 `dashoffset: -(t * 28) % 28`）
5. **颜色主题**：使用暗色主题 (#0b1120, #3b82f6, #fbbf24 等)
6. **函数签名**：
```typescript
export default function LabRenderer(props: LabRendererProps) {{
  const {{state, onStateChange, readonly, t}} = props;
  // ...
}}
```

## 输出前自检（必须逐条满足，否则视为失败）
1. 代码中必须出现至少 1 处“属性值包含 t”的模式（示例）：`strokeDashoffset: -((t*28)%28)` / `opacity: ...Math.sin(...t...)` / `transform: ...t...`
2. 该属性必须作用在实际返回的 SVG/DOM 元素上（不是死代码、不是注释）。
3. 禁止只解构 `t` 却不使用。
4. 代码中必须出现至少 1 个交互控件（`createElement('input', ...)` 或 `createElement('button', ...)`），并且事件处理必须调用 `onStateChange({ ... })`。

## 输出格式要求（必须严格遵守）
**`render_code` 必须是完整的函数定义，不是代码片段：**

```typescript
// ✅ 正确格式
"render_code": `export default function LabRenderer(props) {{
  const {{state, onStateChange, readonly, t}} = props;
  function rv(k, d) {{ var v = state[k]; if (typeof v === 'number' && isFinite(v)) return v; return d; }}
  // ... 变量定义和 SVG 元素 ...
  return createElement('div', {{ style: {{ background: '#0b1120', borderRadius: '10px' }} }}, svg, controls);
}}`

// ❌ 错误格式 - 缺少 export default function 包装
"render_code": `var svg = createElement('svg', {{...}});
return createElement('div', {{...}});`
```

请直接输出完整的 render_code TSX 代码，不需要额外解释。
"""

        if previous_attempt > 0:
            prompt += f"\n\n**注意**：这是第 {previous_attempt} 次修正尝试，请确保之前的错误已全部修复。之前的代码缺少 `export default function` 包装。"

        return prompt

    def _get_relevant_examples(self, exp_type: str | None) -> str:
        """获取与实验类型相关的示例"""
        examples_map = {
            "circuit": [
                ("physics — Ohm's Law Series", lp_examples.EXAMPLE_OHM_SERIES),
            ],
            "optics": [
                ("physics — Snell's Law", lp_examples.EXAMPLE_SNELL),
            ],
            "mechanics": [
                ("physics — Simple Pendulum", lp_examples.EXAMPLE_PENDULUM),
            ],
            "chemistry": [
                ("chemistry — Acid-Base Titration", lp_examples.EXAMPLE_TITRATION),
            ],
            "biology": [
                ("biology — Animal Cell", lp_examples.EXAMPLE_CELL),
            ],
        }

        if exp_type and exp_type in examples_map:
            result = []
            for name, example in examples_map[exp_type]:
                # 只提取 render_code 部分
                rc_match = re.search(r'"render_code":\s*`(.*?)`}?$', example, re.DOTALL)
                if rc_match:
                    result.append(f"### {name}\n```tsx\n{rc_match.group(1)}\n```\n")
            return "\n".join(result) if result else "无相关示例"

        # 返回所有示例的前 500 字符作为参考
        return "\n".join(
            f"### {name}\n```\n内容已省略，请参考 lab_prompts/examples.py\n```"
            for name, _ in lp_examples.ALL_EXAMPLES[:2]
        )

    def _get_rendering_guidance(
        self,
        exp_type: str | None,
        initial_state: dict[str, Any],
        visual_hint: dict[str, Any],
        teacher_message: str | None = None,
        registry_key: str | None = None,
    ) -> str:
        """根据实验类型生成渲染指导"""
        state_keys = list((initial_state or {}).keys())

        circuit_base = f"""\
电路实验（circuit_2d）高质量渲染要点 — 应对标 examples.py 中 Ohm 串联示例，禁止简笔画：
- SVG 先铺全画布 `rect` 背景 `#0b1120`；用 `gx`/`gy` 或网格把回路放在画布视觉中心。
- 电池：`g`+`translate`，外框 rect + 多段 line 表示正负极；可选标注电压。
- 电阻：**禁止**单独用黄色实心 rect 表示电阻；须 `g` 内 dark rect 边框 + **polyline 锯齿折线**（欧姆符号）。
- 导线：粗实线 `#334155`；若 `showCurrent`/`rb('showCurrent')` 为真，叠一层细虚线，`strokeDasharray` + `strokeDashoffset: -(anim*28)%28`，`anim` 来自 `props.t`。
- 用 `rv`/`rb` 读 state；在代码里计算 I、分压、等效 R，用右侧 `g`+多行 `text` 做公式/数值面板。
- 控件每个 slider 的 label 第一个 span 必须有文字（U、R1、R2），禁止 `createElement('span',{{}},null)`；禁止 `createElement('text',{{}},null)`。
- 开关可点击时用 `onClick` + `onStateChange`；键名与 initial_state 一致。
- 参考键: {[k for k in state_keys if 'voltage' in k.lower() or 'current' in k.lower() or 'resistance' in k.lower() or k.lower() in ('r1','r2','switch_closed','showcurrent','show_values')]}"""

        parallel_extra = ""
        if is_parallel_circuit_intent(visual_hint, teacher_message, registry_key):
            parallel_extra = "\n\n" + PARALLEL_CIRCUIT_VISUAL_SPEC_ZH

        incline_force_extra = ""
        if exp_type == "mechanics" and is_incline_force_diagram_intent(
            visual_hint=visual_hint,
            teacher_message=teacher_message,
            registry_key=registry_key,
        ):
            incline_force_extra = f"""\

### 斜面受力分析 / 受力图（通用约束，**必须遵守**）
- **画面结构**：左侧绘制斜面与物块；右侧固定一个“计算结果面板”（半透明卡片），避免文字挡住图形。
- **坐标与比例**：斜面长度占画布宽度约 65%～75%，物块位于斜面中段；力箭头长度按相对大小缩放，但要设上限/下限，确保在不同参数下仍可读。
- **箭头方向（必须物理一致）**：
  - 重力 \\(mg\\)：从物块质心竖直向下
  - 支持力 \\(N\\)：垂直斜面向外
  - 摩擦力 \\(f\\)：沿斜面方向，方向取“阻碍相对运动/阻碍下滑趋势”（若判断困难，允许用“抵抗下滑”作为默认方向）
  - 分力：可选用虚线表示 \\(mg\\sin\\theta\\)（沿斜面向下）与 \\(mg\\cos\\theta\\)（垂直斜面向内）
- **标注规范**：每个力箭头旁必须有标签（mg、N、f、mg∥、mg⊥），标签与箭头同色；禁止只画箭头不标字。
- **参数面板（必须）**：显示 \\(\u03b8, m, \u03bc, g\\) 与计算值（mg、N、fmax、f、a 或“是否下滑/临界”判定），数值统一保留 2 位小数。
- **交互一致性**：`initial_state` 若包含 `showForces`/`showLabels`，必须真实控制对应元素显隐；\\(\u03bc\\) 改变时摩擦力与判定必须随之变化。
- **SVG 细节**：箭头必须用 `marker` 实现，线宽 2.5～3.5；斜面与物块用高对比描边，避免“灰到看不见”。
"""

        guidance_map = {
            "circuit": circuit_base + parallel_extra,

            "optics": f"""\
光学实验渲染要点：
- 主光轴用水平线表示
- 透镜/界面用垂直线 + 半透明矩形
- 入射光、折射光、反射光用不同颜色的线条
- 角度弧线用 path 的 A 命令绘制
- 法线用虚线表示
- 参考键: {[k for k in state_keys if 'angle' in k.lower() or 'n' in k.lower() or 'theta' in k.lower()]}""",

            "mechanics": f"""\
力学实验渲染要点：
- 支点用圆形 + 矩形表示
- 摆线用 line 元素
- 摆球用圆形 + 渐变填充
- 轨迹用 path 元素的 arc 命令
- 角度用 path 的 A 命令绘制弧线
- 使用 props.t 计算动画位置
- 参考键: {[k for k in state_keys if 'angle' in k.lower() or 'length' in k.lower() or 'gravity' in k.lower()]}""",

            "chemistry": f"""\
化学实验渲染要点：
- 坐标轴用 line 元素
- 曲线用 polyline 或 path 元素
- 滴定曲线根据 computePH(vBase) 计算点
- 等当点用垂直虚线 + 圆点标记
- 导数曲线用不同颜色叠加
- 参考键: {[k for k in state_keys if 'conc' in k.lower() or 'volume' in k.lower() or 'ph' in k.lower()]}""",

            "biology": f"""\
生物实验渲染要点：
- 细胞外轮廓用 ellipse
- 细胞核用 circle + 渐变填充
- 细胞器用不同形状（ellipse, path）
- 标注文字用 text 元素
- 高亮效果用 filter 的 feGaussianBlur
- 参考键: {[k for k in state_keys if 'show' in k.lower()]}""",
        }

        if exp_type and exp_type in guidance_map:
            if exp_type == "mechanics" and incline_force_extra:
                return guidance_map[exp_type] + incline_force_extra
            return guidance_map[exp_type]

        return f"""\
通用实验渲染要点：
- 背景用 #0b1120
- SVG 外层容器
- 数值显示用 text 元素
- 控件用 createElement('input', {{type: 'range'}}) 和 createElement('input', {{type: 'checkbox'}})
- 参考键: {state_keys[:5]}"""

    def build_layout_analysis_prompt(
        self,
        initial_state: dict[str, Any],
        visual_hint: dict[str, Any],
        subject: str,
        renderer_profile: str,
        current_render_code: str | None = None,
        teacher_message: str | None = None,
        registry_key: str | None = None,
    ) -> str:
        """
        构建第一步的布局分析 prompt — 不生成代码，只分析如何设计布局、组件和层次。

        返回的 prompt 引导 LLM 先给出 LayoutPlan，再基于 LayoutPlan 生成代码。
        """
        vh = visual_hint if isinstance(visual_hint, dict) else {}
        state_keys = list((initial_state or {}).keys())
        exp_type = self.detect_experiment_type(
            vh.get("primary_concept", ""),
            renderer_profile,
        )
        rendering_guidance = self._get_rendering_guidance(
            exp_type,
            initial_state,
            visual_hint,
            teacher_message=teacher_message,
            registry_key=registry_key,
        )

        teacher_block = ""
        if teacher_message and str(teacher_message).strip():
            teacher_block = f"""
## 教师本次请求（原话）
> {str(teacher_message).strip()[:800]}

**要求**：LayoutPlan 的「布局策略」必须与上述原话中的实验类型（如串联/并联/折射等）一致，不可忽略。

"""

        parallel_remind = ""
        if is_parallel_circuit_intent(vh, teacher_message, registry_key):
            parallel_remind = f"""
## 拓扑约束（本次为并联）
{PARALLEL_CIRCUIT_VISUAL_SPEC_ZH}

LayoutPlan 中必须逐条回应：上母线结点 A、下母线结点 B、两电阻如何并排接到两母线。

"""
        mixed_remind = ""
        if is_series_parallel_circuit_intent(vh, teacher_message, registry_key):
            mixed_remind = f"""
## 拓扑约束（本次为串并联综合）
{SERIES_PARALLEL_CIRCUIT_VISUAL_SPEC_ZH}

LayoutPlan 中必须逐条回应：主干串联段、分流节点 A、两条支路的串联电阻序列、汇流节点 B，以及需要验证的物理量。

"""

        # 若有当前 render_code，提取其中 SVG 结构供参考
        current_snippet = ""
        if current_render_code:
            snippet = current_render_code[:600].replace("`", "'")
            current_snippet = f"\n\n## 当前 render_code 片段（供参考）\n```tsx\n{snippet}\n```"

        prompt = f"""\
你是一个专业的中文理科实验 SVG 可视化设计师。请先**分析布局**，再**生成代码**。
{teacher_block}{parallel_remind}{mixed_remind}
## 第一步：分析布局（必须先完成）

请根据以下信息，输出一个**布局设计方案**（LayoutPlan），格式如下：

```
# LayoutPlan

- **画布**: [建议尺寸，如 "620 x 240"]
- **布局策略**: [如何放置元件，如 "gx/gy 网格，回路占满画布中部"]
- **SVG 组件**: [需要的组件列表，如 "全画布背景 rect, 电池 g, 电阻 g, 导线 line, 流动虚线 line"]
- **层次/叠层**: [从底到顶的叠放顺序，如 "背景 → 静态导线 → 元件(g) → 电流虚线 → 面板 g"]
- **物理计算**: [需要在 JS 中计算的物理量，如 "I=V/(R1+R2), V1=I*R1, V2=I*R2"]
- **交互元素**: [需要交互的控件，如 "电压 slider, R1 slider, R2 slider, 开关 button/circle"]
- **动态效果**: [**至少 1 处**由 `t` 驱动的可见动态，如电流虚线流动(strokeDashoffset)、摆动/闪烁(opacity/transform)]
- **注意事项**: [标签、颜色、可访问性等注意点]
```

## 第二步：基于 LayoutPlan 生成 render_code

请严格按以下规范生成完整 TSX 代码，**先输出 LayoutPlan，再输出代码**。

## 实验基础信息
- subject: {subject}
- renderer_profile: {renderer_profile}
- 实验类型: {exp_type or 'unknown'}
- initial_state 键: {state_keys}
- visual_hint.type: {vh.get('type', 'unknown')}
- primary_concept: {vh.get('primary_concept', '')}
- renderSpec.topology: {(vh.get('renderSpec') or {}).get('topology', 'unknown')}
- renderSpec.components: {[(c.get('type') if isinstance(c, dict) else str(c)) for c in (vh.get('renderSpec') or {}).get('components', [])][:10]}
- registry_key: {registry_key or '(none)'}

## 实验类型渲染指导
{rendering_guidance}

{self._global_render_code_hard_constraints()}

## render_code 完整规范（必须严格遵守）
{lp_rules.RENDER_CODE_RULES}{current_snippet}

## 输出格式
**必须**先输出 LayoutPlan，再输出代码。代码格式：

```typescript
"render_code": export default function LabRenderer(props) {{
  const {{state, onStateChange, readonly, t}} = props;
  function rv(k, d) {{ var v = state[k]; if (typeof v === 'number' && isFinite(v)) return v; return d; }}
  function rb(k) {{ var v = state[k]; return !(v === false || v === 0); }}
  // ... 按 LayoutPlan 生成的完整代码 ...
}}
```
"""
        return prompt

    def build_lab_definition_prompt(
        self,
        teacher_message: str,
        subject: str,
        renderer_profile: str,
        registry_key: str | None = None,
        existing_definition: dict[str, Any] | None = None,
    ) -> str:
        """
        构建实验定义生成 prompt（第一步）

        根据教师需求生成完整的实验定义字段（用于保存到 lab_definitions 表），
        不包含 render_code（render_code 在第二步单独生成）。

        Args:
            teacher_message: 教师的需求描述
            subject: 学科 (physics/chemistry/biology/math)
            renderer_profile: 渲染器配置，如 circuit_2d, function_2d
            registry_key: 可选，已有的 registry_key（用于迭代）
            existing_definition: 可选，已有的实验定义（用于迭代优化）

        Returns:
            用于 LLM 的 prompt
        """
        exp_type = self.detect_experiment_type(
            subject,
            renderer_profile,
        )

        existing_block = ""
        if existing_definition:
            existing_block = f"""
## 现有实验定义（供参考，可选择保留或修改）
```json
{json.dumps(existing_definition, ensure_ascii=False, indent=2)[:2000]}
```
"""

        registry_hint = ""
        if registry_key:
            registry_hint = f"\n- **registry_key**: {registry_key}"

        prompt = f"""\
你是一个专业的中文理科实验设计助手。请根据教师的需求，设计一个完整的实验定义。

## 教师需求
> {teacher_message[:2000]}

## 基本要求
1. 设计完整的实验基本信息（标题、描述、学科等）
2. 设计 initial_state（交互参数及其默认值）
3. 设计 visual_hint（包含 renderSpec 布局规范）
4. 确定 renderer_profile 和 dimension

## 实验类型识别
- 检测到的实验类型: {exp_type or '通用'}
- renderer_profile: {renderer_profile}

## lab_definitions 表字段说明
| 字段 | 说明 | 示例 |
|------|------|------|
| title | 实验标题 | "欧姆定律-串联电路实验" |
| description | 实验描述 | "探究串联电路中电压、电流与电阻的关系" |
| subject_lab | 学科 | physics/chemistry/biology/math |
| renderer_profile | 渲染配置 | circuit_2d/function_2d/generic_2d |
| dimension | 维度 | 2d/3d |
| initial_state | 交互参数 | {{"voltage": 6, "r1": 100, "r2": 200, ...}} |
| reducer_spec | 状态更新规则 | 可选 |
| lab_metadata | 元数据 | 可选 |
| visual_hint | 视觉提示 | 包含 renderSpec 布局规范 |

## visual_hint.renderSpec 布局规范
```json
{{
  "type": "circuit_2d",
  "topology": "series_parallel",  // series/parallel/series_parallel/custom
  "components": [
    {{"id": "bat1", "type": "battery", "label": "E", "value_key": "voltage", "x": 0, "y": 1}},
    {{"id": "sw1",  "type": "switch",  "label": "S", "value_key": "switchClosed", "x": 1, "y": 1}},
    {{"id": "r1",   "type": "resistor", "label": "R1", "value_key": "r1", "x": 2, "y": 1}},
    {{"id": "r2",   "type": "resistor", "label": "R2", "value_key": "r2", "x": 4, "y": 0}},
    {{"id": "r3",   "type": "resistor", "label": "R3", "value_key": "r3", "x": 6, "y": 0}},
    {{"id": "r4",   "type": "resistor", "label": "R4", "value_key": "r4", "x": 4, "y": 2}},
    {{"id": "r5",   "type": "resistor", "label": "R5", "value_key": "r5", "x": 6, "y": 2}}
  ],
  "wires": [
    {{"from": "bat1.pos", "to": "sw1"}},
    {{"from": "sw1", "to": "r1"}},
    {{"from": "r1", "to": "r2"}},
    {{"from": "r2", "to": "r3"}},
    {{"from": "r1", "to": "r4"}},
    {{"from": "r4", "to": "r5"}},
    {{"from": "r3", "to": "bat1.neg"}},
    {{"from": "r5", "to": "bat1.neg"}}
  ],
  "layout": {{"cols": 8, "rows": 3, "padding": 24, "direction": "lr"}},
  "canvas": {{"width": 720, "height": 320}},
  "grid": {{"show": true, "spacing": 40, "color": "#0f172a"}}
}}
```

## 串并联综合（series_parallel）专项要求（若教师意图包含“串并联/综合/复杂电路”）
1. 至少 1 个主干串联段（开关/电阻）+ 2 条并联支路（每条支路至少 2 个电阻串联，如 R2→R3 与 R4→R5）
2. initial_state 必须提供：voltage、r1..r5、switchClosed、showCurrent/showVoltage/showLabels（这些键必须是 boolean，不要用 0/1）
3. visual_hint.renderSpec.components 必须为每个元件提供 x/y 网格坐标（不要用 position 字段）
4. render_code 的面板必须显示：Req_total、I_total、I_branch1、I_branch2，并解释并联两端电压相等（V_branch1=V_branch2）

## 实验类型参考
{self._get_experiment_type_reference(exp_type)}

## 输出格式
**必须**输出一个 JSON 代码块，包含完整的实验定义字段：

```json
{{
  "title": "实验标题",
  "description": "实验描述",
  "subject_lab": "physics",
  "renderer_profile": "{renderer_profile}",
  "dimension": "2d",
  "initial_state": {{
    // 交互参数键值对
  }},
  "reducer_spec": null,
  "lab_metadata": null,
  "visual_hint": {{
    "type": "{renderer_profile}",
    "primary_concept": "核心概念",
    "renderSpec": {{
      "topology": "series/parallel/series_parallel/custom",
      "components": [...],
      "wires": [...],
      "layout": {{"cols": 8, "rows": 3, "padding": 24}},
      "canvas": {{"width": 720, "height": 320}},
      "grid": {{"show": true, "spacing": 40}}
    }}
  }}
}}
```
{existing_block}{registry_hint}

请基于教师需求，设计一个完整、合理的实验定义。
"""
        return prompt

    def _get_experiment_type_reference(self, exp_type: str | None) -> str:
        """获取实验类型参考信息"""
        references = {
            "circuit": """
**电路实验参考**:
- initial_state 常见参数: voltage, r1, r2, switch_closed, show_current, show_values
- renderSpec.topology: series | parallel
- renderSpec.components: battery, resistor(r1), resistor(r2), wire, switch
- 物理计算: I=V/(R1+R2), V1=I*R1, V2=I*R2
""",
            "optics": """
**光学实验参考**:
- initial_state 常见参数: angle, n1, n2, show_normal, show_angles
- renderSpec.topology: refraction | reflection
- renderSpec.components: medium, interface, incident_ray, refracted_ray, normal
- 物理计算: n1*sin(θ1) = n2*sin(θ2)
""",
            "mechanics": """
**力学实验参考**:
- initial_state 常见参数: angle, length, mass, gravity, damping
- renderSpec.topology: pendulum | projectile | spring
- renderSpec.components: pivot, string, bob, trajectory
- 动画: 使用 props.t 计算 θ(t) = θ0 * cos(ω*t)
""",
            "chemistry": """
**化学实验参考**:
- initial_state 常见参数: volume, concentration, ph, indicator_color
- renderSpec.topology: titration_curve
- renderSpec.components: beaker, burette, drop, curve, equivalence_point
- 物理计算: computePH(volume, v_base, ka)
""",
            "biology": """
**生物实验参考**:
- initial_state 常见参数: magnification, show_organelles, label_visible
- renderSpec.topology: cell_structure
- renderSpec.components: membrane, nucleus, mitochondria, er, golgi
- 交互: 切换显示不同细胞器
""",
        }
        return references.get(exp_type or "", """
**通用实验参考**:
- initial_state: 根据教师需求设计合理的交互参数
- renderSpec: 设计合适的组件和布局
- 确保参数有默认值且范围合理
""")

    async def generate_lab_definition(
        self,
        teacher_message: str,
        subject: str,
        renderer_profile: str,
        stream_fn: Callable[[list[dict[str, str]]], Awaitable[str]],
        registry_key: str | None = None,
        existing_definition: dict[str, Any] | None = None,
        max_retries: int = 3,
    ) -> tuple[LabDefinitionOutput | None, ReflectionReport]:
        """
        第一步：生成实验定义（不包括 render_code）

        Args:
            teacher_message: 教师需求
            subject: 学科
            renderer_profile: 渲染配置
            stream_fn: LLM 调用函数
            registry_key: 可选的 registry_key
            existing_definition: 可选的已有定义
            max_retries: 最大重试次数

        Returns:
            (LabDefinitionOutput, ReflectionReport)
        """
        report = ReflectionReport(
            definition_id=registry_key or "new",
            generated_at=datetime.now(),
        )

        prompt = self.build_lab_definition_prompt(
            teacher_message=teacher_message,
            subject=subject,
            renderer_profile=renderer_profile,
            registry_key=registry_key,
            existing_definition=existing_definition,
        )

        for attempt in range(max_retries):
            try:
                response = await stream_fn([{"role": "user", "content": prompt}])
                report.attempt_count += 1

                # 解析响应
                lab_def = LabDefinitionOutput.from_llm_response(response)

                if lab_def.title and lab_def.initial_state:
                    report.corrections_applied.append(
                        f"Attempt {attempt + 1}: Successfully generated lab definition"
                    )
                    report.summary = f"Generated: {lab_def.title}"
                    return lab_def, report

                report.corrections_applied.append(
                    f"Attempt {attempt + 1}: Missing required fields (title or initial_state)"
                )

            except Exception as e:
                report.corrections_applied.append(
                    f"Attempt {attempt + 1}: LLM call failed - {str(e)}"
                )

        report.used_fallback = True
        report.summary = "Failed to generate lab definition after max retries"
        return None, report

    async def validate_and_enhance(
        self,
        render_code: str | None,
        initial_state: dict[str, Any] | None,
        visual_hint: dict[str, Any] | None,
        subject: str,
        renderer_profile: str | None,
        stream_fn: Callable[[list[dict[str, str]]], Awaitable[str]],
        definition_id: str | None = None,
        teacher_message: str | None = None,
        registry_key: str | None = None,
    ) -> tuple[str | None, ReflectionReport, LayoutPlan | None]:
        """
        两步验证与修正流程：

        Step 1 — 实验定义生成：
        - 根据教师需求生成完整的实验定义字段（title, initial_state, visual_hint, renderSpec 等）
        - 保存到 lab_definitions 表
        - **此步骤不包括 render_code**

        Step 2 — 布局分析与 render_code 生成：
        - 基于已生成的实验定义，做 LayoutPlan 布局分析
        - 多轮反思确保布局合理
        - 生成有效的 render_code TSX

        Args:
            render_code: 待验证的 render_code（可为空，用于第二轮生成）
            initial_state: 实验初始状态
            visual_hint: 视觉提示
            subject: 学科 (physics/chemistry/biology 等)
            renderer_profile: 渲染器配置
            stream_fn: 流式 LLM 调用函数
            definition_id: 实验定义 ID（用于报告）
            teacher_message: 教师需求（用于第一步生成实验定义）

        Returns:
            (render_code, ReflectionReport, LayoutPlan)
            - render_code: 修正后的代码或 None
            - ReflectionReport: 反省报告
            - LayoutPlan: 布局方案（可能为 None）
        """
        report = ReflectionReport(
            definition_id=definition_id or "unknown",
            generated_at=datetime.now(),
        )
        lab_definition: LabDefinitionOutput | None = None
        plan: LayoutPlan | None = None

        _state = initial_state or {}
        _vh = visual_hint or {}

        # ========================================================================
        # Step 1: 如果没有初始 render_code 或 teacher_message 先生成实验定义
        # ========================================================================
        if not render_code or teacher_message:
            lab_definition, def_report = await self.generate_lab_definition(
                teacher_message=teacher_message or "生成实验",
                subject=subject,
                renderer_profile=renderer_profile or "generic_2d",
                stream_fn=stream_fn,
                registry_key=registry_key or definition_id,
                existing_definition=_vh,
            )

            # 合并报告
            report.attempt_count += def_report.attempt_count
            report.corrections_applied.extend(def_report.corrections_applied)

            if not lab_definition:
                report.summary = "Failed to generate lab definition in Step 1"
                report.used_fallback = True
                report.lab_definition_output = None
                return None, report, None

            # 更新 initial_state 和 visual_hint
            _state = lab_definition.initial_state or _state
            _vh = lab_definition.visual_hint or _vh
            report.corrections_applied.append(
                f"Step 1 完成: 生成实验定义 {lab_definition.title}"
            )
            report.lab_definition_output = lab_definition

        # ========================================================================
        # Step 0: 检测初始问题
        # ========================================================================
        issues = self.detect_issues(render_code, _state, _vh)
        report.issues_detected.extend(issues)

        # 如果 render_code 已经有效，直接返回
        if render_code and self.is_valid(render_code, _state, _vh) and not issues:
            report.final_render_code = render_code
            report.summary = "Render code passed validation on first attempt"
            report.lab_definition_output = lab_definition
            return render_code, report, None

        # ========================================================================
        # Step 2: 布局分析与多轮反思
        # ========================================================================
        layout_prompt = self.build_layout_analysis_prompt(
            initial_state=_state,
            visual_hint=_vh,
            subject=subject,
            renderer_profile=renderer_profile or "",
            current_render_code=render_code,
            teacher_message=teacher_message,
            registry_key=registry_key or definition_id,
        )

        try:
            layout_response = await stream_fn([{"role": "user", "content": layout_prompt}])
        except Exception as e:
            report.corrections_applied.append(f"Step 2 Layout: LLM call failed - {str(e)}")
            layout_response = ""

        # 解析 LayoutPlan 并存入报告
        plan = LayoutPlan.from_llm_response(layout_response)
        report.layout_plan = plan.to_markdown()
        report.corrections_applied.append(f"LayoutPlan: {report.layout_plan[:200]}")

        # ========================================================================
        # Step 3: 基于 LayoutPlan 生成 render_code
        # ========================================================================
        refined_code = self.extract_render_code_from_response(layout_response)

        # 若第二步未提取到代码，fallback 到反省 prompt
        if not refined_code:
            report.corrections_applied.append(
                "Step 3: No render_code extracted from layout response, using reflection prompt"
            )
            refined_code = await self._generate_with_reflection(
                render_code,
                issues,
                _state,
                _vh,
                subject,
                renderer_profile or "",
                stream_fn,
                report,
                teacher_message=teacher_message,
                registry_key=registry_key or definition_id,
            )
        else:
            # 验证提取到的代码
            new_issues = self.detect_issues(refined_code, _state, _vh)
            if self.is_valid(refined_code, _state, _vh) and not new_issues:
                report.final_render_code = refined_code
                report.corrections_applied.append(
                    "Step 3: Code generated from LayoutPlan and passed validation"
                )
                report.summary = "Render code generated via LayoutPlan analysis"
                report.lab_definition_output = lab_definition
                return refined_code, report, plan

            report.corrections_applied.append(
                f"Step 3: LayoutPlan code has issues: {[i.description for i in new_issues[:2]]}"
            )
            report.issues_detected.extend(new_issues)

            # 继续反省循环修正
            refined_code = await self._generate_with_reflection(
                refined_code,
                new_issues,
                _state,
                _vh,
                subject,
                renderer_profile or "",
                stream_fn,
                report,
                teacher_message=teacher_message,
                registry_key=registry_key or definition_id,
            )

        # ========================================================================
        # Step 4: 结果判定
        # ========================================================================
        if refined_code and self.is_valid(refined_code, _state, _vh):
            final_issues = self.detect_issues(refined_code, _state, _vh)
            if not final_issues:
                report.final_render_code = refined_code
                report.summary = "Render code fixed after reflection"
                report.lab_definition_output = lab_definition
                return refined_code, report, plan
            report.issues_detected.extend(final_issues)

        # 所有尝试均失败
        report.used_fallback = True
        report.summary = f"All generation attempts failed. Fallback will be used. LayoutPlan was: {report.layout_plan[:100]}"
        report.lab_definition_output = lab_definition
        # Prefer a subject-specific fallback to reduce "not supported" perception.
        if str(subject).lower() == "chemistry" and is_chemistry_reaction_intent(
            visual_hint=_vh,
            teacher_message=teacher_message,
            registry_key=registry_key or definition_id,
            initial_state=_state,
        ):
            fallback = self._build_chemistry_reaction_fallback_render_code(_state)
        else:
            fallback = self._build_universal_fallback_render_code(_state)
        report.final_render_code = fallback
        return fallback, report, plan

    def _build_chemistry_reaction_fallback_render_code(self, state: dict[str, Any]) -> str:
        """
        Chemistry reaction fallback render_code (SVG-only, interactive + animated).

        Goals:
        - Visually resembles a reaction (vessel + mixture + sparks + temperature/progress)
        - Minimal assumptions about state keys; maps common keys when present
        - Provides ignite/reset controls + 1-2 numeric sliders + 1 boolean toggle
        """
        keys = list((state or {}).keys())
        # Heuristics for common lab params
        def pick_key(candidates: list[str]) -> str | None:
            for c in candidates:
                if c in keys:
                    return c
            # fuzzy contains
            lc = [k.lower() for k in keys]
            for cand in candidates:
                cl = cand.lower()
                for i, k in enumerate(lc):
                    if cl in k:
                        return keys[i]
            return None

        al_key = pick_key(["aluminumMass_g", "aluminiumMass_g", "al_mass_g", "aluminum_g", "al_g"])
        fe_key = pick_key(["fe2o3Mass_g", "ironOxideMass_g", "oxideMass_g", "fe2o3_g", "fe_g"])
        show_key = pick_key(["showLabels", "show_labels", "labels", "show"])
        ignited_key = pick_key(["ignited", "isIgnited", "started", "isStarted", "burning"])
        ignition_t_key = pick_key(["ignitionTime", "igniteTime", "t0", "startTime"])

        # Provide defaults (still interactive even if the original initial_state had none)
        al_key = al_key or (keys[0] if keys else "aluminumMass_g")
        fe_key = fe_key or (keys[1] if len(keys) > 1 else "fe2o3Mass_g")
        show_key = show_key or "showLabels"
        ignited_key = ignited_key or "ignited"
        ignition_t_key = ignition_t_key or "ignitionTime"

        return f"""export default function LabRenderer(props) {{
  const {{ state, onStateChange, readonly, t }} = props || {{}};
  function rv(k, d) {{
    var v = state && state[k];
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string') {{ var n = parseFloat(v); if (isFinite(n)) return n; }}
    return d;
  }}
  function rb(k, d) {{
    var v = state && state[k];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return !(v === '0' || v === 'false' || v === 'off');
    return !!d;
  }}

  var W = 860, H = 460;
  var bg = '#0b1120';
  var panelBg = '#0f172a';
  var grid = '#1e293b';
  var text = '#e5e7eb';
  var sub = '#94a3b8';
  var accent = '#fb7185';
  var hot = '#f97316';
  var cool = '#38bdf8';

  var al = rv('{al_key}', 100);
  var fe = rv('{fe_key}', 200);
  var show = rb('{show_key}', true);
  var ignited = rb('{ignited_key}', false);
  var t0 = rv('{ignition_t_key}', -1);
  var tt = (typeof t === 'number' && isFinite(t)) ? t : 0;

  // Progress model: start at ignition, saturate in ~10-20s depending on mass ratio
  var ratio = Math.max(0.2, Math.min(3.0, (al + 1) / (fe + 1)));
  var speed = 0.08 + 0.05 * ratio; // 0.09..0.23
  var elapsed = (ignited && t0 >= 0) ? Math.max(0, tt - t0) : 0;
  var prog = ignited ? (1 - Math.exp(-speed * elapsed)) : 0; // 0..1
  prog = Math.max(0, Math.min(1, prog));

  // Temperature estimate (°C), stylized but monotonic with progress & amount
  var amount = Math.max(0, Math.min(1, (al + fe) / 600));
  var temp = 25 + prog * (2200 + 500 * amount);

  // Visual parameters
  var cx = 440, cy = 250;
  var bowlW = 420, bowlH = 180;
  var mixY = cy + 40;
  var glow = prog * (0.35 + 0.35*Math.sin(tt*6));
  var smoke = prog * (0.25 + 0.25*Math.sin(tt*1.5 + 0.8));
  var sparksN = ignited ? Math.floor(10 + 40*prog) : 0;

  function clamp(x,a,b){{return x<a?a:x>b?b:x;}}
  function lerp(a,b,u){{return a+(b-a)*u;}}
  function mixColor(u) {{
    // grey -> orange -> white-hot
    var r = Math.round(lerp(80, 255, clamp(u*1.1,0,1)));
    var g = Math.round(lerp(90, 210, clamp(u*0.9,0,1)));
    var b = Math.round(lerp(110, 120, clamp(u*0.7,0,1)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }}
  var mixFill = mixColor(prog);

  function ignite() {{
    if (readonly || typeof onStateChange !== 'function') return;
    onStateChange({{ '{ignited_key}': true, '{ignition_t_key}': tt }});
  }}
  function reset() {{
    if (readonly || typeof onStateChange !== 'function') return;
    onStateChange({{ '{ignited_key}': false, '{ignition_t_key}': -1 }});
  }}

  // Reaction bowl (crucible) path
  var bowlPath = 'M ' + (cx - bowlW/2) + ' ' + (cy - bowlH/2) +
    ' C ' + (cx - bowlW/2 + 40) + ' ' + (cy + bowlH/2) + ', ' +
    (cx + bowlW/2 - 40) + ' ' + (cy + bowlH/2) + ', ' +
    (cx + bowlW/2) + ' ' + (cy - bowlH/2) +
    ' L ' + (cx + bowlW/2 - 30) + ' ' + (cy - bowlH/2 + 30) +
    ' C ' + (cx + bowlW/2 - 60) + ' ' + (cy + bowlH/2 - 10) + ', ' +
    (cx - bowlW/2 + 60) + ' ' + (cy + bowlH/2 - 10) + ', ' +
    (cx - bowlW/2 + 30) + ' ' + (cy - bowlH/2 + 30) +
    ' Z';

  // Mixture mound
  var moundW = 220 + 80*amount;
  var moundH = 52 + 10*amount;
  var moundPath = 'M ' + (cx - moundW/2) + ' ' + mixY +
    ' C ' + (cx - moundW/4) + ' ' + (mixY - moundH) + ', ' +
    (cx + moundW/4) + ' ' + (mixY - moundH) + ', ' +
    (cx + moundW/2) + ' ' + mixY +
    ' C ' + (cx + moundW/3) + ' ' + (mixY + 22) + ', ' +
    (cx - moundW/3) + ' ' + (mixY + 22) + ', ' +
    (cx - moundW/2) + ' ' + mixY + ' Z';

  // Sparks
  var sparks = ignited ? Array.from({{ length: sparksN }}, function(_, i) {{
    var a = i * 6.283 / Math.max(1, sparksN);
    var r = 18 + 140*prog + 25*Math.sin(tt*2 + i*1.7);
    var sx = cx + r*Math.cos(a + tt*2.2) + 14*Math.sin(tt*5 + i);
    var sy = (cy - 60) + r*Math.sin(a + tt*1.9) - 18*Math.cos(tt*3 + i*0.9);
    var op = clamp(0.9 - 0.7*prog + 0.2*Math.sin(tt*8+i), 0.08, 0.95);
    var rad = 1.2 + 2.6*Math.random();
    var col = (i % 3 === 0) ? '#fde68a' : (i % 3 === 1) ? '#fb7185' : '#f97316';
    return createElement('circle', {{ cx: sx, cy: sy, r: rad, fill: col, opacity: op }});
  }}) : [];

  // Smoke plume
  var smokeKids = ignited ? Array.from({{ length: 10 }}, function(_, i) {{
    var u = (i/10);
    var sx = cx + 40*Math.sin(tt*0.8 + i);
    var sy = (cy - 130) - u*120 - 12*Math.sin(tt*1.2 + i*0.7);
    var rr = 22 + u*28 + 10*Math.sin(tt*0.9 + i);
    var op = smoke * (0.22 - u*0.015);
    return createElement('circle', {{ cx: sx, cy: sy, r: rr, fill: '#94a3b8', opacity: clamp(op, 0, 0.25) }});
  }}) : [];

  // Molten drip (stylized)
  var drip = ignited ? createElement('path', {{
    d: 'M ' + (cx + 60) + ' ' + (mixY + 10) +
       ' C ' + (cx + 90) + ' ' + (mixY + 60) + ', ' +
       (cx + 100) + ' ' + (mixY + 120) + ', ' +
       (cx + 70) + ' ' + (mixY + 150),
    fill: 'none',
    stroke: '#fb7185',
    'stroke-width': 5,
    opacity: clamp(prog*1.2, 0, 1),
    'stroke-linecap': 'round'
  }}) : null;

  var svg = createElement('svg', {{ width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, style: {{ background: bg, display: 'block' }} }},
    createElement('rect', {{ x: 0, y: 0, width: W, height: H, fill: bg }}),
    createElement('g', {{ opacity: 0.25 }},
      ...Array.from({{ length: 15 }}, function(_, i) {{ return createElement('line', {{ x1: i*60, y1: 0, x2: i*60, y2: H, stroke: grid, 'stroke-width': 1 }}); }}),
      ...Array.from({{ length: 9 }}, function(_, i) {{ return createElement('line', {{ x1: 0, y1: i*60, x2: W, y2: i*60, stroke: grid, 'stroke-width': 1 }}); }})
    ),
    createElement('text', {{ x: 28, y: 36, fill: '#93c5fd', 'font-size': 18, 'font-family': 'sans-serif', 'font-weight': 800 }},
      'Thermite Reaction (fallback template)'
    ),
    createElement('text', {{ x: 28, y: 62, fill: sub, 'font-size': 12, 'font-family': 'monospace' }},
      '进度=' + Math.round(prog*100) + '%   温度≈' + Math.round(temp) + '°C'
    ),
    createElement('g', null,
      // glow halo
      createElement('circle', {{ cx: cx, cy: cy - 30, r: 92 + 40*prog, fill: hot, opacity: glow*0.22 }}),
      createElement('circle', {{ cx: cx, cy: cy - 30, r: 56 + 26*prog, fill: '#fde68a', opacity: glow*0.18 }}),
      // crucible
      createElement('path', {{ d: bowlPath, fill: '#111827', stroke: '#334155', 'stroke-width': 2.2 }}),
      // mixture
      createElement('path', {{ d: moundPath, fill: mixFill, opacity: 0.92, stroke: ignited ? '#fde68a' : '#475569', 'stroke-width': 1.2 }}),
      // spark + smoke + drip
      ...smokeKids,
      drip,
      ...sparks
    ),
    show ? createElement('g', null,
      createElement('text', {{ x: cx - 140, y: mixY - 24, fill: cool, 'font-size': 11, 'font-family': 'monospace' }}, 'Al: ' + Math.round(al) + ' g'),
      createElement('text', {{ x: cx - 140, y: mixY - 8, fill: '#fbbf24', 'font-size': 11, 'font-family': 'monospace' }}, 'Fe₂O₃: ' + Math.round(fe) + ' g'),
      createElement('text', {{ x: cx - 140, y: mixY + 8, fill: sub, 'font-size': 10, 'font-family': 'monospace' }}, '模型: 进度由 t 驱动（示意）')
    ) : null
  );

  var controls = (!readonly && typeof onStateChange === 'function') ? createElement('div', {{ style: {{ background: panelBg, padding: '10px 14px', display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }} }},
    createElement('button', {{
      onClick: ignited ? reset : ignite,
      style: {{
        padding: '6px 12px',
        borderRadius: '8px',
        border: '1px solid ' + (ignited ? '#64748b' : '#f97316'),
        background: ignited ? '#111827' : 'rgba(249,115,22,0.18)',
        color: ignited ? '#cbd5e1' : '#fde68a',
        fontFamily: 'monospace',
        fontWeight: 800,
        cursor: 'pointer'
      }}
    }}, ignited ? 'Reset' : 'Ignite'),
    createElement('label', {{ style: {{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#d1d5db' }} }},
      createElement('span', {{ style: {{ color: cool, fontFamily: 'monospace' }} }}, 'Al(g)'),
      createElement('input', {{ type: 'range', min: 10, max: 300, step: 5, value: al,
        onChange: function(e) {{ onStateChange({{ '{al_key}': parseFloat(e.target.value) }}); }},
        style: {{ width: '170px', accentColor: cool }}
      }}),
      createElement('span', {{ style: {{ color: cool, fontFamily: 'monospace' }} }}, String(Math.round(al)))
    ),
    createElement('label', {{ style: {{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#d1d5db' }} }},
      createElement('span', {{ style: {{ color: '#fbbf24', fontFamily: 'monospace' }} }}, 'Fe₂O₃(g)'),
      createElement('input', {{ type: 'range', min: 10, max: 400, step: 5, value: fe,
        onChange: function(e) {{ onStateChange({{ '{fe_key}': parseFloat(e.target.value) }}); }},
        style: {{ width: '170px', accentColor: '#fbbf24' }}
      }}),
      createElement('span', {{ style: {{ color: '#fbbf24', fontFamily: 'monospace' }} }}, String(Math.round(fe)))
    ),
    createElement('label', {{ style: {{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#d1d5db' }} }},
      createElement('span', {{ style: {{ color: sub, fontFamily: 'monospace' }} }}, 'labels'),
      createElement('input', {{ type: 'checkbox', checked: !!show,
        onChange: function(e) {{ onStateChange({{ '{show_key}': !!e.target.checked }}); }},
        style: {{ transform: 'scale(1.05)', accentColor: '#94a3b8' }}
      }})
    )
  ) : null;

  return createElement('div', {{ style: {{ background: bg, borderRadius: '10px', overflow: 'hidden' }} }}, svg, controls);
}}"""

    def _build_universal_fallback_render_code(self, state: dict[str, Any]) -> str:
        """
        Universal fallback render_code.

        Guarantee:
        - Uses SVG createElement only
        - Has at least 1 visible `t`-driven animation
        - Has at least 1 interactive control that calls onStateChange({ ... })
        - Works for any subject by binding to the first numeric / boolean keys in initial_state
        """
        keys = list((state or {}).keys())
        num_key = None
        bool_key = None
        for k in keys:
            v = state.get(k)
            if num_key is None and isinstance(v, (int, float)) and not isinstance(v, bool):
                num_key = k
            if bool_key is None and isinstance(v, bool):
                bool_key = k
        if num_key is None:
            num_key = "param"
        if bool_key is None:
            bool_key = "show"

        # NOTE: Keep it plain JS-in-TSX string; front-end runtime strips imports/exports.
        return f"""export default function LabRenderer(props) {{
  const {{ state, onStateChange, readonly, t }} = props || {{}};
  function rv(k, d) {{ var v = state && state[k]; if (typeof v === 'number' && isFinite(v)) return v; if (typeof v === 'string') {{ var n = parseFloat(v); if (isFinite(n)) return n; }} return d; }}
  function rb(k) {{ var v = state && state[k]; return !(v === false || v === 0); }}

  var W = 720, H = 420;
  var bg = '#0b1120';
  var accent = '#38bdf8';
  var warn = '#fbbf24';
  var grid = '#1e293b';

  var x = rv('{num_key}', 50);
  var flag = rb('{bool_key}');
  var anim = (typeof t === 'number' && isFinite(t)) ? t : 0;
  var pulse = 0.55 + 0.35*Math.sin(t*2);
  var dx = 40*Math.sin(t*1.2);

  var svg = createElement('svg', {{ width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, style: {{ background: bg, display: 'block' }} }},
    createElement('rect', {{ x: 0, y: 0, width: W, height: H, fill: bg }}),
    // grid
    createElement('g', {{ opacity: 0.25 }},
      ...Array.from({{ length: 13 }}, function(_, i) {{ return createElement('line', {{ x1: i*60, y1: 0, x2: i*60, y2: H, stroke: grid, 'stroke-width': 1 }}); }}),
      ...Array.from({{ length: 8 }}, function(_, i) {{ return createElement('line', {{ x1: 0, y1: i*60, x2: W, y2: i*60, stroke: grid, 'stroke-width': 1 }}); }})
    ),
    // animated marker (t-driven, visible)
    createElement('circle', {{ cx: 180 + dx, cy: 220, r: 16, fill: accent, opacity: pulse, stroke: '#e0f2fe', 'stroke-width': 2 }}),
    createElement('text', {{ x: 36, y: 44, fill: '#93c5fd', 'font-size': 18, 'font-family': 'sans-serif', 'font-weight': 700 }},
      'Fallback Renderer (interactive + animated)'
    ),
    createElement('text', {{ x: 36, y: 74, fill: '#cbd5e1', 'font-size': 14, 'font-family': 'sans-serif' }},
      '绑定参数: {num_key}=' + x + ' , {bool_key}=' + (flag ? 'true' : 'false')
    ),
    createElement('text', {{ x: 36, y: 104, fill: warn, 'font-size': 12, 'font-family': 'monospace', opacity: 0.6 + 0.4*Math.sin(anim*3) }},
      't=' + (Math.round(anim*100)/100)
    )
  );

  var controls = (!readonly && typeof onStateChange === 'function') ? createElement('div', {{ style: {{ background: '#0f172a', padding: '10px 14px', display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }} }},
    createElement('label', {{ style: {{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#d1d5db' }} }},
      createElement('span', {{ style: {{ color: accent, fontFamily: 'monospace' }} }}, '{num_key}'),
      createElement('input', {{ type: 'range', min: 0, max: 100, step: 1, value: x,
        onChange: function(e) {{ onStateChange({{ '{num_key}': parseFloat(e.target.value) }}); }},
        style: {{ width: '180px', accentColor: accent }}
      }}),
      createElement('span', {{ style: {{ color: accent, fontFamily: 'monospace' }} }}, String(x))
    ),
    createElement('label', {{ style: {{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#d1d5db' }} }},
      createElement('span', {{ style: {{ color: warn, fontFamily: 'monospace' }} }}, '{bool_key}'),
      createElement('input', {{ type: 'checkbox', checked: !!flag,
        onChange: function(e) {{ onStateChange({{ '{bool_key}': !!e.target.checked }}); }},
        style: {{ transform: 'scale(1.05)', accentColor: warn }}
      }})
    )
  ) : null;

  return createElement('div', {{ style: {{ background: bg, borderRadius: '10px', overflow: 'hidden' }} }}, svg, controls);
}}"""

    async def generate_complete_lab(
        self,
        teacher_message: str,
        subject: str,
        renderer_profile: str,
        stream_fn: Callable[[list[dict[str, str]]], Awaitable[str]],
        registry_key: str | None = None,
        max_reflection_rounds: int = 3,
    ) -> tuple[LabDefinitionOutput | None, str | None, ReflectionReport]:
        """
        完整的实验生成流程（外部调用入口）

        流程：
        1. 根据教师需求生成实验定义（title, initial_state, visual_hint 等）
        2. 多轮反思验证布局方案
        3. 生成 render_code

        Args:
            teacher_message: 教师需求
            subject: 学科
            renderer_profile: 渲染配置
            stream_fn: LLM 调用函数
            registry_key: 可选的 registry_key
            max_reflection_rounds: 最大反思轮数

        Returns:
            (LabDefinitionOutput, render_code, ReflectionReport)
        """
        report = ReflectionReport(
            definition_id=registry_key or "new",
            generated_at=datetime.now(),
        )

        # ── 第一步：生成实验定义 ────────────────────────────────────────────────
        lab_def, def_report = await self.generate_lab_definition(
            teacher_message=teacher_message,
            subject=subject,
            renderer_profile=renderer_profile,
            stream_fn=stream_fn,
            registry_key=registry_key,
        )

        report.attempt_count += def_report.attempt_count
        report.corrections_applied.extend(def_report.corrections_applied)

        if not lab_def:
            report.summary = "Failed to generate lab definition"
            report.used_fallback = True
            return None, None, report

        # ── 第二步：布局分析与反思 ─────────────────────────────────────────────
        layout_prompt = self.build_layout_analysis_prompt(
            initial_state=lab_def.initial_state,
            visual_hint=lab_def.visual_hint,
            subject=subject,
            renderer_profile=renderer_profile,
            teacher_message=teacher_message,
            registry_key=registry_key,
        )

        try:
            layout_response = await stream_fn([{"role": "user", "content": layout_prompt}])
        except Exception as e:
            report.corrections_applied.append(f"Layout analysis failed: {str(e)}")
            layout_response = ""

        plan = LayoutPlan.from_llm_response(layout_response)
        report.layout_plan = plan.to_markdown()

        # 提取 render_code
        render_code = self.extract_render_code_from_response(layout_response)

        # 多轮反思优化 render_code
        if render_code:
            for round_num in range(max_reflection_rounds):
                issues = self.detect_issues(
                    render_code,
                    lab_def.initial_state,
                    lab_def.visual_hint,
                )

                if self.is_valid(render_code, lab_def.initial_state, lab_def.visual_hint) and not issues:
                    report.final_render_code = render_code
                    report.corrections_applied.append(
                        f"Round {round_num + 1}: render_code passed validation"
                    )
                    return lab_def, render_code, report

                # 反思修正
                render_code = await self._generate_with_reflection(
                    render_code,
                    issues,
                    lab_def.initial_state,
                    lab_def.visual_hint,
                    subject,
                    renderer_profile,
                    stream_fn,
                    report,
                    teacher_message=teacher_message,
                    registry_key=registry_key,
                )

                if not render_code:
                    break

        # 最终验证
        if render_code and self.is_valid(render_code, lab_def.initial_state, lab_def.visual_hint):
            final_issues = self.detect_issues(render_code, lab_def.initial_state, lab_def.visual_hint)
            if not final_issues:
                report.final_render_code = render_code
                report.summary = f"Successfully generated complete lab: {lab_def.title}"
                return lab_def, render_code, report

        # 失败
        report.used_fallback = True
        report.summary = "Failed to generate render_code after max reflection rounds"
        return lab_def, None, report

    async def _generate_with_reflection(
        self,
        current_code: str | None,
        issues: list[RenderCodeIssue],
        initial_state: dict[str, Any],
        visual_hint: dict[str, Any],
        subject: str,
        renderer_profile: str,
        stream_fn: Callable[[list[dict[str, str]]], Awaitable[str]],
        report: ReflectionReport,
        teacher_message: str | None = None,
        registry_key: str | None = None,
    ) -> str | None:
        """内部反省循环 — 基于 LayoutPlan context 做多轮修正"""
        reflection_prompt = self.build_reflection_prompt(
            current_code,
            issues,
            initial_state,
            visual_hint,
            subject,
            renderer_profile,
            teacher_message=teacher_message,
            registry_key=registry_key,
        )
        # 在 prompt 末尾附上 LayoutPlan
        if report.layout_plan:
            reflection_prompt += f"\n\n## LayoutPlan（布局方案，上一步分析结果）\n{report.layout_plan}\n\n请严格按 LayoutPlan 生成的层次和组件要求修正代码。"

        for attempt in range(self._max_retries):
            report.attempt_count += 1

            try:
                response = await stream_fn([{"role": "user", "content": reflection_prompt}])
            except Exception as e:
                report.corrections_applied.append(f"Attempt {attempt + 1}: LLM call failed - {str(e)}")
                continue

            new_code = self.extract_render_code_from_response(response)

            if not new_code:
                report.corrections_applied.append(f"Attempt {attempt + 1}: Failed to extract render_code")
                continue

            new_issues = self.detect_issues(new_code, initial_state, visual_hint)

            if self.is_valid(new_code, initial_state, visual_hint) and not new_issues:
                report.final_render_code = new_code
                report.corrections_applied.append(
                    f"Attempt {attempt + 1}: Fixed {len(issues)} issues successfully"
                )
                return new_code

            report.corrections_applied.append(
                f"Attempt {attempt + 1}: {[i.description for i in new_issues[:1]]}"
            )
            report.issues_detected.extend(new_issues)

            reflection_prompt = self.build_reflection_prompt(
                new_code,
                new_issues,
                initial_state,
                visual_hint,
                subject,
                renderer_profile,
                previous_attempt=attempt + 1,
                teacher_message=teacher_message,
                registry_key=registry_key,
            )
            if report.layout_plan:
                reflection_prompt += f"\n\n## LayoutPlan\n{report.layout_plan}"

        return None


# ---------------------------------------------------------------------------
# 便捷函数
# ---------------------------------------------------------------------------

def detect_experiment_type(
    primary_concept: str,
    renderer_profile: str | None = None,
) -> str | None:
    """检测实验类型（便捷函数）"""
    agent = RenderCodeAgent()
    return agent.detect_experiment_type(primary_concept, renderer_profile)


def is_valid_render_code(
    render_code: str | None,
    initial_state: dict[str, Any] | None = None,
    visual_hint: dict[str, Any] | None = None,
) -> bool:
    """验证 render_code 是否有效（便捷函数）"""
    agent = RenderCodeAgent()
    return agent.is_valid(render_code, initial_state, visual_hint)


def detect_render_code_issues(
    render_code: str | None,
    initial_state: dict[str, Any] | None = None,
    visual_hint: dict[str, Any] | None = None,
) -> list[RenderCodeIssue]:
    """检测 render_code 问题（便捷函数）"""
    agent = RenderCodeAgent()
    return agent.detect_issues(render_code, initial_state, visual_hint)
