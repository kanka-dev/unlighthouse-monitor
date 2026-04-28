/**
 * Lädt sites.yml und mergt globale `defaults` in jede Site.
 * Per-Site-Werte überschreiben Defaults (shallow merge auf thresholds + options).
 */

const fs = require("fs");
const yaml = require("js-yaml");

function loadSites(file) {
  const config = yaml.load(fs.readFileSync(file, "utf8")) || {};
  const defaults = config.defaults || {};
  const sites = config.sites || [];

  return sites.map((site) => ({
    ...site,
    thresholds: {
      ...(defaults.thresholds || {}),
      ...(site.thresholds || {}),
    },
    options: {
      ...(defaults.options || {}),
      ...(site.options || {}),
    },
  }));
}

module.exports = { loadSites };
