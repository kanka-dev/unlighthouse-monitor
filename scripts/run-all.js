#!/usr/bin/env node
/**
 * Unlighthouse orchestrator
 *
 * - Reads sites.yml
 * - Runs unlighthouse-ci per site (build-static = HTML reports)
 * - Updates the per-site "latest" symlink
 * - Builds the index dashboard afterwards
 * - Sends a Mattermost notification
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadSites } = require("./load-sites");

const REPORTS_DIR = process.env.REPORTS_DIR || "/reports";
const SITES_FILE = process.env.SITES_FILE || "/app/sites.yml";
const CONFIG_FILE = process.env.UNLIGHTHOUSE_CONFIG || "/app/unlighthouse.config.ts";

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function today() {
  // YYYY-MM-DD in lokaler (Container-)Zeit
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function buildArgs(site) {
  const args = ["--site", site.url, "--build-static", "--no-cache"];
  const o = site.options || {};
  if (o.mobile) args.push("--mobile");
  else if (o.desktop) args.push("--desktop");
  if (o.enableI18nPages) args.push("--enable-i18n-pages");
  if (o.disableDynamicSampling) args.push("--disable-dynamic-sampling");
  if (o.samples && Number.isInteger(o.samples)) args.push("--samples", String(o.samples));
  if (o.throttle === false) args.push("--no-throttle");
  return args;
}

function runSite(site, dateStr) {
  const safe = slugify(site.name);
  const outRoot = path.join(REPORTS_DIR, safe);
  const outDir = path.join(outRoot, dateStr);
  fs.mkdirSync(outDir, { recursive: true });

  log(`=== ${site.name} (${site.url}) -> ${outDir}`);

  const args = buildArgs(site);
  // unlighthouse-ci writes to <cwd>/.unlighthouse by default.
  // We run it inside the target dir and then move .unlighthouse/* out.
  const res = spawnSync("unlighthouse-ci", args, {
    cwd: outDir,
    env: { ...process.env, UNLIGHTHOUSE_CONFIG_FILE: CONFIG_FILE },
    stdio: "inherit",
    timeout: 30 * 60 * 1000, // 30 min hard timeout per site
  });

  if (res.error) {
    log(`  ERROR spawn: ${res.error.message}`);
    return { site, safe, outDir, ok: false, error: res.error.message };
  }
  if (res.status !== 0) {
    // unlighthouse-ci exits non-zero when a budget is missed.
    // That's not a hard error here — the reports are still produced.
    log(`  unlighthouse-ci exited with code ${res.status} (likely a budget breach)`);
  }

  // Move contents of .unlighthouse/ up into outDir so the URL
  // /<slug>/<date>/ points directly to index.html.
  const ulDir = path.join(outDir, ".unlighthouse");
  if (fs.existsSync(ulDir)) {
    for (const entry of fs.readdirSync(ulDir)) {
      const src = path.join(ulDir, entry);
      const dst = path.join(outDir, entry);
      try {
        fs.renameSync(src, dst);
      } catch (e) {
        log(`  move ${entry}: ${e.message}`);
      }
    }
    try {
      fs.rmSync(ulDir, { recursive: true, force: true });
    } catch (_) {}
  }

  // "latest" Symlink aktualisieren
  const latest = path.join(outRoot, "latest");
  try {
    if (fs.existsSync(latest) || fs.lstatSync(latest, { throwIfNoEntry: false })) {
      fs.unlinkSync(latest);
    }
  } catch (_) {}
  try {
    fs.symlinkSync(dateStr, latest, "dir");
  } catch (e) {
    log(`  symlink failed: ${e.message}`);
  }

  return { site, safe, outDir, ok: res.status === 0 || res.status === 1 };
}

function main() {
  if (!fs.existsSync(SITES_FILE)) {
    console.error(`sites.yml not found at ${SITES_FILE}`);
    process.exit(1);
  }
  const sites = loadSites(SITES_FILE);
  if (sites.length === 0) {
    console.error("No sites configured.");
    process.exit(1);
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const dateStr = today();
  log(`Starting run for ${sites.length} site(s), date=${dateStr}`);

  const results = [];
  for (const site of sites) {
    try {
      results.push(runSite(site, dateStr));
    } catch (e) {
      log(`  runSite threw: ${e.message}`);
      results.push({ site, safe: slugify(site.name), ok: false, error: e.message });
    }
  }

  // Index bauen
  try {
    require("./build-index.js");
  } catch (e) {
    log(`build-index failed: ${e.message}`);
  }

  // Mattermost
  try {
    require("./notify.js");
  } catch (e) {
    log(`notify failed: ${e.message}`);
  }

  log("Run complete.");
}

main();
