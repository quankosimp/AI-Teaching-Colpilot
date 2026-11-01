import { randomUUID, createHash } from "node:crypto";

export const QA_BASE_URL = process.env.QA_BASE_URL || "";
export const APP_ORIGIN = process.env.APP_ORIGIN || QA_BASE_URL;

export const SKIP_IF_NO_SERVER = QA_BASE_URL
  ? undefined
  : "BLOCKED: QA_BASE_URL not set (requires running server instance, e.g. QA_BASE_URL=http://127.0.0.1:3110)";

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
    throw new Error(
      "QA_BASE_URL is not set. Ensure server is running and QA_BASE_URL is exported.",
    );
  }

  const url = `${QA_BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const method = (options.method || "GET").toUpperCase();

  const headers: Record<string, string> = {
    "X-Request-Id": uid("req"),
    ...options.headers,
  };

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    if (!headers["Origin"]) {
      headers["Origin"] = APP_ORIGIN;
    }
    if (!headers["Idempotency-Key"]) {
      headers["Idempotency-Key"] = uid("idem");
    }
  }

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
    method,
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

export type TeacherAuth = {
  token: string;
  cookie: string;
  account: "teacher-a" | "teacher-b";
};

export async function loginTeacher(
  account: "teacher-a" | "teacher-b" = "teacher-a",
): Promise<TeacherAuth> {
  const res = await apiRequest<{ accessToken: string }>("/api/v1/auth/mock", {
    method: "POST",
    body: { account },
  });

  if (res.status !== 200 || !res.data.accessToken) {
    throw new Error(
      `Mock login failed for ${account} (${res.status}): ${res.rawText}`,
    );
  }

  const cookieHeader = res.headers.get("set-cookie") || "";
  const cookie = cookieHeader.split(";")[0] || "";

  return {
    token: res.data.accessToken,
    cookie,
    account,
  };
}

export function createSamplePdf(name = "test"): {
  buffer: Buffer;
  fileName: string;
  mimeType: "application/pdf";
  sizeBytes: number;
  sha256: string;
} {
  const buffer = Buffer.from(`%PDF-1.4\nQA test fixture ${name} ${Date.now()}\n%%EOF\n`);
  return {
    buffer,
    fileName: `${name}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

export function createSamplePng(name = "test"): {
  buffer: Buffer;
  fileName: string;
  mimeType: "image/png";
  sizeBytes: number;
  sha256: string;
} {
  const buffer = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  ]);
  return {
    buffer,
    fileName: `${name}.png`,
    mimeType: "image/png",
    sizeBytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

export async function uploadMinio(
  uploadUrl: string,
  buffer: Buffer,
): Promise<number> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: new Uint8Array(buffer),
  });
  return res.status;
}
