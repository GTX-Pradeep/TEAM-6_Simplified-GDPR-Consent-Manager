import axios from "axios";
import { api, type ApiError } from "./client";

export type Role = "USER" | "ADMIN" | "DPO";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export async function register(input: { name: string; email: string; password: string }): Promise<User> {
  const { data } = await api.post<{ user: User }>("/auth/register", input);
  return data.user;
}

export async function login(input: { email: string; password: string }): Promise<User> {
  const { data } = await api.post<{ user: User }>("/auth/login", input);
  return data.user;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

/** The logged-in user, or null when there is no valid session. */
export async function me(): Promise<User | null> {
  try {
    const { data } = await api.get<{ user: User }>("/auth/me");
    return data.user;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) return null;
    throw err;
  }
}

/** A readable message plus per-field errors from the API's standard error shape. */
export function describeError(err: unknown): { message: string; fields: Record<string, string> } {
  if (axios.isAxiosError<ApiError>(err) && err.response?.data?.error) {
    const { message, details } = err.response.data.error;
    const fields: Record<string, string> = {};
    if (details && typeof details === "object") {
      for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
        if (Array.isArray(v) && typeof v[0] === "string") fields[k] = v[0];
      }
    }
    return { message, fields };
  }
  if (axios.isAxiosError(err) && !err.response) {
    return { message: "Cannot reach the server. Is the API running?", fields: {} };
  }
  return { message: "Something went wrong. Please try again.", fields: {} };
}
