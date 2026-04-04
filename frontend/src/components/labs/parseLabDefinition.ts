/**
 * Parse uploaded lab definition JSON (camelCase or snake_case, backend-compatible).
 * Handles AI-generated wrappers like { type: 'lab_definition', definition: {...} }.
 */
import type {
  LabCommandType,
  LabComponentDefinition,
  RendererProfile,
  SubjectLab,
} from './types';

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

/** Auto-infer visualProfile from initialState shape (for AI-generated labs). */
function inferVisualProfile(state: Record<string, unknown>): string | undefined {
  if ('ph' in state) return 'ph_slider';
  if (
    'theta1' in state
    || 'incident_angle' in state
    || 'incidentAngle' in state
    || ('n1' in state && 'n2' in state)
  ) {
    return 'snells_law';
  }
  if ('amplitude' in state || 'frequency' in state) return 'wave_oscillation';
  if ('angle' in state && ('mass' in state || 'gravity' in state)) return 'mechanics_slider';
  if ('moleculeKey' in state || 'atomCount' in state) return 'molecule_viewer';
  return undefined;
}

/** 标题/描述含 Snell、折射等关键词时补上 visualProfile，便于 DynamicLabHost 路由 */
function inferVisualProfileFromText(title: string, description?: string): string | undefined {
  const t = `${title} ${description ?? ''}`.toLowerCase();
  if (t.includes('snell') || t.includes('refraction') || t.includes('折射') || t.includes('斯涅尔')) {
    return 'snells_law';
  }
  return undefined;
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

/**
 * Try to parse a lab definition from free-form assistant text (fenced JSON or raw object).
 */
export function tryParseLabDefinitionFromText(text: string): ParseLabResult {
  const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const chunk = m[1].trim();
    try {
      const parsed: unknown = JSON.parse(chunk);
      const res = parseLabDefinitionJson(parsed);
      if (res.ok) return res;
    } catch {
      /* next */
    }
  }
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    const slice = extractBalancedJsonObject(text, i);
    if (!slice) continue;
    try {
      const parsed: unknown = JSON.parse(slice);
      const res = parseLabDefinitionJson(parsed);
      if (res.ok) return res;
    } catch {
      /* next */
    }
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

function pickVisualProfile(obj: Record<string, unknown>): string | undefined {
  const a = obj.visualProfile;
  const b = obj.visual_profile;
  if (typeof a === 'string' && a.trim()) return a.trim();
  if (typeof b === 'string' && b.trim()) return b.trim();
  return undefined;
}

export type ParseLabResult =
  | { ok: true; definition: LabComponentDefinition }
  | { ok: false; error: string };

/**
 * Parse arbitrary JSON into LabComponentDefinition; returns a readable error on failure.
 * Handles AI-generated wrappers, auto-generates registry_key, infers visualProfile.
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
  const visualProfile =
    pickVisualProfile(obj)
    ?? inferVisualProfile(initialState)
    ?? inferVisualProfileFromText(title, description);

  const definition: LabComponentDefinition = {
    registryKey,
    subjectLab,
    title,
    description,
    rendererProfile,
    initialState,
    reducerSpec,
    metadata,
    status,
    ...(visualProfile ? { visualProfile } : {}),
  };

  return { ok: true, definition };
}
