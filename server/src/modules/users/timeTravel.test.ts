import request from "supertest";

/** Tests for issue #16 (FR-20; TC-SRCH-02): consent state of a user at a past moment. */

const T = (s: string) => new Date(`2026-10-${s}Z`);

const db = {
  users: [
    { id: "11111111-1111-4111-8111-111111111111", name: "Asha User", email: "user@demo.com", role: "USER", isActive: true, sessionVersion: 0 },
    { id: "dpo-1", name: "Meera DPO", email: "dpo@demo.com", role: "DPO", isActive: true, sessionVersion: 0 },
  ],
  purposes: [
    { id: "p-mkt", code: "MARKETING_EMAIL", name: "Marketing e-mails", isActive: true, createdAt: T("01T00:00:00") },
    { id: "p-ana", code: "ANALYTICS", name: "Usage analytics", isActive: false, createdAt: T("01T00:00:00") },
    { id: "p-new", code: "NEWSLETTER", name: "Newsletter", isActive: true, createdAt: T("25T00:00:00") },
  ],
  policies: [
    { id: "v1", versionNo: "1.0", status: "SUPERSEDED", effectiveAt: T("01T00:00:00") },
    { id: "v2", versionNo: "2.0", status: "PUBLISHED", effectiveAt: T("20T12:00:00") },
    { id: "v3", versionNo: "3.0", status: "DRAFT", effectiveAt: null },
  ],
  // Asha: grants marketing (v1), grants analytics (v1), withdraws marketing (v2)
  consents: [
    { id: 1n, userId: "11111111-1111-4111-8111-111111111111", purposeId: "p-mkt", action: "GRANTED", policyVersionId: "v1", recordedAt: T("10T09:00:00") },
    { id: 2n, userId: "11111111-1111-4111-8111-111111111111", purposeId: "p-ana", action: "GRANTED", policyVersionId: "v1", recordedAt: T("12T09:00:00") },
    { id: 3n, userId: "11111111-1111-4111-8111-111111111111", purposeId: "p-mkt", action: "WITHDRAWN", policyVersionId: "v2", recordedAt: T("22T09:00:00") },
  ],
};

jest.mock("../audit/audit.service", () => ({
  ...jest.requireActual("../audit/audit.service"),
  recordAuditSafely: jest.fn(async () => undefined),
}));

