import { Prisma, type ProcessingPurpose } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import { appendAudit } from "../audit/audit.service";
import type { CreatePurposeInput, UpdatePurposeInput } from "./purposes.schemas";

/** FR-4: active purposes for the consent dashboard; inactive ones too for the admin screen. */
export function listPurposes(includeInactive = false): Promise<ProcessingPurpose[]> {
  return prisma.processingPurpose.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: "asc" },
  });
}

/** FR-6: admin creates a purpose (with its audit entry, in one transaction). */
export async function createPurpose(input: CreatePurposeInput, actorId: string): Promise<ProcessingPurpose> {
  try {
    return await prisma.$transaction(async (tx) => {
      const purpose = await tx.processingPurpose.create({ data: input });
      await appendAudit(tx, {
        actorId,
        action: "PURPOSE_CREATED",
        targetType: "ProcessingPurpose",
        targetId: purpose.id,
        details: { code: purpose.code, name: purpose.name },
      });
      return purpose;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "PURPOSE_CODE_TAKEN", `A purpose with code ${input.code} already exists`);
    }
    throw err;
  }
}

/** FR-6: admin edits name / description. */
export async function updatePurpose(
  id: string,
  input: UpdatePurposeInput,
  actorId: string,
): Promise<ProcessingPurpose> {
  const before = await findOrThrow(id);
  return prisma.$transaction(async (tx) => {
    const purpose = await tx.processingPurpose.update({ where: { id }, data: input });
    await appendAudit(tx, {
      actorId,
      action: "PURPOSE_UPDATED",
      targetType: "ProcessingPurpose",
      targetId: id,
      details: { before: { name: before.name, description: before.description }, after: input },
    });
    return purpose;
  });
}

/**
 * FR-6: admin deactivates a purpose. It is never deleted, because existing consent
 * records point to it and must stay readable for audits.
 */
export async function deactivatePurpose(id: string, actorId: string): Promise<ProcessingPurpose> {
  await findOrThrow(id);
  return prisma.$transaction(async (tx) => {
    const purpose = await tx.processingPurpose.update({ where: { id }, data: { isActive: false } });
    await appendAudit(tx, {
      actorId,
      action: "PURPOSE_DEACTIVATED",
      targetType: "ProcessingPurpose",
      targetId: id,
      details: { code: purpose.code },
    });
    return purpose;
  });
}

async function findOrThrow(id: string): Promise<ProcessingPurpose> {
  const purpose = await prisma.processingPurpose.findUnique({ where: { id } });
  if (!purpose) throw new AppError(404, "PURPOSE_NOT_FOUND", "Processing purpose not found");
  return purpose;
}
