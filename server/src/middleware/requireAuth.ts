import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { SESSION_COOKIE, setSessionCookie, verifySession } from "../lib/session";
import { AppError } from "./errorHandler";

/**
 * Lets the request through only if it carries a valid, current session (FR-2, FR-3).
 * The user is re-read from the database every time, so a deactivated account or a
 * logged-out session stops working immediately. The cookie is renewed on each
 * request, so the session only expires after SESSION_TTL_MINUTES of inactivity.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const claims = verifySession(req.cookies?.[SESSION_COOKIE]);
    if (!claims) throw new AppError(401, "UNAUTHENTICATED", "Please log in");

    const user = await prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || !user.isActive || user.sessionVersion !== claims.sv) {
      throw new AppError(401, "UNAUTHENTICATED", "Your session has ended, please log in again");
    }

    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    setSessionCookie(res, { sub: user.id, role: user.role, sv: user.sessionVersion });
    next();
  } catch (err) {
    next(err);
  }
}
