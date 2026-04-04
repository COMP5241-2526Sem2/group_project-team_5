import type { LabComponentDefinition } from '@/components/labs/types';

interface LabListParams {
  subject?: string;
  type?: string;
  dimension?: string;
  status?: string;
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
}

function toBackend(def: LabComponentDefinition): BackendLabDefinition {
  return {
    registry_key: def.registryKey,
    title: def.title,
    description: def.description,
    subject_lab: def.subjectLab,
    renderer_profile: def.rendererProfile,
    dimension: '2d',
    initial_state: def.initialState,
    reducer_spec: def.reducerSpec,
    lab_metadata: def.metadata,
    lab_type: 'ai_generated',
    status: def.status,
    ...(def.visualProfile ? { visual_profile: def.visualProfile } : {}),
  };
}

/** 开发环境下 EventSource 经 Vite 代理常不稳定，SSE 直连后端（需 CORS） */
function sseOrigin(): string {
  if (import.meta.env.DEV) {
    const o = import.meta.env.VITE_SSE_ORIGIN as string | undefined;
    return (o && o.replace(/\/$/, '')) || 'http://127.0.0.1:8000';
  }
  return '';
}

export function fromBackend(def: BackendLabDefinition): LabComponentDefinition {
  return {
    registryKey: def.registry_key,
    title: def.title,
    description: def.description,
    subjectLab: def.subject_lab as LabComponentDefinition['subjectLab'],
    rendererProfile: def.renderer_profile as LabComponentDefinition['rendererProfile'],
    initialState: def.initial_state,
    reducerSpec: def.reducer_spec,
    metadata: def.lab_metadata,
    status: def.status as LabComponentDefinition['status'],
    ...(def.visual_profile ? { visualProfile: def.visual_profile } : {}),
  };
}

export const labsApi = {
  list: (params?: LabListParams) =>
    fetch(`/api/v1/labs/?${new URLSearchParams(params as Record<string, string>)}`).then(r => r.json()),

  get: (registryKey: string): Promise<Record<string, unknown>> =>
    fetch(`/api/v1/labs/${registryKey}`).then(r => {
      if (!r.ok) throw new Error(`Lab not found: ${registryKey}`);
      return r.json();
    }),

  createSession: async (mode: 'drive' | 'generate', registryKey?: string) => {
    const r = await fetch('/api/v1/labs/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, registry_key: registryKey }),
    });
    const data = (await r.json()) as Record<string, unknown>;
    if (!r.ok) {
      const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail ?? data);
      throw new Error(detail || `createSession failed: ${r.status}`);
    }
    if (typeof data.id !== 'number') {
      throw new Error('createSession: invalid response (missing id)');
    }
    return data as { id: number; mode: string; lab_definition_id: number | null };
  },

  getMessages: (sessionId: number) =>
    fetch(`/api/v1/labs/sessions/${sessionId}/messages`).then(r => r.json()),

  streamChat: (sessionId: number, message: string): EventSource => {
    const base = sseOrigin();
    const path = `/api/v1/labs/sessions/${sessionId}/stream?message=${encodeURIComponent(message)}`;
    return new EventSource(base ? `${base}${path}` : path);
  },

  confirmLabDefinition: (def: LabComponentDefinition) =>
    fetch('/api/v1/labs/definitions/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toBackend(def)),
    }).then(r => {
      if (!r.ok) throw new Error(`Failed to save lab: ${r.statusText}`);
      return r.json();
    }),

  /**
   * 保存草稿或发布：与库中内容比较（草稿）；发布时写入并置 published。
   */
  saveLabDefinition: async (
    def: LabComponentDefinition,
    action: 'save_draft' | 'publish'
  ): Promise<{ contentUnchanged: boolean; raw: Record<string, unknown> }> => {
    const status = action === 'save_draft' ? 'draft' : 'published';
    const r = await fetch('/api/v1/labs/definitions/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...toBackend({ ...def, status }), action }),
    });
    const raw = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      const detail =
        typeof raw.detail === 'string'
          ? raw.detail
          : JSON.stringify(raw.detail ?? raw);
      throw new Error(detail || `保存失败: ${r.status}`);
    }
    return { contentUnchanged: raw.content_unchanged === true, raw };
  },

  updateStatus: (labId: number, status: 'draft' | 'published' | 'deprecated') =>
    fetch(`/api/v1/labs/definitions/${labId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).then(r => r.json()),

  delete: (labId: number) =>
    fetch(`/api/v1/labs/definitions/${labId}`, { method: 'DELETE' }).then(r => {
      if (!r.ok && r.status !== 204) throw new Error(`Delete failed: ${r.statusText}`);
    }),
};