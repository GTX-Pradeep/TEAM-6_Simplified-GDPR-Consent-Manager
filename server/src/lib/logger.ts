import pino from "pino";

/**
 * Structured JSON logger. Secrets and personal data are redacted so they never
 * reach the logs (SRS NFR-9).
 */
const pretty = process.env.NODE_ENV === "development";

export const logger = pino({
  // Readable coloured lines while developing; plain JSON in production (for log tools).
  transport: pretty
    ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname,req,res,responseTime" } }
    : undefined,
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
