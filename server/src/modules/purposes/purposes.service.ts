import { Prisma, type ProcessingPurpose } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import type { CreatePurposeInput, UpdatePurposeInput } from "./purposes.schemas";

/** FR-4: active purposes for the consent dashboard; inactive ones too for the admin screen. */
export function listPurposes(includeInactive = false): Promise<ProcessingPurpose[]> {
  return prisma.processingPurpose.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: "asc" },
  });
}

/** FR-6: admin creates a purpose. */
export async function createPurpose(input: CreatePurposeInput): Promise<ProcessingPurpose> {
  // TODO(#13): write a PURPOSE_CREATED entry to the audit trail.
  try {
    return await prisma.processingPurpose.create({ data: input });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "PURPOSE_CODE_TAKEN", `A purpose with code ${input.code} already exists`);
    }
    throw err;
  }
}

/** FR-6: admin edits name / description. */
export async function updatePurpose(id: string, input: UpdatePurposeInput): Promise<ProcessingPurpose> {
  await findOrThrow(id);
  // TODO(#13): write a PURPOSE_UPDATED entry to the audit trail.
  return prisma.processingPurpose.update({ where: { id }, data: input });
}

/**
 * FR-6: admin deactivates a purpose. It is never deleted, because existing consent
 * records point to it and must stay readable for audits.
 */
export async function deactivatePurpose(id: string): Promise<ProcessingPurpose> {
  await findOrThrow(id);
  // TODO(#13): write a PURPOSE_DEACTIVATED entry to the audit trail.
  return prisma.processingPurpose.update({ where: { id }, data: { isActive: false } });
}

async function findOrThrow(id: string): Promise<ProcessingPurpose> {
  const purpose = await prisma.processingPurpose.findUnique({ where: { id } });
  if (!purpose) throw new AppError(404, "PURPOSE_NOT_FOUND", "Processing purpose not found");
  return purpose;
}
