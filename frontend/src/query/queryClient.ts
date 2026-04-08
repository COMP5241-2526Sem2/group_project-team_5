import { QueryClient } from '@tanstack/react-query';

/** 教师端列表/聚合数据：短时间内视为新鲜，避免切页重复打接口 */
export const TEACHER_STALE_MS = 2 * 60 * 1000;
export const TEACHER_GC_MS = 10 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: TEACHER_STALE_MS,
      gcTime: TEACHER_GC_MS,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
