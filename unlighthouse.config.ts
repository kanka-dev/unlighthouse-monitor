// Globale Unlighthouse-Konfiguration für den Docker-Runner.
// Per-Site Optionen (mobile, i18n, ...) werden in run-all.js als CLI-Flags übergeben.
//
// Flags angelehnt an die offizielle Docker-Empfehlung:
// https://unlighthouse.dev/guide/guides/docker
//
// Hinweis: Wir verzichten bewusst auf `defineUnlighthouseConfig`, weil das den
// Import des vollen `unlighthouse`-Pakets erfordern würde. Plain-Object reicht.
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
  // Begrenze parallele Chrome-Instanzen, sonst OOM/TARGET_CRASHED bei größeren Sites.
  // 2 ist konservativ und stabil bei 4 GB Container-Memory.
  puppeteerClusterOptions: {
    maxConcurrency: 2,
  },
  // Lighthouse selbst nicht zu aggressiv parallelisieren.
  lighthouseOptions: {
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  },
  debug: false,
};
