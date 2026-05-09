#!/usr/bin/env node
/**
 * Tiny HTTP API for the Unlighthouse dashboard.
 *
 * Endpoints (all under /api):
 *   GET  /api/health            liveness probe
 *   GET  /api/sites             list of configured sites (slug + name + url)
 *   GET  /api/status            current run status (reads /reports/.run.status.json)
 *   POST /api/run               trigger a full run of all sites
 *   POST /api/run/:slug         trigger a run for a single site
 *
 * Auth: none. The endpoint is reverse-proxied by nginx (unlighthouse-web)
 * and protected upstream by Authentik forward-auth on Traefik.
 *
 * Concurrency: prevented by the lockfile used in run-all.js. The API does an
 * additional in-process check to fail fast with 409 instead of spawning a
 * doomed child.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { loadSites } = require("./load-sites");

const PORT = parseInt(process.env.PORT || "3000", 10);
const REPORTS_DIR = process.env.REPORTS_DIR || "/reports";
const SITES_FILE = process.env.SITES_FILE || "/app/sites.yml";
const RUN_SCRIPT = path.resolve(__dirname, "run-all.js");
const LOCK_FILE = path.join(REPORTS_DIR, ".run.lock");
const STATUS_FILE = path.join(REPORTS_DIR, ".run.status.json");

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, "[api]", ...args);
}

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch (_) {
    return { state: "idle" };
  }
}

function isLocked() {
  return fs.existsSync(LOCK_FILE);
}

function getSites() {
  const sites = loadSites(SITES_FILE);
  return sites.map((s) => ({ slug: slugify(s.name), name: s.name, url: s.url }));
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain" : "application/json",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function spawnRun(args, scope) {
  const child = spawn("node", [RUN_SCRIPT, ...args], {
    cwd: "/app",
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.on("error", (e) => log(`spawn error (${scope}):`, e.message));
  child.unref();
  log(`spawned run-all.js pid=${child.pid} scope=${scope}`);
  return child.pid;
}

function handleRunAll(res) {
  if (isLocked()) {
    return send(res, 409, { error: "A run is already in progress.", status: readStatus() });
  }
  const pid = spawnRun([], "all");
  send(res, 202, { ok: true, scope: "all", pid });
}

function handleRunSite(res, slug) {
  const sites = getSites();
  const match = sites.find((s) => s.slug === slug);
  if (!match) return send(res, 404, { error: `Unknown site slug "${slug}".` });
  if (isLocked()) {
    return send(res, 409, { error: "A run is already in progress.", status: readStatus() });
  }
  const pid = spawnRun(["--site", match.slug], match.slug);
  send(res, 202, { ok: true, scope: match.slug, pid });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathName = url.pathname.replace(/\/+$/, "") || "/";

  // Health
  if (req.method === "GET" && pathName === "/api/health") {
    return send(res, 200, { ok: true });
  }

  // Status
  if (req.method === "GET" && pathName === "/api/status") {
    return send(res, 200, { ...readStatus(), locked: isLocked() });
  }

  // Sites
  if (req.method === "GET" && pathName === "/api/sites") {
    try {
      return send(res, 200, { sites: getSites() });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  // Trigger all
  if (req.method === "POST" && pathName === "/api/run") {
    return handleRunAll(res);
  }

  // Trigger single
  const m = pathName.match(/^\/api\/run\/([a-z0-9-]+)$/);
  if (req.method === "POST" && m) {
    return handleRunSite(res, m[1]);
  }

  send(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  log(`listening on :${PORT}`);
});

const shutdown = (signal) => {
  log(`got ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