jest.mock("../../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) =>
        db.users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      ),
    },
    processingPurpose: {
      findMany: jest.fn(async ({ where }: { where: { createdAt: { lte: Date } } }) =>
        db.purposes.filter((p) => p.createdAt <= where.createdAt.lte).sort((a, b) => a.name.localeCompare(b.name)),
      ),
    },
    consentRecord: {
      findMany: jest.fn(async ({ where }: { where: { userId: string; recordedAt: { lte: Date } } }) => {
        const seen = new Set<string>();
        return db.consents
          .filter((c) => c.userId === where.userId && c.recordedAt <= where.recordedAt.lte)
          .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())
          .filter((c) => (seen.has(c.purposeId) ? false : (seen.add(c.purposeId), true)))
          .map((c) => ({ ...c, policyVersion: { id: c.policyVersionId, versionNo: db.policies.find((p) => p.id === c.policyVersionId)!.versionNo } }));
      }),
    },
    policyVersion: {
      findFirst: jest.fn(async ({ where }: { where: { status: { in: string[] }; effectiveAt: { lte: Date } } }) => {
        const p = db.policies
          .filter((x) => where.status.in.includes(x.status) && x.effectiveAt && x.effectiveAt <= where.effectiveAt.lte)
          .sort((a, b) => b.effectiveAt!.getTime() - a.effectiveAt!.getTime())[0];
        return p ? { id: p.id, versionNo: p.versionNo, effectiveAt: p.effectiveAt } : null;
      }),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { createApp } = require("../../app") as typeof import("../../app");
const { signSession } = require("../../lib/session") as typeof import("../../lib/session");
const { recordAuditSafely } = require("../audit/audit.service") as { recordAuditSafely: jest.Mock };
/* eslint-enable @typescript-eslint/no-var-requires */

const app = createApp();
const asDpo = `gdpr_session=${signSession({ sub: "dpo-1", role: "DPO", sv: 0 })}`;
const ASHA = "11111111-1111-4111-8111-111111111111";
const stateAt = (at: string) => request(app).get(`/api/v1/users/${ASHA}/consent-state`).query({ at }).set("Cookie", asDpo);
const statusOf = (body: { purposes: { purpose: { code: string }; status: string }[] }, code: string) =>
  body.purposes.find((p) => p.purpose.code === code)?.status;

describe("consent state at a past moment (FR-20, #16)", () => {
  it("before any decision: nothing was given, policy 1.0 was in force", async () => {
    const res = await stateAt("2026-10-05T00:00:00Z");
    expect(res.status).toBe(200);
    expect(res.body.policyInForce.versionNo).toBe("1.0");
    expect(statusOf(res.body, "MARKETING_EMAIL")).toBe("NOT_GIVEN");
    expect(statusOf(res.body, "ANALYTICS")).toBe("NOT_GIVEN");
  });

  it("on 15 Oct: both granted under v1.0", async () => {
    const res = await stateAt("2026-10-15T00:00:00Z");
    const m = res.body.purposes.find((p: { purpose: { code: string } }) => p.purpose.code === "MARKETING_EMAIL");
    expect(m).toMatchObject({ status: "GRANTED", recordId: "1", policyVersion: { versionNo: "1.0" } });
    expect(statusOf(res.body, "ANALYTICS")).toBe("GRANTED");
  });

  it("on 21 Oct: policy 2.0 is in force but the old consents still stand", async () => {
    const res = await stateAt("2026-10-21T00:00:00Z");
    expect(res.body.policyInForce.versionNo).toBe("2.0");
    expect(statusOf(res.body, "MARKETING_EMAIL")).toBe("GRANTED");
  });

  it("exactly at the withdrawal instant the withdrawal counts ('at or before')", async () => {
    const res = await stateAt("2026-10-22T09:00:00Z");
    expect(statusOf(res.body, "MARKETING_EMAIL")).toBe("WITHDRAWN");
    const one = await stateAt("2026-10-22T08:59:59Z");
    expect(statusOf(one.body, "MARKETING_EMAIL")).toBe("GRANTED");
  });

  it("includes purposes deactivated later, but not ones created later", async () => {
    const before = await stateAt("2026-10-21T00:00:00Z");
    expect(before.body.purposes.map((p: { purpose: { code: string } }) => p.purpose.code)).toEqual(["MARKETING_EMAIL", "ANALYTICS"]);
    expect(before.body.purposes[1].purpose.isActive).toBe(false);
    const after = await stateAt("2026-10-26T00:00:00Z");
    expect(after.body.purposes).toHaveLength(3);
  });

  it("logs that the DPO looked at the user's data", async () => {
    recordAuditSafely.mockClear();
    await stateAt("2026-10-15T00:00:00Z");
    expect(recordAuditSafely).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CONSENT_STATE_VIEWED", actorId: "dpo-1", targetId: ASHA }),
    );
  });

  it("rejects future and invalid moments, unknown users, and non-DPO callers", async () => {
    expect((await stateAt("2999-01-01T00:00:00Z")).status).toBe(400);
    expect((await stateAt("not-a-date")).status).toBe(400);
    const unknown = await request(app)
      .get("/api/v1/users/22222222-2222-4222-8222-222222222222/consent-state")
      .set("Cookie", asDpo);
    expect(unknown.status).toBe(404);
    expect((await request(app).get(`/api/v1/users/${ASHA}/consent-state`)).status).toBe(401);
  });
});

describe("GET /api/v1/users/lookup", () => {
  it("finds a user by e-mail (case-insensitive) or says 404", async () => {
    const ok = await request(app).get("/api/v1/users/lookup?email=USER@demo.com").set("Cookie", asDpo);
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ id: ASHA, name: "Asha User" });
    expect((await request(app).get("/api/v1/users/lookup?email=nobody@demo.com").set("Cookie", asDpo)).status).toBe(404);
    expect((await request(app).get("/api/v1/users/lookup?email=bad").set("Cookie", asDpo)).status).toBe(400);
  });
});
