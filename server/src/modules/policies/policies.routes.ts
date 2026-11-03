import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { AppError } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/requireAuth";
import { authorize } from "../../middleware/requireRole";
import { createPolicySchema, idParamSchema, updatePolicySchema } from "./policies.schemas";
import * as policies from "./policies.service";

export const policiesRouter = Router();

/** GET /api/v1/policies -> 200 {policies: [...]}   ADMIN, DPO (FR-13) */
policiesRouter.get(
  "/",
  authorize("ADMIN", "DPO"),
  asyncHandler(async (_req, res) => {
    res.json({ policies: await policies.listPolicies() });
  }),
);

/** GET /api/v1/policies/current -> 200 {policy}   any logged-in user (FR-5) */
policiesRouter.get(
  "/current",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ policy: await policies.getCurrentPolicy() });
  }),
);

/**
 * GET /api/v1/policies/:id -> 200 {policy}   any logged-in user.
 * FR-13: drafts are only visible to ADMIN and DPO; for a normal user a draft looks like it
 * does not exist (404), so unpublished text never leaks. Found during system validation.
 */
policiesRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const policy = await policies.getPolicy(id);
    if (policy.status === "DRAFT" && req.user?.role === "USER") {
      throw new AppError(404, "POLICY_NOT_FOUND", "Policy version not found");
    }
    res.json({ policy });
  }),
);

/** POST /api/v1/policies {versionNo, title, body, changeSummary} -> 201 {policy}   ADMIN (FR-13) */
policiesRouter.post(
  "/",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    const input = createPolicySchema.parse(req.body);
    res.status(201).json({ policy: await policies.createDraft(input, req.user!.id) });
  }),
);

/** PATCH /api/v1/policies/:id -> 200 {policy}   ADMIN, drafts only (FR-13, FR-15) */
policiesRouter.patch(
  "/:id",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = updatePolicySchema.parse(req.body);
    res.json({ policy: await policies.updateDraft(id, input, req.user!.id) });
  }),
);

/** POST /api/v1/policies/:id/publish -> 200 {policy}   ADMIN (FR-14) */
policiesRouter.post(
  "/:id/publish",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json({ policy: await policies.publish(id, req.user!.id) });
  }),
);
