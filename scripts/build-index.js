#!/usr/bin/env node
/**
 * Baut ein statisches Dashboard unter <REPORTS_DIR>/index.html
 * - Liest sites.yml
 * - Sammelt je Site alle Datums-Ordner und den neuesten Score
 * - Rendert eine Tabelle mit Badges + Links zu latest / History
 */

const fs = require("fs");
const path = require("path");
const { loadSites } = require("./load-sites");

const REPORTS_DIR = process.env.REPORTS_DIR || "/reports";
const SITES_FILE = process.env.SITES_FILE || "/app/sites.yml";

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const LABELS = {
  performance: "Performance",
  accessibility: "A11y",
  "best-practices": "Best Pr.",
  seo: "SEO",
};

function readCi(dir) {
  const p = path.join(dir, "ci-result.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return null;
  }
}

function aggregateScores(ci) {
  const buckets = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  const pages = Array.isArray(ci) ? ci : ci?.reports || [];
  for (const page of pages) {
    for (const c of CATEGORIES) {
      // unlighthouse ci-result.json hat flaches Format: page.performance, page.seo, ...
      let v = page?.[c];
      // Fallback für lighthouse-natives Format mit categories
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

function color(score, threshold) {
  if (score == null) return "#6b7280";
  if (score >= threshold) return "#16a34a";
  if (score >= threshold - 10) return "#eab308";
  return "#dc2626";
}

function badge(score, threshold, worst) {
  const val = score == null ? "—" : score;
  const main = `<span class="badge" style="background:${color(score, threshold)}">${val}</span>`;
  if (worst != null && worst !== score) {
    return `${main}<div class="worst" title="Schlechteste Einzelseite">min ${worst}</div>`;
  }
  return main;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[c]);
}

function externalUrl(url) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

const EXTERNAL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

function siteCell(site) {
  const ext = externalUrl(site.url);
  return `<span class="site-name">${esc(site.name)}<a class="ext" href="${esc(ext)}" target="_blank" rel="noopener noreferrer" title="${esc(ext)} im neuen Tab öffnen" aria-label="Site öffnen">${EXTERNAL_ICON}</a></span><span class="site-url">${esc(site.url)}</span>`;
}

function buildRow(site) {
  const safe = slugify(site.name);
  const siteDir = path.join(REPORTS_DIR, safe);
  const row = { site, safe, runs: [], latest: null, latestDate: null };
  if (!fs.existsSync(siteDir)) return row;

  row.runs = fs
    .readdirSync(siteDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
    .sort()
    .reverse();

  if (row.runs[0]) {
    const ci = readCi(path.join(siteDir, row.runs[0]));
    if (ci) row.latest = aggregateScores(ci);
    row.latestDate = row.runs[0];
  }
  return row;
}

function render(rows) {
  const generatedAt = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" });

  const head = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Unlighthouse Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:2rem;background:#0b0f17;color:#e4e4e7}
  .wrap{max-width:1200px;margin:0 auto}
  h1{margin:0 0 .25rem;font-size:1.75rem}
  .muted{color:#9ca3af;font-size:.9rem}
  table{width:100%;border-collapse:collapse;background:#111827;border-radius:.5rem;overflow:hidden;margin-top:1.5rem}
  th,td{padding:.85rem 1rem;text-align:left;border-bottom:1px solid #1f2937;vertical-align:middle}
  th{background:#1f2937;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:#d1d5db}
  tr:last-child td{border-bottom:none}
  a{color:#60a5fa;text-decoration:none}
  a:hover{text-decoration:underline}
  .badge{display:inline-block;min-width:2.8em;padding:.25em .55em;border-radius:.35em;color:#fff;text-align:center;font-weight:700;font-size:.9rem}
  .worst{font-size:.7rem;color:#9ca3af;margin-top:.2rem;cursor:help}
  .ext{display:inline-flex;align-items:center;justify-content:center;margin-left:.4rem;color:#9ca3af;vertical-align:middle;transition:color .15s}
  .ext:hover{color:#60a5fa}
  .ext svg{display:block}
  details{margin-top:.4rem}
  details summary{cursor:pointer;color:#9ca3af;font-size:.8rem;list-style:none}
  details summary::-webkit-details-marker{display:none}
  details summary::before{content:"▸ ";transition:transform .15s}
  details[open] summary::before{content:"▾ "}
  details ul{margin:.4rem 0 0;padding-left:1rem;font-size:.85rem}
  .legend{display:flex;gap:1rem;margin-top:1rem;font-size:.8rem;color:#9ca3af;flex-wrap:wrap}
  .dot{display:inline-block;width:.7em;height:.7em;border-radius:50%;margin-right:.35em;vertical-align:middle}
  .site-name{font-weight:600}
  .site-url{color:#6b7280;font-size:.8rem;display:block}
  footer{margin-top:2rem;color:#6b7280;font-size:.8rem;text-align:center}
</style>
</head>
<body>
<div class="wrap">
  <h1>🔦 Unlighthouse Dashboard</h1>
  <div class="muted">Zuletzt gebaut: ${esc(generatedAt)} &middot; ${rows.length} Site(s)</div>
  <div class="legend">
    <span><span class="dot" style="background:#16a34a"></span>&ge; Threshold</span>
    <span><span class="dot" style="background:#eab308"></span>&ge; Threshold &minus; 10</span>
    <span><span class="dot" style="background:#dc2626"></span>unter Threshold</span>
    <span><span class="dot" style="background:#6b7280"></span>keine Daten</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Site</th>
        <th>Run</th>
        <th>Perf</th>
        <th>A11y</th>
        <th>Best Pr.</th>
        <th>SEO</th>
        <th>Report</th>
      </tr>
    </thead>
    <tbody>
`;

  let body = "";
  for (const r of rows) {
    const t = r.site.thresholds || {};
    const get = (k, d = 80) => t[k] || d;
    if (!r.latest) {
      body += `<tr>
        <td>${siteCell(r.site)}</td>
        <td colspan="6" class="muted">Noch keine Daten — nächster Run folgt laut Cron</td>
      </tr>`;
      continue;
    }
    const a = r.latest.avg;
    const m = r.latest.min;
    const history =
      r.runs.length > 1
        ? `<details><summary>History (${r.runs.length})</summary><ul>${r.runs
            .map((d) => `<li><a href="./${esc(r.safe)}/${esc(d)}/">${esc(d)}</a></li>`)
            .join("")}</ul></details>`
        : "";
    body += `<tr>
      <td>${siteCell(r.site)}</td>
      <td>${esc(r.latestDate)}<div class="muted" style="font-size:.75rem">${r.latest.pages} pages</div></td>
      <td>${badge(a.performance, get("performance"), m.performance)}</td>
      <td>${badge(a.accessibility, get("accessibility"), m.accessibility)}</td>
      <td>${badge(a["best-practices"], get("best-practices"), m["best-practices"])}</td>
      <td>${badge(a.seo, get("seo"), m.seo)}</td>
      <td><a href="./${esc(r.safe)}/latest/">Öffnen →</a>${history}</td>
    </tr>`;
  }

  const foot = `</tbody></table>
  <footer>Generated by unlighthouse-runner</footer>
</div>
</body>
</html>`;

  return head + body + foot;
}

function main() {
  if (!fs.existsSync(SITES_FILE)) {
    console.error(`sites.yml not found at ${SITES_FILE}`);
    process.exit(1);
  }
  const rows = loadSites(SITES_FILE).map(buildRow);
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const out = path.join(REPORTS_DIR, "index.html");
  fs.writeFileSync(out, render(rows));
  console.log(`[build-index] wrote ${out} with ${rows.length} sites`);
}

main();
