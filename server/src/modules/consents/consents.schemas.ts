
import { z } from "zod";

/** FR-7, FR-8, FR-9: the only two actions a user can take. Anything else is rejected. */
export const consentActionSchema = z.object({
  purposeId: z.string().uuid("Invalid purpose id"),
  action: z.enum(["GRANTED", "WITHDRAWN"], {
    errorMap: () => ({ message: "action must be GRANTED or WITHDRAWN" }),
  }),
});

export type ConsentActionInput = z.infer<typeof consentActionSchema>;

/** FR-12: Validate the consent history query parameters. */
export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
