import request from "supertest";

/** Tests for issue #17 (SEC-5, SEC-7; TC-SEC-05, TC-SEC-07). */

process.env.DATABASE_URL = "postgresql://test@localhost/test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
process.env.NODE_ENV = "test";
process.env.CLIENT_ORIGIN = "http://localhost:5173";
process.env.AUTH_RATE_LIMIT_PER_MINUTE = "3";
process.env.API_RATE_LIMIT_PER_MINUTE = "10000";

jest.mock("../lib/prisma", () => ({
  prisma: { $queryRaw: jest.fn(async () => [1]), user: { findUnique: jest.fn(async () => null) } },
}));
jest.mock("../modules/audit/audit.service", () => ({
  appendAudit: jest.fn(async () => undefined),
  recordAuditSafely: jest.fn(async () => undefined),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { createApp } = require("../app") as typeof import("../app");
const { csrfOriginCheck, requireHttps } = require("./security") as typeof import("./security");
const { errorHandler } = require("./errorHandler") as typeof import("./errorHandler");
/* eslint-enable @typescript-eslint/no-var-requires */

const login = { email: "a@b.com", password: "whatever-1" };

describe("CSRF origin check (SEC-7)", () => {
  const app = createApp();

  it("blocks a state-changing request coming from another website", async () => {
    const res = await request(app).post("/api/v1/auth/login").set("Origin", "https://evil.example").send(login);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_REJECTED");
  });

  it("blocks it when only the Referer shows another site", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Referer", "https://evil.example/attack.html");
    expect(res.status).toBe(403);
  });

  it("allows requests from our own front end", async () => {
    const res = await request(app).post("/api/v1/auth/logout").set("Origin", "http://localhost:5173");
    expect(res.status).toBe(204);
  });

  it("allows same-host requests (front end served by the API in production)", async () => {
    const res = await request(app).post("/api/v1/auth/logout").set("Host", "consent.example").set("Origin", "https://consent.example");
    expect(res.status).toBe(204);
  });

  it("never blocks read-only requests", async () => {
    const res = await request(app).get("/api/v1/health").set("Origin", "https://evil.example");
    expect(res.status).toBe(200);
  });

  it("blocks the opaque 'null' origin used by sandboxed attack pages", async () => {
    const res = await request(app).post("/api/v1/auth/logout").set("Origin", "null");
    expect(res.status).toBe(403);
  });
});

describe("rate limit on login/register (SEC-7, brute force)", () => {
  it("returns 429 after the limit is reached", async () => {
    const app = createApp();
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await request(app).post("/api/v1/auth/login").send(login)).status);
    expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
    expect(codes[3]).toBe(429);

    const res = await request(app).post("/api/v1/auth/login").send(login);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.headers["ratelimit"] ?? res.headers["ratelimit-policy"]).toBeDefined();
  });
});

describe("HTTPS redirect (SEC-5)", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require("express") as typeof import("express");

  it("is off outside production", async () => {
    const app = express();
    app.use(requireHttps);
    app.get("/x", (_req, res) => res.send("ok"));
    expect((await request(app).get("/x")).status).toBe(200);
  });

  it("redirects plain HTTP to HTTPS in production", async () => {
    jest.resetModules();
    process.env.NODE_ENV = "production";
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const prod = require("./security") as typeof import("./security");
    process.env.NODE_ENV = "test";

    const app = express();
    app.set("trust proxy", 1);
    app.use(prod.requireHttps);
    app.get("/x", (_req, res) => res.send("ok"));

    const plain = await request(app).get("/x").set("Host", "consent.example");
    expect(plain.status).toBe(308);
    expect(plain.headers.location).toBe("https://consent.example/x");

    const viaHttps = await request(app).get("/x").set("X-Forwarded-Proto", "https");
    expect(viaHttps.status).toBe(200);
  });
});

describe("other OWASP basics (SEC-7)", () => {
  it("rejects malformed input before it reaches the database", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "<script>alert(1)</script>", email: "x' OR '1'='1", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty("email");
  });

  it("sends a Content-Security-Policy and HSTS header", async () => {
    const res = await request(createApp()).get("/api/v1/health");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });

  it("a custom origin can be configured", async () => {
    const app = express();
    app.use(csrfOriginCheck("https://consent.example"));
    app.post("/x", (_req, res) => res.send("ok"));
    app.use(errorHandler);
    expect((await request(app).post("/x").set("Origin", "https://consent.example")).status).toBe(200);
    expect((await request(app).post("/x").set("Origin", "http://localhost:5173")).status).toBe(403);
  });
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");
