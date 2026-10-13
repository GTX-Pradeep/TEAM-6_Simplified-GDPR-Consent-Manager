import request from "supertest";

jest.mock("./lib/prisma", () => ({
  prisma: { $queryRaw: jest.fn() },
}));

process.env.DATABASE_URL = "postgresql://test@localhost/test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
process.env.NODE_ENV = "test";

// Imported after the env/mocks are set up.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require("./app") as typeof import("./app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("./lib/prisma") as { prisma: { $queryRaw: jest.Mock } };

describe("GET /api/v1/health", () => {
  it("returns 200 and db=up when the database answers", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    const res = await request(createApp()).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", db: "up" });
  });

  it("returns 503 and db=down when the database is unreachable", async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(createApp()).get("/api/v1/health");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", db: "down" });
  });
});

describe("security basics", () => {
  it("sets security headers and hides the framework", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const res = await request(createApp()).get("/api/v1/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("returns the standard JSON error for unknown routes", async () => {
    const res = await request(createApp()).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
