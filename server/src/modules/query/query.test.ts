import request from "supertest";

/** Tests for issue #22 (FR-18; TC-DPO-*): read-only consent records and audit trail for the DPO. */

type Consent = { id: bigint; recordedAt: Date; action: string; hash: string; userId: string };
type Audit = { id: bigint; createdAt: Date; action: string; outcome: string; actorId: string | null };

const db = {
  users: [
    { id: "dpo-1", name: "Meera DPO", email: "dpo@demo.com", role: "DPO", isActive: true, sessionVersion: 0 },
    { id: "admin-1", name: "Ravi Admin", email: "admin@demo.com", role: "ADMIN", isActive: true, sessionVersion: 0 },
    { id: "user-1", name: "Asha User", email: "user@demo.com", role: "USER", isActive: true, sessionVersion: 0 },
  ],
  consents: [] as Consent[],
  audit: [] as Audit[],
};

jest.mock("../audit/audit.service", () => ({
  ...jest.requireActual("../audit/audit.service"),
  recordAuditSafely: jest.fn(async () => undefined),
}));

jest.mock("../../lib/prisma", () => {
  const page = <T>(rows: T[], args: { skip: number; take: number }) => rows.slice(args.skip, args.skip + args.take);
  const prisma = {
    user: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => db.users.find((u) => u.id === where.id) ?? null) },
    consentRecord: {
      findMany: jest.fn(async (args: { skip: number; take: number }) =>
        page([...db.consents].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime()), args).map((c) => ({
          ...c,
          purposeId: "p1",
          user: { id: c.userId, name: "Asha User", email: "user@demo.com" },
          purpose: { id: "p1", code: "ANALYTICS", name: "Usage analytics" },
          policyVersion: { id: "v1", versionNo: "1.0" },
        })),
      ),
      count: jest.fn(async () => db.consents.length),
    },
    auditEntry: {
      findMany: jest.fn(async (args: { skip: number; take: number }) =>
        page([...db.audit].sort((a, b) => Number(b.id - a.id)), args).map((a) => ({
          ...a,
          targetType: "User",
          targetId: "user-1",
          details: null,
          prevHash: "p",
          hash: "h",
          actor: a.actorId ? { id: a.actorId, name: "Asha User", email: "user@demo.com" } : null,
        })),
      ),
      count: jest.fn(async () => db.audit.length),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma };
});

/* eslint-disable @typescript-eslint/no-var-requires */
const { createApp } = require("../../app") as typeof import("../../app");
const { signSession } = require("../../lib/session") as typeof import("../../lib/session");
/* eslint-enable @typescript-eslint/no-var-requires */

const app = createApp();
const as = (sub: string, role: "DPO" | "ADMIN" | "USER") => `gdpr_session=${signSession({ sub, role, sv: 0 })}`;
const asDpo = as("dpo-1", "DPO");

beforeAll(() => {
  for (let i = 1; i <= 120; i++) {
    db.consents.push({
      id: BigInt(i),
      recordedAt: new Date(Date.UTC(2026, 9, 1) + i * 60_000),
      action: i % 2 ? "GRANTED" : "WITHDRAWN",
      hash: `h${i}`,
      userId: "user-1",
    });
  }
  for (let i = 1; i <= 7; i++) {
    db.audit.push({ id: BigInt(i), createdAt: new Date(), action: i === 7 ? "LOGIN_FAILED" : "CONSENT_GRANTED", outcome: i === 7 ? "FAILURE" : "SUCCESS", actorId: i === 7 ? null : "user-1" });
  }
});

describe("GET /api/v1/consents (FR-18)", () => {
  it("returns the newest records first with user, purpose and policy version", async () => {
    const res = await request(app).get("/api/v1/consents").set("Cookie", asDpo);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 120, page: 1, pageSize: 50 });
    expect(res.body.items).toHaveLength(50);
    expect(res.body.items[0]).toMatchObject({
      id: "120",
      user: { email: "user@demo.com" },
      purpose: { code: "ANALYTICS" },
      policyVersion: { versionNo: "1.0" },
    });
  });

  it("pages through the results", async () => {
    const res = await request(app).get("/api/v1/consents?page=3&pageSize=50").set("Cookie", asDpo);
    expect(res.body.items).toHaveLength(20);
    expect(res.body.items[19].id).toBe("1");
  });

  it("rejects a page size above 100", async () => {
    expect((await request(app).get("/api/v1/consents?pageSize=500").set("Cookie", asDpo)).status).toBe(400);
  });

  it("is for DPO and ADMIN only", async () => {
    expect((await request(app).get("/api/v1/consents").set("Cookie", as("admin-1", "ADMIN"))).status).toBe(200);
    expect((await request(app).get("/api/v1/consents").set("Cookie", as("user-1", "USER"))).status).toBe(403);
    expect((await request(app).get("/api/v1/consents")).status).toBe(401);
  });
});

