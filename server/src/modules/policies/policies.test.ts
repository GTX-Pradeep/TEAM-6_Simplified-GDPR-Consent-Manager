import request from "supertest";

/**
 * Tests for issue #11 (FR-5, FR-13, FR-14, FR-15; TC-POL-*).
 * Prisma is replaced by an in-memory table so no database is needed.
 */
type Policy = {
  id: string;
  versionNo: string;
  title: string;
  body: string;
  changeSummary: string;
  status: "DRAFT" | "PUBLISHED" | "SUPERSEDED";
  effectiveAt: Date | null;
  createdById: string;
  createdAt: Date;
};
const policiesTable: Policy[] = [];
const usersTable = [
  { id: "admin-1", name: "Admin", email: "admin@x.com", role: "ADMIN", isActive: true, sessionVersion: 0 },
  { id: "dpo-1", name: "Dpo", email: "dpo@x.com", role: "DPO", isActive: true, sessionVersion: 0 },
  { id: "user-1", name: "User", email: "user@x.com", role: "USER", isActive: true, sessionVersion: 0 },
];

jest.mock("../../lib/prisma", () => {
  const match = (p: Policy, where: Partial<Policy>) =>
    Object.entries(where).every(([k, v]) => (p as Record<string, unknown>)[k] === v);

  const policyVersion = {
    findMany: jest.fn(async () => [...policiesTable].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
    findFirst: jest.fn(async ({ where }: { where: Partial<Policy> }) => policiesTable.find((p) => match(p, where)) ?? null),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => policiesTable.find((p) => p.id === where.id) ?? null),
    create: jest.fn(async ({ data }: { data: Omit<Policy, "id" | "createdAt" | "effectiveAt"> }) => {
      if (policiesTable.some((p) => p.versionNo === data.versionNo)) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Prisma } = require("@prisma/client");
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
      }
      const row: Policy = {
        id: `00000000-0000-4000-8000-00000000000${policiesTable.length + 1}`,
        effectiveAt: null,
        createdAt: new Date(Date.now() + policiesTable.length), // keeps the order stable
        ...data,
      };
      policiesTable.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Policy> }) => {
      const row = policiesTable.find((p) => p.id === where.id);
      if (!row) throw new Error("not found");
      Object.assign(row, data);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Partial<Policy>; data: Partial<Policy> }) => {
      const rows = policiesTable.filter((p) => match(p, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    }),
  };

  const client = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => usersTable.find((u) => u.id === where.id) ?? null),
    },
    policyVersion,
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ policyVersion })),
  };
  return { prisma: client };
});

process.env.DATABASE_URL = "postgresql://test@localhost/test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
process.env.NODE_ENV = "test";

/* eslint-disable @typescript-eslint/no-var-requires */
const { createApp } = require("../../app") as typeof import("../../app");
const { signSession } = require("../../lib/session") as typeof import("../../lib/session");
/* eslint-enable @typescript-eslint/no-var-requires */

const app = createApp();
const cookie = (sub: string, role: "ADMIN" | "DPO" | "USER") => `gdpr_session=${signSession({ sub, role, sv: 0 })}`;
const asAdmin = cookie("admin-1", "ADMIN");
const asDpo = cookie("dpo-1", "DPO");
const asUser = cookie("user-1", "USER");

const v1 = { versionNo: "1.0", title: "Privacy Policy", body: "We process data for ...", changeSummary: "First version" };
const v2 = { ...v1, versionNo: "2.0", body: "Updated text ...", changeSummary: "Added analytics" };

const createDraft = (body: object, c = asAdmin) => request(app).post("/api/v1/policies").set("Cookie", c).send(body);
const publish = (id: string, c = asAdmin) => request(app).post(`/api/v1/policies/${id}/publish`).set("Cookie", c);

beforeEach(() => {
  policiesTable.length = 0;
});

