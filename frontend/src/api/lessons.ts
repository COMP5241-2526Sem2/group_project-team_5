import { apiRequest } from '@/utils/apiClient';

export interface LessonSlideApi {
  id: number;
  order: number;
  title: string;
  text: string;
  notes: string | null;
  lab_registry_key: string | null;
  lab_definition_id: number | null;
  /** 嵌入的实验定义快照（interactive block extra_payload.lab_snapshot），labs 删除后仍可用 */
  lab_snapshot?: Record<string, unknown> | null;
  image_urls: string[];
  /** 白板布局（后端存于 text block extra_payload.wb） */
  slide_layout?: Record<string, unknown> | null;
}

export interface LessonDetailApi {
  id: number;
  title: string;
  subject: string;
  grade: string | null;
  deck_source: string;
  status: 'draft' | 'published';
  teacher_id: number;
  created_at: string;
  updated_at: string;
  slides: LessonSlideApi[];
}

export interface LessonListItemApi {
  id: number;
  title: string;
  subject: string;
  grade: string | null;
  deck_source: string;
  status: 'draft' | 'published';
  updated_at: string;
  slide_count: number;
}

export interface PaginatedLessonsApi {
  total: number;
  page: number;
  page_size: number;
  items: LessonListItemApi[];
}

export interface LessonCreateBody {
  title?: string;
  subject?: string;
  grade?: string | null;
}

export interface SlideUpsertBody {
  title: string;
  text: string;
  notes?: string | null;
  lab_registry_key?: string | null;
  lab_snapshot?: Record<string, unknown> | null;
  image_urls?: string[];
  slide_layout?: Record<string, unknown> | null;
}

export interface LessonPutBody {
  title: string;
  subject: string;
  grade?: string | null;
  status?: 'draft' | 'published' | null;
  slides: SlideUpsertBody[];
}

function qs(params: Record<string, string | number | undefined>) {
  const e = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) e.set(k, String(v));
  }
  const s = e.toString();
  return s ? `?${s}` : '';
}

export const lessonsApi = {
  /** 使用 `/lessons/?…`（尾部斜杠），避免 FastAPI 对 `/lessons?…` 返回 307 导致列表拉取异常 */
  list: (params?: { page?: number; page_size?: number }) => {
    const q = qs({ page: params?.page ?? 1, page_size: params?.page_size ?? 100 });
    return apiRequest<PaginatedLessonsApi>(`/lessons/${q}`, {}, 'teacher');
  },

  create: (body: LessonCreateBody = {}) =>
    apiRequest<LessonDetailApi>('/lessons/', { method: 'POST', body: JSON.stringify(body) }, 'teacher'),

  get: (id: number) => apiRequest<LessonDetailApi>(`/lessons/${id}`, {}, 'teacher'),

  put: (id: number, body: LessonPutBody) =>
    apiRequest<LessonDetailApi>(`/lessons/${id}`, { method: 'PUT', body: JSON.stringify(body) }, 'teacher'),

  patchStatus: (id: number, status: 'draft' | 'published') =>
    apiRequest<LessonDetailApi>(`/lessons/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }, 'teacher'),

  remove: (id: number) => apiRequest<Record<string, never>>(`/lessons/${id}`, { method: 'DELETE' }, 'teacher'),
};
