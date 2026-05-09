#!/usr/bin/env node
/**
 * Builds a static dashboard at <REPORTS_DIR>/index.html
 * - Reads sites.yml
 * - Collects all date folders per site and the latest score
 * - Renders a table with badges + links to latest / history
 */

const fs = require("fs");
const path = require("path");
const { loadSites } = require("./load-sites");

const REPORTS_DIR = process.env.REPORTS_DIR || "/reports";
const SITES_FILE = process.env.SITES_FILE || "/app/sites.yml";

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const KANKA_URL = "https://kanka.dev";
const KANKA_LOGO_URL =
  "https://kanka.dev/wp-content/uploads/2025/03/kanka.dev_logo.svg";

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
      // unlighthouse ci-result.json has a flat format: page.performance, page.seo, ...
      let v = page?.[c];
      // Fallback for lighthouse's native nested format
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
    return `${main}<div class="worst" title="Worst single page">min ${worst}</div>`;
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
  return `<span class="site-name">${esc(site.name)}<a class="ext" href="${esc(ext)}" target="_blank" rel="noopener noreferrer" title="Open ${esc(ext)} in a new tab" aria-label="Open site">${EXTERNAL_ICON}</a></span><span class="site-url">${esc(site.url)}</span>`;
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
  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

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
  .header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap}
  .header-text{flex:1;min-width:0}
  .brand{flex-shrink:0}
  .brand a{display:inline-block;padding:.35rem .65rem;background:#fff;border-radius:.4rem;transition:transform .15s,box-shadow .15s}
  .brand a:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.3)}
  .brand img{display:block;height:34px;width:auto}
  footer{margin-top:2rem;padding-top:1.25rem;border-top:1px solid #1f2937;color:#6b7280;font-size:.8rem;text-align:center;line-height:1.6}
  footer a{color:#9ca3af}
  footer a:hover{color:#60a5fa}
  .btn{display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .9rem;background:#1f2937;color:#e4e4e7;border:1px solid #374151;border-radius:.4rem;font:inherit;font-size:.85rem;cursor:pointer;transition:background .15s,border-color .15s}
  .btn:hover:not(:disabled){background:#374151;border-color:#4b5563}
  .btn:disabled{opacity:.55;cursor:not-allowed}
  .btn-primary{background:#2563eb;border-color:#2563eb;color:#fff;font-weight:600}
  .btn-primary:hover:not(:disabled){background:#1d4ed8;border-color:#1d4ed8}
  .btn-sm{padding:.3rem .6rem;font-size:.78rem}
  .actions{display:flex;align-items:center;gap:.75rem;margin-top:1rem;flex-wrap:wrap}
  #run-status{font-size:.85rem;color:#9ca3af;min-height:1.2em}
  #run-status.ok{color:#22c55e}
  #run-status.err{color:#f87171}
  #run-status.busy{color:#fbbf24}
  .spin{display:inline-block;width:.9em;height:.9em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite;vertical-align:-2px}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="header-text">
      <h1>🔦 Unlighthouse Dashboard</h1>
      <div class="muted">Last built: ${esc(generatedAt)} &middot; ${rows.length} site(s)</div>
    </div>
    <div class="brand">
      <a href="${esc(KANKA_URL)}" target="_blank" rel="noopener noreferrer" title="kanka.dev — opens in a new tab">
        <img src="${esc(KANKA_LOGO_URL)}" alt="kanka.dev" loading="lazy" />
      </a>
    </div>
  </div>
  <div class="legend">
    <span><span class="dot" style="background:#16a34a"></span>&ge; threshold</span>
    <span><span class="dot" style="background:#eab308"></span>&ge; threshold &minus; 10</span>
    <span><span class="dot" style="background:#dc2626"></span>below threshold</span>
    <span><span class="dot" style="background:#6b7280"></span>no data</span>
  </div>
  <div class="actions">
    <button class="btn btn-primary" data-run-all type="button" title="Run Lighthouse for all configured sites now">
      ▶ Run all sites now
    </button>
    <span id="run-status" role="status" aria-live="polite"></span>
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
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
`;

  let body = "";
  for (const r of rows) {
    const t = r.site.thresholds || {};
    const get = (k, d = 80) => t[k] || d;
    const runBtn = `<button class="btn btn-sm" data-run-site="${esc(r.safe)}" type="button" title="Run Lighthouse for ${esc(r.site.name)} only">▶ Run</button>`;
    if (!r.latest) {
      body += `<tr>
        <td>${siteCell(r.site)}</td>
        <td colspan="5" class="muted">No data yet — next scan follows the cron schedule</td>
        <td>—</td>
        <td>${runBtn}</td>
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
      <td><a href="./${esc(r.safe)}/latest/">Open →</a>${history}</td>
      <td>${runBtn}</td>
    </tr>`;
  }

  const foot = `</tbody></table>
  <footer>
    Generated by unlighthouse-runner &middot;
    designed &amp; operated by <a href="${esc(KANKA_URL)}" target="_blank" rel="noopener noreferrer">kanka.dev</a><br />
    Powered by <a href="https://unlighthouse.dev" target="_blank" rel="noopener noreferrer">Unlighthouse</a>
    &amp; <a href="https://developer.chrome.com/docs/lighthouse/overview" target="_blank" rel="noopener noreferrer">Lighthouse</a>
  </footer>
</div>
<script>
(function () {
  const statusEl = document.getElementById("run-status");
  const runAllBtn = document.querySelector("[data-run-all]");
  const siteBtns = document.querySelectorAll("[data-run-site]");
  const allBtns = [runAllBtn, ...siteBtns].filter(Boolean);
  let polling = false;

  function setStatus(text, cls) {
    if (!statusEl) return;
    statusEl.className = cls || "";
    statusEl.innerHTML = text || "";
  }

  function setBusy(busy, activeBtn) {
    allBtns.forEach((b) => (b.disabled = busy));
    if (busy && activeBtn) {
      activeBtn.dataset.label = activeBtn.textContent;
      activeBtn.innerHTML = '<span class="spin"></span> Running…';
    } else {
      allBtns.forEach((b) => {
        if (b.dataset.label) {
          b.textContent = b.dataset.label;
          delete b.dataset.label;
        }
      });
    }
  }

  async function pollStatus(activeBtn, scope) {
    if (polling) return;
    polling = true;
    setBusy(true, activeBtn);
    setStatus('<span class="spin"></span> Lighthouse is running for <code>' + scope + '</code>… this can take several minutes.', "busy");
    try {
      while (true) {
        await new Promise((r) => setTimeout(r, 4000));
        const res = await fetch("./api/status", { cache: "no-store" });
        if (!res.ok) throw new Error("status HTTP " + res.status);
        const s = await res.json();
        if (s.state === "idle" && !s.locked) {
          if (s.ok === false) {
            setStatus("Run finished with errors. Reloading…", "err");
          } else {
            setStatus("Run finished. Reloading dashboard…", "ok");
          }
          setTimeout(() => location.reload(), 1500);
          return;
        }
      }
    } catch (e) {
      setStatus("Lost connection to API: " + e.message, "err");
      setBusy(false);
    } finally {
      polling = false;
    }
  }

  async function trigger(url, scopeLabel, btn) {
    setStatus('<span class="spin"></span> Starting run for <code>' + scopeLabel + '</code>…', "busy");
    setBusy(true, btn);
    try {
      const res = await fetch(url, { method: "POST", cache: "no-store" });
      if (res.status === 409) {
        const j = await res.json().catch(() => ({}));
        const otherScope = (j.status && j.status.scope) || "another job";
        setStatus("A run for <code>" + otherScope + "</code> is already in progress.", "err");
        setBusy(false);
        // Still poll, so we recover the UI when it finishes.
        pollStatus(null, otherScope);
        return;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error("HTTP " + res.status + " " + txt);
      }
      pollStatus(btn, scopeLabel);
    } catch (e) {
      setStatus("Failed to start run: " + e.message, "err");
      setBusy(false);
    }
  }

  if (runAllBtn) {
    runAllBtn.addEventListener("click", () => {
      if (!confirm("Run Lighthouse for ALL sites now? This can take 10+ minutes.")) return;
      trigger("./api/run", "all sites", runAllBtn);
    });
  }
  siteBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const slug = btn.getAttribute("data-run-site");
      trigger("./api/run/" + encodeURIComponent(slug), slug, btn);
    });
  });

  // On page load, recover state if a run is already in progress (e.g. cron).
  fetch("./api/status", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => {
      if (s && (s.state === "running" || s.locked)) {
        pollStatus(null, s.scope || "running job");
      }
    })
    .catch(() => {});
})();
</script>
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
