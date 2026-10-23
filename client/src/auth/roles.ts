import type { Role } from "../api/auth";

/** FR-2: after login every role lands on its own home screen. */
export function homeFor(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "DPO":
      return "/dpo";
    default:
      return "/dashboard";
  }
}

export const roleLabel: Record<Role, string> = {
  USER: "User",
  ADMIN: "Administrator",
  DPO: "DPO / Auditor",
};
