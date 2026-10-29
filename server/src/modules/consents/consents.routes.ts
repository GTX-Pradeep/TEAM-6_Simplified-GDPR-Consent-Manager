
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { authorize } from "../../middleware/requireRole";
import { consentActionSchema, historyQuerySchema } from "./consents.schemas";
import * as consents from "./consents.service";

/**
 * Mounted at /api/v1/me/consents. "me" = the logged-in user, so a user can only
 * ever read or change his or her own consents (SEC-2).
 */
export const consentsRouter = Router();

/** GET /api/v1/me/consents/history -> consent history (FR-12). */
consentsRouter.get(
  "/history",
  authorize("USER"),
  asyncHandler(async (req, res) => {
    const { limit } = historyQuerySchema.parse(req.query);
    res.json({ history: await consents.getHistory(req.user!.id, limit) });
  }),
);

/** GET /api/v1/me/consents -> current consent state (FR-4). */
consentsRouter.get(
  "/",
  authorize("USER"),
  asyncHandler(async (req, res) => {
    res.json(await consents.getCurrentState(req.user!.id));
  }),
);

/** POST /api/v1/me/consents -> record a consent decision (FR-7..FR-10). */
consentsRouter.post(
  "/",
  authorize("USER"),
  asyncHandler(async (req, res) => {
    const input = consentActionSchema.parse(req.body);
    res.status(201).json({ consent: await consents.recordConsent(req.user!.id, input) });
  }),
);
