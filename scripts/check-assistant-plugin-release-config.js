const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { configureAssistantPluginRelease, validateCatalogUrl } = require("./configure-assistant-plugin-release");

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-plugin-release-config-"));
  try {
    const outputPath = path.join(directory, "assistantPluginRelease.json");
    await fs.copyFile(path.resolve(__dirname, "../src/backend/plugins/pluginTrust.js"), path.join(directory, "pluginTrust.js"));
    assert.equal((await configureAssistantPluginRelease({ outputPath, catalogUrl: "" })).catalogUrl, "");
    assert.equal(require(path.join(directory, "pluginTrust.js")).ASSISTANT_PLUGIN_CATALOG_URL, "");
    for (const url of ["http://127.0.0.1/catalog.json", "file:///tmp/catalog.json", "https://user:token@example.test/catalog.json", "https://example.test/catalog.json#secret", "broken"]) {
      assert.throws(() => validateCatalogUrl(url), /HTTPS/);
    }
    await assert.rejects(configureAssistantPluginRelease({ outputPath, catalogUrl: "", requireOnline: true }), /published HTTPS/);
    const source = "https://downloads.example.test/assistant-plugin-catalog.json";
    await configureAssistantPluginRelease({ outputPath, catalogUrl: source, requireOnline: true });
    const previousOverride = process.env.FREEFLOW_ASSISTANT_RELEASE_CATALOG_URL;
    delete process.env.FREEFLOW_ASSISTANT_RELEASE_CATALOG_URL;
    try {
      assert.equal((await configureAssistantPluginRelease({ outputPath, requireOnline: true })).catalogUrl, source, "ordinary builds must preserve the committed release source");
      process.env.FREEFLOW_ASSISTANT_RELEASE_CATALOG_URL = "https://downloads.example.test/override.json";
      assert.equal((await configureAssistantPluginRelease({ outputPath })).catalogUrl, process.env.FREEFLOW_ASSISTANT_RELEASE_CATALOG_URL, "release workflows can explicitly override the source");
      process.env.FREEFLOW_ASSISTANT_RELEASE_CATALOG_URL = "";
      assert.equal((await configureAssistantPluginRelease({ outputPath })).catalogUrl, "", "an explicit empty environment override requests an offline build");
    } finally {
      if (previousOverride === undefined) delete process.env.FREEFLOW_ASSISTANT_RELEASE_CATALOG_URL;
      else process.env.FREEFLOW_ASSISTANT_RELEASE_CATALOG_URL = previousOverride;
    }
    await configureAssistantPluginRelease({ outputPath, catalogUrl: source });
    delete require.cache[require.resolve(path.join(directory, "pluginTrust.js"))];
    delete require.cache[require.resolve(outputPath)];
    assert.equal(require(path.join(directory, "pluginTrust.js")).ASSISTANT_PLUGIN_CATALOG_URL, source, "packaged default source must work without a runtime environment override");
    await configureAssistantPluginRelease({ outputPath, catalogUrl: "" });
    assert.equal(JSON.parse(await fs.readFile(outputPath, "utf8")).catalogUrl, "", "offline builds must clear a previous release source");
    console.log("PASS assistant release config: HTTPS defaults, preserved release source, explicit online/offline overrides and strict publication gate");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
