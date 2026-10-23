import request from "supertest";

/**
 * Tests for issue #7 (FR-4, FR-7..FR-11, NFR-5; TC-CON-*).
 * Prisma is replaced by in-memory tables so no database is needed.
 */
type Purpose = { id: string; code: string; name: string; description: string; isActive: boolean };
type Policy = { id: string; versionNo: string; status: "DRAFT" | "PUBLISHED" | "SUPERSEDED" };
type Consent = {
  id: bigint;
  userId: string;
  purposeId: string;
  action: "GRANTED" | "WITHDRAWN";
  policyVersionId: string;
  recordedAt: Date;
  prevHash: string;
  hash: string;
};

const db = {
  users: [
    { id: "user-1", name: "U1", email: "u1@x.com", role: "USER", isActive: true, sessionVersion: 0 },
    { id: "user-2", name: "U2", email: "u2@x.com", role: "USER", isActive: true, sessionVersion: 0 },
    { id: "admin-1", name: "A", email: "a@x.com", role: "ADMIN", isActive: true, sessionVersion: 0 },
  ],
  purposes: [] as Purpose[],
  policies: [] as Policy[],
  consents: [] as Consent[],
};

jest.mock("../audit/audit.service", () => {
  const actual = jest.requireActual("../audit/audit.service");
  return { ...actual, appendAudit: jest.fn(async () => undefined), recordAuditSafely: jest.fn(async () => undefined) };
});

jest.mock("../../lib/prisma", () => {
  const newestFirst = (a: Consent, b: Consent) =>
    b.recordedAt.getTime() - a.recordedAt.getTime() || Number(b.id - a.id);

  const prisma: Record<string, unknown> = {
    $executeRawUnsafe: jest.fn(async () => 0),
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => db.users.find((u) => u.id === where.id) ?? null),
    },
    processingPurpose: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => db.purposes.find((p) => p.id === where.id) ?? null),
      findMany: jest.fn(async () =>
        db.purposes.filter((p) => p.isActive).sort((a, b) => a.name.localeCompare(b.name)),
      ),
    },
    policyVersion: {
      findFirst: jest.fn(async () => {
        const p = db.policies.find((x) => x.status === "PUBLISHED");
        return p ? { ...p } : null;
      }),
    },
    consentRecord: {
      findFirst: jest.fn(async ({ where }: { where?: { userId: string; purposeId: string } }) => {
        const rows = where
          ? db.consents.filter((c) => c.userId === where.userId && c.purposeId === where.purposeId).sort(newestFirst)
          : [...db.consents].sort((a, b) => Number(b.id - a.id));
        return rows[0] ?? null;
      }),
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) => {
        const seen = new Set<string>();
        return db.consents
          .filter((c) => c.userId === where.userId)
          .sort(newestFirst)
          .filter((c) => (seen.has(c.purposeId) ? false : (seen.add(c.purposeId), true)))
          .map((c) => ({
            ...c,
            policyVersion: { id: c.policyVersionId, versionNo: db.policies.find((p) => p.id === c.policyVersionId)!.versionNo },
          }));
      }),
      create: jest.fn(async ({ data }: { data: Omit<Consent, "id"> }) => {
        const row = { id: BigInt(db.consents.length + 1), ...data };
        db.consents.push(row);
        return row;
      }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});

process.env.DATABASE_URL = "postgresql://test@localhost/test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
process.env.NODE_ENV = "test";

/* eslint-disable @typescript-eslint/no-var-requires */
const { createApp } = require("../../app") as typeof import("../../app");
const { signSession } = require("../../lib/session") as typeof import("../../lib/session");
const { computeConsentHash } = require("./consents.service") as typeof import("./consents.service");
const { GENESIS_HASH } = require("../audit/audit.service") as typeof import("../audit/audit.service");
const { appendAudit } = require("../audit/audit.service") as { appendAudit: jest.Mock };
/* eslint-enable @typescript-eslint/no-var-requires */

const app = createApp();
const cookie = (sub: string, role: "USER" | "ADMIN") => `gdpr_session=${signSession({ sub, role, sv: 0 })}`;
const asUser1 = cookie("user-1", "USER");
const asUser2 = cookie("user-2", "USER");
const asAdmin = cookie("admin-1", "ADMIN");

const MARKETING = "00000000-0000-4000-8000-0000000000a1";
const ANALYTICS = "00000000-0000-4000-8000-0000000000a2";
const OLD = "00000000-0000-4000-8000-0000000000a3";

const act = (purposeId: string, action: string, c = asUser1) =>
  request(app).post("/api/v1/me/consents").set("Cookie", c).send({ purposeId, action });
const state = (c = asUser1) => request(app).get("/api/v1/me/consents").set("Cookie", c);

beforeEach(() => {
  db.purposes = [
    { id: MARKETING, code: "MARKETING_EMAIL", name: "Marketing e-mails", description: "Offers", isActive: true },
    { id: ANALYTICS, code: "ANALYTICS", name: "Analytics", description: "Stats", isActive: true },
    { id: OLD, code: "OLD", name: "Old purpose", description: "Retired", isActive: false },
  ];
  db.policies = [{ id: "pol-1", versionNo: "1.0", status: "PUBLISHED" }];
  db.consents = [];
  appendAudit.mockClear();
});

