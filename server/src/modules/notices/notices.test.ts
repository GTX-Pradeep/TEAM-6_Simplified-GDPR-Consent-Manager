import request from "supertest";

/** Tests for issue #20 (FR-16; TC-POL-04): re-confirmation after a policy change. */

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
type Consent = { id: bigint; userId: string; purposeId: string; action: "GRANTED" | "WITHDRAWN"; policyVersionId: string; recordedAt: Date; prevHash: string; hash: string };
type Notice = { id: string; userId: string; policyVersionId: string; createdAt: Date; acknowledgedAt: Date | null };

const db = {
  users: [U1, U2].map((id, i) => ({ id, name: `U${i + 1}`, email: `u${i + 1}@x.com`, role: "USER", isActive: true, sessionVersion: 0 })),
  purposes: [
    { id: "p-mkt", code: "MARKETING_EMAIL", name: "Marketing e-mails", isActive: true },
    { id: "p-ana", code: "ANALYTICS", name: "Usage analytics", isActive: true },
    { id: "p-old", code: "OLD", name: "Old", isActive: false },
  ],
  policies: [] as { id: string; versionNo: string; status: string; title: string; changeSummary: string; effectiveAt: Date | null }[],
  consents: [] as Consent[],
  notices: [] as Notice[],
};
let clock = Date.UTC(2026, 9, 1);
const tick = () => new Date((clock += 1000));

jest.mock("../audit/audit.service", () => ({
  ...jest.requireActual("../audit/audit.service"),
  appendAudit: jest.fn(async () => undefined),
  recordAuditSafely: jest.fn(async () => undefined),
}));

