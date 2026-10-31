import request from "supertest";

/** Tests for issue #23 (SEC-4; TC-SEC-04): user and role administration. */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // admin
const U = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // user
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // dpo

type Row = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN" | "DPO";
  isActive: boolean;
  sessionVersion: number;
  failedLoginCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
};
let users: Row[] = [];
const reset = () => {
  const base = { isActive: true, sessionVersion: 0, failedLoginCount: 0, lockedUntil: null };
  users = [
    { ...base, id: A, name: "Ravi Admin", email: "admin@demo.com", role: "ADMIN", createdAt: new Date(1) },
    { ...base, id: U, name: "Asha User", email: "user@demo.com", role: "USER", createdAt: new Date(2) },
    { ...base, id: D, name: "Meera DPO", email: "dpo@demo.com", role: "DPO", createdAt: new Date(3) },
  ];
};

jest.mock("../audit/audit.service", () => ({
  ...jest.requireActual("../audit/audit.service"),
  appendAudit: jest.fn(async () => undefined),
  recordAuditSafely: jest.fn(async () => undefined),
}));

jest.mock("../../lib/prisma", () => {
  const pick = (u: Row) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    lockedUntil: u.lockedUntil,
    createdAt: u.createdAt,
  });
  const matches = (u: Row, where: { role?: string; OR?: { email?: { contains: string }; name?: { contains: string } }[] }) =>
    (!where.role || u.role === where.role) &&
    (!where.OR ||
      where.OR.some((c) =>
        c.email ? u.email.toLowerCase().includes(c.email.contains.toLowerCase()) : u.name.toLowerCase().includes(c.name!.contains.toLowerCase()),
      ));
  const prisma: Record<string, unknown> = {
    user: {
      findUnique: jest.fn(async ({ where, select }: { where: { id: string }; select?: object }) => {
        const u = users.find((x) => x.id === where.id);
        return u ? (select ? pick(u) : u) : null;
      }),
      findMany: jest.fn(async ({ where, skip, take }: { where: object; skip: number; take: number }) =>
        users.filter((u) => matches(u, where)).slice(skip, skip + take).map(pick),
      ),
      count: jest.fn(async ({ where }: { where: object }) => users.filter((u) => matches(u, where)).length),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = users.find((x) => x.id === where.id)!;
        for (const [k, v] of Object.entries(data)) {
          const inc = v as { increment?: number };
          (u as Record<string, unknown>)[k] = inc && typeof inc === "object" && "increment" in inc ? (u as unknown as Record<string, number>)[k] + inc.increment! : v;
        }
        return pick(u);
      }),
    },
  };
  prisma.$transaction = jest.fn(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma)));
  return { prisma };
});

/* eslint-disable @typescript-eslint/no-var-requires */
const { createApp } = require("../../app") as typeof import("../../app");
const { signSession } = require("../../lib/session") as typeof import("../../lib/session");
const { appendAudit } = require("../audit/audit.service") as { appendAudit: jest.Mock };
/* eslint-enable @typescript-eslint/no-var-requires */

const app = createApp();
const cookie = (sub: string, role: Row["role"], sv = 0) => `gdpr_session=${signSession({ sub, role, sv })}`;
const asAdmin = cookie(A, "ADMIN");

beforeEach(() => {
  reset();
  appendAudit.mockClear();
});

describe("GET /api/v1/users (SEC-4)", () => {
  it("lists users for an admin, without password hashes", async () => {
    const res = await request(app).get("/api/v1/users").set("Cookie", asAdmin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items.map((u: Row) => u.email)).toEqual(["admin@demo.com", "user@demo.com", "dpo@demo.com"]);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it("searches by name/e-mail and filters by role", async () => {
    expect((await request(app).get("/api/v1/users?q=asha").set("Cookie", asAdmin)).body.items).toHaveLength(1);
    expect((await request(app).get("/api/v1/users?role=DPO").set("Cookie", asAdmin)).body.items[0].email).toBe("dpo@demo.com");
  });

  it("is refused for USER and DPO", async () => {
    expect((await request(app).get("/api/v1/users").set("Cookie", cookie(U, "USER"))).status).toBe(403);
    expect((await request(app).get("/api/v1/users").set("Cookie", cookie(D, "DPO"))).status).toBe(403);
  });
});

describe("PATCH /api/v1/users/:id/role (SEC-4)", () => {
  it("changes the role, ends the user's sessions and audits the change", async () => {
    const res = await request(app).patch(`/api/v1/users/${U}/role`).set("Cookie", asAdmin).send({ role: "DPO" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("DPO");
    expect(users[1].sessionVersion).toBe(1);
    expect(appendAudit.mock.calls[0][1]).toMatchObject({
      actorId: A,
      action: "USER_ROLE_CHANGED",
      targetId: U,
      details: { from: "USER", to: "DPO" },
    });
    // the user's old cookie no longer works
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", cookie(U, "USER", 0))).status).toBe(401);
  });

  it("an admin cannot change his own role", async () => {
    const res = await request(app).patch(`/api/v1/users/${A}/role`).set("Cookie", asAdmin).send({ role: "USER" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CANNOT_CHANGE_SELF");
  });

  it("rejects unknown roles and users; non-admins are refused", async () => {
    expect((await request(app).patch(`/api/v1/users/${U}/role`).set("Cookie", asAdmin).send({ role: "ROOT" })).status).toBe(400);
    expect(
      (await request(app).patch("/api/v1/users/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/role").set("Cookie", asAdmin).send({ role: "DPO" })).status,
    ).toBe(404);
    expect((await request(app).patch(`/api/v1/users/${U}/role`).set("Cookie", cookie(D, "DPO")).send({ role: "ADMIN" })).status).toBe(403);
    expect(users[1].role).toBe("USER");
  });

  it("setting the same role again changes nothing and is not audited", async () => {
    await request(app).patch(`/api/v1/users/${U}/role`).set("Cookie", asAdmin).send({ role: "USER" });
    expect(appendAudit).not.toHaveBeenCalled();
  });
});

describe("deactivate / activate (SEC-4)", () => {
  it("deactivating blocks the account at once; activating restores it", async () => {
    const off = await request(app).patch(`/api/v1/users/${U}/deactivate`).set("Cookie", asAdmin);
    expect(off.body.user.isActive).toBe(false);
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", cookie(U, "USER", 1))).status).toBe(401);

    const on = await request(app).patch(`/api/v1/users/${U}/activate`).set("Cookie", asAdmin);
    expect(on.body.user.isActive).toBe(true);
    expect(appendAudit.mock.calls.map((c) => c[1].action)).toEqual(["USER_DEACTIVATED", "USER_REACTIVATED"]);
  });

  it("an admin cannot deactivate himself", async () => {
    expect((await request(app).patch(`/api/v1/users/${A}/deactivate`).set("Cookie", asAdmin)).status).toBe(409);
  });
});
