const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { _electron: electron } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const VERSION = require("../package.json").version;

async function main() {
  const online = process.argv.includes("--online");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-plugin-desktop-"));
  const data = path.join(directory, "AppData");
  const profile = path.join(directory, "Profile");
  const artifact = process.env.FREEFLOW_ASSISTANT_PLUGIN_ARTIFACT || path.join(ROOT, "release", "plugins", `freeflow-ai-assistant-${VERSION}.ffplugin`);
  const packageBytes = await fs.readFile(artifact);
  const { manifest } = JSON.parse(zlib.gunzipSync(packageBytes));
  let downloads = 0;
  const catalog = { id: manifest.id, version: manifest.version, minAppVersion: manifest.minAppVersion,
    hostApiVersion: manifest.hostApiVersion, url: "/assistant.ffplugin", size: packageBytes.length,
    sha256: crypto.createHash("sha256").update(packageBytes).digest("hex") };
  const downloadServer = http.createServer((req, res) => {
    if (req.url === "/catalog.json") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(catalog)); }
    else if (req.url === "/assistant.ffplugin") { downloads += 1; res.setHeader("Content-Length", packageBytes.length); res.end(packageBytes); }
    else { res.statusCode = 404; res.end(); }
  });
  if (!online) await new Promise((resolve) => downloadServer.listen(0, "127.0.0.1", resolve));
  await fs.mkdir(data);
  await fs.mkdir(profile);
  await fs.writeFile(path.join(data, "ui-settings.json"), JSON.stringify({
    hasShownStartupTutorial: true, lastTutorialIntroVersion: VERSION,
    dismissedTutorialIntroVersion: VERSION, defaultLaunchFullscreen: false,
    defaultChatPanelVisible: true,
  }));
  const bootstrap = path.join(directory, "bootstrap.cjs");
  await fs.writeFile(bootstrap, `const {app}=require("electron");\napp.setPath("userData",${JSON.stringify(profile)});\napp.getAppPath=()=>${JSON.stringify(ROOT)};\nrequire(${JSON.stringify(path.join(ROOT, "electron/main.js"))});\n`);
  const env = {
    ...process.env, FREEFLOW_HOME_DIR: directory, FREEFLOW_USER_DATA_DIR: data,
    FREEFLOW_CANVAS_BOARD_DIR: path.join(directory, "Boards"),
    FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(directory, "Legacy"), FREEFLOW_PORT: "0",
    FREEFLOW_ASSISTANT_CATALOG_URL: online ? require("../src/backend/plugins/assistantPluginRelease.json").catalogUrl : `http://127.0.0.1:${downloadServer.address().port}/catalog.json`,
    FREEFLOW_PLUGIN_TEST_LOOPBACK: online ? "0" : "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let application;
  let page;
  let errors = [];
  let requests = [];
  async function launch() {
    application = await electron.launch({ executablePath: require("electron"), args: [bootstrap], cwd: ROOT, env, timeout: 30000 });
    page = await application.firstWindow();
    errors = [];
    requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"), null, { timeout: 30000 });
    env.FREEFLOW_PORT = new URL(page.url()).port;
    assert.equal(await page.evaluate(() => !!window.desktopShell?.isDesktop), true);
  }
  async function close() {
    assert.deepEqual(errors, [], "desktop should not report renderer exceptions");
    await application.close();
    application = null;
  }
  async function status() {
    return page.evaluate(async () => (await (await fetch("/api/plugins/assistant/status")).json()).plugin);
  }
  async function settings(section = "plugins") {
    await page.locator("#conversation-settings-btn").evaluate((button) => button.click());
    await page.locator(".settings-center-layout").waitFor({ state: "visible" });
    const category = page.locator("[data-settings-category]");
    if (await category.count() && await category.isVisible()) await category.selectOption(section);
    else await page.locator(`.settings-center-nav [data-settings-section="${section}"]`).click();
  }
  try {
    await launch();
    assert.equal((await status()).installed, false);
    assert.equal(await page.locator("#prompt-input").count(), 0);
    assert.equal(await page.locator("#right-panel-tab-assistant").isVisible(), false);
    assert.equal(await page.locator("#right-panel-tab-screen").isVisible(), true);
    await settings();
    assert.equal(await page.locator('[data-settings-section="ai"]').count(), 0);
    assert.equal(requests.some((url) => url.startsWith("/api/agent/") || url.includes("/assets/assistant.")), false);
    await assert.rejects(fs.stat(path.join(data, "agent-sessions.sqlite")), { code: "ENOENT" });
    await page.locator('[data-settings-action="plugin-install"]').click();
    await page.waitForFunction(async () => {
      const plugin = (await (await fetch("/api/plugins/assistant/status")).json()).plugin;
      if (plugin.error) throw new Error(plugin.error.message);
      return plugin.installed && plugin.selfCheck?.ok && plugin.restartRequired;
    }, null, { timeout: online ? 150000 : 45000 });
    assert.equal((await status()).activeEnabled, false, "successful installation cannot activate mid-session");
    assert.equal((await status()).running, false, "self-check process must exit after install");
    if (!online) assert.equal(downloads, 1, "desktop install must download the actual signed package");
    assert.equal((await status()).version, manifest.version);
    await page.locator(".settings-center-plugin-state").filter({ hasText: "等待重启" }).waitFor();
    await assert.rejects(fs.stat(path.join(data, "agent-sessions.sqlite")), { code: "ENOENT" });
    await page.screenshot({ path: path.join(directory, "installed-restart.png") });
    await close();

    await launch();
    assert.equal((await status()).activeEnabled, true);
    assert.equal((await status()).running, false);
    assert.equal(await page.locator("#prompt-input").count(), 1);
    await settings("appearance");
    assert.equal((await status()).running, false, "opening ordinary settings must not launch the assistant");
    await page.locator("#drawer-close-btn").click();
    const initialized = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/agent/sessions" && response.status() === 200);
    await page.locator("#right-panel-tab-assistant").click();
    await initialized;
    await fs.access(path.join(data, "agent-sessions.sqlite"));
    await page.screenshot({ path: path.join(directory, "assistant-enabled.png") });
    await settings("ai");
    await page.locator('[data-ai-section="permissions"]').click();
    await page.locator('[data-ai-section="diagnostics"]').click();
    await page.locator('[data-settings-section="plugins"]').click();
    await page.locator('[data-settings-action="plugin-disable-confirm"]').click();
    const disabled = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/plugins/assistant/enabled" && response.request().method() === "POST");
    await page.locator('[data-settings-action="plugin-disable"]').click();
    const disabledResponse = await disabled;
    const disabledPayload = await disabledResponse.json();
    assert.equal(disabledResponse.status(), 200, JSON.stringify(disabledPayload));
    assert.equal(disabledPayload.plugin.activeEnabled, false);
    await page.locator("#prompt-input").waitFor({ state: "detached" });
    assert.equal((await status()).running, false);
    assert.equal(await page.locator("#prompt-input").count(), 0);
    assert.equal(await page.locator('[data-settings-section="ai"]').count(), 0);
    await page.locator("#drawer-close-btn").click();
    assert.equal(await page.locator("#right-panel-tab-screen").isVisible(), true);
    const oldEndpoint = await page.evaluate(async () => (await fetch("/api/chat-once", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
    assert.equal(oldEndpoint, 409);
    await close();

    await launch();
    assert.equal((await status()).activeEnabled, false);
    await settings();
    await page.locator('[data-settings-action="plugin-enable"]').click();
    await page.waitForFunction(async () => (await (await fetch("/api/plugins/assistant/status")).json()).plugin.restartRequired);
    assert.equal((await status()).activeEnabled, false);
    await close();

    await launch();
    assert.equal((await status()).activeEnabled, true);
    await settings();
    await page.locator(".settings-center-plugin-more > summary").click();
    await page.locator('[data-settings-action="plugin-uninstall-confirm"]').click();
    const uninstalled = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/plugins/assistant/uninstall" && response.request().method() === "POST");
    await page.locator('[data-settings-action="plugin-uninstall"]').click();
    const uninstallResponse = await uninstalled;
    assert.equal(uninstallResponse.status(), 200, await uninstallResponse.text());
    await page.locator("#prompt-input").waitFor({ state: "detached" });
    assert.equal((await status()).running, false);
    await fs.access(path.join(data, "agent-sessions.sqlite"));
    assert.equal(await page.locator("#prompt-input").count(), 0);
    assert.deepEqual(errors, []);
    const input = page.locator('input[type="file"][accept=".ffplugin"]');
    assert.equal(await input.count(), 1);
    await input.setInputFiles(artifact);
    await page.locator(".settings-center-plugin-state").filter({ hasText: "等待重启" }).waitFor();
    assert.equal((await status()).activeEnabled, false);
    await fs.access(path.join(data, "agent-sessions.sqlite"));
    await close();
    console.log(`[check-assistant-plugin-desktop] real Electron ${online ? "public HTTPS" : "HTTP fixture"} download/offline import/self-check, four boots, lazy worker, AI settings, disable/re-enable/uninstall and history preservation passed; screenshots: ${directory}`);
  } finally {
    await application?.close().catch(() => {});
    if (!online) await new Promise((resolve) => downloadServer.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
