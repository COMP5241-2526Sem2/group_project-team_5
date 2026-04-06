// ── Lab 类型系统 ─────────────────────────────────────────────────────────────

export type SubjectLab = 'math' | 'physics' | 'chemistry' | 'biology' | 'dynamic';

// ── LabCommand 协议 ───────────────────────────────────────────────────────────
export type LabCommandType =
  // 通用
  | 'SET_PARAM'
  | 'RESET'
  | 'SET_STATE'
  // 电路专项
  | 'ADD_COMPONENT'
  | 'REMOVE_COMPONENT'
  | 'TOGGLE_SWITCH'
  | 'SET_RESISTANCE'
  | 'CONNECT'
  | 'DISCONNECT'
  // 函数图像
  | 'SET_FUNCTION'
  | 'ADD_CURVE'
  | 'REMOVE_CURVE'
  // 几何
  | 'SET_SHAPE'
  | 'SET_ANGLE'
  // 分子
  | 'HIGHLIGHT_ATOM'
  | 'SET_MOLECULE'
  // 细胞
  | 'HIGHLIGHT_ORGANELLE'
  | 'TOGGLE_LAYER';

export interface LabCommand {
  type: LabCommandType;
  payload?: Record<string, unknown>;
  description?: string;
}

// ── Lab State 基础 ────────────────────────────────────────────────────────────
export interface LabState {
  [key: string]: unknown;
}

// ── RenderSpec — AI 提供的结构化渲染施工图 ─────────────────────────────────────
/** 归一化网格坐标 [0, cols/rows] 用于电路/光学等拓扑布局 */
export interface RenderSpecPosition {
  x: number;
  y: number;
}

/** 电路元件 */
export type RenderSpecComponentType =
  | 'battery' | 'resistor' | 'capacitor' | 'inductor'
  | 'bulb' | 'switch' | 'wire' | 'ground'
  | 'ammeter' | 'voltmeter' | 'fuse' | 'diode';

/** 光学元件 */
export type RenderSpecOpticsType =
  | 'wave_source' | 'prism' | 'lens' | 'mirror'
  | 'slit' | 'screen' | 'medium' | 'ray' | 'normal';

/** 摆/力学元件 */
export type RenderSpecMechanicsType =
  | 'pendulum_bob' | 'spring' | 'pivot' | 'string'
  | 'mass_block' | 'inclined_plane' | 'ramp' | 'arrow';

/** 通用元件 */
export type RenderSpecGenericType =
  | 'planet' | 'orbit' | 'arrow' | 'particle'
  | 'cell_membrane' | 'organelle' | 'molecule';

/** 所有元件类型联合 */
export type RenderSpecElementType =
  | RenderSpecComponentType
  | RenderSpecOpticsType
  | RenderSpecMechanicsType
  | RenderSpecGenericType
  | string;  // 允许未预定义的类型

export interface RenderSpecComponent {
  id: string;
  /** 元件类型，影响渲染器的绘图方式 */
  type: RenderSpecElementType;
  /** 人类可读标签（如 "R₁", "V", "E"） */
  label?: string;
  /** 绑定到 initial_state 中的 key，值作为元件参数值显示 */
  value_key?: string;
  unit?: string;
  /** 网格坐标（用于电路图/2D 拓扑） */
  x?: number;
  y?: number;
  /** 元件方向（影响符号旋转方向） */
  direction?: 'h' | 'v' | 'h_flip' | 'v_flip';
  /** 元件特定属性（如棱镜顶角、透镜焦距等） */
  properties?: Record<string, unknown>;
}

export interface RenderSpecWire {
  id?: string;
  /** 起点格式：componentId 或 componentId.pin */
  from: string;
  /** 终点格式：componentId 或 componentId.pin */
  to: string;
  label?: string;
  /** 线型：实线/虚线/粗线 */
  style?: 'solid' | 'dashed' | 'bold';
}

export interface RenderSpecLayout {
  rows?: number;
  cols?: number;
  /** 主方向：lr=左→右, rl, tb=上→下, bt */
  direction?: 'lr' | 'rl' | 'tb' | 'bt';
  align?: 'top' | 'center' | 'bottom' | 'left' | 'right';
  /** 元件间距因子（相对 CELL 大小） */
  spacing?: number;
  padding?: number;
}

