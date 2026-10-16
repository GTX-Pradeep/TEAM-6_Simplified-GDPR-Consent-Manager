import { z } from "zod";

/** Purpose codes are stable identifiers such as MARKETING_EMAIL (FR-6). */
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]{2,49}$/, "Use 3-50 capital letters, digits or _ (e.g. MARKETING_EMAIL)");

const name = z.string().trim().min(1, "Name is required").max(100);
const description = z.string().trim().min(1, "Description is required").max(1000);

export const createPurposeSchema = z.object({ code, name, description });

/** Only name and description can change; the code stays fixed so old consent records keep their meaning. */
export const updatePurposeSchema = z
  .object({ name: name.optional(), description: description.optional() })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: "Send name and/or description",
  });

export const listQuerySchema = z.object({
  /** ADMIN only: also show deactivated purposes (for the admin screen). */
  all: z.enum(["true", "false"]).optional(),
});

export type CreatePurposeInput = z.infer<typeof createPurposeSchema>;
export type UpdatePurposeInput = z.infer<typeof updatePurposeSchema>;
