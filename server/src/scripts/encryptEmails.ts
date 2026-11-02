import type { PrismaClient } from "@prisma/client";
import { isEncrypted, protectEmail } from "../lib/emailCrypto";

/**
 * One-time conversion for issue #28 (NFR-10): encrypts the e-mail of every account that was
 * created before e-mail encryption existed and sets its lookup hash.
 *   npm run db:encrypt-emails -w server
 * Safe to run again: already-encrypted rows are skipped. (Old accounts are also converted
 * automatically the next time they log in.)
 */
export async function encryptExistingEmails(prisma: PrismaClient): Promise<number> {
  const legacy = await prisma.user.findMany({ where: { emailHash: null }, select: { id: true, email: true } });
  let converted = 0;
  for (const u of legacy) {
    if (isEncrypted(u.email)) continue;
    await prisma.user.update({ where: { id: u.id }, data: protectEmail(u.email) });
    converted++;
  }
  return converted;
}

/* istanbul ignore next -- command-line entry point */
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv/config");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
  const prisma = new PrismaClient();
  encryptExistingEmails(prisma)
    // eslint-disable-next-line no-console
    .then((n) => console.log(`E-mail addresses encrypted: ${n}`))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Failed:", err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
