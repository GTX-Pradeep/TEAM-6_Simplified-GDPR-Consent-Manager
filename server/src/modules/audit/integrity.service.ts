import { prisma } from "../../lib/prisma";
import { computeConsentHash } from "../consents/consents.service";
import { computeAuditHash, GENESIS_HASH } from "./audit.service";

/**
 * SEC-6 / FR-17: recomputes both SHA-256 hash chains from the first row to the last and
 * reports the first place where they do not match. Any change to an old row (even one
 * made directly in the database, bypassing the triggers) is detected, because its hash
 * and every following prevHash would no longer fit.
 */

export interface ChainReport {
  ok: boolean;
  checked: number;
  /** id of the first row that does not fit, if any */
  firstBrokenId: string | null;
  reason: "HASH_MISMATCH" | "BROKEN_LINK" | null;
}

export interface IntegrityReport {
  ok: boolean;
  checkedAt: Date;
  audit: ChainReport;
  consents: ChainReport;
}

const BATCH = 1000;

/** Walks a chain in id order, in batches so it also works with very many rows. */
async function walk<T extends { id: bigint; prevHash: string; hash: string }>(
  fetch: (afterId: bigint | null) => Promise<T[]>,
  hashOf: (prevHash: string, row: T) => string,
): Promise<ChainReport> {
  let expectedPrev = GENESIS_HASH;
  let checked = 0;
  let after: bigint | null = null;

  for (;;) {
    const rows = await fetch(after);
    for (const row of rows) {
      checked++;
      if (row.prevHash !== expectedPrev) {
        return { ok: false, checked, firstBrokenId: row.id.toString(), reason: "BROKEN_LINK" };
      }
      if (hashOf(row.prevHash, row) !== row.hash) {
        return { ok: false, checked, firstBrokenId: row.id.toString(), reason: "HASH_MISMATCH" };
      }
      expectedPrev = row.hash;
    }
    if (rows.length < BATCH) return { ok: true, checked, firstBrokenId: null, reason: null };
    after = rows[rows.length - 1].id;
  }
}

export async function verifyIntegrity(): Promise<IntegrityReport> {
  const [audit, consents] = await Promise.all([
    walk(
      (after) =>
        prisma.auditEntry.findMany({
          where: after === null ? {} : { id: { gt: after } },
          orderBy: { id: "asc" },
          take: BATCH,
        }),
      (prev, r) => computeAuditHash(prev, r),
    ),
    walk(
      (after) =>
        prisma.consentRecord.findMany({
          where: after === null ? {} : { id: { gt: after } },
          orderBy: { id: "asc" },
          take: BATCH,
        }),
      (prev, r) => computeConsentHash(prev, r),
    ),
  ]);
  return { ok: audit.ok && consents.ok, checkedAt: new Date(), audit, consents };
}
