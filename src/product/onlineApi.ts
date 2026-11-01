import type { ActionResult } from "../../contracts/ui";

let token = "";
export function getAccessToken() {
  return token;
}
let pendingRefresh: Promise<boolean> | null = null;
export type ApiFailure = Extract<ActionResult<unknown>, { ok: false }>;
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly failure: ApiFailure,
  ) {
    super(failure.message);
  }
}
async function refresh() {
  if (!pendingRefresh)
    pendingRefresh = fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    })
      .then(async (r) => {
        if (!r.ok) return false;
        token = (await r.json()).accessToken;
        return true;
      })
      .catch(() => false)
      .finally(() => {
        pendingRefresh = null;
      });
  return pendingRefresh;
}
export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  if (
    (method === "POST" || method === "PUT" || method === "PATCH") &&
    !path.startsWith("/auth/")
  ) {
    const headers = new Headers(init.headers);
    if (!headers.has("Idempotency-Key"))
      headers.set("Idempotency-Key", crypto.randomUUID());
    init = { ...init, headers: Object.fromEntries(headers.entries()) };
  }
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, {
      ok: false,
      code: "NOT_FOUND",
      message: "Không kết nối được máy chủ.",
      requestId: "offline",
    });
  }
  if (
    response.status === 401 &&
    retry &&
    path !== "/auth/refresh" &&
    path !== "/auth/mock" &&
    path !== "/auth/google/callback"
  ) {
    if (await refresh()) return api(path, init, false);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, {
      ok: false,
      code: data?.error?.code || "VALIDATION_ERROR",
      message: data?.error?.message || "Không thể hoàn thành yêu cầu.",
      requestId: data?.error?.requestId || "unknown",
    });
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export async function signIn(account: "teacher-a" | "teacher-b") {
  const data = await api<{ accessToken: string }>("/auth/mock", {
    method: "POST",
    body: JSON.stringify({ account }),
  });
  token = data.accessToken;
}
export async function googleCallback(code: string, state: string) {
  const data = await api<{ accessToken: string }>("/auth/google/callback", {
    method: "POST",
    body: JSON.stringify({ code, state }),
  });
  token = data.accessToken;
}
export async function signOut() {
  try {
    await api("/auth/logout", { method: "POST" });
  } finally {
    token = "";
  }
}
