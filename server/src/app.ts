import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import pinoHttp from "pino-http";
import { config } from "./config";
import { logger } from "./lib/logger";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { healthRouter } from "./routes/health";

/**
 * Builds the Express application.
 * Request pipeline (SAD Figure 1): security headers -> CORS -> body parsing -> routes -> error handler.
 * Auth, RBAC and validation middleware are added per route as the modules are built.
 */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      // The UI polls /health every 15 s; logging it would bury the useful lines.
      autoLogging: { ignore: (req) => req.url === "/api/v1/health" },
      // One short line per request instead of every header.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customSuccessMessage: (req, res, ms) => `${req.method} ${req.url} -> ${res.statusCode} (${ms} ms)`,
      customErrorMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`,
      genReqId: (req, res) => {
        const id = (req.headers["x-request-id"] as string) || randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
    }),
  );

  const api = express.Router();
  api.use("/health", healthRouter);
  api.use("/auth", authRouter); //          FR-1..3, SEC-1
  // Feature modules still to be mounted during the sprints:
  // api.use("/purposes", purposesRouter);  FR-4, FR-6
  // api.use("/policies", policiesRouter);  FR-5, FR-13..16
  // api.use("/me/consents", consentRouter); FR-7..12
  // api.use("/audit", auditRouter);        FR-17..19
  app.use("/api/v1", api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
