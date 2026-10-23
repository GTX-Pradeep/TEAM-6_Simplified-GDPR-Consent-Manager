import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { authorize } from "../../middleware/requireRole";
import { consentActionSchema } from "./consents.schemas";
import * as consents from "./consents.service";

/**
 * Mounted at /api/v1/me/consents. "me" = the logged-in user, so a user can only
 * ever read or change his or her own consents (SEC-2).
 */
export const consentsRouter = Router();

/** GET /api/v1/me/consents -> 200 {purposes: [{purpose, status, updatedAt, policyVersion}], currentPolicy} (FR-4) */
consentsRouter.get(
  "/",
  authorize("USER"),
  asyncHandler(async (req, res) => {
    res.json(await consents.getCurrentState(req.user!.id));
  }),
);

/** POST /api/v1/me/consents {purposeId, action: "GRANTED"|"WITHDRAWN"} -> 201 {consent} (FR-7..FR-10) */
consentsRouter.post(
  "/",
  authorize("USER"),
  asyncHandler(async (req, res) => {
    const input = consentActionSchema.parse(req.body);
    res.status(201).json({ consent: await consents.recordConsent(req.user!.id, input) });
  }),
);
