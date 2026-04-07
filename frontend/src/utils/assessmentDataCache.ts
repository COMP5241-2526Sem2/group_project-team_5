import { fetchPaperListApi, type PaperListResponseDto } from "./paperApi";
import { listQuestionBankSetsApi, type QuestionBankSetsResponseDto } from "./questionBankApi";

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const DEFAULT_TTL_MS = 60_000;

function toStableQueryKey(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && String(v).trim() !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}

// ───────────────────────────────────────────────────────────────────────────────
// Question Bank Sets
// ───────────────────────────────────────────────────────────────────────────────
const qbCache = new Map<string, CacheEntry<QuestionBankSetsResponseDto>>();
const qbInflight = new Map<string, Promise<QuestionBankSetsResponseDto>>();

export function readCachedQuestionBankSets(params: Record<string, string | undefined> = {}): QuestionBankSetsResponseDto | null {
  const key = toStableQueryKey(params);
  const hit = qbCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > DEFAULT_TTL_MS) return null;
  return hit.data;
}

export async function prefetchQuestionBankSets(
  params: Record<string, string | undefined> = {},
  opts: { force?: boolean } = {},
): Promise<QuestionBankSetsResponseDto> {
  const key = toStableQueryKey(params);
  if (!opts.force) {
    const cached = readCachedQuestionBankSets(params);
    if (cached) return cached;
  }
  const inflight = qbInflight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const data = await listQuestionBankSetsApi(params);
      qbCache.set(key, { data, fetchedAt: Date.now() });
      return data;
    } finally {
      qbInflight.delete(key);
    }
  })();
  qbInflight.set(key, p);
  return p;
}

// ───────────────────────────────────────────────────────────────────────────────
// Paper List
// ───────────────────────────────────────────────────────────────────────────────
const paperCache = new Map<string, CacheEntry<PaperListResponseDto>>();
const paperInflight = new Map<string, Promise<PaperListResponseDto>>();

export function readCachedPaperList(params: Record<string, string | number | undefined> = {}): PaperListResponseDto | null {
  const key = toStableQueryKey(
    Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, v === undefined ? undefined : String(v)]),
    ),
  );
  const hit = paperCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > DEFAULT_TTL_MS) return null;
  return hit.data;
}

export async function prefetchPaperList(
  params: Record<string, string | number | undefined> = { page: 1, page_size: 100 },
  opts: { force?: boolean } = {},
): Promise<PaperListResponseDto> {
  const key = toStableQueryKey(
    Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, v === undefined ? undefined : String(v)]),
    ),
  );
  if (!opts.force) {
    const cached = readCachedPaperList(params);
    if (cached) return cached;
  }
  const inflight = paperInflight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const data = await fetchPaperListApi({
        status: params.status as any,
        subject: params.subject as any,
        grade: params.grade as any,
        semester: params.semester as any,
        exam_type: params.exam_type as any,
        q: params.q as any,
        page: typeof params.page === "number" ? params.page : Number(params.page ?? 1),
        page_size: typeof params.page_size === "number" ? params.page_size : Number(params.page_size ?? 100),
      });
      paperCache.set(key, { data, fetchedAt: Date.now() });
      return data;
    } finally {
      paperInflight.delete(key);
    }
  })();
  paperInflight.set(key, p);
  return p;
}

