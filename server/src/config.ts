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