/**
 * 直接 Canvas2D 绘图指令（AI 提供完整画布操作，绕过模板）。
 * type 映射到 Canvas2D API：
 *   arc      → ctx.arc(attrs.x, attrs.y, attrs.r, attrs.startAngle, attrs.endAngle)
 *   line     → ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2)
 *   circle   → ctx.arc(x, y, r, 0, Math.PI*2)
 *   rect     → ctx.rect(x, y, width, height)
 *   arrow    → 自定义箭头（从 drawArrow helper）
 *   text     → ctx.fillText(label.text, label.x, label.y)
 *   path     → ctx.stroke(new Path2D(attrs.d)) 支持 SVG path d 语法
 *   polygon  → ctx.beginPath() +多边形点
 *   arcPath  → 扇形填充
 *   curve    → ctx.quadraticCurveTo / bezierCurveTo
 */
export interface RenderSpecDrawingCommand {
  type:
    | 'arc' | 'arcPath' | 'line' | 'circle' | 'rect'
    | 'arrow' | 'text' | 'path' | 'polygon' | 'curve' | 'bezier'
    | 'filledRect' | 'filledCircle' | 'filledArc' | 'filledPolygon'
    | 'gradientRect' | 'dashedLine' | 'doubleLine'
    | 'label' | 'formula' | 'dimension' | 'angleArc' | 'spring' | 'pendulumString'
    | string;
  /** Canvas2D 坐标/尺寸属性（x, y, x1, y1, x2, y2, width, height, r, startAngle, endAngle …） */
  attrs: Record<string, number | string | undefined>;
  /** 描边颜色 */
  stroke?: string;
  /** 填充颜色 */
  fill?: string;
  /** 线宽 */
  lineWidth?: number;
  /** 标签/文字内容 */
  label?: {
    text: string;
    x: number;
    y: number;
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
  };
  /** 标注公式（渲染在 attrs 指定位置） */
  formula?: {
    latex?: string;
    text: string;
    x: number;
    y: number;
    fontSize?: number;
    color?: string;
  };
  /** dash pattern for dashed lines */
  dash?: number[];
  /** end of arrow head (only for type='arrow') */
  arrowHead?: 'triangle' | 'bar' | 'none';
  arrowHeadAngle?: number;
  /** Path2D d attribute (SVG path syntax, only for type='path') */
  d?: string;
}

export interface RenderSpecAnnotation {
  /** 绑定到 initial_state 中的 key */
  key: string;
  label: string;
  /** LaTeX 或显示文本公式 */
  formula?: string;
  /** 归一化画布坐标 [0-1] */
  x?: number;
  y?: number;
  /** 像素坐标（优先级高于归一化） */
  px?: number;
  py?: number;
  color?: string;
  fontSize?: number;
}

export interface RenderSpec {
  /**
   * 拓扑类型（用于渲染器选择和自动布局）。
   * 已知拓扑类型由渲染器提供专用绘制逻辑；
   * "custom" 或未知类型走 drawing_commands 或 generic fallback。
   */
  topology?:
    | 'series'
    | 'parallel'
    | 'series_parallel'
    | 'bridge'
    | 'custom'
    | 'lens_array'
    | 'pendulum_chain'
    | 'ray_diagram'
    | 'orbital'
    | 'diffusion_grid'
    | 'wave_interference'
    | 'custom';

  /** 元件列表（AI 显式声明要画哪些元件及位置） */
  components?: RenderSpecComponent[];

  /** 连线/连接列表 */
  wires?: RenderSpecWire[];

  /** 自动布局提示 */
  layout?: RenderSpecLayout;

  /**
   * 直接 Canvas2D 绘图指令（最高优先级）。
   * 当 AI 需要超越模板绘制能力时使用（如复杂光路、动画路径）。
   * 每条指令映射到 Canvas2D API 调用。
   */
  drawing_commands?: RenderSpecDrawingCommand[];

  /** 数学标注（叠加在画布上） */
  annotations?: RenderSpecAnnotation[];

  /** 画布尺寸覆盖（单位：px） */
  canvas?: { width?: number; height?: number };

  /** 背景网格配置 */
  grid?: {
    show?: boolean;
    spacing?: number;
    color?: string;
  };

  /** 坐标轴配置 */
  axis?: {
    show?: boolean;
    xLabel?: string;
    yLabel?: string;
    origin?: boolean;
  };
}

// ── VisualHint（扩展）────────────────────────────────────────────────────────
export interface VisualHint {
  type?: VisualHintType;
  primary_concept?: string;
  animate?: string[];
  annotations?: VisualHintAnnotation[];
  colors?: VisualHintColors;
  /**
   * AI 提供的结构化渲染施工图。
   * 当存在时，前端渲染器优先使用 renderSpec（拓扑/布局/直接绘图指令），
   * 绕过预设 drawXxx 模板，实现 AI 描述的精确可视化。
   */
  renderSpec?: RenderSpec;
}

