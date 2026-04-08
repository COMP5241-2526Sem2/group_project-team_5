/**
 * 教师端 TanStack Query 键：与 prefetch、各页面 useQuery 共用，保证预取与展示命中同一缓存。
 */
export function stableParamKey(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

export const teacherKeys = {
  lessonsList: (page: number, pageSize: number) => ['teacher', 'lessons', 'list', page, pageSize] as const,

  questionBankSets: (params: Record<string, string | undefined>) =>
    ['teacher', 'questionBank', 'sets', stableParamKey(params)] as const,

  /** 与 paperApi.fetchPaperList 入参一致；未传的筛选项不要写入 params，避免键分裂 */
  paperList: (params: {
    status?: string;
    subject?: string;
    grade?: string;
    semester?: string;
    exam_type?: string;
    q?: string;
    page?: number;
    page_size?: number;
  }) => ['teacher', 'papers', 'list', stableParamKey(params as Record<string, string | number | undefined>)] as const,

  paperDetail: (paperId: number) => ['teacher', 'papers', 'detail', paperId] as const,

  labsAiList: (pageSize: number) => ['teacher', 'labs', 'list', 'ai_generated', pageSize] as const,

  lessonDetail: (id: number) => ['teacher', 'lessons', 'detail', id] as const,

  /** Task Publishing：与 taskApi.fetchTaskListApi 参数一致 */
  tasksList: (page: number, pageSize: number) => ['teacher', 'tasks', 'list', page, pageSize] as const,
};
