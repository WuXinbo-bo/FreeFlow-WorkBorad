const fs = require("node:fs/promises");
const path = require("node:path");

const CONFIG_PATH = path.resolve(__dirname, "../src/backend/plugins/assistantPluginRelease.json");

function validateCatalogUrl(value, requireOnline = false) {
  const source = String(value || "").trim();
  if (!source) {
    if (requireOnline) throw new Error("A published HTTPS assistant catalog is required for this release");
    return "";
  }
  let url;
  try { url = new URL(source); } catch { throw new Error("Assistant release catalog must be an absolute HTTPS URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("Assistant release catalog must use HTTPS without credentials or a fragment");
  }
  return url.href;
}

async function configureAssistantPluginRelease({ catalogUrl = process.env.FREEFLOW_ASSISTANT_RELEASE_CATALOG_URL, outputPath = CONFIG_PATH, requireOnline = false } = {}) {
  // Keep the committed release source unless an explicit override (including an
  // empty string for offline builds) was supplied by the release workflow.
  if (catalogUrl === undefined) {
    try { catalogUrl = JSON.parse(await fs.readFile(outputPath, "utf8")).catalogUrl; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const config = { catalogUrl: validateCatalogUrl(catalogUrl, requireOnline) };
  const text = `${JSON.stringify(config, null, 2)}\n`;
  if (await fs.readFile(outputPath, "utf8").catch(() => "") !== text) await fs.writeFile(outputPath, text);
  return config;
}

if (require.main === module) {
  configureAssistantPluginRelease({ requireOnline: process.argv.includes("--require-online") }).then((config) => {
    console.log(`[assistant-plugin-release] ${config.catalogUrl ? "Published HTTPS catalog configured for desktop packaging" : "No online source configured; signed offline import remains available"}`);
  }).catch((error) => { console.error(`[assistant-plugin-release] ${error.message}`); process.exitCode = 1; });
}

module.exports = { CONFIG_PATH, validateCatalogUrl, configureAssistantPluginRelease };
