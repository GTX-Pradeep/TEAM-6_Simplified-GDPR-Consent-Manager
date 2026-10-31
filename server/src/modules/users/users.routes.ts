import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { authorize } from "../../middleware/requireRole";
import { recordAuditSafely } from "../audit/audit.service";
import { consentStateAt, findUserByEmail } from "./timeTravel.service";
import { consentStateQuerySchema, lookupQuerySchema, userIdParamSchema } from "./users.schemas";

export const usersRouter = Router();

/** GET /api/v1/users/lookup?email=... -> {user}   DPO, ADMIN (used to pick a user) */
usersRouter.get(
  "/lookup",
  authorize("DPO", "ADMIN"),
  asyncHandler(async (req, res) => {
    const { email } = lookupQuerySchema.parse(req.query);
    res.json({ user: await findUserByEmail(email) });
  }),
);

/**
 * GET /api/v1/users/:userId/consent-state?at=2026-10-29T15:30:00Z   DPO, ADMIN (FR-20)
 * -> {user, at, policyInForce, purposes: [{purpose, status, decidedAt, recordId, policyVersion}]}
 * Looking at someone's personal data is itself logged in the audit trail.
 */
usersRouter.get(
  "/:userId/consent-state",
  authorize("DPO", "ADMIN"),
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    const { at } = consentStateQuerySchema.parse(req.query);
    const state = await consentStateAt(userId, at);
    await recordAuditSafely({
      actorId: req.user!.id,
      action: "CONSENT_STATE_VIEWED",
      targetType: "User",
      targetId: userId,
      details: { at: at.toISOString() },
    });
    res.json(state);
  }),
);
