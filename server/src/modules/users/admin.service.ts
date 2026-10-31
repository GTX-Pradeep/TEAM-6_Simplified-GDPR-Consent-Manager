import type { Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import { appendAudit } from "../audit/audit.service";

/**
 * SEC-4: only an administrator can list users, change roles and (de)activate accounts.
 * Every change is written to the audit trail in the same transaction. Nobody can change
 * consent records here (or anywhere): that table is append-only.
 */

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lockedUntil: Date | null;
  createdAt: Date;
}

const select = { id: true, name: true, email: true, role: true, isActive: true, lockedUntil: true, createdAt: true } as const;

export async function listUsers(q: {
  q?: string;
  role?: Role;
  page: number;
  pageSize: number;
}): Promise<{ items: AdminUserRow[]; total: number; page: number; pageSize: number }> {
  const where: Prisma.UserWhereInput = {};
  if (q.q) {
    where.OR = [
      { email: { contains: q.q, mode: "insensitive" } },
      { name: { contains: q.q, mode: "insensitive" } },
    ];
  }
  if (q.role) where.role = q.role;
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select,
      orderBy: { createdAt: "asc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

async function getOrThrow(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
  return user;
}

/** An admin cannot demote or deactivate himself, so the system never loses its last admin by accident. */
function notSelf(actorId: string, targetId: string, what: string) {
  if (actorId === targetId) {
    throw new AppError(409, "CANNOT_CHANGE_SELF", `You cannot ${what} your own account. Ask another administrator.`);
  }
}

export async function changeRole(actorId: string, userId: string, role: Role): Promise<AdminUserRow> {
  notSelf(actorId, userId, "change the role of");
  const before = await getOrThrow(userId);
  if (before.role === role) return before;

  return prisma.$transaction(async (tx) => {
    // Logging out every session makes the new role effective at once (the token holds the old role).
    const user = await tx.user.update({
      where: { id: userId },
      data: { role, sessionVersion: { increment: 1 } },
      select,
    });
    await appendAudit(tx, {
      actorId,
      action: "USER_ROLE_CHANGED",
      targetType: "User",
      targetId: userId,
      details: { from: before.role, to: role },
    });
    return user;
  });
}

export async function setActive(actorId: string, userId: string, isActive: boolean): Promise<AdminUserRow> {
  if (!isActive) notSelf(actorId, userId, "deactivate");
  const before = await getOrThrow(userId);
  if (before.isActive === isActive) return before;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      // Deactivating also ends every open session immediately.
      data: isActive ? { isActive, failedLoginCount: 0, lockedUntil: null } : { isActive, sessionVersion: { increment: 1 } },
      select,
    });
    await appendAudit(tx, {
      actorId,
      action: isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
      targetType: "User",
      targetId: userId,
    });
    return user;
  });
}
