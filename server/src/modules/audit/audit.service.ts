import { createHash } from "node:crypto";
import type { AuditEntry, AuditOutcome, Prisma } from "@prisma/client";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";

/**
 * Append-only, hash-chained audit trail (SRS FR-17, SEC-6).
 *
 * Every entry stores the hash of the entry before it (prevHash) and its own
 * hash = SHA-256(prevHash + its content). Changing or deleting any old entry
 * breaks every hash after it, so tampering is detectable. The database also
 * rejects UPDATE and DELETE on audit_entries (trigger in the init migration).
 */

/** prevHash of the very first entry. */
export const GENESIS_HASH = "0".repeat(64);

/** Arbitrary constant used as the PostgreSQL advisory-lock key for the audit chain. */
const AUDIT_CHAIN_LOCK = 72_120_017;

export interface AuditEvent {
  /** Who did it (null for anonymous actions such as a failed login with an unknown e-mail). */
  actorId: string | null;
  /** What happened, e.g. CONSENT_GRANTED, POLICY_PUBLISHED, LOGIN_FAILED. */
  action: string;
  /** What it happened to, e.g. ProcessingPurpose + its id. */
  targetType: string;
  targetId: string;
  outcome?: AuditOutcome;
  /** Extra facts. Never put passwords or e-mail addresses here (NFR-9). */
  details?: Prisma.InputJsonValue;
}

/** JSON with sorted keys, so the same content always gives the same hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The hash of one audit entry. Also used later by the integrity check (#27). */
export function computeAuditHash(
  prevHash: string,
  entry: Pick<AuditEntry, "actorId" | "action" | "targetType" | "targetId" | "outcome" | "createdAt"> & {
    details: unknown;
  },
): string {
  return sha256(
    prevHash +
      canonicalJson({
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        outcome: entry.outcome,
        details: entry.details ?? null,
        createdAt: entry.createdAt,
      }),
  );
}

/**
 * Adds one entry to the chain INSIDE the caller's transaction, so the business
 * change and its audit entry are saved together or not at all (FR-10).
 */
export async function appendAudit(tx: Prisma.TransactionClient, event: AuditEvent): Promise<AuditEntry> {
  // Only one transaction at a time may extend the chain; otherwise two entries
  // could point to the same prevHash. The lock is released at commit/rollback.
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);

  const last = await tx.auditEntry.findFirst({ orderBy: { id: "desc" }, select: { hash: true } });
  const prevHash = last?.hash ?? GENESIS_HASH;
  const createdAt = new Date();
  const outcome = event.outcome ?? "SUCCESS";
  const hash = computeAuditHash(prevHash, { ...event, outcome, createdAt, details: event.details });

  return tx.auditEntry.create({
    data: {
      actorId: event.actorId,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      outcome,
      details: event.details,
      createdAt,
      prevHash,
      hash,
    },
  });
}

/** Records an event in its own transaction (used when there is no business change, e.g. a failed login). */
export function recordAudit(event: AuditEvent): Promise<AuditEntry> {
  return prisma.$transaction((tx) => appendAudit(tx, event));
}

/**
 * Like recordAudit, but never throws: a problem writing a security log entry must
 * not stop the request itself. The problem is logged instead.
 */
export async function recordAuditSafely(event: AuditEvent): Promise<void> {
  try {
    await recordAudit(event);
  } catch (err) {
    logger.error({ err, action: event.action }, "could not write audit entry");
  }
}
