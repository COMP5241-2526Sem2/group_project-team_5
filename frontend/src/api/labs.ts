import type { LabComponentDefinition, RendererProfile } from '@/components/labs/types';
import { apiRequest } from '@/utils/apiClient';

/** 后端 / LLM 可能写入前端 RendererProfile 联合类型之外的别名 */
const API_RENDERER_PROFILE_ALIASES: Record<string, RendererProfile> = {
  optics_2d: 'generic_2d',
  optics: 'generic_2d',
  bio_2d: 'generic_2d',
  biology_2d: 'generic_2d',
};

function normalizeRendererProfileFromApi(raw: string): RendererProfile {
  const k = raw.trim().toLowerCase().replace(/-/g, '_');
  return API_RENDERER_PROFILE_ALIASES[k] ?? (raw as RendererProfile);
}

/** DB / LLM 偶发写入字面量 "null"；空串也不应走 AILabRuntime */
export function isUsableRenderCode(v: string | null | undefined): boolean {
  if (v == null) return false;
  const t = v.trim();
  return t.length > 0 && t.toLowerCase() !== 'null';
}

interface LabListParams {
  subject?: string;
  type?: string;
  dimension?: string;
  /** 单状态（与 statuses 互斥，后端优先使用 statuses） */
  status?: string;
  /** 多状态，如 published + draft */
  statuses?: string[];
  search?: string;
  page?: number;
  page_size?: number;
}

// Backend field names (snake_case)
interface BackendLabDefinition {
  registry_key: string;
  title: string;
  description?: string;
  subject_lab: string;
  renderer_profile: string;
  dimension: string;
  initial_state: Record<string, unknown>;
  reducer_spec?: {
    allowedCommands: string[];
    maxNodes?: number;
    maxConnections?: number;
  };
  lab_metadata?: Record<string, unknown>;
  lab_type: string;
  status: string;
  visual_profile?: string;
  visual_hint?: Record<string, unknown>;
  render_code?: string;
}

/** 写入课件 slide 的 lab_snapshot（与后端 Lab 表字段对齐），库中实验删除后仍凭此渲染 */
export function labDefinitionToEmbeddedSnapshot(def: LabComponentDefinition): Record<string, unknown> {
  return toBackend(def) as unknown as Record<string, unknown>;
}

function toBackend(def: LabComponentDefinition): BackendLabDefinition {
  // 仅序列化「前端确有」的可选字段，避免 JSON.stringify 误传 null 把库里整列清空。
  // render_code 始终带键（可为 null），与保存/指纹一致。
  const out: Record<string, unknown> = {
    registry_key: def.registryKey,
    title: def.title,
    subject_lab: def.subjectLab,
    renderer_profile: def.rendererProfile,
    dimension: '2d',
    initial_state: def.initialState,
    lab_type: 'ai_generated',
    status: def.status,
    render_code: (def as { renderCode?: string | null }).renderCode ?? null,
  };
  if (def.description !== undefined) out.description = def.description ?? null;
  if (def.reducerSpec !== undefined) out.reducer_spec = def.reducerSpec ?? null;
  if (def.metadata !== undefined) out.lab_metadata = def.metadata ?? null;
  // 使用 hasOwnProperty：避免「省略键」导致后端不更新 visual_hint；仅在有该字段时序列化
  if (Object.prototype.hasOwnProperty.call(def, 'visual_hint')) {
    out.visual_hint = (def.visual_hint as Record<string, unknown> | undefined) ?? null;
  }
  const vp = (def as { visualProfile?: string }).visualProfile;
  if (vp !== undefined) out.visual_profile = vp;
  return out as BackendLabDefinition;
}

/** 开发环境下 EventSource 经 Vite 代理常不稳定，SSE 直连后端（需 CORS） */
function sseOrigin(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (raw) {
    const noSlash = raw.replace(/\/+$/, '');
    return noSlash.endsWith('/api/v1') ? noSlash.slice(0, -7) : noSlash;
  }
  if (import.meta.env.DEV) {
    const o = import.meta.env.VITE_SSE_ORIGIN as string | undefined;
    return (o && o.replace(/\/$/, '')) || 'http://127.0.0.1:8000';
  }
  return '';
}

/** 内置模板（无 DB 行）：写入课件的嵌入快照 */
export function builtinLabEmbeddedSnapshot(
  widgetType: string,
  title: string,
  subjectLab: string,
  initialState: Record<string, unknown>,
): Record<string, unknown> {
  return {
    registry_key: widgetType,
    title,
    subject_lab: subjectLab,
    renderer_profile: 'generic_2d',
    dimension: '2d',
    initial_state: initialState,
    lab_type: 'builtin_template',
    status: 'published',
    render_code: null,
  };
}

