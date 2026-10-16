import request from "supertest";

/**
 * Tests for issue #8 (FR-4, FR-6; TC-PUR-*).
 * Prisma is replaced by small in-memory tables so no database is needed.
 */
type Purpose = {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};
const purposesTable: Purpose[] = [];
const usersTable = [
  { id: "admin-1", name: "Admin", email: "admin@x.com", role: "ADMIN", isActive: true, sessionVersion: 0 },
  { id: "user-1", name: "User", email: "user@x.com", role: "USER", isActive: true, sessionVersion: 0 },
];

jest.mock("../../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        usersTable.find((u) => u.id === where.id) ?? null,
      ),
    },
    processingPurpose: {
      findMany: jest.fn(async ({ where }: { where: { isActive?: boolean } }) =>
        purposesTable
          .filter((p) => where.isActive === undefined || p.isActive === where.isActive)
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        purposesTable.find((p) => p.id === where.id) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Pick<Purpose, "code" | "name" | "description"> }) => {
        if (purposesTable.some((p) => p.code === data.code)) {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { Prisma } = require("@prisma/client");
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        const row: Purpose = {
          id: `00000000-0000-4000-8000-00000000000${purposesTable.length + 1}`,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        purposesTable.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Purpose> }) => {
        const row = purposesTable.find((p) => p.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      }),
    },
  },
}));

process.env.DATABASE_URL = "postgresql://test@localhost/test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
process.env.NODE_ENV = "test";

/* eslint-disable @typescript-eslint/no-var-requires */
const { createApp } = require("../../app") as typeof import("../../app");
const { signSession } = require("../../lib/session") as typeof import("../../lib/session");
/* eslint-enable @typescript-eslint/no-var-requires */

const app = createApp();
const asAdmin = `gdpr_session=${signSession({ sub: "admin-1", role: "ADMIN", sv: 0 })}`;
const asUser = `gdpr_session=${signSession({ sub: "user-1", role: "USER", sv: 0 })}`;
const marketing = { code: "marketing_email", name: "Marketing e-mails", description: "Newsletters and offers" };
const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";

const create = (body: object, cookie = asAdmin) =>
  request(app).post("/api/v1/purposes").set("Cookie", cookie).send(body);

beforeEach(() => {
  purposesTable.length = 0;
});

describe("GET /api/v1/purposes (FR-4)", () => {
  it("needs a login", async () => {
    expect((await request(app).get("/api/v1/purposes")).status).toBe(401);
  });

  it("lists only active purposes, sorted by name", async () => {
    await create({ code: "ANALYTICS", name: "Usage analytics", description: "Anonymous statistics" });
    await create(marketing);
    purposesTable[0].isActive = false;

    const res = await request(app).get("/api/v1/purposes").set("Cookie", asUser);
    expect(res.status).toBe(200);
    expect(res.body.purposes.map((p: Purpose) => p.code)).toEqual(["MARKETING_EMAIL"]);
  });

  it("?all=true shows deactivated purposes to an ADMIN but not to a USER", async () => {
    await create(marketing);
    purposesTable[0].isActive = false;

    const admin = await request(app).get("/api/v1/purposes?all=true").set("Cookie", asAdmin);
    expect(admin.body.purposes).toHaveLength(1);
    const user = await request(app).get("/api/v1/purposes?all=true").set("Cookie", asUser);
    expect(user.body.purposes).toHaveLength(0);
  });
});

describe("POST /api/v1/purposes (FR-6)", () => {
  it("an ADMIN can create a purpose; the code is stored in capitals", async () => {
    const res = await create(marketing);
    expect(res.status).toBe(201);
    expect(res.body.purpose).toMatchObject({ code: "MARKETING_EMAIL", name: "Marketing e-mails", isActive: true });
  });

  it("a USER gets 403", async () => {
    const res = await create(marketing, asUser);
    expect(res.status).toBe(403);
    expect(purposesTable).toHaveLength(0);
  });

  it("the same code twice gets 409 PURPOSE_CODE_TAKEN", async () => {
    await create(marketing);
    const res = await create({ ...marketing, name: "Another name" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PURPOSE_CODE_TAKEN");
  });

  it("rejects a bad code and missing fields with 400", async () => {
    const res = await create({ code: "has spaces!", name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty("code");
    expect(res.body.error.details).toHaveProperty("name");
    expect(res.body.error.details).toHaveProperty("description");
  });
});

describe("PATCH /api/v1/purposes/:id and /deactivate (FR-6)", () => {
  it("an ADMIN can rename a purpose but not change its code", async () => {
    const { body } = await create(marketing);
    const res = await request(app)
      .patch(`/api/v1/purposes/${body.purpose.id}`)
      .set("Cookie", asAdmin)
      .send({ name: "Promotional e-mails", code: "CHANGED" });
    expect(res.status).toBe(200);
    expect(res.body.purpose).toMatchObject({ name: "Promotional e-mails", code: "MARKETING_EMAIL" });
  });

  it("an empty update gets 400", async () => {
    const { body } = await create(marketing);
    const res = await request(app).patch(`/api/v1/purposes/${body.purpose.id}`).set("Cookie", asAdmin).send({});
    expect(res.status).toBe(400);
  });

  it("an unknown id gets 404, a malformed id gets 400", async () => {
    const unknown = await request(app)
      .patch(`/api/v1/purposes/${UNKNOWN_ID}`)
      .set("Cookie", asAdmin)
      .send({ name: "x" });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("PURPOSE_NOT_FOUND");

    const bad = await request(app).patch("/api/v1/purposes/not-a-uuid").set("Cookie", asAdmin).send({ name: "x" });
    expect(bad.status).toBe(400);
  });

  it("deactivating hides the purpose from users but keeps it in the database", async () => {
    const { body } = await create(marketing);
    const res = await request(app).patch(`/api/v1/purposes/${body.purpose.id}/deactivate`).set("Cookie", asAdmin);
    expect(res.status).toBe(200);
    expect(res.body.purpose.isActive).toBe(false);
    expect(purposesTable).toHaveLength(1);

    const list = await request(app).get("/api/v1/purposes").set("Cookie", asUser);
    expect(list.body.purposes).toHaveLength(0);
  });

  it("a USER cannot edit or deactivate", async () => {
    const { body } = await create(marketing);
    const id = body.purpose.id;
    expect((await request(app).patch(`/api/v1/purposes/${id}`).set("Cookie", asUser).send({ name: "x" })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/purposes/${id}/deactivate`).set("Cookie", asUser)).status).toBe(403);
  });
});
