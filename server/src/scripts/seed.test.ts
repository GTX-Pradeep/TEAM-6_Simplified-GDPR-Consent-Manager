import bcrypt from "bcryptjs";
import { DEMO_PASSWORD, DEMO_PURPOSES, DEMO_USERS, seed } from "./seed";

/** Tests for issue #10: the seed creates demo data once and is safe to run again. */

type AnyRow = Record<string, unknown>;

function fakePrisma() {
  const tables: Record<string, AnyRow[]> = { user: [], processingPurpose: [], policyVersion: [] };
  const model = (name: string, key: string) => ({
    findUnique: jest.fn(async ({ where }: { where: AnyRow }) => tables[name].find((r) => r[key] === where[key]) ?? null),
    findUniqueOrThrow: jest.fn(async ({ where }: { where: AnyRow }) => {
      const row = tables[name].find((r) => r[key] === where[key]);
      if (!row) throw new Error("not found");
      return row;
    }),
    findFirst: jest.fn(async () => tables[name][0] ?? null),
    create: jest.fn(async ({ data }: { data: AnyRow }) => {
      const row = { id: `${name}-${tables[name].length + 1}`, ...data };
      tables[name].push(row);
      return row;
    }),
  });
  const prisma = {
    user: model("user", "email"),
    processingPurpose: model("processingPurpose", "code"),
    policyVersion: model("policyVersion", "id"),
  };
  return { prisma, tables };
}

describe("seed (#10)", () => {
  it("creates 3 demo users with hashed passwords, 4 purposes and a published policy 1.0", async () => {
    const { prisma, tables } = fakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await seed(prisma as any, 4);

    expect(result).toEqual({ usersCreated: 3, purposesCreated: 4, policyCreated: true });
    expect(tables.user.map((u) => u.role)).toEqual(["USER", "ADMIN", "DPO"]);
    expect(tables.processingPurpose).toHaveLength(DEMO_PURPOSES.length);

    const hash = tables.user[0].passwordHash as string;
    expect(hash).not.toContain(DEMO_PASSWORD);
    expect(await bcrypt.compare(DEMO_PASSWORD, hash)).toBe(true);

    expect(tables.policyVersion[0]).toMatchObject({ versionNo: "1.0", status: "PUBLISHED", createdById: "user-2" });
  });

  it("running it a second time adds nothing", async () => {
    const { prisma, tables } = fakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await seed(prisma as any, 4);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const again = await seed(prisma as any, 4);

    expect(again).toEqual({ usersCreated: 0, purposesCreated: 0, policyCreated: false });
    expect(tables.user).toHaveLength(DEMO_USERS.length);
    expect(tables.policyVersion).toHaveLength(1);
  });

  it("does not add a policy when one already exists", async () => {
    const { prisma, tables } = fakePrisma();
    tables.policyVersion.push({ id: "existing", versionNo: "3.0", status: "PUBLISHED" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await seed(prisma as any, 4);
    expect(result.policyCreated).toBe(false);
    expect(tables.policyVersion).toHaveLength(1);
  });
});
