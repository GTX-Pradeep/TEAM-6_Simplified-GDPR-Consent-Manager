import { Prisma, type PolicyVersion } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import { appendAudit } from "../audit/audit.service";
import { createNoticesForPublish } from "../notices/notices.service";
import type { CreatePolicyInput, UpdatePolicyInput } from "./policies.schemas";

/** FR-13: all versions, newest first (admin / DPO screen). */
export function listPolicies(): Promise<PolicyVersion[]> {
  return prisma.policyVersion.findMany({ orderBy: { createdAt: "desc" } });
}

/** FR-5: the policy users currently consent under. */
export async function getCurrentPolicy(): Promise<PolicyVersion> {
  const policy = await prisma.policyVersion.findFirst({ where: { status: "PUBLISHED" } });
  if (!policy) throw new AppError(404, "NO_PUBLISHED_POLICY", "No privacy policy has been published yet");
  return policy;
}

/** Any version by id, e.g. the version a user saw when giving an old consent. */
export async function getPolicy(id: string): Promise<PolicyVersion> {
  const policy = await prisma.policyVersion.findUnique({ where: { id } });
  if (!policy) throw new AppError(404, "POLICY_NOT_FOUND", "Policy version not found");
  return policy;
}

/** FR-13: admin creates a new DRAFT version. */
export async function createDraft(input: CreatePolicyInput, createdById: string): Promise<PolicyVersion> {
  try {
    return await prisma.$transaction(async (tx) => {
      const policy = await tx.policyVersion.create({ data: { ...input, createdById, status: "DRAFT" } });
      await appendAudit(tx, {
        actorId: createdById,
        action: "POLICY_DRAFT_CREATED",
        targetType: "PolicyVersion",
        targetId: policy.id,
        details: { versionNo: policy.versionNo },
      });
      return policy;
    });
  } catch (err) {
    throw mapDbError(err, input.versionNo);
  }
}

/** FR-13 / FR-15: a draft can be edited; published and superseded versions are locked. */
export async function updateDraft(id: string, input: UpdatePolicyInput, actorId: string): Promise<PolicyVersion> {
  const policy = await getPolicy(id);
  if (policy.status !== "DRAFT") throw locked(policy);
  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.policyVersion.update({ where: { id }, data: input });
      await appendAudit(tx, {
        actorId,
        action: "POLICY_DRAFT_UPDATED",
        targetType: "PolicyVersion",
        targetId: id,
        details: { versionNo: updated.versionNo, fields: Object.keys(input) },
      });
      return updated;
    });
  } catch (err) {
    throw mapDbError(err, input.versionNo);
  }
}

/**
 * FR-14: publish a draft. In ONE transaction the currently published version becomes
 * SUPERSEDED and this one becomes PUBLISHED, so there is never zero or two published
 * versions. (The database triggers also enforce both rules.)
 */
export async function publish(id: string, actorId: string): Promise<PolicyVersion> {
  try {
    return await prisma.$transaction(async (tx) => {
      const policy = await tx.policyVersion.findUnique({ where: { id } });
      if (!policy) throw new AppError(404, "POLICY_NOT_FOUND", "Policy version not found");
      if (policy.status !== "DRAFT") throw locked(policy);

      const previous = await tx.policyVersion.findFirst({ where: { status: "PUBLISHED" } });
      await tx.policyVersion.updateMany({ where: { status: "PUBLISHED" }, data: { status: "SUPERSEDED" } });
      const published = await tx.policyVersion.update({
        where: { id },
        data: { status: "PUBLISHED", effectiveAt: new Date() },
      });
      // FR-16: users whose consents refer to an older version are asked to review them.
      const usersNotified = await createNoticesForPublish(tx, published.id);
      await appendAudit(tx, {
        actorId,
        action: "POLICY_PUBLISHED",
        targetType: "PolicyVersion",
        targetId: id,
        details: { versionNo: published.versionNo, supersedes: previous?.versionNo ?? null, usersNotified },
      });
      return published;
    });
  } catch (err) {
    throw mapDbError(err);
  }
}

function locked(policy: PolicyVersion) {
  return new AppError(
    409,
    "POLICY_LOCKED",
    `Version ${policy.versionNo} is ${policy.status.toLowerCase()} and can no longer be changed`,
  );
}

/** Turns database errors into clear API errors. */
function mapDbError(err: unknown, versionNo?: string): unknown {
  if (err instanceof AppError) return err;
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return new AppError(409, "POLICY_VERSION_TAKEN", `Version ${versionNo ?? ""} already exists`.trim());
  }
  // Raised by the database triggers from the init migration.
  const message = err instanceof Error ? err.message : "";
  if (message.includes("POLICY_LOCKED")) {
    return new AppError(409, "POLICY_LOCKED", "This policy version can no longer be changed");
  }
  if (message.includes("POLICY_CONFLICT")) {
    return new AppError(409, "POLICY_CONFLICT", "Another version was published at the same time, try again");
  }
  return err;
}
