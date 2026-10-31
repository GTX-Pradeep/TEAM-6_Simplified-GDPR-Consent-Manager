import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { retentionCutoff } from "../lib/retention";

/**
 * Logical backup of the whole database to one JSON file (issue #29, NFR-11).
 *   npm run db:backup -w server            -> server/backups/backup-<UTC time>.json
 *
 * The daily backup itself is done by Neon (point-in-time restore, 24-hour history on the
 * free plan = recovery point of 24 h). This script adds a portable copy that can be kept
 * anywhere and restored into ANY empty PostgreSQL database with db:restore.
 *
 * The file contains password hashes and e-mail addresses: keep it private. The backups/
 * folder is in .gitignore so it is never pushed to GitHub.
 */

export const BACKUP_FORMAT = "gdpr-consent-manager/backup@1";

/** Tables in foreign-key order: parents first. Restore inserts in this order. */
export const TABLE_ORDER = [
  "users",
  "processingPurposes",
  "policyVersions",
  "consentRecords",
  "auditEntries",
  "policyReviewNotices",
] as const;

export type TableName = (typeof TABLE_ORDER)[number];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  createdAt: string;
  counts: Record<TableName, number>;
  tables: Record<TableName, Record<string, unknown>[]>;
}

/** BigInt ids cannot be written by JSON.stringify, so they are stored as text. */
function plain<T extends object>(rows: T[]): Record<string, unknown>[] {
  return rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])),
  );
}

export async function exportDatabase(prisma: PrismaClient, now = new Date()): Promise<BackupFile> {
  // One read-only transaction, so every table is copied from the same moment.
  const [users, processingPurposes, policyVersions, consentRecords, auditEntries, policyReviewNotices] =
    await prisma.$transaction([
      prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.processingPurpose.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.policyVersion.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.consentRecord.findMany({ orderBy: { id: "asc" } }),
      prisma.auditEntry.findMany({ orderBy: { id: "asc" } }),
      prisma.policyReviewNotice.findMany({ orderBy: { createdAt: "asc" } }),
    ]);

  const tables = {
    users: plain(users),
    processingPurposes: plain(processingPurposes),
    policyVersions: plain(policyVersions),
    consentRecords: plain(consentRecords),
    auditEntries: plain(auditEntries),
    policyReviewNotices: plain(policyReviewNotices),
  };
  const counts = Object.fromEntries(TABLE_ORDER.map((t) => [t, tables[t].length])) as Record<TableName, number>;
  return { format: BACKUP_FORMAT, createdAt: now.toISOString(), counts, tables };
}

/** e.g. backup-2026-10-29T14-05-00Z.json */
export function backupFileName(now = new Date()): string {
  return `backup-${now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-")}.json`;
}

/* istanbul ignore next -- command-line entry point */
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv/config");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
  const prisma = new PrismaClient();
  const started = Date.now();
  exportDatabase(prisma)
    .then((backup) => {
      const dir = join(__dirname, "..", "..", "backups");
      mkdirSync(dir, { recursive: true });
      const file = join(dir, backupFileName(new Date(backup.createdAt)));
      writeFileSync(file, JSON.stringify(backup, null, 1));
      const old = backup.tables.consentRecords.filter(
        (r) => new Date(r.recordedAt as string) < retentionCutoff(),
      ).length;
      /* eslint-disable no-console */
      console.log(`Backup written: ${file}`);
      console.log("Rows:", backup.counts);
      console.log(`Consent records older than the retention period: ${old} (kept - nothing is deleted automatically)`);
      console.log(`Took ${((Date.now() - started) / 1000).toFixed(1)} s`);
      /* eslint-enable no-console */
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Backup failed:", err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
