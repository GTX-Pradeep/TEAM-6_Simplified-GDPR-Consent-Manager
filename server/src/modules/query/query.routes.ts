import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { authorize } from "../../middleware/requireRole";
import { pageQuerySchema } from "./query.schemas";
import * as query from "./query.service";

/**
 * DPO console API (FR-18): read-only, for the DPO / auditor and the administrator.
 * Only GET routes exist here, so the records cannot be changed through this API.
 */
export const consentRecordsRouter = Router();
export const auditRouter = Router();

/** GET /api/v1/consents?page=1&pageSize=50 -> {items, total, page, pageSize} */
consentRecordsRouter.get(
  "/",
  authorize("DPO", "ADMIN"),
  asyncHandler(async (req, res) => {
    res.json(await query.listConsentRecords(pageQuerySchema.parse(req.query)));
  }),
);

/** GET /api/v1/audit?page=1&pageSize=50 -> {items, total, page, pageSize} */
auditRouter.get(
  "/",
  authorize("DPO", "ADMIN"),
  asyncHandler(async (req, res) => {
    res.json(await query.listAuditEntries(pageQuerySchema.parse(req.query)));
  }),
);
