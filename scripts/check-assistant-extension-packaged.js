"use strict";
const assert = require("assert/strict");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { _electron: electron } = require("playwright");
const { ExtensionManager } = require("../src/backend/extensions/extensionManager");
const catalog = require("../src/backend/extensions/assistantCatalog.json");
async function main() {
  const executable = process.env.FREEFLOW_PACKAGED_EXECUTABLE;
  assert(executable, "Set FREEFLOW_PACKAGED_EXECUTABLE to the built desktop executable");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-packaged-extension-"));
  const dataDir = path.join(temp, "Data");
  const cliPath = path.join(temp, "fake-codex.js");
  await fs.writeFile(cliPath, 'console.log("freeflow-test-codex 1.0.0");\n');
  const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: dataDir, FREEFLOW_CANVAS_BOARD_DIR: path.join(temp, "Boards"), FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, "Legacy"), FREEFLOW_PORT: "0" };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    for (const enabled of [false, true]) {
      if (enabled) {
        const manager = new ExtensionManager({ dataDir, catalog, localPackage: path.join(__dirname, "../build/extensions", catalog.filename) });
        await manager.initialize(); await manager.change("install"); await manager.change("enable");
      }
      app = await electron.launch({ executablePath: executable, args: [`--user-data-dir=${path.join(temp, "Profile")}`], env, timeout: 45000 });
      const page = await app.firstWindow();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
      assert.equal(await page.locator("#chat-form").count(), enabled ? 1 : 0);
      const result = await page.evaluate(async ({ enabled, cliPath }) => {
        const mirror = await window.desktopShell.listAiMirrorTargets();
        if (!enabled) return { mirror };
        await fetch("/api/agent/bootstrap");
        const sessions = await (await fetch("/api/agent/sessions")).json();
        const binding = await (await fetch("/api/agent/providers/codex/runtime", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: cliPath }) })).json();
        const settings = await import("/extensions/ai-assistant/settings.js");
        return { mirror, sessions, binding, renderer: typeof settings.renderAiSetup };
      }, { enabled, cliPath });
      assert.equal(result.mirror.ok, true);
      if (enabled) { assert.equal(result.sessions.ok, true); assert.equal(result.renderer, "function"); assert.equal(result.binding.runtime?.providers.codex.path, cliPath, JSON.stringify(result.binding)); }
      assert.deepEqual(errors, []);
      await app.close(); app = null;
    }
    console.log("[assistant-extension-packaged] base ASAR without assistant + installed package: native startup/mirror/worker/SQLite/frontend passed");
  } finally { await app?.close(); await fs.rm(temp, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