export type VisualHintType =
  | 'wave'
  | 'pendulum'
  | 'particle'
  | 'field'
  | 'curve'
  | 'geometric'
  | 'dynamic2d'
  | 'mixed'
  | 'circuit'
  | 'auto';

export interface VisualHintAnnotation {
  key: string;
  label: string;
  formula?: string;
}

export interface VisualHintColors {
  primary?: string;
  secondary?: string;
  accent?: string;
}

export type RendererProfile =
  | 'circuit_2d'
  | 'function_2d'
  | 'geometry_3d'
  | 'molecule_3d'
  | 'cell_3d'
  | 'mechanics_3d'
  | 'generic_2d';

export interface LabComponentDefinition {
  registryKey: string;
  subjectLab: SubjectLab;
  title: string;
  description?: string;
  rendererProfile: RendererProfile;
  /** AI 描述的渲染意图 — 前端根据此选择 Canvas2D 渲染策略，未指定时自动推断 */
  visual_hint?: VisualHint;
  /** 指定 DynamicLabHost 内置可视化模板，如 ph_slider、snells_law 等 */
  visualProfile?: string;
  /**
   * AI 生成的完整 TSX 渲染组件代码，优先级高于 visual_hint.renderSpec。
   * 前端通过 new Function() 执行，存入数据库。
   */
  renderCode?: string;
  initialState: LabState;
  reducerSpec?: {
    allowedCommands: LabCommandType[];
    maxNodes?: number;
    maxConnections?: number;
  };
  metadata?: {
    grade?: string;
    topic?: string;
    createdBy?: string;
    version?: number;
  };
  status: 'draft' | 'published' | 'deprecated';
}

// ── Slide & Deck ──────────────────────────────────────────────────────────────
export type BlockType = 'text' | 'interactive' | 'exercise_walkthrough' | 'image';
export type DeckSource = 'kb_ai' | 'ppt_import' | 'hybrid' | 'manual';

export interface TextBlock {
  id: string;
  type: 'text';
  content: string;
}

export interface InteractiveBlock {
  id: string;
  type: 'interactive';
  widgetType: string;
  labInstanceId: string;
  initialState: LabState;
  subjectLab: SubjectLab;
  allowedCommands?: LabCommandType[];
}

export interface ExerciseWalkthroughBlock {
  id: string;
  type: 'exercise_walkthrough';
  question: string;
  steps: Array<{
    id: string;
    text: string;
    labInstanceId?: string;
    targetState?: LabState;
  }>;
}

export type SlideBlock = TextBlock | InteractiveBlock | ExerciseWalkthroughBlock;

export interface LabEntry {
  label: string;
  widgetType: string;
  labInstanceId?: string;
  initialState?: LabState;
  presentationMode?: 'fullscreen' | 'split';
}

export interface Slide {
  id: string;
  title: string;
  blocks: SlideBlock[];
  labEntry?: LabEntry;
  notes?: string;
}

export interface LessonDeck {
  id: string;
  title: string;
  subject: SubjectLab | string;
  grade: string;
  deckSource: DeckSource;
  status: 'draft' | 'published';
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
  teacherId: string;
  thumbnail?: string;
}

// ── AI Chat message ───────────────────────────────────────────────────────────
export type ChatRole = 'user' | 'assistant' | 'system';
export type ChatMode = 'drive_lab' | 'generate_lab';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  commands?: LabCommand[];
  /** Single definition (backward compat) */
  pendingDefinition?: LabComponentDefinition;
  definition?: LabComponentDefinition;
  commitNotice?: string;
  /** Multiple definition candidates from a single LLM response (regenerate flow) */
  definitionCandidates?: LabComponentDefinition[];
  /** Index of the currently selected candidate (default 0) */
  selectedCandidateIndex?: number;
  timestamp: number;
  streaming?: boolean;
}

// ── Registry entry ────────────────────────────────────────────────────────────
export interface RegistryEntry {
  widgetType: string;
  component: React.ComponentType<LabWidgetProps>;
  subject: SubjectLab;
  label: string;
  description: string;
  defaultState: LabState;
  thumbnail?: string;
}

export interface LabWidgetProps {
  state: LabState;
  onStateChange?: (patch: Partial<LabState>) => void;
  dispatch?: (cmd: LabCommand) => void;
  readonly?: boolean;
  height?: number;
}
