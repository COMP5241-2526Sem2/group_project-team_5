"""\
Lab Prompt 模板 — 规范规则片段。

所有片段均以纯文本形式嵌入主模板，不含 Python 格式化占位符。
"""

# ---------------------------------------------------------------------------
# initial_state 规范
# ---------------------------------------------------------------------------
INITIAL_STATE_RULES = """\
## initial_state 规范 — flat scalar only
Every key must be a **top-level scalar**: `number` | `boolean` | `string`.
- number → slider（由 render_code 中 `type="range"` 实现）
- boolean → toggle / checkbox
- string with `,` 分隔 → option buttons

### boolean 必须为 true/false
- ✅ `true` / `false`
- ❌ `1` / `0`（前端会被当成 number，导致 rb/checkbox 语义混乱）

### 禁止的模式
- ❌ `"panels": [...]` — nested array
- ❌ `"controls": {{ ... }}` — nested object
- ❌ `"sliders": [5, 10, 15]` — bare array as a key
- ❌ any nested object as a top-level key

### 正确示例
```json
{ "angle": 45, "gravity": 9.8, "showTrajectory": true }
{ "ph": 7, "showScale": true, "mode": "auto,manual" }
{ "frequency": 2, "amplitude": 1.5, "wavelength": 3.0 }
```"""

# ---------------------------------------------------------------------------
# visual_hint.renderSpec 规范
# ---------------------------------------------------------------------------
RENDER_SPEC_RULES = """\
## visual_hint.renderSpec 规范 — 必填子字段
Every `visual_hint` must contain a `renderSpec` object. Even for simple experiments, output at least `{{"topology": "custom", "components": [], "wires": [], "drawing_commands": []}}`.

| 子字段 | 类型 | 说明 |
|---|---|---|
| `topology` | string | 见 topology 枚举 |
| `components` | array | 元件列表 |
| `wires` | array | 连线列表 |
| `layout` | object|null | `direction`（`lr`/`rl`/`tb`/`bt`）、`rows`、`cols`、`padding` |
| `drawing_commands` | array | 直接 Canvas2D 绘图指令（可省略以使用模板） |
| `annotations` | array|null | 数学标注 |
| `canvas` | object|null | `width` / `height`（默认 480×320） |
| `grid` | object|null | `show`/`spacing`/`color` |
| `axis` | object|null | `show`/`xLabel`/`yLabel`/`origin` |

### renderSpec.components 元素类型
电路元件：`battery` / `resistor` / `bulb` / `switch` / `capacitor` / `inductor`
光学元件：`lens` / `mirror` / `prism` / `screen` / `wave_source` / `object_arrow`
通用：`point` / `line` / `arc` / `circle` / `rect` / `text`

### 重要光学实验规范
`topology` 单独存在（lens_array / ray_diagram）**不会绘制任何可见元素**。必须同时：
1. 在 `components` 中声明 lens / mirror / prism / wave_source / screen 等元件
2. 在 `drawing_commands` 中添加 `arrow` / `line` / `dashedLine` 表示入射光/折射光/反射光
3. 用户期望看到：可见的透镜 + 可见的光线 + 物体箭头"""

