import type { PaperListResponseDto } from "./paperApi";
import type { QuestionBankSetsResponseDto } from "./questionBankApi";
import { fetchPaperListApi } from "./paperApi";
import { listQuestionBankSetsApi } from "./questionBankApi";
import { queryClient, TEACHER_STALE_MS } from "@/query/queryClient";
import { teacherKeys } from "@/query/teacherKeys";

function normalizePaperListParams(
  params: Record<string, string | number | undefined> = {},
): Parameters<typeof fetchPaperListApi>[0] {
  return {
    status: params.status as "draft" | "published" | "closed" | undefined,
    subject: params.subject as string | undefined,
    grade: params.grade as string | undefined,
    semester: params.semester as string | undefined,
    exam_type: params.exam_type as string | undefined,
    q: params.q as string | undefined,
    page: typeof params.page === "number" ? params.page : Number(params.page ?? 1),
    page_size: typeof params.page_size === "number" ? params.page_size : Number(params.page_size ?? 100),
  };
}

/** 与 useQuery / prefetch 共用缓存；用于首帧从内存读出（侧栏 hover 预取命中时即时展示） */
export function readCachedQuestionBankSets(
  params: Record<string, string | undefined> = {},
): QuestionBankSetsResponseDto | null {
  return queryClient.getQueryData(teacherKeys.questionBankSets(params)) ?? null;
}

export async function prefetchQuestionBankSets(
  params: Record<string, string | undefined> = {},
  opts: { force?: boolean } = {},
): Promise<QuestionBankSetsResponseDto> {
  const key = teacherKeys.questionBankSets(params);
  if (opts.force) {
    await queryClient.invalidateQueries({ queryKey: key });
  }
  return queryClient.ensureQueryData({
    queryKey: key,
    queryFn: () => listQuestionBankSetsApi(params),
    staleTime: TEACHER_STALE_MS,
  });
}

export function readCachedPaperList(
  params: Record<string, string | number | undefined> = {},
): PaperListResponseDto | null {
  const norm = normalizePaperListParams(params);
  return queryClient.getQueryData(teacherKeys.paperList(norm)) ?? null;
}

export async function prefetchPaperList(
  params: Record<string, string | number | undefined> = { page: 1, page_size: 100 },
  opts: { force?: boolean } = {},
): Promise<PaperListResponseDto> {
  const norm = normalizePaperListParams(params);
  const key = teacherKeys.paperList(norm);
  if (opts.force) {
    await queryClient.invalidateQueries({ queryKey: key });
  }
  return queryClient.ensureQueryData({
    queryKey: key,
    queryFn: () => fetchPaperListApi(norm),
    staleTime: TEACHER_STALE_MS,
  });
}
