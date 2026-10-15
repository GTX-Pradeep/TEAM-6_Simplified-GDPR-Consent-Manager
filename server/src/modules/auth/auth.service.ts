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

/** SEC-3: after this many wrong passwords in a row the account is locked ... */
export const MAX_FAILED_LOGINS = 5;
/** ... for this many minutes. */
export const LOCK_MINUTES = 15;

/** FR-2 + SEC-3: returns the user if the e-mail and password are correct and the account is not locked. */
export async function login(input: LoginInput): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // A locked account is refused before the password is even checked, so guessing
  // the right password during the lock period does not help.
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw accountLocked(user.lockedUntil);
  }

  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !user.isActive) throw invalidCredentials();

  if (!ok) {
    await recordFailedLogin(user.id);
    throw invalidCredentials();
  }

  // Successful login: forget earlier failures.
  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }
  return user;
}

/** Counts a wrong password; on the 5th one in a row the account is locked for 15 minutes. */
async function recordFailedLogin(userId: string): Promise<void> {
  // increment is done by the database, so two parallel attempts are both counted
  const { failedLoginCount } = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
  });
  if (failedLoginCount >= MAX_FAILED_LOGINS) {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
    });
    // TODO(#13): write an AUTH_LOCKED entry to the audit trail.
  }
}

function invalidCredentials() {
  return new AppError(401, "INVALID_CREDENTIALS", "E-mail or password is incorrect");
}

function accountLocked(until: Date) {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return new AppError(
    423,
    "ACCOUNT_LOCKED",
    `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    { lockedUntil: until.toISOString() },
  );
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
