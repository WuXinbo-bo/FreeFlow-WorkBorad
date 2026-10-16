const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { builtinModules } = require("module");

const ROOT_DIR = path.resolve(__dirname, "..");
const EXCLUSIONS = [
  "!src/backend/agent/**/*",
  "!src/backend/assistant-plugin/**/*",
  "!public/src/api/agentClient.js",
  "!public/src/runtime/conversationAssistant/agentController.js",
  "!public/src/runtime/conversationAssistant/activityPresentation.js",
  "!public/src/runtime/assistant-plugin/**/*",
  "!public/ui.agent-assistant.css",
];
const PLUGIN_FILES = ["assistant.css", "assistant.html", "assistant.js", "backend.cjs"];

function assertCoreImportBoundary() {
  const visited = new Set();
  function visit(relativePath) {
    const filePath = path.resolve(ROOT_DIR, relativePath);
    if (visited.has(filePath)) return;
    visited.add(filePath);
    assert(!/[\\/]backend[\\/](?:agent|assistant-plugin)[\\/]/.test(filePath), `Core backend still imports assistant implementation: ${filePath}`);
    assert(!/[\\/](?:agentClient|agentController|activityPresentation)\.js$/.test(filePath), `Core frontend still imports assistant implementation: ${filePath}`);
    if (!fs.existsSync(filePath)) return;
    const source = fs.readFileSync(filePath, "utf8");
    const imports = [...source.matchAll(/(?:require\s*\(\s*|import\s*\(\s*|\bfrom\s+|\bimport\s+)["']([^"']+)["']/g)];
    for (const match of imports) {
      if (!match[1].startsWith(".")) continue;
      const requested = path.resolve(path.dirname(filePath), match[1]);
      const resolved = [requested, `${requested}.js`, path.join(requested, "index.js")].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (resolved && /\.(?:js|cjs|mjs)$/.test(resolved)) visit(resolved);
    }
  }
  visit("server.js");
  visit("public/src/runtime/workbenchRuntime.js");
  const html = fs.readFileSync(path.join(ROOT_DIR, "public/index.html"), "utf8");
  assert(!/href=["'][^"']*ui\.agent-assistant\.css/.test(html), "Core document must not load assistant stylesheet");
}

function assertCorePackaging() {
  const packageInfo = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const files = packageInfo.build.files;
  for (const exclusion of EXCLUSIONS) assert(files.includes(exclusion), `Missing assistant package exclusion: ${exclusion}`);
  assert(!files.includes("!public/src/runtime/conversationAssistant/**/*"), "Mirror chrome/dom must remain available to the core");
  for (const relativePath of ["scripts/start-desktop.js", "scripts/prepare-desktop-build.js"]) {
    const source = fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
    assert(!/build-assistant-plugin|build:assistant-plugin/.test(source), "Ordinary startup/build must not generate or download a plugin");
  }
  assertCoreImportBoundary();
}

function assertPluginPackage(packagePath) {
  const { ASSISTANT_PLUGIN_PUBLIC_KEY } = require("../src/backend/plugins/pluginTrust");
  const bytes = fs.readFileSync(packagePath);
  const payload = JSON.parse(zlib.gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }).toString("utf8"));
  assert.deepEqual(Object.keys(payload.files).sort(), PLUGIN_FILES);
  assert.deepEqual(Object.keys(payload.manifest.files).sort(), PLUGIN_FILES);
  assert.equal(payload.manifest.id, "freeflow.ai-assistant");
  assert.equal(payload.manifest.hostApiVersion, 1);
  assert(crypto.verify(null, Buffer.from(JSON.stringify(payload.manifest)), ASSISTANT_PLUGIN_PUBLIC_KEY, Buffer.from(payload.signature, "base64")), "Plugin signature is invalid");
  for (const fileName of PLUGIN_FILES) {
    const contents = Buffer.from(payload.files[fileName], "base64");
    assert.equal(contents.length, payload.manifest.files[fileName].size, `Asset size mismatch: ${fileName}`);
    assert.equal(crypto.createHash("sha256").update(contents).digest("hex"), payload.manifest.files[fileName].sha256, `Asset hash mismatch: ${fileName}`);
  }
  const backend = Buffer.from(payload.files["backend.cjs"], "base64").toString("utf8");
  const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
  for (const [, specifier] of backend.matchAll(/require\(["']([^"']+)["']\)/g)) {
    assert(builtins.has(specifier), `Plugin backend has a runtime npm/file dependency: ${specifier}`);
  }
  const frontend = Buffer.from(payload.files["assistant.js"], "base64").toString("utf8");
  assert(!/\b(?:from|import\s*\()\s*["'][./]/.test(frontend), "Assistant frontend must be a standalone bundle");
  return { size: bytes.length, version: payload.manifest.version };
}

function assertCoreArchive(archivePath) {
  const asar = require("@electron/asar");
  const files = asar.listPackage(archivePath).map((file) => file.replace(/^\//, ""));
  for (const file of files) {
    assert(!/^src\/backend\/(?:agent|assistant-plugin)(?:\/|$)/.test(file), `Assistant backend leaked into core archive: ${file}`);
    assert(!/^public\/src\/runtime\/assistant-plugin(?:\/|$)/.test(file), `Assistant frontend leaked into core archive: ${file}`);
    assert(!/^public\/src\/(?:api\/agentClient|runtime\/conversationAssistant\/(?:agentController|activityPresentation))\.js$/.test(file), `Assistant source leaked into core archive: ${file}`);
    assert(file !== "public/ui.agent-assistant.css", "Assistant stylesheet leaked into core archive");
    assert(!file.endsWith(".ffplugin"), "Core archive must not carry a plugin package");
  }
  for (const required of ["src/backend/plugins/assistantWorker.js", "src/backend/plugins/assistantPluginManager.js", "public/src/runtime/conversationAssistant/chrome.js", "public/src/runtime/conversationAssistant/dom.js"]) {
    assert(files.includes(required), `Missing core plugin/mirror host file: ${required}`);
  }
  return { files: files.length, size: fs.statSync(archivePath).size };
}

if (require.main === module) {
  try {
    assertCorePackaging();
    const option = process.argv.indexOf("--package-file");
    if (option >= 0) {
      assert(process.argv[option + 1], "--package-file requires a path");
      const result = assertPluginPackage(path.resolve(process.argv[option + 1]));
      console.log(`[check-assistant-plugin-packaging] signed standalone package ${result.version}: ${result.size} bytes`);
    }
    const archiveOption = process.argv.indexOf("--asar-file");
    if (archiveOption >= 0) {
      assert(process.argv[archiveOption + 1], "--asar-file requires a path");
      const result = assertCoreArchive(path.resolve(process.argv[archiveOption + 1]));
      console.log(`[check-assistant-plugin-packaging] actual core archive: ${result.files} entries, ${result.size} bytes, no assistant implementation`);
    }
    console.log("[check-assistant-plugin-packaging] Core excludes assistant implementation; startup is independent");
  } catch (error) {
    console.error(`[check-assistant-plugin-packaging] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { assertCorePackaging, assertPluginPackage, assertCoreArchive, EXCLUSIONS };
