import type { CookieOptions, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { config, isProduction } from "../config";

/** Name of the httpOnly cookie that holds the login token. */
export const SESSION_COOKIE = "gdpr_session";

/** What we put inside the signed token. No personal data, only ids. */
export interface SessionClaims {
  sub: string; // user id
  role: Role;
  sv: number; // users.session_version at the time of login
}

const ttlSeconds = () => config.SESSION_TTL_MINUTES * 60;

export function signSession(claims: SessionClaims): string {
  return jwt.sign(claims, config.JWT_SECRET, { algorithm: "HS256", expiresIn: ttlSeconds() });
}

/** Returns the claims, or null if the token is missing, forged or expired. */
export function verifySession(token: string | undefined): SessionClaims | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload !== "object" || typeof payload.sub !== "string" || typeof payload.sv !== "number") {
      return null;
    }
    return { sub: payload.sub, role: payload.role as Role, sv: payload.sv };
  } catch {
    return null;
  }
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true, // JavaScript in the browser cannot read it (protects against XSS token theft)
    secure: isProduction, // HTTPS only in production
    sameSite: "lax",
    path: "/",
  };
}

/** Issues (or renews) the session cookie. Renewing on every request gives a sliding idle timeout. */
export function setSessionCookie(res: Response, claims: SessionClaims) {
  res.cookie(SESSION_COOKIE, signSession(claims), { ...cookieOptions(), maxAge: ttlSeconds() * 1000 });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}
