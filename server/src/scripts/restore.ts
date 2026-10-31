import { readFileSync } from "node:fs";
import { Prisma, type PrismaClient } from "@prisma/client";
import { BACKUP_FORMAT, TABLE_ORDER, type BackupFile } from "./backup";

/**
 * Restores a backup made by db:backup into an EMPTY database (issue #29, NFR-11).
 *   1. create an empty database (e.g. a new Neon branch) and put its URL in DATABASE_URL
 *   2. npm run db:migrate -w server
 *   3. npm run db:restore -w server -- backups/backup-....json
 * Everything is inserted in one transaction: either the whole backup is restored or nothing.
 * Ids and hashes are kept exactly, so the hash chains stay valid after the restore.
 */

const DATE_FIELDS = new Set(["createdAt", "updatedAt", "lockedUntil", "effectiveAt", "recordedAt", "acknowledgedAt"]);

/** Turns JSON values back into what Prisma expects (dates, BigInt ids, JSON null). */
export function revive(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (DATE_FIELDS.has(k)) out[k] = v === null ? null : new Date(v as string);
    else if (k === "id" && (table === "consentRecords" || table === "auditEntries")) out[k] = BigInt(v as string);
    else if (k === "details" && table === "auditEntries") out[k] = v === null ? Prisma.DbNull : v;
    else out[k] = v;
  }
  return out;
}

export function validateBackup(data: unknown): asserts data is BackupFile {
  const b = data as Partial<BackupFile> | null;
  if (!b || b.format !== BACKUP_FORMAT || !b.tables) throw new Error("This is not a Consent Manager backup file");
  for (const t of TABLE_ORDER) {
    if (!Array.isArray(b.tables[t])) throw new Error(`Backup is missing the ${t} table`);
  }
}

const MODEL: Record<(typeof TABLE_ORDER)[number], string> = {
  users: "user",
  processingPurposes: "processingPurpose",
  policyVersions: "policyVersion",
  consentRecords: "consentRecord",
  auditEntries: "auditEntry",
  policyReviewNotices: "policyReviewNotice",
};

export async function importDatabase(prisma: PrismaClient, backup: unknown): Promise<Record<string, number>> {
  validateBackup(backup);

  const existing = await prisma.user.count();
  if (existing > 0) {
    throw new Error("The target database is not empty. Restore only into a fresh, migrated database.");
  }

  const restored: Record<string, number> = {};
  await prisma.$transaction(
    async (tx) => {
      for (const table of TABLE_ORDER) {
        const rows = backup.tables[table].map((r) => revive(table, r));
        if (rows.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count } = await (tx as any)[MODEL[table]].createMany({ data: rows });
          restored[table] = count;
        } else restored[table] = 0;
      }
      // New rows after the restore must get ids after the restored ones.
      for (const t of ["consent_records", "audit_entries"]) {
        await tx.$executeRawUnsafe(
          `SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), COALESCE((SELECT MAX(id) FROM "${t}"), 0) + 1, false)`,
        );
      }
    },
    { timeout: 10 * 60_000 },
  );
  return restored;
}

/* istanbul ignore next -- command-line entry point */
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv/config");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
  const file = process.argv[2];
  if (!file) {
    // eslint-disable-next-line no-console
    console.error("Usage: npm run db:restore -w server -- backups/<file>.json");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const started = Date.now();
  importDatabase(prisma, JSON.parse(readFileSync(file, "utf8")))
    .then((r) => {
      /* eslint-disable no-console */
      console.log("Restored rows:", r);
      console.log(`Restore took ${((Date.now() - started) / 1000).toFixed(1)} s (target: under 4 hours, NFR-11)`);
      /* eslint-enable no-console */
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Restore failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
