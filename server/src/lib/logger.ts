import pino from "pino";

/**
 * Structured JSON logger. Secrets and personal data are redacted so they never
 * reach the logs (SRS NFR-9).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.passwordHash",
      "*.email",
      "*.token",
    ],
    censor: "[REDACTED]",
  },
});
