import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { config, isProduction } from "../config";
import { AppError } from "./errorHandler";

/**
 * Security hardening (issue #17, SRS SEC-5 and SEC-7).
 *
 * Already in place elsewhere:
 *  - SQL injection: Prisma always sends parameterised queries.
 *  - XSS: React escapes all output; Helmet sets a strict Content-Security-Policy.
 *  - Input validation: every route parses its input with a Zod schema.
 * Added here: HTTPS redirect, CSRF origin check and rate limits.
 */

/** SEC-5: in production every plain-HTTP request is redirected to HTTPS (HSTS is set by Helmet). */
export function requireHttps(req: Request, res: Response, next: NextFunction) {
  if (!isProduction || req.secure) return next();
  res.redirect(308, `https://${req.headers.host ?? ""}${req.originalUrl}`);
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * SEC-7 CSRF protection for a cookie-based JSON API.
 * A state-changing request is only accepted when the browser says it comes from our
 * own front end (the Origin header, or Referer as a fallback). A malicious site cannot
 * fake these headers, and the session cookie is SameSite=Lax as a second barrier.
 * (OWASP CSRF cheat sheet: "verifying origin with standard headers".)
 * Requests without either header (curl, server-to-server, tests) are not sent by a
 * victim's browser, so they are allowed.
 */
export function csrfOriginCheck(allowedOrigin = config.CLIENT_ORIGIN): RequestHandler {
  const allowed = new URL(allowedOrigin).origin;
  return (req, _res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();

    const origin = req.headers.origin;
    const referer = req.headers.referer;
    let source: string | null = null;
    if (origin && origin !== "null") source = origin;
    else if (referer) {
      try {
        source = new URL(referer).origin;
      } catch {
        source = "invalid";
      }
    } else if (origin === "null") source = "null";

    if (source === null) return next();

    const host = req.headers.host;
    const sameHost = host !== undefined && (source === `https://${host}` || source === `http://${host}`);
    if (source === allowed || sameHost) return next();

    next(new AppError(403, "CSRF_REJECTED", "Request blocked: it did not come from the Consent Manager site"));
  };
}

const limitReached = (message: string) => (_req: Request, _res: Response, next: NextFunction) =>
  next(new AppError(429, "RATE_LIMITED", message));

/** Brute-force protection on login and register (works together with the account lockout, SEC-3). */
export function authRateLimit(perMinute = config.AUTH_RATE_LIMIT_PER_MINUTE): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: perMinute,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: limitReached("Too many attempts from this network. Please wait a minute and try again."),
  });
}

/** General limit for the whole API, against scripted abuse. */
export function apiRateLimit(perMinute = config.API_RATE_LIMIT_PER_MINUTE): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: perMinute,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => req.path === "/health",
    handler: limitReached("Too many requests. Please slow down."),
  });
}