describe("GET /api/v1/audit (FR-17, FR-18)", () => {
  it("lists audit entries newest first, including anonymous failures", async () => {
    const res = await request(app).get("/api/v1/audit").set("Cookie", asDpo);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    expect(res.body.items[0]).toMatchObject({ id: "7", action: "LOGIN_FAILED", outcome: "FAILURE", actor: null });
    expect(res.body.items[1].actor.email).toBe("user@demo.com");
  });

  it("is read-only: there is no route to change or delete entries", async () => {
    for (const method of ["post", "patch", "put", "delete"] as const) {
      const res = await request(app)[method]("/api/v1/audit").set("Cookie", asDpo);
      expect(res.status).toBe(404);
    }
  });

  it("a USER cannot read the audit trail", async () => {
    expect((await request(app).get("/api/v1/audit").set("Cookie", as("user-1", "USER"))).status).toBe(403);
  });
});

describe("search and filter (FR-19, #26)", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prisma } = require("../../lib/prisma") as {
    prisma: { consentRecord: { findMany: jest.Mock; count: jest.Mock }; auditEntry: { findMany: jest.Mock } };
  };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { consentWhere, auditWhere } = require("./query.service") as typeof import("./query.service");

  it("passes every consent filter to the database query", async () => {
    prisma.consentRecord.findMany.mockClear();
    const res = await request(app)
      .get("/api/v1/consents?user=asha&purpose=analytics&action=GRANTED&policyVersion=2.0&from=2026-10-01&to=2026-10-29")
      .set("Cookie", asDpo);
    expect(res.status).toBe(200);
    const where = prisma.consentRecord.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      user: { OR: [{ email: { contains: "asha", mode: "insensitive" } }, { name: { contains: "asha", mode: "insensitive" } }] },
      purpose: { code: { equals: "analytics", mode: "insensitive" } },
      action: "GRANTED",
      policyVersion: { versionNo: "2.0" },
      recordedAt: { gte: new Date("2026-10-01T00:00:00.000Z"), lt: new Date("2026-10-30T00:00:00.000Z") },
    });
    expect(prisma.consentRecord.count.mock.calls.at(-1)[0].where).toEqual(where);
  });

  it("a date-only 'to' includes that whole day; a full time is used as given", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { consentFilterSchema } = require("./query.schemas") as typeof import("./query.schemas");
    expect(consentFilterSchema.parse({ to: "2026-10-29" }).to?.toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect(consentFilterSchema.parse({ to: "2026-10-29T12:00:00Z" }).to?.toISOString()).toBe("2026-10-29T12:00:00.000Z");
  });

  it("empty filters are ignored", () => {
    expect(consentWhere({ user: undefined })).toEqual({});
    expect(auditWhere({})).toEqual({});
  });

  it("filters the audit trail by actor, action, outcome and dates", async () => {
    prisma.auditEntry.findMany.mockClear();
    await request(app).get("/api/v1/audit?actor=meera&action=login_failed&outcome=FAILURE&from=2026-10-29").set("Cookie", asDpo);
    expect(prisma.auditEntry.findMany.mock.calls[0][0].where).toEqual({
      actor: { OR: [{ email: { contains: "meera", mode: "insensitive" } }, { name: { contains: "meera", mode: "insensitive" } }] },
      action: { equals: "login_failed", mode: "insensitive" },
      outcome: "FAILURE",
      createdAt: { gte: new Date("2026-10-29T00:00:00.000Z") },
    });
  });

  it("rejects invalid filter values with 400", async () => {
    expect((await request(app).get("/api/v1/consents?action=MAYBE").set("Cookie", asDpo)).status).toBe(400);
    const bad = await request(app).get("/api/v1/consents?from=yesterday").set("Cookie", asDpo);
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toHaveProperty("from");
    expect((await request(app).get("/api/v1/audit?outcome=MAYBE").set("Cookie", asDpo)).status).toBe(400);
  });

  it("injection-looking text is only ever used as a search value (SEC-7)", async () => {
    prisma.consentRecord.findMany.mockClear();
    const res = await request(app).get("/api/v1/consents").query({ user: "x' OR '1'='1" }).set("Cookie", asDpo);
    expect(res.status).toBe(200);
    expect(prisma.consentRecord.findMany.mock.calls[0][0].where.user.OR[0].email.contains).toBe("x' OR '1'='1");
  });
});
