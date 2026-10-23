/** Tests for issue #13: the SHA-256 hash chain of the audit trail (FR-17, SEC-6). */

process.env.DATABASE_URL = "postgresql://test@localhost/test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
process.env.NODE_ENV = "test";

jest.mock("../../lib/prisma", () => ({ prisma: {} }));

/* eslint-disable @typescript-eslint/no-var-requires */
const audit = require("./audit.service") as typeof import("./audit.service");
/* eslint-enable @typescript-eslint/no-var-requires */

type Row = { id: number; hash: string; prevHash: string; [k: string]: unknown };

/** A fake transaction with an in-memory audit_entries table. */
function fakeTx() {
  const rows: Row[] = [];
  const tx = {
    $executeRawUnsafe: jest.fn(async () => 0),
    auditEntry: {
      findFirst: jest.fn(async () => (rows.length ? rows[rows.length - 1] : null)),
      create: jest.fn(async ({ data }: { data: Omit<Row, "id"> }) => {
        const row = { id: rows.length + 1, ...data } as Row;
        rows.push(row);
        return row;
      }),
    },
  };
  return { tx, rows };
}

const event = { actorId: "u1", action: "CONSENT_GRANTED", targetType: "ProcessingPurpose", targetId: "p1" };

describe("canonicalJson", () => {
  it("gives the same text whatever the key order", () => {
    expect(audit.canonicalJson({ b: 1, a: { d: 2, c: [3, null] } })).toBe(
      audit.canonicalJson({ a: { c: [3, null], d: 2 }, b: 1 }),
    );
  });

  it("writes dates as ISO strings", () => {
    expect(audit.canonicalJson({ t: new Date("2026-10-23T00:00:00.000Z") })).toBe('{"t":"2026-10-23T00:00:00.000Z"}');
  });
});

describe("appendAudit", () => {
  it("the first entry points to the genesis hash", async () => {
    const { tx, rows } = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await audit.appendAudit(tx as any, event);
    expect(rows[0].prevHash).toBe(audit.GENESIS_HASH);
    expect(rows[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].outcome).toBe("SUCCESS");
  });

  it("each entry points to the hash of the one before (a chain)", async () => {
    const { tx, rows } = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (let i = 0; i < 3; i++) await audit.appendAudit(tx as any, { ...event, targetId: `p${i}` });
    expect(rows[1].prevHash).toBe(rows[0].hash);
    expect(rows[2].prevHash).toBe(rows[1].hash);
  });

  it("takes the chain lock before reading the last entry", async () => {
    const { tx } = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await audit.appendAudit(tx as any, event);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"));
    expect(tx.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      tx.auditEntry.findFirst.mock.invocationCallOrder[0],
    );
  });

  it("the stored hash can be recomputed, and any change to the entry is detected", async () => {
    const { tx, rows } = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await audit.appendAudit(tx as any, { ...event, details: { purpose: "MARKETING" } });
    const row = rows[0] as unknown as Parameters<typeof audit.computeAuditHash>[1] & Row;

    expect(audit.computeAuditHash(row.prevHash, row)).toBe(row.hash);
    expect(audit.computeAuditHash(row.prevHash, { ...row, action: "CONSENT_WITHDRAWN" })).not.toBe(row.hash);
    expect(audit.computeAuditHash(row.prevHash, { ...row, details: { purpose: "ANALYTICS" } })).not.toBe(row.hash);
  });
});
