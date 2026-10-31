import { z } from "zod";

export const userIdParamSchema = z.object({ userId: z.string().uuid("Invalid user id") });

export const lookupQuerySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail address"),
});

/** FR-20: the past moment to look at. Default: now. Future moments are refused. */
export const consentStateQuerySchema = z.object({
  at: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return new Date();
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use an ISO date-time, e.g. 2026-10-29T15:30:00Z" });
        return z.NEVER;
      }
      if (d.getTime() > Date.now() + 60_000) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a moment in the past" });
        return z.NEVER;
      }
      return d;
    }),
});
