import bcrypt from "bcryptjs";
import { Prisma, type User } from "@prisma/client";
import { config } from "../../config";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import type { AuthUser } from "../../types/express";
import type { LoginInput, RegisterInput } from "./auth.schemas";

/** The only user fields ever sent to the browser. */
export function toPublicUser(user: Pick<User, "id" | "name" | "email" | "role">): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/** FR-1: self-registered accounts always get the USER role. */
export async function register(input: RegisterInput): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw emailTaken();

  const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);
  try {
    return await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: "USER" },
    });
  } catch (err) {
    // Two registrations with the same e-mail at the same moment: the unique index wins.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw emailTaken();
    throw err;
  }
}

// Compared against when the e-mail does not exist, so a wrong e-mail and a wrong
// password take the same time and return the same message (no account enumeration).
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

/** FR-2: returns the user if the e-mail and password are correct. */
export async function login(input: LoginInput): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok || !user.isActive) {
    // Account lockout after 5 failures (SEC-3) is added in issue #6.
    throw new AppError(401, "INVALID_CREDENTIALS", "E-mail or password is incorrect");
  }
  return user;
}

/**
 * FR-3: invalidates every token issued so far for this user by increasing the
 * session version. Only acts if the token is still current (logging out twice is harmless).
 */
export async function logout(userId: string, sessionVersion: number): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, sessionVersion },
    data: { sessionVersion: { increment: 1 } },
  });
}

function emailTaken() {
  return new AppError(409, "EMAIL_TAKEN", "An account with this e-mail already exists");
}
