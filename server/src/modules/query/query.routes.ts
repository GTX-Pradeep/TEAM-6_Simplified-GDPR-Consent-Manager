import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { authorize } from "../../middleware/requireRole";
import { recordAuditSafely } from "../audit/audit.service";
import { verifyIntegrity } from "../audit/integrity.service";
import { auditFilterSchema, consentFilterSchema } from "./query.schemas";
import * as query from "./query.service";

/**
 * DPO console API (FR-18): read-only, for the DPO / auditor and the administrator.
 * Only GET routes exist here, so the records cannot be changed through this API.
 */
export const consentRecordsRouter = Router();
export const auditRouter = Router();

/**
 * GET /api/v1/consents -> {items, total, page, pageSize}
 * Filters (FR-19, all optional): user, purpose, action, policyVersion, from, to, page, pageSize
 */
consentRecordsRouter.get(
  "/",
  authorize("DPO", "ADMIN"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, ...filters } = consentFilterSchema.parse(req.query);
    res.json(await query.listConsentRecords({ page, pageSize }, query.consentWhere(filters)));
  }),
);

/**
 * GET /api/v1/audit -> {items, total, page, pageSize}
 * Filters (FR-19, all optional): actor, action, outcome, from, to, page, pageSize
 */
auditRouter.get(
  "/",
  authorize("DPO", "ADMIN"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, ...filters } = auditFilterSchema.parse(req.query);
    res.json(await query.listAuditEntries({ page, pageSize }, query.auditWhere(filters)));
  }),
);

/**
 * GET /api/v1/audit/verify -> {ok, checkedAt, audit: ChainReport, consents: ChainReport}
 * SEC-6: recomputes both hash chains and reports the first broken link, if any.
 */
auditRouter.get(
  "/verify",
  authorize("DPO", "ADMIN"),
  asyncHandler(async (req, res) => {
    const report = await verifyIntegrity();
    // Logged after the check, so the check itself never changes what it is checking.
    await recordAuditSafely({
      actorId: req.user!.id,
      action: "INTEGRITY_CHECKED",
      targetType: "HashChains",
      targetId: "audit+consents",
      outcome: report.ok ? "SUCCESS" : "FAILURE",
      details: {
        auditChecked: report.audit.checked,
        consentsChecked: report.consents.checked,
        firstBroken: report.audit.firstBrokenId ?? report.consents.firstBrokenId,
      },
    });
    res.json(report);
  }),
);
