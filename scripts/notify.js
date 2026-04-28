#!/usr/bin/env node
/**
 * Mattermost-Notification nach einem Run.
 *
 * Modus: "immer Summary + Detail bei Breach".
 * - Postet pro Run eine Markdown-Tabelle mit allen Sites und Scores.
 * - Bei Threshold-Unterschreitung: Alert-Emoji + Detail-Block mit den Verstößen.
 */

const fs = require("fs");
const path = require("path");
const { loadSites } = require("./load-sites");

const REPORTS_DIR = process.env.REPORTS_DIR || "/reports";
const SITES_FILE = process.env.SITES_FILE || "/app/sites.yml";
const WEBHOOK = process.env.MATTERMOST_WEBHOOK_URL;
const PUBLIC_URL = (process.env.PUBLIC_URL || "http://localhost").replace(/\/$/, "");

if (!WEBHOOK) {
  console.error("[notify] MATTERMOST_WEBHOOK_URL not set — skipping");
  process.exit(0);
}

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const SHORT = { performance: "Perf", accessibility: "A11y", "best-practices": "BP", seo: "SEO" };

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function aggregate(ci) {
  const buckets = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  const pages = Array.isArray(ci) ? ci : ci?.reports || [];
  for (const page of pages) {
    for (const c of CATEGORIES) {
      let v = page?.[c];
      if (typeof v !== "number") v = page?.categories?.[c]?.score;
      if (typeof v === "number") buckets[c].push(Math.round(v * 100));
    }
  }
  const avg = {};
  const min = {};
  for (const c of CATEGORIES) {
    if (buckets[c].length) {
      avg[c] = Math.round(buckets[c].reduce((a, b) => a + b, 0) / buckets[c].length);
      min[c] = Math.min(...buckets[c]);
    } else {
      avg[c] = null;
      min[c] = null;
    }
  }
  return { avg, min, pages: pages.length };
}

function emoji(score, threshold) {
  if (score == null) return "⚪";
  if (score >= threshold) return "🟢";
  if (score >= threshold - 10) return "🟡";
  return "🔴";
}

async function main() {
  const sites = loadSites(SITES_FILE);
  const date = today();

  const rows = [];
  const breaches = [];
  for (const site of sites) {
    const safe = slugify(site.name);
    const ciPath = path.join(REPORTS_DIR, safe, date, "ci-result.json");
    const t = site.thresholds || {};
    const th = (k, d = 80) => t[k] || d;

    if (!fs.existsSync(ciPath)) {
      rows.push({ name: site.name, url: site.url, failed: true });
      breaches.push(`**${site.name}** — ❌ kein Report erzeugt (Scan fehlgeschlagen?)`);
      continue;
    }
    const ci = JSON.parse(fs.readFileSync(ciPath, "utf8"));
    const { avg, min, pages } = aggregate(ci);
    const siteBreaches = [];
    for (const c of CATEGORIES) {
      if (avg[c] != null && avg[c] < th(c)) {
        siteBreaches.push(`${SHORT[c]} Ø${avg[c]} (min ${min[c]}) < ${th(c)}`);
      }
    }
    rows.push({ name: site.name, url: site.url, safe, avg, min, t, pages, siteBreaches });
    if (siteBreaches.length) {
      breaches.push(`**${site.name}** (${site.url}) — ${siteBreaches.join(", ")}\n→ [Report](${PUBLIC_URL}/${safe}/latest/)`);
    }
  }

  const hasIssue = breaches.length > 0;
  const header = hasIssue
    ? `### 🚨 Unlighthouse — ${date}`
    : `### ✅ Unlighthouse — ${date}`;

  const table = [
    "| Site | Pages | Perf | A11y | BP | SEO | Report |",
    "|---|---:|---|---|---|---|---|",
  ];
  for (const r of rows) {
    if (r.failed) {
      table.push(`| ${r.name} | — | ❌ | | | | — |`);
      continue;
    }
    const c = (k) => {
      const a = r.avg[k];
      const m = r.min[k];
      const e = emoji(a, r.t[k] || 80);
      if (a == null) return `${e} —`;
      return m != null && m !== a ? `${e} ${a} _(min ${m})_` : `${e} ${a}`;
    };
    table.push(
      `| ${r.name} | ${r.pages} | ${c("performance")} | ${c("accessibility")} | ${c("best-practices")} | ${c("seo")} | [link](${PUBLIC_URL}/${r.safe}/latest/) |`
    );
  }

  let text = header + "\n\n" + table.join("\n");
  text += `\n\n📊 [Dashboard](${PUBLIC_URL}/)`;
  if (breaches.length) {
    text += "\n\n---\n#### ⚠️ Threshold-Verletzungen\n\n" + breaches.join("\n\n");
  }

  const body = {
    username: "Unlighthouse",
    icon_emoji: hasIssue ? ":rotating_light:" : ":flashlight:",
    text,
  };

  try {
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const respText = await res.text();
    console.log(`[notify] ${res.status} ${respText}`);
  } catch (e) {
    console.error(`[notify] failed: ${e.message}`);
  }
}

main();
