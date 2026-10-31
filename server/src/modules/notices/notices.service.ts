import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import { appendAudit } from "../audit/audit.service";
import { appendConsentRecord } from "../consents/consents.service";

/**
 * FR-16 policy-change re-confirmation.
 * When a new policy version is published, every user whose CURRENT consent for some purpose
 * was given under an older version gets a review notice. On the next login the dashboard
 * shows it; the user can re-confirm (new GRANTED records under the new version) or
 * withdraw purposes one by one. Existing consent records are never altered.
 */

type Tx = Prisma.TransactionClient;

/** Current GRANTED consents of a user (or of everybody) that refer to another policy version. */
async function outdatedGrants(db: Tx, policyVersionId: string, userId?: string) {
  const latest = await db.consentRecord.findMany({
    where: userId ? { userId } : {},
    orderBy: [{ userId: "asc" }, { purposeId: "asc" }, { recordedAt: "desc" }, { id: "desc" }],
    distinct: ["userId", "purposeId"],
    include: {
      purpose: { select: { id: true, code: true, name: true, isActive: true } },
      policyVersion: { select: { id: true, versionNo: true } },
    },
  });
  return latest.filter((r) => r.action === "GRANTED" && r.policyVersionId !== policyVersionId && r.purpose.isActive);
}

/** Called inside the publish transaction. Returns how many users were notified. */
export async function createNoticesForPublish(tx: Tx, policyVersionId: string): Promise<number> {
  const userIds = [...new Set((await outdatedGrants(tx, policyVersionId)).map((r) => r.userId))];
  if (userIds.length === 0) return 0;
  const { count } = await tx.policyReviewNotice.createMany({
    data: userIds.map((userId) => ({ userId, policyVersionId })),
    skipDuplicates: true,
  });
  return count;
}

export interface NoticeDto {
  id: string;
  createdAt: Date;
  policy: { id: string; versionNo: string; title: string; changeSummary: string; effectiveAt: Date | null };
  /** purposes the user agreed to under an older version */
  purposes: { id: string; code: string; name: string; grantedUnder: string }[];
}

/** The user's open notice for the current policy (at most one), with the purposes to review. */
export async function getMyNotices(userId: string): Promise<NoticeDto[]> {
  const current = await prisma.policyVersion.findFirst({ where: { status: "PUBLISHED" } });
  if (!current) return [];
  const notice = await prisma.policyReviewNotice.findFirst({
    where: { userId, policyVersionId: current.id, acknowledgedAt: null },
  });
  if (!notice) return [];
  const grants = await outdatedGrants(prisma as unknown as Tx, current.id, userId);
  return [
    {
      id: notice.id,
      createdAt: notice.createdAt,
      policy: {
        id: current.id,
        versionNo: current.versionNo,
        title: current.title,
        changeSummary: current.changeSummary,
        effectiveAt: current.effectiveAt,
      },
      purposes: grants.map((g) => ({
        id: g.purpose.id,
        code: g.purpose.code,
        name: g.purpose.name,
        grantedUnder: g.policyVersion.versionNo,
      })),
    },
  ];
}

async function openNoticeOrThrow(tx: Tx, userId: string, noticeId: string) {
  const notice = await tx.policyReviewNotice.findUnique({ where: { id: noticeId } });
  // Someone else's notice looks exactly like a missing one (SEC-2).
  if (!notice || notice.userId !== userId) throw new AppError(404, "NOTICE_NOT_FOUND", "Notice not found");
  if (notice.acknowledgedAt) throw new AppError(409, "NOTICE_CLOSED", "This notice was already answered");
  return notice;
}

/** Closes every open notice of the user (older ones are covered by the newest answer). */
async function closeAll(tx: Tx, userId: string) {
  await tx.policyReviewNotice.updateMany({ where: { userId, acknowledgedAt: null }, data: { acknowledgedAt: new Date() } });
}

/** "Keep my choices": a new GRANTED record under the current version for each outdated grant. */
export async function reconfirm(userId: string, noticeId: string): Promise<{ reconfirmed: number }> {
  return prisma.$transaction(async (tx) => {
    const notice = await openNoticeOrThrow(tx, userId, noticeId);
    const current = await tx.policyVersion.findFirst({ where: { status: "PUBLISHED" } });
    if (!current || current.id !== notice.policyVersionId) {
      throw new AppError(409, "NOTICE_OUTDATED", "A newer policy version exists; please reload the page");
    }
    const grants = await outdatedGrants(tx, current.id, userId);
    for (const g of grants) {
      const record = await appendConsentRecord(tx, {
        userId,
        purposeId: g.purposeId,
        action: "GRANTED",
        policyVersionId: current.id,
      });
      await appendAudit(tx, {
        actorId: userId,
        action: "CONSENT_RECONFIRMED",
        targetType: "ProcessingPurpose",
        targetId: g.purposeId,
        details: {
          consentRecordId: record.id.toString(),
          purposeCode: g.purpose.code,
          from: g.policyVersion.versionNo,
          to: current.versionNo,
        },
      });
    }
    await closeAll(tx, userId);
    return { reconfirmed: grants.length };
  });
}

/** "I've reviewed it" (e.g. after withdrawing what the user no longer wants). */
export async function acknowledge(userId: string, noticeId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const notice = await openNoticeOrThrow(tx, userId, noticeId);
    await closeAll(tx, userId);
    await appendAudit(tx, {
      actorId: userId,
      action: "POLICY_NOTICE_ACKNOWLEDGED",
      targetType: "PolicyVersion",
      targetId: notice.policyVersionId,
    });
  });
}
