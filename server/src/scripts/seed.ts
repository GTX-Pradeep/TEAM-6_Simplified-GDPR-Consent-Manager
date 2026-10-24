import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

/**
 * Demo data so the app can be shown right after setup (issue #10).
 *   npm run db:seed -w server
 * Safe to run many times: existing rows are left as they are.
 *
 * Demo accounts (all with password Demo@12345):
 *   user@demo.com  - USER  (consent dashboard)
 *   admin@demo.com - ADMIN (purposes, policies)
 *   dpo@demo.com   - DPO   (audit / read-only views)
 */
export const DEMO_PASSWORD = "Demo@12345";

export const DEMO_USERS = [
  { email: "user@demo.com", name: "Asha User", role: "USER" },
  { email: "admin@demo.com", name: "Ravi Admin", role: "ADMIN" },
  { email: "dpo@demo.com", name: "Meera DPO", role: "DPO" },
] as const;

export const DEMO_PURPOSES = [
  {
    code: "MARKETING_EMAIL",
    name: "Marketing e-mails",
    description: "Newsletters, offers and product news sent to your e-mail address. Usually about twice a month.",
  },
  {
    code: "ANALYTICS",
    name: "Usage analytics",
    description: "Statistics about how you use the app (pages visited, features used) to improve it.",
  },
  {
    code: "PERSONALISATION",
    name: "Personalised recommendations",
    description: "Using your activity to suggest content and features that match your interests.",
  },
  {
    code: "THIRD_PARTY_SHARING",
    name: "Sharing with partners",
    description: "Sharing your name and e-mail address with selected partner companies for their own offers.",
  },
] as const;

export const DEMO_POLICY = {
  versionNo: "1.0",
  title: "Privacy Policy",
  changeSummary: "First published version.",
  body: [
    "1. Who we are",
    "This demo application is operated by Team 6 as an academic project.",
    "",
    "2. What we collect",
    "Your name, e-mail address and the consent choices you make in this app.",
    "",
    "3. Why we process it",
    "Only for the purposes listed on your consent dashboard, and only after you grant consent. You can withdraw",
    "consent at any time; withdrawing is as easy as granting.",
    "",
    "4. How long we keep it",
    "Consent records are kept for 3 years as proof of your choices, then deleted.",
    "",
    "5. Your rights",
    "You can see your full consent history at any time. Contact the data protection officer for any question.",
  ].join("\n"),
};

export interface SeedResult {
  usersCreated: number;
  purposesCreated: number;
  policyCreated: boolean;
}

export async function seed(prisma: PrismaClient, rounds = 12): Promise<SeedResult> {
  const result: SeedResult = { usersCreated: 0, purposesCreated: 0, policyCreated: false };
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, rounds);

  for (const u of DEMO_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (!existing) {
      await prisma.user.create({ data: { ...u, passwordHash } });
      result.usersCreated++;
    }
  }

  for (const p of DEMO_PURPOSES) {
    const existing = await prisma.processingPurpose.findUnique({ where: { code: p.code } });
    if (!existing) {
      await prisma.processingPurpose.create({ data: p });
      result.purposesCreated++;
    }
  }

  // Only add policy v1.0 if no policy exists yet, so we never interfere with real policies.
  const anyPolicy = await prisma.policyVersion.findFirst();
  if (!anyPolicy) {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@demo.com" } });
    await prisma.policyVersion.create({
      data: { ...DEMO_POLICY, status: "PUBLISHED", effectiveAt: new Date(), createdById: admin.id },
    });
    result.policyCreated = true;
  }

  return result;
}

/* istanbul ignore next -- only runs from the command line */
if (require.main === module) {
  // Imported here so the tests above can use seed() without a real database.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv/config");

  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO !== "true") {
    // eslint-disable-next-line no-console
    console.error("Refusing to create demo accounts in production (set SEED_DEMO=true to force).");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  seed(prisma)
    .then((r) => {
      // eslint-disable-next-line no-console
      console.log(
        `Seed done: ${r.usersCreated} users, ${r.purposesCreated} purposes, policy ${r.policyCreated ? "1.0 published" : "already present"}.`,
      );
      // eslint-disable-next-line no-console
      console.log(`Demo logins: user@demo.com / admin@demo.com / dpo@demo.com  -  password ${DEMO_PASSWORD}`);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Seed failed:", err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
