# Unlighthouse Runner

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Scheduled, multi-site [Unlighthouse](https://unlighthouse.dev/) scans with persistent history, a static dashboard, and Mattermost notifications. Self-hosted, ~500 lines of code, no database.

Ideal use case: monitor performance/SEO/a11y of a handful of production websites you maintain (e.g. client sites), get alerted when scores drop below your thresholds.

## Features

- **Cron-driven** (default: Mon + Thu 03:00) via `supercronic`
- **Single source of truth**: `sites.yml` with global defaults + per-site overrides
- **Persistent history**: every run is kept under `reports/<slug>/<date>/`
- **Static dashboard** (`index.html`) with color-coded badges, average + worst-page scores, history toggle
- **Mattermost notifications** after every run (summary always, alert details when thresholds are breached)
- **Reverse-proxy friendly**: works standalone (port forward) or behind Traefik (with optional Authentik / CrowdSec)
- **Site-wide crawl with smart sampling** (Unlighthouse feature) — scans dozens of representative pages per site, not just the homepage

## Repository layout

```
unlighthouse-runner/
├── docker-compose.yml                       # generic base (committed)
├── docker-compose.override.yml              # YOUR proxy/labels (gitignored)
├── docker-compose.override.example.yml      # template: direct port forward
├── docker-compose.traefik.example.yml       # template: Traefik integration
├── Dockerfile                               # node + chromium + supercronic
├── sites.yml                                # YOUR site list (gitignored)
├── sites.example.yml                        # template
├── .env                                     # YOUR secrets (gitignored)
├── .env.example                             # template
├── crontab                                  # schedule
├── unlighthouse.config.ts                   # global puppeteer/chrome flags
├── nginx.conf                               # report webserver
├── scripts/
│   ├── run-all.js                           # orchestrator
│   ├── build-index.js                       # dashboard generator
│   ├── notify.js                            # Mattermost
│   ├── load-sites.js                        # yaml + defaults merger
│   └── package.json
└── reports/                                 # output (gitignored)
    ├── index.html                           # dashboard
    └── <slug>/
        ├── latest -> 2026-04-28/
        └── 2026-04-28/
            ├── index.html
            ├── ci-result.json
            └── ...
```

## Quick start

```bash
git clone https://github.com/kanka-dev/unlighthouse-monitor.git
cd unlighthouse-monitor

# 1. Configuration
cp .env.example .env                    && nano .env
cp sites.example.yml sites.yml          && nano sites.yml

# 2. Pick how the dashboard is exposed
# Option A: directly on a host port (no proxy)
cp docker-compose.override.example.yml docker-compose.override.yml

# Option B: behind Traefik (TLS, SSO etc.)
cp docker-compose.traefik.example.yml docker-compose.override.yml
nano docker-compose.override.yml         # adjust Host(), certresolver, middlewares

# 3. Start
docker compose up -d --build

# 4. First run (otherwise it waits for the cron slot)
docker compose exec unlighthouse-runner /app/scripts/run-all.js
```

First build takes ~3-5 min (Chromium + Node packages). A scan of N sites takes about **N × 3-5 minutes** sequentially.

## Configuration

### `.env`

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PUBLIC_URL` | recommended | `http://localhost` | Dashboard URL used in Mattermost links and the dashboard itself |
| `MATTERMOST_WEBHOOK_URL` | optional | _empty_ | Mattermost Incoming Webhook. If empty, notifications are skipped |
| `TZ` | optional | `UTC` | Timezone the cron runs in (e.g. `Europe/Berlin`) |

### `sites.yml`

Single source of truth for what's scanned. A `defaults` block applies to all sites, per-site values override it (shallow merge on `thresholds` and `options`):

```yaml
defaults:
  thresholds:
    performance: 80
    seo: 90
    accessibility: 90
    best-practices: 85
  options:
    mobile: true

sites:
  # Inherits all defaults
  - name: example.com
    url: example.com

  # Override only what differs
  - name: heavy-example.com
    url: heavy-example.com
    thresholds:
      performance: 60
    options:
      enableI18nPages: true
```

Available `options`:

| Key | Effect |
|---|---|
| `mobile: true` | Mobile-emulation scan (default) |
| `desktop: true` | Desktop scan instead |
| `enableI18nPages: true` | Scan all language variants |
| `disableDynamicSampling: true` | Scan **every** route (warning: very slow) |
| `samples: N` | Number of Lighthouse runs per page |
| `throttle: false` | Disable network throttling |

The file is re-read on every run — no container restart needed when adding sites.

### Schedule (`crontab`)

Default is `0 3 * * 1,4` (Mon + Thu, 03:00). Edit `crontab`, then:

```bash
docker compose restart unlighthouse-runner
```

### Reverse-proxy / exposure

Pick **one** of the example overrides (see _Quick start_ above) and copy it to `docker-compose.override.yml`. Compose merges it with `docker-compose.yml` automatically.

## Manual operation

| Action | Command |
|---|---|
| Full run (scan + dashboard + Mattermost) | `docker compose exec unlighthouse-runner /app/scripts/run-all.js` |
| Rebuild dashboard only (e.g. after editing `sites.yml`) | `docker compose exec unlighthouse-runner /app/scripts/build-index.js` |
| Re-send Mattermost notification for the latest run | `docker compose exec unlighthouse-runner /app/scripts/notify.js` |
| Test a single site (debug, no dashboard update) | `docker compose exec unlighthouse-runner unlighthouse-ci --site example.com --build-static --no-cache --mobile` |
| Run in background | `docker compose exec -d unlighthouse-runner /app/scripts/run-all.js` |
| Follow logs | `docker compose logs -f unlighthouse-runner` |

## Mattermost notifications

After every run, one summary message is posted. If any threshold is breached, an alert emoji and a details block listing the violations are added, with a deep link to the full HTML report per affected site.

Disable notifications by leaving `MATTERMOST_WEBHOOK_URL` empty in `.env`.

## Maintenance

### Edit scripts (`run-all.js`, `notify.js`, `build-index.js`)

Mounted as a volume — changes are picked up on next invocation. **No rebuild needed.**

### Edit `unlighthouse.config.ts`

Also mounted as a volume — read on next `unlighthouse-ci` call. **No rebuild needed.**

### Add npm dependencies for the scripts

`node_modules` lives in the image, so a rebuild **is** required:

```bash
docker compose build unlighthouse-runner
docker compose up -d unlighthouse-runner
```

### Update Unlighthouse itself

`@unlighthouse/cli@latest` is pinned in the Dockerfile. Pull a newer version:

```bash
docker compose build --no-cache unlighthouse-runner
docker compose up -d unlighthouse-runner
```

### Prune old reports

Reports grow by ~5-20 MB per site per run. To remove runs older than 180 days:

```bash
find ./reports -mindepth 2 -maxdepth 2 -type d \
  -regex '.*/[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}$' -mtime +180 -exec rm -rf {} +
docker compose exec unlighthouse-runner /app/scripts/build-index.js
```

Add to `crontab` for automatic cleanup if desired.

## Troubleshooting

**Logs:** `docker compose logs -f unlighthouse-runner`

**Chromium fails to launch / `TARGET_CRASHED` errors:**
- Increase `shm_size` in `docker-compose.yml` (default: `2gb`)
- Lower `puppeteerClusterOptions.maxConcurrency` in `unlighthouse.config.ts`
- Increase `deploy.resources.limits.memory`

**Reports show 404 at `/<slug>/latest/`:**
- Check the `latest` symlink: `ls -la reports/<slug>/`
- Recreate it by running a full scan: `docker compose exec unlighthouse-runner /app/scripts/run-all.js`

**Mattermost notification missing:**
- `docker compose exec unlighthouse-runner env | grep MATTERMOST`
- Re-trigger: `docker compose exec unlighthouse-runner /app/scripts/notify.js`
- Note: `notify.js` looks for **today's** `ci-result.json` — if the run was on a different day, it reports "no report produced".

**Cron doesn't fire:**
- Check logs: `docker compose logs unlighthouse-runner | grep -i cron` — supercronic logs every execution
- Verify `TZ` env var: cron times are interpreted in that timezone
- For a quick test, set `* * * * *` in `crontab` and `docker compose restart unlighthouse-runner`. **Reset afterwards.**

## How slugs are derived

`slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`

| `name` | Slug | Report URL |
|---|---|---|
| `example.com` | `example-com` | `<PUBLIC_URL>/example-com/latest/` |
| `My Site` | `my-site` | `<PUBLIC_URL>/my-site/latest/` |

## Demo / preview

To preview what the dashboard and Mattermost notification look like with **anonymized sample data** (no real scans, no Chromium needed):

```bash
# 1. Generate fake reports for 7 example sites × 4 dates
docker compose exec unlighthouse-runner node /app/scripts/generate-demo.js
docker compose cp unlighthouse-runner:/app/demo ./demo

# 2. Open the dashboard
xdg-open ./demo/reports/index.html       # Linux
open ./demo/reports/index.html           # macOS
# or serve it: cd demo/reports && python3 -m http.server 8000

# 3. Preview the Mattermost message (dry-run, no webhook needed)
docker compose exec \
  -e DRY_RUN=1 \
  -e REPORTS_DIR=/app/demo/reports \
  -e SITES_FILE=/app/demo/sites.yml \
  -e PUBLIC_URL=https://unlighthouse.example.com \
  unlighthouse-runner /app/scripts/notify.js
```

The demo includes sites in different score profiles (great, good, performance issues, threshold breaches) so you can see all visual states at once.

`./demo/` is gitignored; regenerate any time.

## Acknowledgements

Built on top of the excellent [Unlighthouse](https://unlighthouse.dev/) by [Harlan Wilton](https://github.com/harlan-zw). This project is just orchestration glue around it.

## License

[MIT](LICENSE)
