import request from "supertest";

/**
 * Tests for issue #5 (TC-AUTH-01..03, TC-SEC-01).
 * Prisma is replaced by a small in-memory "users table" so the tests need no database.
 */
type Row = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "USER" | "ADMIN" | "DPO";
  isActive: boolean;
  sessionVersion: number;
};
const users: Row[] = [];

jest.mock("../../lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) =>
        users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Omit<Row, "id" | "isActive" | "sessionVersion"> }) => {
        const row: Row = { id: `user-${users.length + 1}`, isActive: true, sessionVersion: 0, ...data };
        users.push(row);
        return row;
      }),
      updateMany: jest.fn(async ({ where }: { where: { id: string; sessionVersion: number } }) => {
        const row = users.find((u) => u.id === where.id && u.sessionVersion === where.sessionVersion);
        if (row) row.sessionVersion += 1;
        return { count: row ? 1 : 0 };
      }),
    },
  },
}));

process.env.DATABASE_URL = "postgresql://test@localhost/test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
process.env.NODE_ENV = "test";
process.env.BCRYPT_ROUNDS = "4";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require("../../app") as typeof import("../../app");

const app = createApp();
const alice = { name: "Alice", email: "Alice@Example.com", password: "correct-horse-1" };

/** Returns the "name=value" part of the session cookie from a response. */
function sessionCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  const c = cookies.find((x) => x.startsWith("gdpr_session="));
  if (!c) throw new Error("no session cookie");
  return c.split(";")[0];
}

beforeEach(() => {
  users.length = 0;
});

describe("POST /api/v1/auth/register (FR-1, SEC-1)", () => {
  it("creates a USER account, logs it in and never returns the password hash", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(alice);

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({ id: "user-1", name: "Alice", email: "alice@example.com", role: "USER" });
    expect(JSON.stringify(res.body)).not.toContain("password");

    const cookie = ([] as string[]).concat(res.headers["set-cookie"]).join(";");
    expect(cookie).toContain("gdpr_session=");
    expect(cookie).toContain("HttpOnly");
  });

  it("stores only a bcrypt hash, not the password", async () => {
    await request(app).post("/api/v1/auth/register").send(alice);
    expect(users[0].passwordHash).toMatch(/^\$2[aby]\$/);
    expect(users[0].passwordHash).not.toContain(alice.password);
  });

  it("ignores a role sent by the client", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...alice, role: "ADMIN" });
    expect(res.body.user.role).toBe("USER");
  });

  it("rejects a duplicate e-mail (case-insensitive) with 409", async () => {
    await request(app).post("/api/v1/auth/register").send(alice);
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...alice, email: "alice@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects a short password and a bad e-mail with 400", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Bob", email: "not-an-email", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toHaveProperty("email");
    expect(res.body.error.details).toHaveProperty("password");
  });
});

describe("POST /api/v1/auth/login (FR-2)", () => {
  beforeEach(async () => {
    await request(app).post("/api/v1/auth/register").send(alice);
  });

  it("logs in with the right password and returns the role", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: alice.password });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("USER");
    expect(sessionCookie(res)).toMatch(/^gdpr_session=.+/);
  });

  it.each([
    ["wrong password", { email: "alice@example.com", password: "wrong-password" }],
    ["unknown e-mail", { email: "nobody@example.com", password: alice.password }],
  ])("returns the same 401 for a %s", async (_label, body) => {
    const res = await request(app).post("/api/v1/auth/login").send(body);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("refuses a deactivated account", async () => {
    users[0].isActive = false;
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: alice.password });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/auth/me and POST /api/v1/auth/logout (FR-3)", () => {
  it("returns 401 without a session", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 for a forged token", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Cookie", "gdpr_session=not.a.real.token");
    expect(res.status).toBe(401);
  });

  it("returns the user with a valid session", async () => {
    const reg = await request(app).post("/api/v1/auth/register").send(alice);
    const res = await request(app).get("/api/v1/auth/me").set("Cookie", sessionCookie(reg));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("alice@example.com");
  });

  it("after logout the OLD cookie no longer works, even if someone kept a copy", async () => {
    const reg = await request(app).post("/api/v1/auth/register").send(alice);
    const oldCookie = sessionCookie(reg);

    const out = await request(app).post("/api/v1/auth/logout").set("Cookie", oldCookie);
    expect(out.status).toBe(204);

    const res = await request(app).get("/api/v1/auth/me").set("Cookie", oldCookie);
    expect(res.status).toBe(401);
  });

  it("logout without a session is harmless", async () => {
    const res = await request(app).post("/api/v1/auth/logout");
    expect(res.status).toBe(204);
  });
});