# ---------------------------------------------------------------------------
# render_code SVG 规范
# ---------------------------------------------------------------------------
RENDER_CODE_RULES = """\
## render_code — 强制规范（全部使用 SVG createElement）

### 渲染方式：SVG 虚拟 DOM（唯一合法方式）
**禁止使用 Canvas API（`useRef` / `getContext('2d')` / `requestAnimationFrame` 等）。所有渲染必须通过 SVG 虚拟元素实现。**

### props 接口（已在执行环境中注入）
```typescript
interface LabRendererProps {
  state: Record<string, unknown>;   // initial_state 当前值
  onStateChange?: (patch: Partial<Record<string, unknown>>) => void;
  readonly?: boolean;
  dispatch?: (cmd: { type: string; payload?: Record<string, unknown>; description?: string }) => void;
  t: number;                        // 动画时间（秒），由前端递增
}
```

### 可用辅助函数（已在执行环境中注入）
- `createElement(tag, attrs, ...children)` — 创建 SVG 虚拟元素
- `rv(key, defaultVal)` — 从 state 读取 number，返回默认值
- `rb(key)` — 从 state 读取 boolean，转换为 true/false
- `MOLECULES`, `ATOM_COLOR`, `ATOM_R` — 化学分子 3D 数据（已预置 H₂O, CO₂, NaCl, CH₄, O₂ 等）

### props 解构与函数体变量（`const` 解构 + `rv`/`rb` + `var`/`const` 兼容）
- **props 入口**：必须用 **`const` 解构**（或等价地先取 `props` 再读字段）拿到 **`state`、`onStateChange`、`readonly`、`t`**，例如  
  `const { state, onStateChange, readonly, t } = props` 或 `const { state, onStateChange, readonly, t } = props || {}`。
- **禁止**：从 `props` **顶层**解构 `initial_state` 的标量键（如 ❌ `const { voltage, r1, showCurrent } = props`）。这些值在 **`state` 对象**里，必须用 **`rv`/`rb`**（或与本项目示例等价的读法），否则前端无法随交互更新。
- **函数体内局部变量**（在定义好 `function rv` / `function rb` 之后）：**`var x = rv('key', default)` 与 `const x = rv('key', default)`（或 `let`）两种写法均可**，可与上一行的 `const { state, ... } = props` **同时存在**；示例代码多用 `var` 仅为风格统一，**不是**排斥 `const`/`let`。
- **`rv`/`rb` 函数实现**：建议保持示例中的 `var v = state[k]`，与文档示例一致。

### 动画实现方式
`props.t` 由前端递增（秒），在 SVG 元素中直接使用 `t` 驱动动画：
- 弹簧振子：`theta = theta0 * Math.cos(omega * t) * Math.exp(-d * t)`
- 电流动画：`strokeDashoffset = -(t * 28) % 28`（配合 `strokeDasharray`）
- 波动动画：`translateX` / `opacity` 随 `t` 变化

### 动画覆盖（强制，适用于**每个**实验）
每个实验的 `render_code` **必须**包含至少 1 处“肉眼可见”的动态效果，并且必须由 `t` 驱动（不要只解构 `t` 却不使用）。

允许的最小动画（任选其一即可，但要**明显可见**）：
- **流动效果**：线条用 `strokeDasharray` + `strokeDashoffset: -(t * k) % k`
- **箭头/光线动态**（光学/矢量类）：箭头线条同样用 dashoffset 流动，或 `opacity: 0.6 + 0.4*Math.sin(t*ω)`
- **呼吸高亮**：某个关键元件（如介质分界、关键电阻）描边/光晕 `opacity` 随 `sin/cos` 变化

示例（光线箭头流动）：
`strokeDasharray: '10 16'`，`strokeDashoffset: -(t * 24) % 26`，并设置 `'marker-end': 'url(#arr1)'`。

### 交互覆盖（强制，适用于**每个**实验）
每个实验的 `render_code` **必须**提供至少 1 个交互控件（slider/checkbox/button），并且该控件必须通过 `onStateChange({ key: value })` 修改 `state`，使实验参数能被教师/学生调整。

允许的最小交互（任选其一即可，但要真实生效）：
- **slider**：`createElement('input', { type: 'range', value: X, onChange: function(e){ onStateChange({ key: parseFloat(e.target.value) }); } })`
- **checkbox**：`createElement('input', { type: 'checkbox', checked: B, onChange: function(e){ onStateChange({ key: e.target.checked }); } })`
- **button**：`createElement('button', { onClick: function(){ onStateChange({ key: next }); } }, 'Toggle')`

### SVG createElement 核心规范

**1. 背景 + 外层容器**
```tsx
return createElement('div', { style: { background: '#0b1120', borderRadius: '10px', overflow: 'hidden' } },
  createElement('div', { style: { overflowX: 'auto' } }, svg),
  controls
);
```

**2. SVG 外层**
```tsx
var svg = createElement('svg', { width: W, height: H, style: { display: 'block' } }, ...kids);
```

**禁止 DOM 式拼接（极易在前端报错）**
- `createElement` 返回的是 **React 虚拟节点**，**不是** 浏览器里的 `SVGElement`。
- **禁止** `svg.appendChild(...)`、`parent.insertBefore(...)` 等 DOM API。
- **禁止** `document.createElement`、`document.createElementNS` — 前端运行时没有 DOM 文档，只能用注入的 `createElement('svg'|'line'|…)`。
- **禁止** `globalThis.createElement` / `window.createElement` — 浏览器全局上没有 React 的 `createElement`，会得到 `undefined` 进而 `h is not a function`。应直接写 **`createElement(...)`**（运行时注入的同名函数）。
- **正确**：`createElement('svg', props, child1, child2, ...)` 或 `createElement('g', null, ...)` 把子节点写在第三参数及之后；**最终 return** 必须是 `createElement('div', …)` 包一层，勿 return 真实 DOM 节点。

**对象字面量里带连字符的 SVG 属性必须加引号**
- ❌ `marker-end: 'url(#arr)'` → 解析成 `marker - end`，前端 `Unexpected token '-'`
- ✅ `'marker-end': 'url(#arr)'`、`'stroke-width': 3`、`'text-anchor': 'middle'`

**3. SVG 元素构建**
```tsx
createElement('rect', { x: 0, y: 0, width: W, height: H, fill: '#0b1120' })
createElement('line', { x1, y1, x2, y2, stroke, strokeWidth })
createElement('circle', { cx, cy, r, fill, stroke, strokeWidth })
createElement('path', { d: 'M x,y A r,r 0 0,1 x2,y2', fill, stroke })
createElement('polyline', { points: 'x1,y1 x2,y2 x3,y3', fill, stroke })
createElement('text', { x, y, fill, fontSize, fontFamily: 'monospace', textAnchor: 'middle' }, 'label')
createElement('g', { transform: 'translate(x,y)' }, ...children)
```

**4. 箭头 marker（需在 defs 中声明）**
```tsx
createElement('defs', null,
  createElement('marker', { id: 'arr1', markerWidth: 10, markerHeight: 7, refX: 9, refY: 3.5, orient: 'auto' },
    createElement('polygon', { points: '0 0, 10 3.5, 0 7', fill: '#3b82f6' })
  )
)
// 使用：line 标签加 markerEnd: 'url(#arr1)'
```

**5. 交互控件（controls panel）**
```tsx
!readonly ? createElement('div', { style: { background: '#0f172a', padding: '10px 16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
  createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' } },
    createElement('span', { style: { color: '#60a5fa', fontFamily: 'monospace' } }, 'U'),
    createElement('input', { type: 'range', min: 1, max: 24, step: 0.5, value: V,
      onChange: function(e) { onStateChange({ voltage: parseFloat(e.target.value) }); },
      style: { width: '100px', accentColor: '#3b82f6' } }),
    createElement('span', { style: { fontFamily: 'monospace', color: '#60a5fa' } }, V + 'V')
  ),
  ...
) : null
```

**6. 颜色变量约定（统一暗色主题）**
| 含义 | 颜色 |
|---|---|
| 背景 | `#0b1120` |
| 面板背景 | `#0f172a` / `rgba(15,23,42,0.85)` |
| 边框/网格 | `#1e293b` |
| 电线（静态） | `#334155` |
| 电线（带电） | `#3b82f6` |
| 电阻/灯泡 | `#fbbf24` |
| 电流流动 | `#60a5fa` |
| 开关（闭合） | `#10b981` |
| 开关（断开） | `#f97316` |
| 文字（主） | `#d1d5db` |
| 文字（次） | `#94a3b8` |

### circuit_2d / 电路实验 — render_code 质量要求（禁止“简笔画”）

当 `renderer_profile` 为 `circuit_2d` 或 `visual_hint.renderSpec.topology` 为 `series` / `parallel` / 含电池与电阻时，**禁止**仅用纯色 `rect` 充当电阻、空白导线拼成方块。应接近教学用电路图质量，参考 `lab_prompts/examples.py` 中 Ohm 串联示例。

**1. 符号与结构（必须）**
- **全画布背景**：`svg` 内第一个子元素为 `createElement('rect', { x:0, y:0, width:W, height:H, fill:'#0b1120' })`。
- **电池**：`g` + `translate`，外框 `rect` + 多段 `line` 表示正负极（长短线），可选 `text` 标注 `E = …V`。
- **电阻**：`g` + `translate`，外框 `rect`（深色填充）+ **`polyline` 锯齿折线**（`strokeLinejoin:'round'`）表示电阻符号；**禁止**单独用黄色实心 `rect` 代替电阻图形。
- **导线**：粗 `line`（`strokeWidth` 3–4，`#334155`）；**电流示意**另用较细 `line` 叠层，`strokeDasharray:'10 18'`（或类似），`strokeDashoffset: -(anim * 28) % 28`，其中 `anim = (typeof t === 'number' && isFinite(t)) ? t : 0`。
- **布局**：用网格函数 `gx(x)/gy(y)`（`OFF + x*CELL`）或等效坐标，使回路占满画布中部，避免元件挤在左上角。
- **读数面板**：用 `g` 内多行 `text` 显示 **由公式算出的** `I`、分压、等效电阻等（与 `initial_state` 键一致）；不要只画静态几何而不显示计算结果。

**2. 物理与状态（必须）**
- 用 `rv` 读 `voltage`、`r1`/`r2`（或你定义的扁平键名），**在 JS 中计算** 串联/并联等效电阻、支路电流、分压等，再驱动 `text` 与导线高亮颜色（例如有电流时电阻描边用 `#fbbf24`，无电流用 `#374151`）。
- 布尔量用 **`function rb(k)`**（与规范一致），如 `showCurrent`、`switch_closed`；**禁止** `state['x'] === true` 与 `rb` 混用且无默认值处理。
- `showCurrent`（或等价键）为真时，**必须**出现可辨别的流动虚线层；为假时移除该层。禁止 `createElement('text', {...}, null)` 作为占位。

**3. 控件栏（必须）**
- 每个 `label` 内 **第一个 `span` 必须有可见文字**（如 `U`、`R1`、`R2`），**禁止** `createElement('span', {...}, null)` 或空标签。
- `input` 的 `value` 必须绑定 `rv` 读到的变量；`onStateChange` 的键名与 `initial_state` **完全一致**。

**4. 反模式（禁止）**
- 用两个黄色 `rect` 表示电阻、无电池符号、无公式面板、`showCurrent` 勾选后画面无变化。
- `text` 的文本子节点为 `null` / 未提供字符串。

### 安全约束
- 禁止 `eval` / `new Function`
- 禁止网络请求
- 禁止操作 DOM（除 render_code 返回的 React 元素树外）

### render_code 输出格式（必须严格遵守）

**`render_code` 必须是一个完整的函数定义，不是代码片段：**

```typescript
// ✅ 正确格式（props 用 const 解构；读 state 后用 var 或 const 均可）
"render_code": `export default function LabRenderer(props) {
  const {state, onStateChange, readonly, t} = props;
  function rv(k, d) { var v = state[k]; if (typeof v === 'number' && isFinite(v)) return v; return d; }
  function rb(k) { var v = state[k]; return !(v === false || v === 0); }
  var V = rv('voltage', 12);
  const r1 = rv('r1', 100);
  // ... 其余变量与 SVG ...
  return createElement('div', { style: { background: '#0b1120', borderRadius: '10px' } }, svg, controls);
}`

// ❌ 错误格式 - 缺少 export default function 包装
"render_code": `var svg = createElement('svg', {...});
return createElement('div', {...});`

// ❌ 错误格式 - 在模板字符串内输出实际换行（应用 \n 转义）
```

**关键要求：**
1. 必须以 `export default function LabRenderer(props) {` 开头
2. 必须从 props 解构运行接口：`const {state, onStateChange, readonly, t} = props;`（勿从 props 解构 initial_state 标量键）
3. 必须有辅助函数：`function rv(k, d) {...}` 和 `function rb(k) {...}`（布尔 state 需用 rb）
4. 从 state 读出的局部量：**`var` 与 `const`/`let` 均可**（在 rv/rb 定义之后）
5. 必须返回 createElement 调用的结果（React 虚拟节点，禁止 `document.createElement` / 真实 DOM）
6. 模板字符串内的换行用 `\n`，双引号用 `\"`"""

