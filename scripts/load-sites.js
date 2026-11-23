/**
 * Loads sites.yml and merges global `defaults` into each site.
 * Per-site values override defaults (shallow merge on thresholds + options).
 */

const fs = require("fs");
const { loadAll, CORE_SCHEMA, mergeTag } = require("js-yaml");

const siteSchema = CORE_SCHEMA.withTags(mergeTag);

function loadSites(file) {
  // Keep empty files and YAML merge keys working as they did with js-yaml 4.
  const documents = loadAll(fs.readFileSync(file, "utf8"), { schema: siteSchema });
  if (documents.length > 1) throw new Error("The site configuration must contain a single YAML document.");
  const config = documents[0] || {};
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
