import request from "supertest";

/** Tests for issue #27 (SEC-6, FR-17; TC-SEC-06): recomputing both hash chains. */

type AnyRow = Record<string, unknown> & { id: bigint; prevHash: string; hash: string };
const db = { audit: [] as AnyRow[], consents: [] as AnyRow[] };

jest.mock("./audit.service", () => ({
  ...jest.requireActual("./audit.service"),
  recordAuditSafely: jest.fn(async () => undefined),
}));

jest.mock("../../lib/prisma", () => {
  const finder = (rows: () => AnyRow[]) =>
    jest.fn(async ({ where, take }: { where: { id?: { gt: bigint } }; take: number }) =>
      rows()
        .filter((r) => !where.id || r.id > where.id.gt)
        .sort((a, b) => Number(a.id - b.id))
        .slice(0, take),
    );
  return {
    prisma: {
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          ({ "dpo-1": { id: "dpo-1", name: "D", email: "d@x.com", role: "DPO", isActive: true, sessionVersion: 0 } })[where.id] ??
          null,
        ),
      },
      auditEntry: { findMany: finder(() => db.audit) },
      consentRecord: { findMany: finder(() => db.consents) },
    },
  };
});

/* eslint-disable @typescript-eslint/no-var-requires */
const { computeAuditHash, GENESIS_HASH } = require("./audit.service") as typeof import("./audit.service");
const { computeConsentHash } = require("../consents/consents.service") as typeof import("../consents/consents.service");
const { verifyIntegrity } = require("./integrity.service") as typeof import("./integrity.service");
const { createApp } = require("../../app") as typeof import("../../app");
const { signSession } = require("../../lib/session") as typeof import("../../lib/session");
const { recordAuditSafely } = require("./audit.service") as { recordAuditSafely: jest.Mock };
/* eslint-enable @typescript-eslint/no-var-requires */

/** Builds valid chains the same way the app does. */
function build(auditCount: number, consentCount: number) {
  db.audit = [];
  db.consents = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= auditCount; i++) {
    const row = {
      id: BigInt(i),
      actorId: i % 3 ? "u1" : null,
      action: i % 2 ? "CONSENT_GRANTED" : "LOGIN_FAILED",
      targetType: "User",
      targetId: "u1",
      outcome: i % 2 ? "SUCCESS" : "FAILURE",
      details: i % 4 ? { n: i, nested: { b: 2, a: 1 } } : null,
      createdAt: new Date(Date.UTC(2026, 9, 1) + i * 1000),
      prevHash: prev,
      hash: "",
    } as AnyRow;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    row.hash = computeAuditHash(prev, row as any);
    prev = row.hash;
    db.audit.push(row);
  }
  prev = GENESIS_HASH;
  for (let i = 1; i <= consentCount; i++) {
    const row = {
      id: BigInt(i),
      userId: "u1",
      purposeId: "p1",
      action: i % 2 ? "GRANTED" : "WITHDRAWN",
      policyVersionId: "v1",
      recordedAt: new Date(Date.UTC(2026, 9, 1) + i * 1000),
      prevHash: prev,
      hash: "",
    } as AnyRow;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    row.hash = computeConsentHash(prev, row as any);
    prev = row.hash;
    db.consents.push(row);
  }
}

describe("verifyIntegrity (#27)", () => {
  it("reports both chains intact, across more than one batch", async () => {
    build(1500, 30);
    const r = await verifyIntegrity();
    expect(r.ok).toBe(true);
    expect(r.audit).toEqual({ ok: true, checked: 1500, firstBrokenId: null, reason: null });
    expect(r.consents.checked).toBe(30);
  });

  it("an empty database is fine", async () => {
    build(0, 0);
    expect((await verifyIntegrity()).ok).toBe(true);
  });

  it("detects a changed audit entry (someone edited the action in the database)", async () => {
    build(20, 5);
    db.audit[11].action = "CONSENT_WITHDRAWN";
    const r = await verifyIntegrity();
    expect(r.ok).toBe(false);
    expect(r.audit).toMatchObject({ ok: false, firstBrokenId: "12", reason: "HASH_MISMATCH" });
    expect(r.consents.ok).toBe(true);
  });

  it("detects a changed consent decision", async () => {
    build(5, 10);
    db.consents[3].action = db.consents[3].action === "GRANTED" ? "WITHDRAWN" : "GRANTED";
    expect((await verifyIntegrity()).consents).toMatchObject({ ok: false, firstBrokenId: "4", reason: "HASH_MISMATCH" });
  });

  it("detects a deleted row (the next row no longer links back)", async () => {
    build(10, 3);
    db.audit.splice(4, 1); // remove id 5
    expect((await verifyIntegrity()).audit).toMatchObject({ ok: false, firstBrokenId: "6", reason: "BROKEN_LINK" });
  });

  it("detects a row whose hash was recomputed to hide a change", async () => {
    build(10, 3);
    const r = db.audit[2];
    r.targetId = "someone-else";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.hash = computeAuditHash(r.prevHash, r as any);
    expect((await verifyIntegrity()).audit).toMatchObject({ ok: false, firstBrokenId: "4", reason: "BROKEN_LINK" });
  });
});

describe("GET /api/v1/audit/verify (#27)", () => {
  const app = createApp();
  const asDpo = `gdpr_session=${signSession({ sub: "dpo-1", role: "DPO", sv: 0 })}`;

  it("returns the report and logs that a check was made", async () => {
    build(8, 4);
    recordAuditSafely.mockClear();
    const res = await request(app).get("/api/v1/audit/verify").set("Cookie", asDpo);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, audit: { checked: 8 }, consents: { checked: 4 } });
    expect(recordAuditSafely).toHaveBeenCalledWith(
      expect.objectContaining({ action: "INTEGRITY_CHECKED", actorId: "dpo-1", outcome: "SUCCESS" }),
    );
  });

  it("needs DPO or ADMIN", async () => {
    expect((await request(app).get("/api/v1/audit/verify")).status).toBe(401);
  });
});
