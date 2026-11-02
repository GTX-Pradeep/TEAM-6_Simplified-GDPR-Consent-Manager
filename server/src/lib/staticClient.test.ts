import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";

/** Tests for issue #18: the API serves the built web app in production. */

function fakeBuild() {
  const dir = mkdtempSync(join(tmpdir(), "client-dist-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><div id=root></div>");
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)");
  return dir;
}

function load(nodeEnv: string) {
  jest.resetModules();
  process.env.NODE_ENV = nodeEnv;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("./staticClient") as typeof import("./staticClient");
  process.env.NODE_ENV = "test";
  return mod;
}

describe("serveClient (#18)", () => {
  it("in production: serves files, and index.html for app routes like /dashboard", async () => {
    const { serveClient } = load("production");
    const app = express();
    app.get("/api/v1/health", (_req, res) => res.json({ ok: true }));
    expect(serveClient(app, fakeBuild())).toBe(true);
    app.use((_req, res) => res.status(404).json({ error: "not found" }));

    const page = await request(app).get("/dashboard");
    expect(page.status).toBe(200);
    expect(page.text).toContain('<div id=root>');
    expect(page.headers["cache-control"]).toBe("no-cache");

    const asset = await request(app).get("/assets/app-abc123.js");
    expect(asset.status).toBe(200);
    expect(asset.headers["cache-control"]).toContain("max-age=31536000");

    // API routes are never answered with the web page
    expect((await request(app).get("/api/v1/health")).body).toEqual({ ok: true });
    expect((await request(app).get("/api/v1/nope")).status).toBe(404);
  });

  it("does nothing in development (Vite serves the app there)", () => {
    const { serveClient } = load("development");
    expect(serveClient(express(), fakeBuild())).toBe(false);
  });

  it("does nothing when the app was not built", () => {
    const { serveClient } = load("production");
    expect(serveClient(express(), join(tmpdir(), "does-not-exist"))).toBe(false);
  });
});
