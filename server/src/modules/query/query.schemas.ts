import { z } from "zod";

/** Paging for the DPO console (FR-18). */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : undefined));

/** "2026-10-29" or a full ISO date-time. */
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use a date like 2026-10-29" });
      return z.NEVER;
    }
    return d;
  });

/** Shared date range: `from` is inclusive; a date-only `to` includes that whole day. */
const range = {
  from: optionalDate,
  to: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use a date like 2026-10-29" });
        return z.NEVER;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) d.setUTCDate(d.getUTCDate() + 1); // end of that day (exclusive)
      return d;
    }),
};

/** FR-19: filters for consent records. */
export const consentFilterSchema = pageQuerySchema.extend({
  user: optionalText, //          part of the user's e-mail or name
  purpose: optionalText, //       purpose code, e.g. MARKETING_EMAIL
  action: z.enum(["GRANTED", "WITHDRAWN"]).optional(),
  policyVersion: optionalText, // e.g. 2.0
  ...range,
});

/** FR-19: filters for the audit trail. */
export const auditFilterSchema = pageQuerySchema.extend({
  actor: optionalText, //         part of the actor's e-mail or name
  action: optionalText, //        e.g. LOGIN_FAILED (exact, case-insensitive)
  outcome: z.enum(["SUCCESS", "FAILURE"]).optional(),
  ...range,
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
export type ConsentFilter = z.infer<typeof consentFilterSchema>;
export type AuditFilter = z.infer<typeof auditFilterSchema>;
