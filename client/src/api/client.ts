import axios from "axios";

/**
 * Shared HTTP client for the REST API (SAD 4.3).
 * - baseURL /api/v1 is proxied to the Express server in development (vite.config.ts).
 * - withCredentials sends the httpOnly session cookie set at login.
 */
export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
  timeout: 10_000,
});

export type ApiError = {
  error: { code: string; message: string; details?: unknown; requestId?: string };
};

export type Health = { status: "ok" | "degraded"; db: "up" | "down"; time: string };

export async function getHealth(): Promise<Health> {
  const { data } = await api.get<Health>("/health");
  return data;
}
