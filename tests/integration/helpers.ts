import { randomUUID } from "node:crypto";

export const QA_BASE_URL = process.env.QA_BASE_URL || "";

export const SKIP_IF_NO_SERVER = QA_BASE_URL
  ? undefined
  : "BLOCKED: QA_BASE_URL not set (requires running server instance, e.g. QA_BASE_URL=http://127.0.0.1:3100)";

export function uid(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export type ApiResponse<T = any> = {
  status: number;
  headers: Headers;
  data: T;
  rawText: string;
};

export async function apiRequest<T = any>(
  path: string,
  options: {
    method?: string;
    token?: string;
    cookie?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResponse<T>> {
  if (!QA_BASE_URL) {
    throw new Error("QA_BASE_URL is not set. Ensure server is running and QA_BASE_URL is exported.");
  }

  const url = `${QA_BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    "X-Request-Id": uid("req"),
    ...options.headers,
  };

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }
  if (options.cookie) {
    headers["Cookie"] = options.cookie;
  }
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rawText = await res.text();
  let data: T;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = rawText as unknown as T;
  }

  return {
    status: res.status,
    headers: res.headers,
    data,
    rawText,
  };
}
