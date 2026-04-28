#!/usr/bin/env node
/**
 * Generates anonymized demo data for screenshots / repo previews.
 *
 * Writes to ./demo/ (sibling of scripts/) — never touches your real reports/.
 *
 * Run:
 *   node scripts/generate-demo.js
 *   # then open ./demo/reports/index.html in a browser
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DEMO_DIR = path.join(ROOT, "demo");
const REPORTS = path.join(DEMO_DIR, "reports");
const SITES_FILE = path.join(DEMO_DIR, "sites.yml");

const SITES = [
  { name: "example.com", url: "example.com", profile: "great" },
  { name: "blog.example.com", url: "blog.example.com", profile: "good" },
  { name: "docs.example.com", url: "docs.example.com", profile: "great", i18n: true },
  { name: "shop.example.com", url: "shop.example.com", profile: "perf-issue" },
  { name: "legacy.example.com", url: "legacy.example.com", profile: "breach" },
  { name: "media.example.com", url: "media.example.com", profile: "good" },
  { name: "api-portal.example.com", url: "api-portal.example.com", profile: "perf-issue" },
];

const PROFILES = {
  great:        { perf: [94, 100], a11y: [95, 100], bp: [95, 100], seo: [95, 100] },
  good:         { perf: [82, 95],  a11y: [88, 97],  bp: [90, 100], seo: [92, 100] },
  "perf-issue": { perf: [58, 78],  a11y: [85, 95],  bp: [85, 95],  seo: [85, 95]  },
  breach:       { perf: [48, 68],  a11y: [70, 85],  bp: [72, 88],  seo: [76, 89]  },
};

const PAGES = {
  great: ["/", "/about/", "/contact/", "/blog/", "/team/", "/imprint/"],
  good: [
    "/",
    "/posts/welcome-to-the-blog/",
    "/posts/release-notes-v2/",
    "/posts/case-study-acme/",
    "/categories/news/",
    "/about/",
    "/imprint/",
    "/privacy/",
  ],
  "perf-issue": [
    "/",
    "/products/",
    "/products/widget-pro/",
    "/products/widget-lite/",
    "/cart/",
    "/checkout/",
    "/account/",
  ],
  breach: ["/", "/services/", "/team/", "/archive/2018/", "/archive/2019/", "/contact/"],
};

const rand = (min, max) => min + Math.random() * (max - min);
const r2 = (range) => Math.round(rand(range[0], range[1])) / 100;

function genCiResult(profile, pages) {
  const { perf, a11y, bp, seo } = PROFILES[profile];
  return pages.map((p) => {
    const performance = r2(perf);
    const accessibility = r2(a11y);
    const bestPractices = r2(bp);
    const seoScore = r2(seo);
    const overall = Math.round(((performance + accessibility + bestPractices + seoScore) / 4) * 100) / 100;
    return {
      path: p,
      score: overall,
      performance,
      accessibility,
      "best-practices": bestPractices,
      seo: seoScore,
    };
  });
}

function dateStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function buildSitesYaml() {
  const blocks = SITES.map((s) => {
    let b = `  - name: ${s.name}\n    url: ${s.url}`;
    if (s.i18n) b += "\n    options:\n      enableI18nPages: true";
    return b;
  });
  return `defaults:
  thresholds:
    performance: 80
    seo: 90
    accessibility: 90
    best-practices: 85
  options:
    mobile: true

sites:
${blocks.join("\n\n")}
`;
}

function stubReport(siteName, date) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Demo report — ${siteName}</title>
<style>body{font-family:system-ui,sans-serif;background:#0b1220;color:#e5e7eb;margin:0;padding:3rem;max-width:680px;margin:0 auto}h1{margin:0 0 .5rem}p{line-height:1.6}code{background:#1f2937;padding:.15rem .35rem;border-radius:.25rem}a{color:#60a5fa}</style>
</head><body>
<h1>Demo report</h1>
<p>This is a placeholder for the full Unlighthouse report of <code>${siteName}</code> on <code>${date}</code>.</p>
<p>In a real run, this page contains the interactive Unlighthouse dashboard with per-page Lighthouse breakdowns, screenshots, and actionable suggestions.</p>
<p><a href="..">← back</a></p>
</body></html>`;
}

console.log(`[demo] generating in ${DEMO_DIR}`);
fs.rmSync(DEMO_DIR, { recursive: true, force: true });
fs.mkdirSync(REPORTS, { recursive: true });

fs.writeFileSync(SITES_FILE, buildSitesYaml());

const dates = [dateStr(0), dateStr(3), dateStr(7), dateStr(10)];

for (const site of SITES) {
  const slug = slugify(site.name);
  const pages = PAGES[site.profile];
  const siteDir = path.join(REPORTS, slug);
  fs.mkdirSync(siteDir, { recursive: true });

  for (const d of dates) {
    const runDir = path.join(siteDir, d);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "ci-result.json"),
      JSON.stringify(genCiResult(site.profile, pages), null, 2)
    );
    fs.writeFileSync(path.join(runDir, "index.html"), stubReport(site.name, d));
  }
  fs.symlinkSync(dates[0], path.join(siteDir, "latest"));
}

console.log(`[demo] wrote ${SITES.length} sites × ${dates.length} dates`);

// Build the dashboard against the demo data
const env = { ...process.env, REPORTS_DIR: REPORTS, SITES_FILE };
const r = spawnSync("node", [path.join(__dirname, "build-index.js")], {
  env,
  stdio: "inherit",
});
if (r.status !== 0) process.exit(r.status || 1);

console.log(`\n[demo] done.`);
console.log(`[demo] dashboard: file://${path.join(REPORTS, "index.html")}`);
console.log(`[demo] preview locally:  cd demo/reports && python3 -m http.server 8000`);
