import "dotenv/config";
import { z } from "zod";

/** All configuration comes from environment variables (see .env.example). */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  /** Minutes of inactivity after which a login session expires (SRS SEC-3). */
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  /** SEC-7 / brute force: login + register attempts allowed per IP per minute. */
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  /** All other API requests allowed per IP per minute. */
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
  /**
   * NFR-10: key for encrypting e-mail addresses at rest: 32 random bytes as base64
   * (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))").
   * If missing, a key is derived from JWT_SECRET, so keep JWT_SECRET stable in that case.
   */
  EMAIL_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine((v) => !v || Buffer.from(v, "base64").length === 32, "EMAIL_ENCRYPTION_KEY must be 32 bytes in base64"),
  /**
   * Folder with the built React app (client/dist). In production the API also serves the
   * web app, so the whole system runs on one address (issue #18).
   */
  CLIENT_DIST_DIR: z.string().optional(),
  /** NFR-8: consent records, policies and audit entries are kept at least this many years. */
  RETENTION_YEARS: z.coerce.number().int().min(1).max(50).default(3),
  /** bcrypt work factor (SRS SEC-1). Tests use a lower value to stay fast. */
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export const isProduction = config.NODE_ENV === "production";