export function fromBackend(def: BackendLabDefinition): LabComponentDefinition {
  const rc = (def as { render_code?: string | null }).render_code;
  const vp = (def as { visual_profile?: string | null }).visual_profile;
  return {
    registryKey: def.registry_key,
    title: def.title,
    description: def.description,
    subjectLab: def.subject_lab as LabComponentDefinition['subjectLab'],
    rendererProfile: normalizeRendererProfileFromApi(def.renderer_profile),
    initialState: def.initial_state,
    reducerSpec: def.reducer_spec,
    metadata: def.lab_metadata,
    status: def.status as LabComponentDefinition['status'],
    visual_hint: def.visual_hint as LabComponentDefinition['visual_hint'],
    ...(typeof rc === 'string' && isUsableRenderCode(rc) ? { renderCode: rc } : {}),
    ...(typeof vp === 'string' ? { visualProfile: vp } : {}),
  };
}

function labsListQueryString(params?: LabListParams): string {
  if (!params) return '';
  const e = new URLSearchParams();
  if (params.page !== undefined) e.set('page', String(params.page));
  if (params.page_size !== undefined) e.set('page_size', String(params.page_size));
  if (params.subject !== undefined) e.set('subject', params.subject);
  if (params.type !== undefined) e.set('type', params.type);
  if (params.dimension !== undefined) e.set('dimension', params.dimension);
  if (params.search !== undefined) e.set('search', params.search);
  if (params.statuses?.length) {
    for (const s of params.statuses) e.append('statuses', s);
  } else if (params.status !== undefined) {
    e.set('status', params.status);
  }
  const s = e.toString();
  return s ? `?${s}` : '';
}

export const labsApi = {
  list: (params?: LabListParams) =>
    apiRequest<Record<string, unknown>>(`/labs/${labsListQueryString(params)}`, {}, 'teacher'),

  get: (registryKey: string): Promise<Record<string, unknown>> =>
    apiRequest<Record<string, unknown>>(`/labs/${registryKey}`, {}, 'teacher'),

  createSession: async (mode: 'drive' | 'generate', registryKey?: string) => {
    const data = await apiRequest<Record<string, unknown>>(
      '/labs/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ mode, registry_key: registryKey }),
      },
      'teacher',
    );
    if (typeof data.id !== 'number') {
      throw new Error('createSession: invalid response (missing id)');
    }
    return data as { id: number; mode: string; lab_definition_id: number | null };
  },

  getMessages: (sessionId: number) =>
    apiRequest<Record<string, unknown>>(`/labs/sessions/${sessionId}/messages`, {}, 'teacher'),

  streamChat: (sessionId: number, message: string): EventSource => {
    const base = sseOrigin();
    const path = `/api/v1/labs/sessions/${sessionId}/stream?message=${encodeURIComponent(message)}`;
    return new EventSource(base ? `${base}${path}` : path);
  },

  confirmLabDefinition: (def: LabComponentDefinition) =>
    apiRequest<Record<string, unknown>>(
      '/labs/definitions/confirm',
      {
        method: 'POST',
        body: JSON.stringify(toBackend(def)),
      },
      'teacher',
    ),

  /**
   * 保存草稿或发布：与库中内容比较（草稿）；发布时写入并置 published。
   */
  saveLabDefinition: async (
    def: LabComponentDefinition,
    action: 'save_draft' | 'publish'
  ): Promise<{ contentUnchanged: boolean; raw: Record<string, unknown> }> => {
    const status = action === 'save_draft' ? 'draft' : 'published';
    const raw = await apiRequest<Record<string, unknown>>(
      '/labs/definitions/save',
      {
        method: 'POST',
        body: JSON.stringify({ ...toBackend({ ...def, status }), action }),
      },
      'teacher',
    );
    return { contentUnchanged: raw.content_unchanged === true, raw };
  },

  updateStatus: (labId: number, status: 'draft' | 'published' | 'deprecated') =>
    apiRequest<Record<string, unknown>>(
      `/labs/definitions/${labId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
      'teacher',
    ),

  delete: (labId: number) =>
    apiRequest<Record<string, unknown>>(
      `/labs/definitions/${labId}`,
      { method: 'DELETE' },
      'teacher',
    ).then(() => undefined),
};