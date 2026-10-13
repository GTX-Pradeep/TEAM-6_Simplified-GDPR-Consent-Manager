import { PrismaClient } from "@prisma/client";

/** Single shared Prisma client (one connection pool for the whole API). */
export const prisma = new PrismaClient();
