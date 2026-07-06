/**
 * Typed API fetch wrapper for DevPulse.
 * - Automatically includes credentials (cookies) on all requests.
 * - Throws ApiError on non-2xx responses for consistent error handling.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    message?: string
  ) {
    super(message || detail);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include", // always send httpOnly cookies
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || body.message || detail;
      if (Array.isArray(detail) && detail.length > 0 && typeof detail[0] === "object" && detail[0].msg) {
        detail = detail.map((err: { msg: string }) => err.msg).join(", ");
      } else if (typeof detail === "object" && detail !== null) {
        detail = JSON.stringify(detail);
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new ApiError(res.status, detail);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

export const apiGet = <T>(path: string) => apiFetch<T>(path);

export const apiPost = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

export const apiPut = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, {
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

export const apiDelete = <T>(path: string) =>
  apiFetch<T>(path, { method: "DELETE" });

// ── Types ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string;
  username: string;
  role: "user" | "admin";
  is_verified: boolean;
  is_active: boolean;
  avatar_url: string | null;
  bio: string | null;
  oauth_provider: string | null;
  created_at: string;
}

export interface AuthResponse {
  message: string;
  user: User;
}

export interface MessageResponse {
  message: string;
}
