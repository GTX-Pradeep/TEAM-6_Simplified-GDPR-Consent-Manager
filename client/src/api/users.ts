import { api } from "./client";
import type { Role } from "./auth";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lockedUntil: string | null;
  createdAt: string;
}

export async function listUsers(params: { q?: string; role?: string; page?: number; pageSize?: number } = {}) {
  const { data } = await api.get<{ items: AdminUser[]; total: number; page: number; pageSize: number }>("/users", {
    params,
  });
  return data;
}

export async function changeRole(id: string, role: Role): Promise<AdminUser> {
  const { data } = await api.patch<{ user: AdminUser }>(`/users/${id}/role`, { role });
  return data.user;
}

export async function setActive(id: string, active: boolean): Promise<AdminUser> {
  const { data } = await api.patch<{ user: AdminUser }>(`/users/${id}/${active ? "activate" : "deactivate"}`);
  return data.user;
}