# ---------------------------------------------------------------------------
# Quick Generation Mode
# ---------------------------------------------------------------------------
QUICK_GENERATION_MODE = """\
### 快速生成模式
If the teacher's request is already specific (topic, parameters, interactive elements), generate the LabComponentDefinition JSON directly. Do NOT ask generic clarifying questions — proceed immediately.

### 模糊请求处理
If the request is vague (e.g. "make a physics lab"), ask ONE focused clarifying question about the key concept or phenomenon."""

# ---------------------------------------------------------------------------
# 关键规则汇总
# ---------------------------------------------------------------------------
KEY_RULES = """\
## 关键规则
1. **renderSpec 必填** — 每个 visual_hint 必须包含完整的 renderSpec（topology / components / wires / drawing_commands）
2. **render_code 强制** — 所有实验都必须输出完整的 TSX 代码
3. **SVG createElement** — render_code 中禁止使用 Canvas API，必须使用 SVG 虚拟元素
4. **Flat initial_state** — 禁止嵌套对象，key 必须是一级标量
5. **合法 JSON** — lab_definition 代码块内必须是严格合法 JSON（render_code 值是反引号字符串）
6. **registry_key 唯一** — 同一实验不同配置用不同 registry_key（如 series / parallel）
7. **dimension 匹配** — `*_2d` → `"2d"`；`*_3d` → `"3d"`
8. **circuit_2d 质量** — 电路 `render_code` 须含电池/电阻符号（锯齿 polyline）、物理量计算面板、`showCurrent` 时用 `t` 驱动虚线流动；控件标签不得为空
9. **布尔键一致** — `showCurrent/showVoltage/showLabels/switchClosed` 等必须是 boolean，render_code 中用 `rb()` 读取
10. **交互覆盖强制** — 每个实验必须提供至少 1 个控件，并通过 `onStateChange({ ... })` 写回 state；禁止仅静态示意图"""
