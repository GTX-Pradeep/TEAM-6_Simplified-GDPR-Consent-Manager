import express from "express";
import request from "supertest";
import type { AuthUser } from "../types/express";

/** Tests for issue #6 (SEC-2, TC-SEC-02): role checks and "own data only". */

process.env.DATABASE_URL = "postgresql://test@localhost/test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
process.env.NODE_ENV = "test";

jest.mock("../lib/prisma", () => ({ prisma: {} }));
jest.mock("../modules/audit/audit.service", () => ({ recordAuditSafely: jest.fn(async () => undefined) }));

/* eslint-disable @typescript-eslint/no-var-requires */
const { requireRole, requireSelfOrRole } = require("./requireRole") as typeof import("./requireRole");
const { errorHandler } = require("./errorHandler") as typeof import("./errorHandler");
/* eslint-enable @typescript-eslint/no-var-requires */

/** A tiny app where the test decides who is "logged in". */
function appAs(user?: AuthUser) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.get("/admin-only", requireRole("ADMIN"), (_req, res) => res.json({ ok: true }));
  app.get("/dpo-or-admin", requireRole("DPO", "ADMIN"), (_req, res) => res.json({ ok: true }));
  app.get("/users/:userId/consents", requireSelfOrRole("userId", "DPO", "ADMIN"), (_req, res) =>
    res.json({ ok: true }),
  );
  app.use(errorHandler);
  return app;
}

const user: AuthUser = { id: "u1", name: "U", email: "u@x.com", role: "USER" };
const admin: AuthUser = { id: "a1", name: "A", email: "a@x.com", role: "ADMIN" };
const dpo: AuthUser = { id: "d1", name: "D", email: "d@x.com", role: "DPO" };

describe("requireRole (SEC-2)", () => {
  it("401 when nobody is logged in", async () => {
    const res = await request(appAs()).get("/admin-only");
    expect(res.status).toBe(401);
  });

  it("403 FORBIDDEN for a USER on an admin route", async () => {
    const res = await request(appAs(user)).get("/admin-only");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("lets an ADMIN through", async () => {
    expect((await request(appAs(admin)).get("/admin-only")).status).toBe(200);
  });

  it("accepts any of several roles", async () => {
    expect((await request(appAs(dpo)).get("/dpo-or-admin")).status).toBe(200);
    expect((await request(appAs(admin)).get("/dpo-or-admin")).status).toBe(200);
    expect((await request(appAs(user)).get("/dpo-or-admin")).status).toBe(403);
  });

  it("refuses to be created without roles", () => {
    expect(() => requireRole()).toThrow();
  });
});

describe("requireSelfOrRole (SEC-2: a user sees only his or her own data)", () => {
  it("a USER can open their own data", async () => {
    expect((await request(appAs(user)).get("/users/u1/consents")).status).toBe(200);
  });

  it("a USER cannot open someone else's data", async () => {
    const res = await request(appAs(user)).get("/users/someone-else/consents");
    expect(res.status).toBe(403);
  });

  it("DPO and ADMIN can open anyone's data", async () => {
    expect((await request(appAs(dpo)).get("/users/u1/consents")).status).toBe(200);
    expect((await request(appAs(admin)).get("/users/u1/consents")).status).toBe(200);
  });
});

describe("denied access is audited (SEC-2, FR-17)", () => {
  it("writes an ACCESS_DENIED entry", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { recordAuditSafely } = require("../modules/audit/audit.service") as { recordAuditSafely: jest.Mock };
    recordAuditSafely.mockClear();
    await request(appAs(user)).get("/admin-only");
    await request(appAs(user)).get("/users/someone-else/consents");
    expect(recordAuditSafely.mock.calls.map((c) => [c[0].action, c[0].actorId, c[0].outcome])).toEqual([
      ["ACCESS_DENIED", "u1", "FAILURE"],
      ["ACCESS_DENIED", "u1", "FAILURE"],
    ]);
  });
});
