type UserRole = "student" | "teacher" | "admin";

function inferCodespacesApiBaseUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const host = window.location.hostname;
  const matched = host.match(/^(.*)-\d+\.app\.github\.dev$/);
  if (!matched) {
    return null;
  }

  return `https://${matched[1]}-8000.app.github.dev/api/v1`;
}

function inferApiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (import.meta.env.DEV) return "/api/v1";

  const codespaces = inferCodespacesApiBaseUrl();
  if (codespaces) return codespaces;

  // Production default should never point to localhost.
  // Use same-origin API prefix unless explicitly overridden by VITE_API_BASE_URL.
  return "/api/v1";
}

const API_BASE_URL = inferApiBaseUrl();

function toNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getUserIdFromStorage(role: UserRole): number | null {
  const keys = [
    "openstudy.userId",
    "userId",
    "X-User-Id",
    `${role}Id`,
  ];
  for (const key of keys) {
    const n = toNumber(window.localStorage.getItem(key));
    if (n !== null) return n;
  }
  return null;
}

function getDefaultUserIdByRole(role: UserRole): number {
  if (role === "teacher") {
    return Number(import.meta.env.VITE_TEACHER_USER_ID || 1003);
  }
  if (role === "admin") {
    return Number(import.meta.env.VITE_ADMIN_USER_ID || 1001);
  }
  return Number(import.meta.env.VITE_STUDENT_USER_ID || 1004);
}

export function resolveUserId(role: UserRole): number {
  return getUserIdFromStorage(role) ?? getDefaultUserIdByRole(role);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  role: UserRole = "student",
): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("X-User-Id", String(resolveUserId(role)));
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const url = `${API_BASE_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown network error";
    throw new Error(`Network error: ${detail} (url=${url})`);
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.detail) detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
    } catch {
      // keep default detail
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return {} as T;
  }
  return response.json() as Promise<T>;
}

/** Parse RFC 5987 / quoted `filename` from Content-Disposition. */
export function parseFilenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const star = cd.match(/filename\*=UTF-8''([^;\s]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      return star[1];
    }
  }
  const quoted = cd.match(/filename="((?:[^"\\]|\\.)*)"/);
  if (quoted?.[1]) return quoted[1].replace(/\\"/g, '"');
  const unquoted = cd.match(/filename=([^;\s]+)/);
  if (unquoted?.[1]) return unquoted[1].replace(/^["']|["']$/g, "");
  return null;
}

export async function apiRequestBlob(
  path: string,
  role: UserRole = "student",
): Promise<{ blob: Blob; filename: string | null }> {
  const headers = new Headers();
  headers.set("X-User-Id", String(resolveUserId(role)));
  const url = `${API_BASE_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown network error";
    throw new Error(`Network error: ${detail} (url=${url})`);
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.detail) detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
    } catch {
      // keep default detail
    }
    throw new Error(detail);
  }
  const blob = await response.blob();
  const filename = parseFilenameFromContentDisposition(response.headers.get("Content-Disposition"));
  return { blob, filename };
}

export type BlobProgress = { loaded: number; total: number | null; percent: number | null };

/** Stream response body to build a Blob and report download progress (uses Content-Length when present). */
export async function apiRequestBlobWithProgress(
  path: string,
  role: UserRole = "student",
  onProgress?: (p: BlobProgress) => void,
): Promise<{ blob: Blob; filename: string | null }> {
  const headers = new Headers();
  headers.set("X-User-Id", String(resolveUserId(role)));
  const url = `${API_BASE_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown network error";
    throw new Error(`Network error: ${detail} (url=${url})`);
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.detail) detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
    } catch {
      // keep default detail
    }
    throw new Error(detail);
  }

  const cd = response.headers.get("Content-Disposition");
  const filename = parseFilenameFromContentDisposition(cd);
  const lenHeader = response.headers.get("Content-Length");
  const total = lenHeader ? Number.parseInt(lenHeader, 10) : null;
  const safeTotal = total !== null && Number.isFinite(total) && total > 0 ? total : null;

  const reader = response.body?.getReader();
  if (!reader) {
    const blob = await response.blob();
    onProgress?.({ loaded: blob.size, total: safeTotal ?? blob.size, percent: 100 });
    return { blob, filename };
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress?.({ loaded: 0, total: safeTotal, percent: safeTotal ? 0 : null });

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length) {
      chunks.push(value);
      loaded += value.length;
      const percent =
        safeTotal !== null ? Math.min(100, Math.round((loaded / safeTotal) * 100)) : null;
      onProgress?.({ loaded, total: safeTotal, percent });
    }
  }

  const blob = new Blob(chunks as BlobPart[]);
  const finalTotal = safeTotal ?? blob.size;
  onProgress?.({ loaded: blob.size, total: finalTotal, percent: 100 });
  return { blob, filename };
}
