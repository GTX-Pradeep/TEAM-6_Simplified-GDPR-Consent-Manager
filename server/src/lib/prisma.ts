import { PrismaClient } from "@prisma/client";

/**
 * Single shared Prisma client (one connection pool for the whole API).
 *
 * Audit and consent writes run in interactive transactions that wait for a chain lock
 * (pg_advisory_xact_lock), so they are written one after another. Prisma's defaults
 * (wait 2 s for a connection, 5 s per transaction) were too short when 50 users logged in
 * at the same moment: some audit entries were lost (load test TC-SCAL-01, defect D-03).
 * Longer limits let these short transactions queue instead of failing.
 */
export const prisma = new PrismaClient({
  transactionOptions: { maxWait: 15_000, timeout: 30_000 },
});
