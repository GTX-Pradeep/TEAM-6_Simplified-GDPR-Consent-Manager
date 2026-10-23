import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth } from "../../middleware/requireAuth";
import { authorize } from "../../middleware/requireRole";
import { createPurposeSchema, listQuerySchema, updatePurposeSchema } from "./purposes.schemas";
import * as purposes from "./purposes.service";

export const purposesRouter = Router();

const idParam = z.object({ id: z.string().uuid("Invalid purpose id") });

/**
 * GET /api/v1/purposes -> 200 {purposes: [...]}       any logged-in user (FR-4)
 * GET /api/v1/purposes?all=true                        ADMIN: also deactivated ones
 */
purposesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { all } = listQuerySchema.parse(req.query);
    const includeInactive = all === "true" && req.user?.role === "ADMIN";
    res.json({ purposes: await purposes.listPurposes(includeInactive) });
  }),
);

/** POST /api/v1/purposes {code, name, description} -> 201 {purpose}   ADMIN (FR-6) */
purposesRouter.post(
  "/",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    const input = createPurposeSchema.parse(req.body);
    res.status(201).json({ purpose: await purposes.createPurpose(input, req.user!.id) });
  }),
);

/** PATCH /api/v1/purposes/:id {name?, description?} -> 200 {purpose}   ADMIN (FR-6) */
purposesRouter.patch(
  "/:id",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const input = updatePurposeSchema.parse(req.body);
    res.json({ purpose: await purposes.updatePurpose(id, input, req.user!.id) });
  }),
);

/** PATCH /api/v1/purposes/:id/deactivate -> 200 {purpose}   ADMIN (FR-6) */
purposesRouter.patch(
  "/:id/deactivate",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json({ purpose: await purposes.deactivatePurpose(id, req.user!.id) });
  }),
);
