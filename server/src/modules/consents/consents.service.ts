import type { ConsentAction, ConsentRecord, PolicyVersion, Prisma, ProcessingPurpose } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import { appendAudit, canonicalJson, GENESIS_HASH, sha256 } from "../audit/audit.service";
import type { ConsentActionInput } from "./consents.schemas";

/** Advisory-lock key for the consent hash chain (different from the audit chain). */
const CONSENT_CHAIN_LOCK = 72_120_007;

export type ConsentStatus = "GRANTED" | "WITHDRAWN" | "NOT_GIVEN";

/** What the browser gets for one consent decision. (The database id is a BigInt, sent as text.) */
export interface ConsentDto {
  id: string;
  purposeId: string;
  action: ConsentAction;
  recordedAt: Date;
  policyVersion: { id: string; versionNo: string };
}

/** One card on the consent dashboard (FR-4). */
export interface ConsentStateDto {
  purpose: Pick<ProcessingPurpose, "id" | "code" | "name" | "description">;
  status: ConsentStatus;
  updatedAt: Date | null;
  policyVersion: { id: string; versionNo: string } | null;
}

/**
 * Hash of one consent record. Each record also stores the hash of the record before it,
 * so the consent history forms a tamper-evident chain (FR-11, SEC-6).
 */
export function computeConsentHash(
  prevHash: string,
  r: Pick<ConsentRecord, "userId" | "purposeId" | "action" | "policyVersionId" | "recordedAt">,
): string {
  return sha256(
    prevHash +
      canonicalJson({
        userId: r.userId,
        purposeId: r.purposeId,
        action: r.action,
        policyVersionId: r.policyVersionId,
        recordedAt: r.recordedAt,
      }),
  );
}

/**
 * Adds one record to the end of the consent hash chain, inside the caller's transaction.
 * Used for every new decision (grant, withdraw, re-confirm). Never updates old rows.
 */
export async function appendConsentRecord(
  tx: Prisma.TransactionClient,
  input: { userId: string; purposeId: string; action: ConsentAction; policyVersionId: string },
): Promise<ConsentRecord> {
  // One writer at a time extends the chain, so two records never share a prevHash.
  // (Advisory locks are re-entrant, so taking it again in the same transaction is fine.)
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CONSENT_CHAIN_LOCK})`);
  const last = await tx.consentRecord.findFirst({ orderBy: { id: "desc" }, select: { hash: true } });
  const prevHash = last?.hash ?? GENESIS_HASH;
  const data = { ...input, recordedAt: new Date() }; // stored as timestamptz, i.e. UTC (NFR-13)
  return tx.consentRecord.create({ data: { ...data, prevHash, hash: computeConsentHash(prevHash, data) } });
}

/**
 * FR-7 / FR-8 / FR-9 / FR-10: grant or withdraw consent for one purpose.
 * - the purpose must exist and be active
 * - the record stores the UTC time and the policy version in force right now
 * - granting twice (or withdrawing something not granted) is refused
 * - the consent record and its audit entry are written in ONE transaction (NFR-5)
 * Records are never updated or deleted; a withdrawal is a new record (FR-11).
 */
export async function recordConsent(userId: string, input: ConsentActionInput): Promise<ConsentDto> {
  return prisma.$transaction(async (tx) => {
    // One writer at a time extends the chain, so two records never share a prevHash.
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CONSENT_CHAIN_LOCK})`);

    const purpose = await tx.processingPurpose.findUnique({ where: { id: input.purposeId } });
    if (!purpose) throw new AppError(404, "PURPOSE_NOT_FOUND", "Processing purpose not found");
    if (!purpose.isActive) {
      throw new AppError(409, "PURPOSE_INACTIVE", "This purpose is no longer offered");
    }

    const policy = await tx.policyVersion.findFirst({ where: { status: "PUBLISHED" } });
    if (!policy) {
      throw new AppError(409, "NO_PUBLISHED_POLICY", "Consent cannot be recorded before a privacy policy is published");
    }

    const latest = await tx.consentRecord.findFirst({
      where: { userId, purposeId: purpose.id },
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    });
    const current: ConsentStatus = latest?.action ?? "NOT_GIVEN";
    if (input.action === "GRANTED" && current === "GRANTED") {
      throw new AppError(409, "CONSENT_UNCHANGED", "You have already given consent for this purpose");
    }
    if (input.action === "WITHDRAWN" && current !== "GRANTED") {
      throw new AppError(409, "CONSENT_UNCHANGED", "There is no consent to withdraw for this purpose");
    }

    const record = await appendConsentRecord(tx, {
      userId,
      purposeId: purpose.id,
      action: input.action,
      policyVersionId: policy.id,
    });

    await appendAudit(tx, {
      actorId: userId,
      action: input.action === "GRANTED" ? "CONSENT_GRANTED" : "CONSENT_WITHDRAWN",
      targetType: "ProcessingPurpose",
      targetId: purpose.id,
      details: { consentRecordId: record.id.toString(), purposeCode: purpose.code, policyVersion: policy.versionNo },
    });

    return toDto(record, policy);
  });
}

/**
 * FR-4: the user's current choice for every active purpose. The current state is
 * simply the newest record per purpose; nothing is stored twice.
 */
export async function getCurrentState(
  userId: string,
): Promise<{ purposes: ConsentStateDto[]; currentPolicy: { id: string; versionNo: string } | null }> {
  const [purposes, latest, policy] = await Promise.all([
    prisma.processingPurpose.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.consentRecord.findMany({
      where: { userId },
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
      distinct: ["purposeId"],
      include: { policyVersion: { select: { id: true, versionNo: true } } },
    }),
    prisma.policyVersion.findFirst({ where: { status: "PUBLISHED" }, select: { id: true, versionNo: true } }),
  ]);

  const byPurpose = new Map(latest.map((r) => [r.purposeId, r]));
  return {
    currentPolicy: policy,
    purposes: purposes.map((p) => {
      const r = byPurpose.get(p.id);
      return {
        purpose: { id: p.id, code: p.code, name: p.name, description: p.description },
        status: r?.action ?? "NOT_GIVEN",
        updatedAt: r?.recordedAt ?? null,
        policyVersion: r ? r.policyVersion : null,
      };
    }),
  };
}

/** One line of the user's consent history (FR-12). */
export interface HistoryItemDto {
  id: string;
  action: ConsentAction;
  recordedAt: Date;
  purpose: { id: string; code: string; name: string };
  policyVersion: { id: string; versionNo: string };
}

/**
 * FR-12: every consent decision the user ever made, newest first. Because records
 * are append-only, this is the complete and unchangeable history.
 */
export async function getHistory(userId: string, limit = 100): Promise<HistoryItemDto[]> {
  const rows = await prisma.consentRecord.findMany({
    where: { userId },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    take: limit,
    include: {
      purpose: { select: { id: true, code: true, name: true } },
      policyVersion: { select: { id: true, versionNo: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    action: r.action,
    recordedAt: r.recordedAt,
    purpose: r.purpose,
    policyVersion: r.policyVersion,
  }));
}

function toDto(record: ConsentRecord, policy: Pick<PolicyVersion, "id" | "versionNo">): ConsentDto {
  return {
    id: record.id.toString(),
    purposeId: record.purposeId,
    action: record.action,
    recordedAt: record.recordedAt,
    policyVersion: { id: policy.id, versionNo: policy.versionNo },
  };
}
