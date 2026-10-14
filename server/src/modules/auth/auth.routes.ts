import { Router, type NextFunction, type Request, type Response } from "express";
import { SESSION_COOKIE, clearSessionCookie, setSessionCookie, verifySession } from "../../lib/session";
import { requireAuth } from "../../middleware/requireAuth";
import { loginSchema, registerSchema } from "./auth.schemas";
import * as auth from "./auth.service";

export const authRouter = Router();

type Handler = (req: Request, res: Response) => Promise<unknown>;
/** Passes errors from async handlers to the error handler. */
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

/** POST /api/v1/auth/register  {name, email, password} -> 201 {user}  (FR-1, SEC-1) */
authRouter.post(
  "/register",
  wrap(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const user = await auth.register(input);
    setSessionCookie(res, { sub: user.id, role: user.role, sv: user.sessionVersion });
    res.status(201).json({ user: auth.toPublicUser(user) });
  }),
);

/** POST /api/v1/auth/login  {email, password} -> 200 {user}  (FR-2) */
authRouter.post(
  "/login",
  wrap(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await auth.login(input);
    setSessionCookie(res, { sub: user.id, role: user.role, sv: user.sessionVersion });
    res.json({ user: auth.toPublicUser(user) });
  }),
);

/** POST /api/v1/auth/logout -> 204. Ends the session on the server, not just in the browser (FR-3). */
authRouter.post(
  "/logout",
  wrap(async (req, res) => {
    const claims = verifySession(req.cookies?.[SESSION_COOKIE]);
    if (claims) await auth.logout(claims.sub, claims.sv);
    clearSessionCookie(res);
    res.status(204).end();
  }),
);

/** GET /api/v1/auth/me -> 200 {user}, or 401 when not logged in. Used by the UI on page load. */
authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
