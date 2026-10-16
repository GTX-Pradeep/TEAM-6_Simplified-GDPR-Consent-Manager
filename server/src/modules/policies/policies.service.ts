import { Prisma, type PolicyVersion } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
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
    // TODO(#13): write a POLICY_DRAFT_CREATED entry to the audit trail.
    return await prisma.policyVersion.create({ data: { ...input, createdById, status: "DRAFT" } });
  } catch (err) {
    throw mapDbError(err, input.versionNo);
  }
}

/** FR-13 / FR-15: a draft can be edited; published and superseded versions are locked. */
export async function updateDraft(id: string, input: UpdatePolicyInput): Promise<PolicyVersion> {
  const policy = await getPolicy(id);
  if (policy.status !== "DRAFT") throw locked(policy);
  try {
    return await prisma.policyVersion.update({ where: { id }, data: input });
  } catch (err) {
    throw mapDbError(err, input.versionNo);
  }
}

/**
 * FR-14: publish a draft. In ONE transaction the currently published version becomes
 * SUPERSEDED and this one becomes PUBLISHED, so there is never zero or two published
 * versions. (The database triggers also enforce both rules.)
 */
export async function publish(id: string): Promise<PolicyVersion> {
  try {
    return await prisma.$transaction(async (tx) => {
      const policy = await tx.policyVersion.findUnique({ where: { id } });
      if (!policy) throw new AppError(404, "POLICY_NOT_FOUND", "Policy version not found");
      if (policy.status !== "DRAFT") throw locked(policy);

      await tx.policyVersion.updateMany({ where: { status: "PUBLISHED" }, data: { status: "SUPERSEDED" } });
      const published = await tx.policyVersion.update({
        where: { id },
        data: { status: "PUBLISHED", effectiveAt: new Date() },
      });
      // TODO(#20): create re-confirmation notices for affected users (FR-16).
      // TODO(#13): write a POLICY_PUBLISHED entry to the audit trail.
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
