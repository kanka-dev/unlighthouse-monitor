/**
 * Loads sites.yml and merges global `defaults` into each site.
 * Per-site values override defaults (shallow merge on thresholds + options).
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