jest.mock("../../lib/prisma", () => {
  const withRel = (c: Consent) => ({
    ...c,
    purpose: db.purposes.find((p) => p.id === c.purposeId)!,
    policyVersion: { id: c.policyVersionId, versionNo: db.policies.find((p) => p.id === c.policyVersionId)!.versionNo },
  });
  const newest = (a: Consent, b: Consent) => b.recordedAt.getTime() - a.recordedAt.getTime() || Number(b.id - a.id);
  const prisma: Record<string, unknown> = {
    $executeRawUnsafe: jest.fn(async () => 0),
    user: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => db.users.find((u) => u.id === where.id) ?? null) },
    policyVersion: { findFirst: jest.fn(async () => db.policies.find((p) => p.status === "PUBLISHED") ?? null) },
    consentRecord: {
      findMany: jest.fn(async ({ where }: { where: { userId?: string } }) => {
        const seen = new Set<string>();
        return db.consents
          .filter((c) => !where.userId || c.userId === where.userId)
          .sort(newest)
          .filter((c) => (seen.has(c.userId + c.purposeId) ? false : (seen.add(c.userId + c.purposeId), true)))
          .map(withRel);
      }),
      findFirst: jest.fn(async () => [...db.consents].sort((a, b) => Number(b.id - a.id))[0] ?? null),
      create: jest.fn(async ({ data }: { data: Omit<Consent, "id"> }) => {
        const row = { ...data, id: BigInt(db.consents.length + 1), recordedAt: tick() };
        db.consents.push(row);
        return row;
      }),
    },
    policyReviewNotice: {
      createMany: jest.fn(async ({ data }: { data: { userId: string; policyVersionId: string }[] }) => {
        let count = 0;
        for (const d of data) {
          if (!db.notices.some((n) => n.userId === d.userId && n.policyVersionId === d.policyVersionId)) {
            db.notices.push({ ...d, id: `0000000${db.notices.length + 1}-0000-4000-8000-000000000000`, createdAt: new Date(), acknowledgedAt: null });
            count++;
          }
        }
        return { count };
      }),
      findFirst: jest.fn(async ({ where }: { where: Partial<Notice> }) =>
        db.notices.find((n) => n.userId === where.userId && n.policyVersionId === where.policyVersionId && n.acknowledgedAt === null) ?? null,
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => db.notices.find((n) => n.id === where.id) ?? null),
      updateMany: jest.fn(async ({ where, data }: { where: { userId: string }; data: { acknowledgedAt: Date } }) => {
        const rows = db.notices.filter((n) => n.userId === where.userId && n.acknowledgedAt === null);
        rows.forEach((n) => (n.acknowledgedAt = data.acknowledgedAt));
        return { count: rows.length };
      }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});

/* eslint-disable @typescript-eslint/no-var-requires */
const { createApp } = require("../../app") as typeof import("../../app");
const { signSession } = require("../../lib/session") as typeof import("../../lib/session");
const { prisma } = require("../../lib/prisma");
const { createNoticesForPublish } = require("./notices.service") as typeof import("./notices.service");
const { appendAudit } = require("../audit/audit.service") as { appendAudit: jest.Mock };
/* eslint-enable @typescript-eslint/no-var-requires */

const app = createApp();
const as = (id: string) => `gdpr_session=${signSession({ sub: id, role: "USER", sv: 0 })}`;
const consent = (userId: string, purposeId: string, action: Consent["action"], policyVersionId: string) =>
  db.consents.push({ id: BigInt(db.consents.length + 1), userId, purposeId, action, policyVersionId, recordedAt: tick(), prevHash: "x", hash: `h${db.consents.length}` });

/** v1 published; U1 grants marketing + analytics then withdraws analytics; U2 only withdrew; then v2 is published. */
async function scenario() {
  db.policies = [{ id: "v1", versionNo: "1.0", status: "PUBLISHED", title: "Privacy Policy", changeSummary: "First", effectiveAt: new Date() }];
  db.consents = [];
  db.notices = [];
  consent(U1, "p-mkt", "GRANTED", "v1");
  consent(U1, "p-ana", "GRANTED", "v1");
  consent(U1, "p-ana", "WITHDRAWN", "v1");
  consent(U2, "p-mkt", "GRANTED", "v1");
  consent(U2, "p-mkt", "WITHDRAWN", "v1");
  consent(U1, "p-old", "GRANTED", "v1"); // purpose deactivated since: not asked again
  db.policies[0].status = "SUPERSEDED";
  db.policies.push({ id: "v2", versionNo: "2.0", status: "PUBLISHED", title: "Privacy Policy", changeSummary: "Adds analytics details", effectiveAt: new Date() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createNoticesForPublish(prisma as any, "v2");
}

beforeEach(() => appendAudit.mockClear());

describe("notices on publish (FR-16)", () => {
  it("notifies only users with a current grant under an older version", async () => {
    expect(await scenario()).toBe(1);
    expect(db.notices.map((n) => n.userId)).toEqual([U1]);
  });

  it("publishing does not change any existing consent record", async () => {
    await scenario();
    expect(db.consents).toHaveLength(6);
    expect(db.consents.every((c) => c.policyVersionId === "v1")).toBe(true);
  });

  it("does not create the same notice twice", async () => {
    await scenario();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await createNoticesForPublish(prisma as any, "v2")).toBe(0);
  });
});

describe("GET /api/v1/me/notices", () => {
  it("shows the new version and the purposes to review", async () => {
    await scenario();
    const res = await request(app).get("/api/v1/me/notices").set("Cookie", as(U1));
    expect(res.status).toBe(200);
    expect(res.body.notices).toHaveLength(1);
    expect(res.body.notices[0].policy).toMatchObject({ versionNo: "2.0", changeSummary: "Adds analytics details" });
    expect(res.body.notices[0].purposes).toEqual([{ id: "p-mkt", code: "MARKETING_EMAIL", name: "Marketing e-mails", grantedUnder: "1.0" }]);
  });

  it("a user without affected consents has no notice", async () => {
    await scenario();
    expect((await request(app).get("/api/v1/me/notices").set("Cookie", as(U2))).body.notices).toEqual([]);
  });
});

describe("POST /api/v1/me/notices/:id/reconfirm", () => {
  it("adds a new GRANTED record under v2 for each affected purpose and closes the notice", async () => {
    await scenario();
    const id = db.notices[0].id;
    const res = await request(app).post(`/api/v1/me/notices/${id}/reconfirm`).set("Cookie", as(U1));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reconfirmed: 1 });

    const added = db.consents[db.consents.length - 1];
    expect(added).toMatchObject({ userId: U1, purposeId: "p-mkt", action: "GRANTED", policyVersionId: "v2" });
    expect(db.consents).toHaveLength(7); // old records untouched, one appended
    expect(db.notices[0].acknowledgedAt).not.toBeNull();
    expect(appendAudit.mock.calls[0][1]).toMatchObject({ action: "CONSENT_RECONFIRMED", details: { from: "1.0", to: "2.0" } });
    expect((await request(app).get("/api/v1/me/notices").set("Cookie", as(U1))).body.notices).toEqual([]);
  });

  it("cannot answer the same notice twice, or someone else's notice", async () => {
    await scenario();
    const id = db.notices[0].id;
    expect((await request(app).post(`/api/v1/me/notices/${id}/reconfirm`).set("Cookie", as(U2))).status).toBe(404);
    await request(app).post(`/api/v1/me/notices/${id}/reconfirm`).set("Cookie", as(U1));
    expect((await request(app).post(`/api/v1/me/notices/${id}/reconfirm`).set("Cookie", as(U1))).status).toBe(409);
  });
});

describe("POST /api/v1/me/notices/:id/ack", () => {
  it("closes the notice without new consent records", async () => {
    await scenario();
    const id = db.notices[0].id;
    const res = await request(app).post(`/api/v1/me/notices/${id}/ack`).set("Cookie", as(U1));
    expect(res.status).toBe(204);
    expect(db.consents).toHaveLength(6);
    expect(appendAudit.mock.calls[0][1].action).toBe("POLICY_NOTICE_ACKNOWLEDGED");
  });

  it("needs a USER login and a valid id", async () => {
    expect((await request(app).get("/api/v1/me/notices")).status).toBe(401);
    expect((await request(app).post("/api/v1/me/notices/nope/ack").set("Cookie", as(U1))).status).toBe(400);
  });
});
