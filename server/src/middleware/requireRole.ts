import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Role } from "@prisma/client";
import { logger } from "../lib/logger";
import { recordAuditSafely } from "../modules/audit/audit.service";
import { AppError } from "./errorHandler";
import { requireAuth } from "./requireAuth";

/**
 * Role-based access control (SRS SEC-2). Use AFTER requireAuth:
 *
 *   router.post("/", requireAuth, requireRole("ADMIN"), handler)
 *
 * or simply use `authorize("ADMIN")`, which does both.
 * A logged-in user without one of the allowed roles gets 403 FORBIDDEN.
 */
export function requireRole(...allowed: Role[]): RequestHandler {
  if (allowed.length === 0) throw new Error("requireRole() needs at least one role");

  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, "UNAUTHENTICATED", "Please log in"));

    if (!allowed.includes(req.user.role)) {
      void recordAuditSafely({
        actorId: req.user.id,
        action: "ACCESS_DENIED",
        targetType: "Route",
        targetId: `${req.method} ${req.baseUrl}${req.route?.path ?? ""}`,
        outcome: "FAILURE",
        details: { role: req.user.role, allowed },
      });
      logger.warn(
        { userId: req.user.id, role: req.user.role, allowed, path: req.originalUrl },
        "access denied",
      );
      return next(new AppError(403, "FORBIDDEN", "You do not have permission to do this"));
    }
    next();
  };
}

/** Login check + role check in one: `router.get("/", authorize("DPO", "ADMIN"), handler)`. */
export function authorize(...allowed: Role[]): RequestHandler[] {
  return [requireAuth, requireRole(...allowed)];
}

/**
 * Ownership rule for routes like /users/:userId/... (SEC-2): a USER may only reach his
 * or her own data; ADMIN and DPO may read anyone's. Use after requireAuth.
 */
export function requireSelfOrRole(param: string, ...privileged: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, "UNAUTHENTICATED", "Please log in"));
    if (req.params[param] === req.user.id || privileged.includes(req.user.role)) return next();

    void recordAuditSafely({
      actorId: req.user.id,
      action: "ACCESS_DENIED",
      targetType: "UserData",
      targetId: String(req.params[param]),
      outcome: "FAILURE",
      details: { role: req.user.role },
    });
    logger.warn({ userId: req.user.id, path: req.originalUrl }, "access to another user's data denied");
    next(new AppError(403, "FORBIDDEN", "You can only access your own data"));
  };
}