describe("POST /api/v1/me/consents (FR-7, FR-8, FR-9)", () => {
  it("grants consent and records the current policy version and time", async () => {
    const res = await act(MARKETING, "GRANTED");
    expect(res.status).toBe(201);
    expect(res.body.consent).toMatchObject({
      id: "1",
      purposeId: MARKETING,
      action: "GRANTED",
      policyVersion: { id: "pol-1", versionNo: "1.0" },
    });
    expect(new Date(res.body.consent.recordedAt).toISOString()).toBe(res.body.consent.recordedAt);
  });

  it("withdrawing adds a NEW record; the grant is kept (append-only, FR-11)", async () => {
    await act(MARKETING, "GRANTED");
    const res = await act(MARKETING, "WITHDRAWN");
    expect(res.status).toBe(201);
    expect(db.consents.map((c) => c.action)).toEqual(["GRANTED", "WITHDRAWN"]);
  });

  it("granting twice gets 409 CONSENT_UNCHANGED", async () => {
    await act(MARKETING, "GRANTED");
    const res = await act(MARKETING, "GRANTED");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONSENT_UNCHANGED");
    expect(db.consents).toHaveLength(1);
  });

  it("withdrawing something never granted gets 409", async () => {
    expect((await act(MARKETING, "WITHDRAWN")).status).toBe(409);
  });

  it("rejects an invalid action or purpose id with 400 (FR-9)", async () => {
    const bad = await act(MARKETING, "MAYBE");
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toHaveProperty("action");
    expect((await act("not-a-uuid", "GRANTED")).status).toBe(400);
    expect(db.consents).toHaveLength(0);
  });

  it("unknown purpose 404, inactive purpose 409", async () => {
    expect((await act("11111111-1111-4111-8111-111111111111", "GRANTED")).status).toBe(404);
    const inactive = await act(OLD, "GRANTED");
    expect(inactive.status).toBe(409);
    expect(inactive.body.error.code).toBe("PURPOSE_INACTIVE");
  });

  it("refuses consent while no policy is published", async () => {
    db.policies = [];
    const res = await act(MARKETING, "GRANTED");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NO_PUBLISHED_POLICY");
  });

  it("needs a USER login: 401 without, 403 for an ADMIN", async () => {
    expect((await request(app).post("/api/v1/me/consents").send({ purposeId: MARKETING, action: "GRANTED" })).status).toBe(401);
    expect((await act(MARKETING, "GRANTED", asAdmin)).status).toBe(403);
  });
});

describe("hash chain and audit (FR-10, FR-11, SEC-6)", () => {
  it("each record points to the hash of the previous one, starting from genesis", async () => {
    await act(MARKETING, "GRANTED");
    await act(ANALYTICS, "GRANTED", asUser2);
    await act(MARKETING, "WITHDRAWN");

    const [a, b, c] = db.consents;
    expect(a.prevHash).toBe(GENESIS_HASH);
    expect(b.prevHash).toBe(a.hash);
    expect(c.prevHash).toBe(b.hash);
    expect(computeConsentHash(b.prevHash, b)).toBe(b.hash);
    expect(computeConsentHash(b.prevHash, { ...b, action: "WITHDRAWN" })).not.toBe(b.hash);
  });

  it("writes an audit entry for every decision, in the same transaction", async () => {
    await act(MARKETING, "GRANTED");
    await act(MARKETING, "WITHDRAWN");
    expect(appendAudit.mock.calls.map((c) => [c[1].action, c[1].actorId, c[1].details.purposeCode])).toEqual([
      ["CONSENT_GRANTED", "user-1", "MARKETING_EMAIL"],
      ["CONSENT_WITHDRAWN", "user-1", "MARKETING_EMAIL"],
    ]);
  });

  it("if the audit entry fails, the request fails (nothing half-saved is reported as success)", async () => {
    appendAudit.mockRejectedValueOnce(new Error("db down"));
    const res = await act(MARKETING, "GRANTED");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/v1/me/consents (FR-4)", () => {
  it("shows every active purpose; nothing is pre-ticked", async () => {
    const res = await state();
    expect(res.status).toBe(200);
    expect(res.body.currentPolicy).toMatchObject({ id: "pol-1", versionNo: "1.0" });
    expect(res.body.purposes.map((p: { purpose: { code: string }; status: string }) => [p.purpose.code, p.status])).toEqual([
      ["ANALYTICS", "NOT_GIVEN"],
      ["MARKETING_EMAIL", "NOT_GIVEN"],
    ]);
  });

  it("shows the latest decision per purpose, only for the logged-in user", async () => {
    await act(MARKETING, "GRANTED");
    await act(MARKETING, "WITHDRAWN");
    await act(ANALYTICS, "GRANTED");
    await act(MARKETING, "GRANTED", asUser2);

    const mine = (await state()).body.purposes;
    expect(mine.find((p: { purpose: { code: string } }) => p.purpose.code === "MARKETING_EMAIL").status).toBe("WITHDRAWN");
    expect(mine.find((p: { purpose: { code: string } }) => p.purpose.code === "ANALYTICS")).toMatchObject({
      status: "GRANTED",
      policyVersion: { versionNo: "1.0" },
    });

    const theirs = (await state(asUser2)).body.purposes;
    expect(theirs.find((p: { purpose: { code: string } }) => p.purpose.code === "ANALYTICS").status).toBe("NOT_GIVEN");
  });
});
