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

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? "/api/v1" : null) ||
  inferCodespacesApiBaseUrl() ||
  "http://127.0.0.1:8000/api/v1";

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
