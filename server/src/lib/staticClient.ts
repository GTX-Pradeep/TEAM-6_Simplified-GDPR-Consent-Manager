import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import express, { type Express } from "express";
import { config, isProduction } from "../config";

/**
 * Issue #18: in production the Express server also serves the built React app, so the
 * web pages and the API share one address (no CORS, and the SameSite session cookie
 * works without extra settings). Unknown non-API paths return index.html, so React Router
 * can show /dashboard, /admin etc. after a page refresh.
 */
export function serveClient(app: Express, dir = config.CLIENT_DIST_DIR ?? resolve(__dirname, "../../../client/dist")) {
  const index = join(dir, "index.html");
  if (!isProduction || !existsSync(index)) return false;

  // Hashed asset files can be cached for a year; index.html must always be fresh.
  app.use(express.static(dir, { index: false, maxAge: "1y", immutable: true }));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(index);
  });
  return true;
}
