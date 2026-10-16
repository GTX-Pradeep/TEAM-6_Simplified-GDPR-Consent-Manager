import { z } from "zod";

/** Version numbers look like 1.0, 1.1, 2.0 (FR-13). */
const versionNo = z
  .string()
  .trim()
  .regex(/^\d{1,3}\.\d{1,3}$/, "Use a version like 1.0 or 2.1");

const title = z.string().trim().min(1, "Title is required").max(200);
const body = z.string().trim().min(1, "Policy text is required").max(50_000);
const changeSummary = z.string().trim().min(1, "Describe what changed").max(1000);

export const createPolicySchema = z.object({ versionNo, title, body, changeSummary });

/** Only drafts can be edited; every field is optional but at least one is needed. */
export const updatePolicySchema = z
  .object({
    versionNo: versionNo.optional(),
    title: title.optional(),
    body: body.optional(),
    changeSummary: changeSummary.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Send at least one field" });

export const idParamSchema = z.object({ id: z.string().uuid("Invalid policy id") });

export type CreatePolicyInput = z.infer<typeof createPolicySchema>;
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;
