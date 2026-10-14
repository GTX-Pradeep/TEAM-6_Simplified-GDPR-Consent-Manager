import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(254);

/** FR-1, SEC-1: name, unique e-mail, password of at least 8 characters. */
export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email,
  // bcrypt only uses the first 72 bytes, so longer passwords are refused.
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

/** FR-2 */
export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
