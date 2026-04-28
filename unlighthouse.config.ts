// Global Unlighthouse configuration for the Docker runner.
// Per-site options (mobile, i18n, ...) are passed as CLI flags from run-all.js.
//
// Flags inspired by the official Docker recipe:
// https://unlighthouse.dev/guide/guides/docker
//
// Note: we intentionally skip `defineUnlighthouseConfig` because that would
// require importing the full `unlighthouse` package. A plain object is enough.
export default {
  puppeteerOptions: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--ignore-certificate-errors",
    ],
  },
  chrome: {
    useSystem: true,
  },
  ci: {
    buildStatic: true,
  },
  // Limit concurrent Chrome instances; otherwise OOM/TARGET_CRASHED on larger sites.
  // 2 is conservative and stable with 4 GB container memory.
  puppeteerClusterOptions: {
    maxConcurrency: 2,
  },
  // Categories Lighthouse should report on (drops PWA which is mostly noise).
  lighthouseOptions: {
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  },
  debug: false,
};
