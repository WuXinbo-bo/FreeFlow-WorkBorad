const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const assert = require("node:assert/strict");
const { assertPluginPackage } = require("./check-assistant-plugin-packaging");
const { CONFIG_PATH, validateCatalogUrl } = require("./configure-assistant-plugin-release");

async function checkAssistantPluginRelease({ catalogPath = path.resolve(__dirname, "../release/plugins/assistant-plugin-catalog.json"), configPath = CONFIG_PATH, requireOnline = false } = {}) {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const catalogUrl = validateCatalogUrl(config.catalogUrl, requireOnline);
  const packageUrl = new URL(catalog.url, catalogUrl || "https://offline.invalid/");
  validateCatalogUrl(packageUrl.href, true);
  const fileName = path.basename(packageUrl.pathname);
  if (!/^freeflow-ai-assistant-[A-Za-z0-9.-]+\.ffplugin$/.test(fileName)) throw new Error("Catalog package filename is invalid");
  const packagePath = path.join(path.dirname(catalogPath), fileName);
  assertPluginPackage(packagePath);
  const bytes = await fs.readFile(packagePath);
  const envelope = JSON.parse(zlib.gunzipSync(bytes, { maxOutputLength: 96 * 1024 * 1024 }));
  for (const key of ["id", "version", "hostApiVersion", "minAppVersion", "maxAppVersion", "platform", "arch"]) assert.equal(catalog[key], envelope.manifest[key], `Catalog ${key} differs from the signed package`);
  assert.equal(catalog.size, bytes.length, "Catalog size differs from the package");
  assert.equal(catalog.sha256, crypto.createHash("sha256").update(bytes).digest("hex"), "Catalog hash differs from the package");
  assert.deepEqual(catalog.manifest, envelope.manifest, "Catalog manifest differs from the signed package");
  assert.equal(catalog.signature, envelope.signature, "Catalog signature differs from the package");
  return { version: catalog.version, size: bytes.length, catalogUrl, packagePath, onlineConfigured: Boolean(catalogUrl) };
}

if (require.main === module) {
  const index = process.argv.indexOf("--catalog-file");
  checkAssistantPluginRelease({ catalogPath: index >= 0 ? path.resolve(process.argv[index + 1]) : undefined, requireOnline: process.argv.includes("--require-online") }).then((result) => {
    console.log(`[assistant-plugin-release] ${result.version}: signed package and catalog match (${result.size} bytes); ${result.onlineConfigured ? "HTTPS source configured; publication still requires an online check" : "offline-ready, online publication not configured"}`);
  }).catch((error) => { console.error(`[assistant-plugin-release] ${error.message}`); process.exitCode = 1; });
}

module.exports = { checkAssistantPluginRelease };
