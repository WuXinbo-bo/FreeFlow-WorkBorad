"use strict";
const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { _electron: electron } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-extension-desktop-"));
  const data = path.join(temp, "Data");
  await fs.mkdir(data);
  const cliPath = path.join(temp, "fake-codex.js");
  await fs.writeFile(cliPath, 'console.log("freeflow-test-codex 1.0.0");\n');
  const version = require("../package.json").version;
  await fs.writeFile(path.join(data, "ui-settings.json"), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version, defaultLaunchFullscreen: false }));
  const bootstrap = path.join(temp, "bootstrap.cjs");
  await fs.writeFile(bootstrap, `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(path.join(temp, "Profile"))}); app.getAppPath = () => ${JSON.stringify(ROOT)}; require(${JSON.stringify(path.join(ROOT, "electron/main.js"))}); globalThis.__extensionBackend = require(${JSON.stringify(path.join(ROOT, "src/backend"))});`);
  const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data, FREEFLOW_CANVAS_BOARD_DIR: path.join(temp, "Boards"), FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, "Legacy"), FREEFLOW_PORT: "0" };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath: require("electron"), args: [bootstrap], cwd: ROOT, env, timeout: 30000 });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    const shell = await page.evaluate(async () => ({ mirror: await window.desktopShell.listAiMirrorTargets(), settings: await (await fetch("/api/extensions")).json(), chat: !!document.querySelector("#chat-form") }));
    assert.equal(shell.chat, false); assert.equal(shell.settings.assistant.enabled, false); assert.equal(shell.mirror.ok, true);
    const change = async (action) => page.evaluate(async (name) => {
      const response = await fetch(`/api/extensions/ai-assistant/${name}`, { method: "POST", headers: { "x-freeflow-extension": "1" } });
      const result = await response.json(); if (!result.ok) throw new Error(result.error); return result;
    }, action);
    await change("install"); await change("enable");
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.assistantEnabled === "true" && !document.body.classList.contains("app-booting"));
    const runtime = await page.evaluate(async () => {
      await fetch("/api/agent/bootstrap");
      const response = await fetch("/api/agent/sessions");
      return { status: response.status, data: await response.json() };
    });
    assert.equal(runtime.status, 200, JSON.stringify(runtime));
    const binding = await page.evaluate(async (cliPath) => {
      const response = await fetch("/api/agent/providers/codex/runtime", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: cliPath }) });
      return { status: response.status, data: await response.json() };
    }, cliPath);
    assert.equal(binding.status, 200, JSON.stringify(binding));
    assert.equal(binding.data.runtime.providers.codex.path, cliPath, "utility host must run Node CLI wrappers through the Electron executable");
    // Access host through the loaded module, validating Electron's actual utility process rather than node fork.
    const processType = await app.evaluate(({ app }) => {
      const backend = globalThis.__extensionBackend;
      return { pid: backend.assistantHost.child?.pid, utility: typeof backend.assistantHost.child?.postMessage === "function" };
    });
    assert(processType.pid); assert.equal(processType.utility, true);
    const workerMetric = await app.evaluate(({ app }, pid) => app.getAppMetrics().find((item) => item.pid === pid)?.memory, processType.pid);
    console.log("[assistant-extension-desktop] assistant utility memory (KB):", JSON.stringify(workerMetric));
    await page.locator("#right-panel-tab-assistant").click();
    await page.locator("#prompt-input").fill("保留的助手草稿");
    await page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
    await change("disable");
    assert.equal(await app.evaluate(({ app }) => globalThis.__extensionBackend.assistantHost.child), null);
    await page.reload();
    await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
    assert.equal(await page.locator("#chat-form").count(), 0);
    assert.equal(await page.locator("#screen-source-panel").isVisible(), true);
    await change("enable"); await page.reload();
    await page.waitForFunction(() => document.body.dataset.assistantEnabled === "true" && !document.body.classList.contains("app-booting"));
    assert.equal(await page.locator("#prompt-input").inputValue(), "保留的助手草稿");
    await change("uninstall"); await page.reload();
    await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
    const mirror = await page.evaluate(() => window.desktopShell.listAiMirrorTargets()); assert.equal(mirror.ok, true);
    assert.deepEqual(errors, []);
    console.log("[assistant-extension-desktop] native Electron utility process, mirror IPC, SQLite, disable/re-enable/draft/uninstall passed");
  } finally { await app?.close(); await fs.rm(temp, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
