import { Router } from "express";
import { prisma } from "../lib/prisma";

export const healthRouter = Router();

/** Liveness + database check, used by the uptime monitor (SRS NFR-4). */
healthRouter.get("/", async (_req, res) => {
  let db: "up" | "down" = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "down";
  }
  res.status(db === "up" ? 200 : 503).json({
    status: db === "up" ? "ok" : "degraded",
    db,
    time: new Date().toISOString(),
  });
});