describe("POST /api/v1/policies (FR-13)", () => {
  it("an ADMIN creates a DRAFT and is recorded as its author", async () => {
    const res = await createDraft(v1);
    expect(res.status).toBe(201);
    expect(res.body.policy).toMatchObject({ versionNo: "1.0", status: "DRAFT", createdById: "admin-1", effectiveAt: null });
  });

  it("USER and DPO get 403", async () => {
    expect((await createDraft(v1, asUser)).status).toBe(403);
    expect((await createDraft(v1, asDpo)).status).toBe(403);
  });

  it("a duplicate version number gets 409 POLICY_VERSION_TAKEN", async () => {
    await createDraft(v1);
    const res = await createDraft(v1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("POLICY_VERSION_TAKEN");
  });

  it("validates the input", async () => {
    const res = await createDraft({ versionNo: "v1", title: "" });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual(
      expect.arrayContaining(["versionNo", "title", "body", "changeSummary"]),
    );
  });
});

describe("PATCH /api/v1/policies/:id (FR-13, FR-15)", () => {
  it("a draft can be edited", async () => {
    const { body } = await createDraft(v1);
    const res = await request(app)
      .patch(`/api/v1/policies/${body.policy.id}`)
      .set("Cookie", asAdmin)
      .send({ title: "Privacy Notice" });
    expect(res.status).toBe(200);
    expect(res.body.policy.title).toBe("Privacy Notice");
  });

  it("a published version is locked: 409 POLICY_LOCKED and the text is unchanged", async () => {
    const { body } = await createDraft(v1);
    await publish(body.policy.id);
    const res = await request(app)
      .patch(`/api/v1/policies/${body.policy.id}`)
      .set("Cookie", asAdmin)
      .send({ body: "sneaky change" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("POLICY_LOCKED");
    expect(policiesTable[0].body).toBe(v1.body);
  });
});

describe("POST /api/v1/policies/:id/publish (FR-14)", () => {
  it("publishing sets PUBLISHED and the effective date", async () => {
    const { body } = await createDraft(v1);
    const res = await publish(body.policy.id);
    expect(res.status).toBe(200);
    expect(res.body.policy.status).toBe("PUBLISHED");
    expect(res.body.policy.effectiveAt).not.toBeNull();
  });

  it("publishing a new version supersedes the old one, so only one is published", async () => {
    const first = (await createDraft(v1)).body.policy;
    const second = (await createDraft(v2)).body.policy;
    await publish(first.id);
    await publish(second.id);

    expect(policiesTable.filter((p) => p.status === "PUBLISHED").map((p) => p.versionNo)).toEqual(["2.0"]);
    expect(policiesTable.find((p) => p.id === first.id)?.status).toBe("SUPERSEDED");
  });

  it("an already published version cannot be published again", async () => {
    const { body } = await createDraft(v1);
    await publish(body.policy.id);
    expect((await publish(body.policy.id)).status).toBe(409);
  });

  it("a USER cannot publish; an unknown id gets 404", async () => {
    const { body } = await createDraft(v1);
    expect((await publish(body.policy.id, asUser)).status).toBe(403);
    expect((await publish("11111111-1111-4111-8111-111111111111")).status).toBe(404);
  });
});

describe("reading policies (FR-5)", () => {
  it("GET /current returns 404 before anything is published", async () => {
    const res = await request(app).get("/api/v1/policies/current").set("Cookie", asUser);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NO_PUBLISHED_POLICY");
  });

  it("GET /current returns the published version to any logged-in user", async () => {
    const { body } = await createDraft(v1);
    await publish(body.policy.id);
    const res = await request(app).get("/api/v1/policies/current").set("Cookie", asUser);
    expect(res.status).toBe(200);
    expect(res.body.policy.versionNo).toBe("1.0");
  });

  it("GET /policies (all versions) is for ADMIN and DPO only, newest first", async () => {
    await createDraft(v1);
    await createDraft(v2);
    const dpo = await request(app).get("/api/v1/policies").set("Cookie", asDpo);
    expect(dpo.status).toBe(200);
    expect(dpo.body.policies.map((p: Policy) => p.versionNo)).toEqual(["2.0", "1.0"]);
    expect((await request(app).get("/api/v1/policies").set("Cookie", asUser)).status).toBe(403);
  });

  it("GET /:id returns any version to a logged-in user; needs login", async () => {
    const { body } = await createDraft(v1);
    expect((await request(app).get(`/api/v1/policies/${body.policy.id}`).set("Cookie", asUser)).status).toBe(200);
    expect((await request(app).get(`/api/v1/policies/${body.policy.id}`)).status).toBe(401);
  });
});
