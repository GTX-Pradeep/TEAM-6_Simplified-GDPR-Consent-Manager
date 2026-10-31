import type { ConsentAction } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";

/**
 * FR-20 "time travel": what had a user agreed to at a given moment in the past?
 * Because consent records are never changed or deleted, the answer is simply the last
 * decision per purpose made at or before that moment, plus the policy version then in force.
 */

export interface PurposeStateAt {
  purpose: { id: string; code: string; name: string; isActive: boolean };
  status: ConsentAction | "NOT_GIVEN";
  decidedAt: Date | null;
  recordId: string | null;
  policyVersion: { id: string; versionNo: string } | null;
}

export interface ConsentStateAt {
  user: { id: string; name: string; email: string };
  at: Date;
  policyInForce: { id: string; versionNo: string; effectiveAt: Date | null } | null;
  purposes: PurposeStateAt[];
}

export async function findUserByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "No user with this e-mail address");
  return user;
}

export async function consentStateAt(userId: string, at: Date): Promise<ConsentStateAt> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");

  const [purposes, latest, policy] = await Promise.all([
    // purposes that existed at that moment (also ones deactivated later)
    prisma.processingPurpose.findMany({ where: { createdAt: { lte: at } }, orderBy: { name: "asc" } }),
    // newest decision per purpose made at or before `at`
    prisma.consentRecord.findMany({
      where: { userId, recordedAt: { lte: at } },
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
      distinct: ["purposeId"],
      include: { policyVersion: { select: { id: true, versionNo: true } } },
    }),
    // the version that was published most recently before `at`
    prisma.policyVersion.findFirst({
      where: { status: { in: ["PUBLISHED", "SUPERSEDED"] }, effectiveAt: { lte: at } },
      orderBy: { effectiveAt: "desc" },
      select: { id: true, versionNo: true, effectiveAt: true },
    }),
  ]);

  const byPurpose = new Map(latest.map((r) => [r.purposeId, r]));
  return {
    user,
    at,
    policyInForce: policy,
    purposes: purposes.map((p) => {
      const r = byPurpose.get(p.id);
      return {
        purpose: { id: p.id, code: p.code, name: p.name, isActive: p.isActive },
        status: r?.action ?? "NOT_GIVEN",
        decidedAt: r?.recordedAt ?? null,
        recordId: r ? r.id.toString() : null,
        policyVersion: r ? r.policyVersion : null,
      };
    }),
  };
}
