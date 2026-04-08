import type { QueryClient } from '@tanstack/react-query';
import { lessonsApi } from '@/api/lessons';
import { labsApi } from '@/api/labs';
import { listQuestionBankSetsApi } from '@/utils/questionBankApi';
import { fetchPaperListApi } from '@/utils/paperApi';
import { fetchTaskListApi } from '@/utils/taskApi';
import { teacherKeys } from './teacherKeys';
import { TEACHER_STALE_MS } from './queryClient';

/**
 * 进入教师端壳层后后台预取：不阻塞首屏，命中后子页面可立即展示缓存。
 */
export function prefetchTeacherShell(client: QueryClient): void {
  void Promise.allSettled([
    client.prefetchQuery({
      queryKey: teacherKeys.lessonsList(1, 100),
      queryFn: () => lessonsApi.list({ page: 1, page_size: 100 }),
      staleTime: TEACHER_STALE_MS,
    }),
    client.prefetchQuery({
      queryKey: teacherKeys.questionBankSets({}),
      queryFn: () => listQuestionBankSetsApi({}),
      staleTime: TEACHER_STALE_MS,
    }),
    client.prefetchQuery({
      queryKey: teacherKeys.paperList({ page: 1, page_size: 100 }),
      queryFn: () => fetchPaperListApi({ page: 1, page_size: 100 }),
      staleTime: TEACHER_STALE_MS,
    }),
    client.prefetchQuery({
      queryKey: teacherKeys.labsAiList(100),
      queryFn: () => labsApi.list({ type: 'ai_generated', page_size: 100 }),
      staleTime: TEACHER_STALE_MS,
    }),
    client.prefetchQuery({
      queryKey: teacherKeys.tasksList(1, 100),
      queryFn: () => fetchTaskListApi({ page: 1, page_size: 100 }),
      staleTime: TEACHER_STALE_MS,
    }),
  ]);
}
