import { Prisma } from "@prisma/client";
import { BACKUP_FORMAT, TABLE_ORDER, backupFileName, exportDatabase } from "./backup";
import { importDatabase, revive, validateBackup } from "./restore";
import { isWithinRetention, retentionCutoff } from "../lib/retention";

/** Tests for issue #29 (NFR-8 retention, NFR-11 backup/restore; TC-DATA-01, TC-REL-03). */

type Row = Record<string, unknown>;

/** A fake Prisma client with in-memory tables. */
function fakeDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    user: [],
    processingPurpose: [],
    policyVersion: [],
    consentRecord: [],
    auditEntry: [],
    policyReviewNotice: [],
    ...seed,
  };
  const inserted: string[] = [];
  const model = (name: string) => ({
    findMany: jest.fn(async () => tables[name]),
    count: jest.fn(async () => tables[name].length),
    createMany: jest.fn(async ({ data }: { data: Row[] }) => {
      inserted.push(name);
      tables[name].push(...data);
      return { count: data.length };
    }),
  });
  const prisma: Record<string, unknown> = Object.fromEntries(Object.keys(tables).map((t) => [t, model(t)]));
  prisma.$executeRawUnsafe = jest.fn(async () => 1);
  prisma.$transaction = jest.fn(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma),
  );
  return { prisma, tables, inserted };
}

const t0 = new Date("2026-10-20T09:00:00.000Z");
const sample = {
  user: [{ id: "u1", name: "Asha", email: "user@demo.com", passwordHash: "$2a$12$x", role: "USER", createdAt: t0, lockedUntil: null }],
  processingPurpose: [{ id: "p1", code: "ANALYTICS", name: "Analytics", description: "d", isActive: true, createdAt: t0, updatedAt: t0 }],
  policyVersion: [{ id: "v1", versionNo: "1.0", status: "PUBLISHED", effectiveAt: t0, createdAt: t0, createdById: "u1" }],
  consentRecord: [{ id: 7n, userId: "u1", purposeId: "p1", action: "GRANTED", policyVersionId: "v1", recordedAt: t0, prevHash: "0", hash: "a" }],
  auditEntry: [
    { id: 1n, actorId: "u1", action: "CONSENT_GRANTED", details: { purposeCode: "ANALYTICS" }, createdAt: t0, prevHash: "0", hash: "b" },
    { id: 2n, actorId: null, action: "LOGIN_FAILED", details: null, createdAt: t0, prevHash: "b", hash: "c" },
  ],
};

describe("backup (#29)", () => {
  it("exports every table with row counts and turns BigInt ids into text", async () => {
    const { prisma } = fakeDb(sample);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backup = await exportDatabase(prisma as any, new Date("2026-10-29T14:05:00.000Z"));

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.counts).toEqual({
      users: 1,
      processingPurposes: 1,
      policyVersions: 1,
      consentRecords: 1,
      auditEntries: 2,
      policyReviewNotices: 0,
    });
    expect(backup.tables.consentRecords[0].id).toBe("7");
    expect(() => JSON.stringify(backup)).not.toThrow();
  });

  it("names files by UTC time, safe for Windows", () => {
    expect(backupFileName(new Date("2026-10-29T14:05:00.123Z"))).toBe("backup-2026-10-29T14-05-00Z.json");
  });
});

describe("restore (#29)", () => {
  async function backupJson() {
    const { prisma } = fakeDb(sample);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return JSON.parse(JSON.stringify(await exportDatabase(prisma as any)));
  }

  it("restores into an empty database in foreign-key order and resets the id sequences", async () => {
    const data = await backupJson();
    const target = fakeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await importDatabase(target.prisma as any, data);

    expect(target.inserted).toEqual(["user", "processingPurpose", "policyVersion", "consentRecord", "auditEntry"]);
    expect(result).toMatchObject({ users: 1, consentRecords: 1, auditEntries: 2, policyReviewNotices: 0 });
    expect(target.prisma.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("consent_records"));
    expect(target.prisma.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("audit_entries"));
  });

  it("keeps ids, hashes and dates exactly (so the hash chains stay valid)", async () => {
    const data = await backupJson();
    const target = fakeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await importDatabase(target.prisma as any, data);

    const c = target.tables.consentRecord[0];
    expect(c.id).toBe(7n);
    expect(c.hash).toBe("a");
    expect((c.recordedAt as Date).toISOString()).toBe(t0.toISOString());
    expect(target.tables.auditEntry[1].details).toBe(Prisma.DbNull);
    expect(target.tables.auditEntry[0].details).toEqual({ purposeCode: "ANALYTICS" });
  });

  it("refuses to restore over existing data", async () => {
    const data = await backupJson();
    const target = fakeDb({ user: [{ id: "someone" }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(importDatabase(target.prisma as any, data)).rejects.toThrow(/not empty/);
    expect(target.inserted).toEqual([]);
  });

  it("rejects files that are not our backups", () => {
    expect(() => validateBackup({ hello: 1 })).toThrow(/not a Consent Manager backup/);
    const missing = { format: BACKUP_FORMAT, tables: Object.fromEntries(TABLE_ORDER.slice(1).map((t) => [t, []])) };
    expect(() => validateBackup(missing)).toThrow(/missing the users table/);
  });

  it("revive leaves unknown fields untouched", () => {
    expect(revive("users", { name: "A", lockedUntil: null })).toEqual({ name: "A", lockedUntil: null });
  });
});

describe("retention (NFR-8)", () => {
  const now = new Date("2026-10-29T00:00:00.000Z");

  it("defaults to 3 years", () => {
    expect(retentionCutoff(now).toISOString()).toBe("2023-10-29T00:00:00.000Z");
  });

  it("records inside the period are protected, older ones are not", () => {
    expect(isWithinRetention(new Date("2024-01-01T00:00:00.000Z"), now)).toBe(true);
    expect(isWithinRetention(new Date("2023-01-01T00:00:00.000Z"), now)).toBe(false);
    expect(isWithinRetention(new Date("2023-01-01T00:00:00.000Z"), now, 5)).toBe(true);
  });
});
