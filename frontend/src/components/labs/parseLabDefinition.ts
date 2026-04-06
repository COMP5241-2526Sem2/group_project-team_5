/**
 * Parse uploaded lab definition JSON (camelCase or snake_case, backend-compatible).
 * Handles AI-generated wrappers like { type: 'lab_definition', definition: {...} }.
 */

/** Strip BOM, leading `json{` / `json{{` chat artifact, optional ```json fence — for file / paste upload */
export function sanitizeLabDefinitionFileText(text: string): string {
  let t = String(text).replace(/^\uFEFF/, '').trim();
  if (/^json\s*\{\{/i.test(t)) {
    t = t.replace(/^json\s*/i, '').replace(/^\s*\{\{/, '{');
  } else if (/^json\s*\{/i.test(t)) {
    t = t.replace(/^json\s*/i, '');
  }
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)```\s*$/im.exec(t);
  if (fence) t = fence[1].trim();
  return t;
}
import type {
  LabCommandType,
  LabComponentDefinition,
  RendererProfile,
  SubjectLab,
  VisualHint,
  RenderSpec,
  RenderSpecComponent,
  RenderSpecWire,
  RenderSpecLayout,
  RenderSpecDrawingCommand,
  RenderSpecAnnotation,
} from './types';
import { isUsableRenderCode } from '@/api/labs';
import { flattenInitialState } from './flattenInitialState';

const SUBJECTS: SubjectLab[] = ['math', 'physics', 'chemistry', 'biology', 'dynamic'];

const RENDERER_PROFILES: RendererProfile[] = [
  'circuit_2d',
  'function_2d',
  'geometry_3d',
  'molecule_3d',
  'cell_3d',
  'mechanics_3d',
  'generic_2d',
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Unwrap AI wrapper: { type: 'lab_definition', definition: {...} } → {...} */
function unwrapAiWrapper(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const inner = raw['definition'] ?? raw['data'];
  if (isRecord(inner)) return inner;
  return raw;
}

/** Auto-generate a registry_key from subject + title when not provided. */
function buildRegistryKey(subject: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `${subject}.${slug}`.replace(/__+/g, '_') || `${subject}.unnamed`;
}

function pickStr(obj: Record<string, unknown>, camel: string, snake: string): string | undefined {
  const a = obj[camel];
  const b = obj[snake];
  if (typeof a === 'string' && a.trim()) return a.trim();
  if (typeof b === 'string' && b.trim()) return b.trim();
  return undefined;
}

function pickSubject(obj: Record<string, unknown>): SubjectLab | undefined {
  const raw = pickStr(obj, 'subjectLab', 'subject_lab')?.toLowerCase();
  if (!raw) return undefined;
  return SUBJECTS.includes(raw as SubjectLab) ? (raw as SubjectLab) : undefined;
}

/** Map AI / legacy prompt names to frontend RendererProfile */
const RENDERER_ALIASES: Record<string, RendererProfile> = {
  chemistry_reaction: 'generic_2d',
  bio_cell: 'cell_3d',
  dynamic: 'mechanics_3d',
  mechanics: 'mechanics_3d',
  molecule: 'molecule_3d',
  cell: 'cell_3d',
  generic: 'generic_2d',
  function: 'function_2d',
  circuit: 'circuit_2d',
  /** LLM 光学实验常用名，前端统一落到 generic_2d（与 render_code 分支一致） */
  optics_2d: 'generic_2d',
  optics: 'generic_2d',
  /** LLM 生物过程/光合作用等常用名（见 lab_service / 原始会话 bio_2d） */
  bio_2d: 'generic_2d',
  biology_2d: 'generic_2d',
};

function pickRenderer(obj: Record<string, unknown>): RendererProfile | undefined {
  const raw = pickStr(obj, 'rendererProfile', 'renderer_profile')?.toLowerCase();
  if (!raw) return undefined;
  const underscored = raw.replace(/-/g, '_');
  if (RENDERER_ALIASES[underscored]) return RENDERER_ALIASES[underscored];
  const normalized = underscored as RendererProfile;
  return RENDERER_PROFILES.includes(normalized) ? normalized : undefined;
}

/** Extract balanced `{ ... }` from position (respects JSON strings). */
function extractBalancedJsonObject(text: string, start: number): string | null {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function collapseDoubleBracesOnce(s: string): string {
  return s.replace(/\{\{/g, '{').replace(/\}\}/g, '}');
}

/** Parse JSON; on failure, collapse model-style `{{` / `}}` repeatedly (valid JSON succeeds on first try). */
function tryParseJsonLenient(raw: string): unknown | null {
  let s = raw.trim();
  for (let pass = 0; pass < 12; pass++) {
    try {
      return JSON.parse(s);
    } catch {
      const next = collapseDoubleBracesOnce(s);
      if (next === s) return null;
      s = next;
    }
  }
  return null;
}

/**
 * Try to parse a lab definition from free-form assistant text (fenced JSON or raw object).
 */
export function tryParseLabDefinitionFromText(text: string): ParseLabResult {
  let work = String(text).trim();
  if (/^json\s*\{\{/i.test(work)) {
    work = work.replace(/^json\s*/i, '').replace(/^\s*\{\{/, '{');
  }
  const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(work)) !== null) {
    const chunk = m[1].trim();
    const parsed = tryParseJsonLenient(chunk);
    if (parsed === null) continue;
    const res = parseLabDefinitionJson(parsed);
    if (res.ok) return res;
  }
  for (let i = 0; i < work.length; i++) {
    if (work[i] !== '{') continue;
    const slice = extractBalancedJsonObject(work, i);
    if (!slice) continue;
    const parsed = tryParseJsonLenient(slice);
    if (parsed === null) continue;
    const res = parseLabDefinitionJson(parsed);
    if (res.ok) return res;
  }
  return { ok: false, error: '在文本中未找到可解析的 Lab 定义 JSON' };
}

function pickState(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const a = obj.initialState;
  const b = obj.initial_state;
  const s = a ?? b;
  if (isRecord(s)) return s;
  return undefined;
}

function pickReducer(obj: Record<string, unknown>): LabComponentDefinition['reducerSpec'] {
  const a = obj.reducerSpec;
  const b = obj.reducer_spec;
  const r = a ?? b;
  if (!isRecord(r)) return undefined;
  const allowed = r.allowedCommands ?? r.allowed_commands;
  const out: NonNullable<LabComponentDefinition['reducerSpec']> = {} as NonNullable<
    LabComponentDefinition['reducerSpec']
  >;
  if (Array.isArray(allowed) && allowed.every(x => typeof x === 'string')) {
    out.allowedCommands = allowed as LabCommandType[];
  }
  if (typeof r.maxNodes === 'number') out.maxNodes = r.maxNodes;
  if (typeof r.maxConnections === 'number') out.maxConnections = r.maxConnections;
  return Object.keys(out).length ? out : undefined;
}

function pickMetadata(obj: Record<string, unknown>): LabComponentDefinition['metadata'] {
  const a = obj.metadata;
  const b = obj.lab_metadata;
  const m = a ?? b;
  if (!isRecord(m)) return undefined;
  const grade = typeof m.grade === 'string' ? m.grade : undefined;
  const topic = typeof m.topic === 'string' ? m.topic : undefined;
  const createdBy = typeof m.createdBy === 'string' ? m.createdBy : typeof m.created_by === 'string' ? m.created_by : undefined;
  const version = typeof m.version === 'number' ? m.version : undefined;
  if (!grade && !topic && !createdBy && version === undefined) return undefined;
  return { grade, topic, createdBy, version };
}

function pickStatus(obj: Record<string, unknown>): 'draft' | 'published' | 'deprecated' {
  const s = pickStr(obj, 'status', 'status')?.toLowerCase();
  if (s === 'published' || s === 'deprecated' || s === 'draft') return s;
  return 'draft';
}

/** AI TSX canvas component; snake_case from API, camelCase from some models.
 *  也支持整个 lab-definition JSON 对象被误当成 render_code 传入的情况：
 *  检测到字符串以 `{` 开头则尝试解析内层 `renderCode` / `render_code` 字段。 */
function pickRenderCode(obj: Record<string, unknown>): string | undefined {
  const a = obj.renderCode;
  const b = obj.render_code;

  // Case 1 — 正常的 render_code 字符串
  if (typeof a === 'string' && isUsableRenderCode(a)) return a;
  if (typeof b === 'string' && isUsableRenderCode(b)) return b;

  // Case 2 — 整个 JSON 对象被误传进来（LLM 的一次性回复中，
  //   render_code 字段里嵌套了完整 lab-definition JSON，
  //   或保存时写错了字段名）
  if (typeof a === 'string') {
    const inner = tryExtractRenderCodeFromJson(a);
    if (inner) return inner;
  }
  if (typeof b === 'string') {
    const inner = tryExtractRenderCodeFromJson(b);
    if (inner) return inner;
  }

  return undefined;
}

/** 检测字符串是否为 JSON 且含 renderCode/render_code，是则返回其值；否则返回 null。 */
function tryExtractRenderCodeFromJson(s: string): string | undefined {
  try {
    const t = s.trim();
    // 必须是 JSON 对象字面量
    if (!t.startsWith('{')) return undefined;
    const parsed = JSON.parse(t) as Record<string, unknown>;
    const rc = (parsed['renderCode'] ?? parsed['render_code']) as string | undefined;
    if (typeof rc === 'string' && isUsableRenderCode(rc)) return rc;
    return undefined;
  } catch {
    return undefined;
  }
}

/** visual_profile — DynamicLabHost built-in template name (ph_slider, snells_law, …) */
function pickVisualProfile(obj: Record<string, unknown>): string | undefined {
  const a = obj.visualProfile;
  const b = obj.visual_profile;
  if (typeof a === 'string' && a.trim()) return a;
  if (typeof b === 'string' && b.trim()) return b;
  return undefined;
}

// ── renderSpec 解析 ──────────────────────────────────────────────────────────────

function coerceNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Deep-clone visual_hint so merge/sanitize never mutates SSE / 上传的原始对象 */
function cloneRecord(raw: Record<string, unknown>): Record<string, unknown> {
  try {
    return structuredClone(raw) as Record<string, unknown>;
  } catch {
    return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  }
}

function pickRenderSpecWire(w: unknown): RenderSpecWire | null {
  if (!isRecord(w)) return null;
  const from = typeof w.from === 'string' ? w.from : undefined;
  const to = typeof w.to === 'string' ? w.to : undefined;
  if (!from || !to) return null;
  return {
    from,
    to,
    id: typeof w.id === 'string' ? w.id : undefined,
    label: typeof w.label === 'string' ? w.label : undefined,
    style:
      typeof w.style === 'string' && ['solid', 'dashed', 'bold'].includes(w.style)
        ? w.style as RenderSpecWire['style']
        : undefined,
  };
}

function pickRenderSpecComponent(c: unknown): RenderSpecComponent | null {
  if (!isRecord(c)) return null;
  const id = typeof c.id === 'string' ? c.id : undefined;
  const type = typeof c.type === 'string' ? c.type : undefined;
  if (!id || !type) return null;
  return {
    id,
    type: type as RenderSpecComponent['type'],
    label: typeof c.label === 'string' ? c.label : undefined,
    value_key: typeof c.value_key === 'string' ? c.value_key : undefined,
    unit: typeof c.unit === 'string' ? c.unit : undefined,
    x: coerceNumber(c.x),
    y: coerceNumber(c.y),
    direction:
      typeof c.direction === 'string' && ['h', 'v', 'h_flip', 'v_flip'].includes(c.direction)
        ? c.direction as RenderSpecComponent['direction']
        : undefined,
    properties: isRecord(c.properties) ? c.properties : undefined,
  };
}

function pickRenderSpecLayout(l: unknown): RenderSpecLayout | null {
  if (!isRecord(l) && l !== undefined) return null;
  if (l === undefined) return {};
  const out: RenderSpecLayout = {};
  if (typeof l.rows === 'number') out.rows = l.rows;
  if (typeof l.cols === 'number') out.cols = l.cols;
  if (typeof l.direction === 'string' && ['lr', 'rl', 'tb', 'bt'].includes(l.direction)) {
    out.direction = l.direction as RenderSpecLayout['direction'];
  }
  if (typeof l.align === 'string' && ['top', 'center', 'bottom', 'left', 'right'].includes(l.align)) {
    out.align = l.align as RenderSpecLayout['align'];
  }
  if (typeof l.spacing === 'number') out.spacing = l.spacing;
  if (typeof l.padding === 'number') out.padding = l.padding;
  return out;
}

function pickRenderSpecDrawingCommand(cmd: unknown): RenderSpecDrawingCommand | null {
  if (!isRecord(cmd)) return null;
  const type = typeof cmd.type === 'string' ? cmd.type : undefined;
  const attrs = isRecord(cmd.attrs) ? cmd.attrs : {};
  if (!type) return null;
  const out: RenderSpecDrawingCommand = { type, attrs };
  if (typeof cmd.stroke === 'string') out.stroke = cmd.stroke;
  if (typeof cmd.fill === 'string') out.fill = cmd.fill;
  if (typeof cmd.lineWidth === 'number') out.lineWidth = cmd.lineWidth;
  if (cmd.dash !== undefined && Array.isArray(cmd.dash)) out.dash = cmd.dash;
  if (cmd.label !== undefined && isRecord(cmd.label)) {
    const lb = cmd.label as Record<string, unknown>;
    out.label = {
      text: typeof lb.text === 'string' ? lb.text : '',
      x: typeof lb.x === 'number' ? lb.x : 0,
      y: typeof lb.y === 'number' ? lb.y : 0,
      fontSize: typeof lb.fontSize === 'number' ? lb.fontSize : undefined,
      fontFamily: typeof lb.fontFamily === 'string' ? lb.fontFamily : undefined,
      color: typeof lb.color === 'string' ? lb.color : undefined,
    };
  }
  if (cmd.formula !== undefined && isRecord(cmd.formula)) {
    const fm = cmd.formula as Record<string, unknown>;
    out.formula = {
      text: typeof fm.text === 'string' ? fm.text : '',
      x: typeof fm.x === 'number' ? fm.x : 0,
      y: typeof fm.y === 'number' ? fm.y : 0,
      latex: typeof fm.latex === 'string' ? fm.latex : undefined,
      fontSize: typeof fm.fontSize === 'number' ? fm.fontSize : undefined,
      color: typeof fm.color === 'string' ? fm.color : undefined,
    };
  }
  if (typeof cmd.arrowHead === 'string') out.arrowHead = cmd.arrowHead as RenderSpecDrawingCommand['arrowHead'];
  if (typeof cmd.arrowHeadAngle === 'number') out.arrowHeadAngle = cmd.arrowHeadAngle;
  if (typeof cmd.d === 'string') out.d = cmd.d;
  return out;
}

function pickRenderSpecAnnotation(a: unknown): RenderSpecAnnotation | null {
  if (!isRecord(a)) return null;
  const key = typeof a.key === 'string' ? a.key : undefined;
  const label = typeof a.label === 'string' ? a.label : typeof a.key === 'string' ? a.key : undefined;
  if (!key || !label) return null;
  return {
    key,
    label,
    formula: typeof a.formula === 'string' ? a.formula : undefined,
    x: typeof a.x === 'number' ? a.x : undefined,
    y: typeof a.y === 'number' ? a.y : undefined,
    px: typeof a.px === 'number' ? a.px : undefined,
    py: typeof a.py === 'number' ? a.py : undefined,
    color: typeof a.color === 'string' ? a.color : undefined,
    fontSize: typeof a.fontSize === 'number' ? a.fontSize : undefined,
  };
}

function pickRenderSpec(raw: unknown): RenderSpec | undefined {
  if (!isRecord(raw)) return undefined;
  const out: RenderSpec = {};
  // topology
  const topo = raw.topology;
  if (typeof topo === 'string') out.topology = topo as RenderSpec['topology'];
  // components
  if (Array.isArray(raw.components)) {
    const comps = raw.components.map(pickRenderSpecComponent).filter(Boolean) as RenderSpecComponent[];
    if (comps.length) out.components = comps;
  }
  // wires
  if (Array.isArray(raw.wires)) {
    const wires = raw.wires.map(pickRenderSpecWire).filter(Boolean) as RenderSpecWire[];
    if (wires.length) out.wires = wires;
  }
  // layout
  const layout = pickRenderSpecLayout(raw.layout);
  if (layout && Object.keys(layout).length) out.layout = layout;
  // drawing_commands
  if (Array.isArray(raw.drawing_commands)) {
    const cmds = raw.drawing_commands.map(pickRenderSpecDrawingCommand).filter(Boolean) as RenderSpecDrawingCommand[];
    if (cmds.length) out.drawing_commands = cmds;
  }
  // annotations
  if (Array.isArray(raw.annotations)) {
    const anns = raw.annotations.map(pickRenderSpecAnnotation).filter(Boolean) as RenderSpecAnnotation[];
    if (anns.length) out.annotations = anns;
  }
  // canvas
  if (isRecord(raw.canvas)) {
    const cv = raw.canvas;
    out.canvas = {};
    if (typeof cv.width === 'number') out.canvas.width = cv.width;
    if (typeof cv.height === 'number') out.canvas.height = cv.height;
  }
  // grid
  if (isRecord(raw.grid)) {
    const g = raw.grid;
    out.grid = {
      show: typeof g.show === 'boolean' ? g.show : undefined,
      spacing: typeof g.spacing === 'number' ? g.spacing : undefined,
      color: typeof g.color === 'string' ? g.color : undefined,
    };
  }
  // axis
  if (isRecord(raw.axis)) {
    const ax = raw.axis;
    out.axis = {
      show: typeof ax.show === 'boolean' ? ax.show : undefined,
      xLabel: typeof ax.xLabel === 'string' ? ax.xLabel : undefined,
      yLabel: typeof ax.yLabel === 'string' ? ax.yLabel : undefined,
      origin: typeof ax.origin === 'boolean' ? ax.origin : undefined,
    };
  }
  // 与原始对象合并：校验字段覆盖 LLM 输出，其余键原样保留以便落库 / 渲染
  if (Object.keys(out).length === 0) {
    return { ...raw } as RenderSpec;
  }
  return { ...raw, ...out } as RenderSpec;
}

// ── VisualHint 解析 ─────────────────────────────────────────────────────────────

function pickVisualHint(obj: Record<string, unknown>): VisualHint | undefined {
  const a = obj.visual_hint;
  const b = obj.visualHint;
  const raw = (isRecord(a) ? a : isRecord(b) ? b : null);
  if (!raw) return undefined;

  const base = cloneRecord(raw);

  const renderSpecRaw = raw.renderSpec ?? raw.render_spec;
  if (renderSpecRaw !== undefined) {
    const merged = pickRenderSpec(renderSpecRaw);
    if (merged) {
      base.renderSpec = merged as Record<string, unknown>;
    } else if (isRecord(renderSpecRaw)) {
      base.renderSpec = renderSpecRaw;
    }
    delete base.render_spec;
  }

  return Object.keys(base).length > 0 ? (base as unknown as VisualHint) : undefined;
}

export type ParseLabResult =
  | { ok: true; definition: LabComponentDefinition }
  | { ok: false; error: string };

/**
 * Parse arbitrary JSON into LabComponentDefinition; returns a readable error on failure.
 * Handles AI-generated wrappers, auto-generates registry_key, infers render mode from visual_hint.
 */
export function parseLabDefinitionJson(raw: unknown): ParseLabResult {
  const obj = unwrapAiWrapper(raw);
  if (!isRecord(obj)) {
    return { ok: false, error: 'Root value must be a JSON object' };
  }

  const title = pickStr(obj, 'title', 'title') ?? 'Untitled Lab';

  const registryKey =
    pickStr(obj, 'registryKey', 'registry_key') ??
    buildRegistryKey(pickSubject(obj) ?? 'dynamic', title);

  const subjectLab = pickSubject(obj);
  if (!subjectLab) {
    return { ok: false, error: 'Invalid subject_lab / subjectLab; use math|physics|chemistry|biology|dynamic' };
  }

  const rendererProfile = pickRenderer(obj);
  if (!rendererProfile) {
    return {
      ok: false,
      error: `Invalid renderer_profile; allowed: ${RENDERER_PROFILES.join(', ')}`,
    };
  }

  const initialState = pickState(obj);
  if (!initialState) {
    return { ok: false, error: 'Missing initial_state or initialState object' };
  }

  const description = pickStr(obj, 'description', 'description');
  const reducerSpec = pickReducer(obj);
  const metadata = pickMetadata(obj);
  const status = pickStatus(obj);
  const visual_hint = pickVisualHint(obj);
  const renderCode = pickRenderCode(obj);
  const visualProfile = pickVisualProfile(obj);
  // Always flatten initialState so nested AI output becomes flat scalar fields
  const flatState = flattenInitialState(initialState);

  const definition: LabComponentDefinition = {
    registryKey,
    subjectLab,
    title,
    description,
    rendererProfile,
    initialState: flatState,
    reducerSpec,
    metadata,
    status,
    ...(visual_hint ? { visual_hint } : {}),
    ...(renderCode ? { renderCode } : {}),
    ...(visualProfile ? { visualProfile } : {}),
  };

  return { ok: true, definition };
}
