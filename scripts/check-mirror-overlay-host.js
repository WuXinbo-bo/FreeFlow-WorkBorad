"use strict";

// Run the actual browser-side broker against a fake native shell and file lock.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const root = path.resolve(__dirname, "../public");
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/fixture.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end('<!doctype html><html><body><aside id="drawer" style="width:560px"></aside><button id="trigger">Menu</button><section id="menu" style="--mirror-menu-width:232px"></section></body></html>');
      return;
    }
    const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    async function setup(mode = "success") {
      await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
      await page.evaluate(async mode => {
        const { createMirrorOverlayHost } = await import("/src/runtime/mirrorOverlay/mirrorOverlayHost.js");
        const state = window.hostFixture = {
          presents: [], dismisses: [], notifications: [], activated: [], unavailable: [], closed: 0,
          changes: 0, lock: false, operationMode: mode, failPresent: false, menuOpen: false,
          delayDismiss: false, dismissResolvers: [], settingsOpen: false,
        };
        const shell = {
          platform: "darwin",
          async presentMirrorOverlay(input) { state.presents.push(input); return state.failPresent ? { ok: false, error: "fixture native failure" } : { ok: true }; },
          async dismissMirrorOverlay(input) {
            state.dismisses.push(input);
            if (state.delayDismiss) await new Promise(resolve => { state.dismissResolvers.push(resolve); });
            return { ok: true };
          },
          async notifyMirrorOverlay(input) { state.notifications.push(input); return { ok: true }; },
          onMirrorOverlayRequest(listener) { state.request = listener; return () => {}; },
          onMirrorOverlayEvent(listener) { state.event = listener; return () => {}; },
          githubSync: {
            onOperation(listener) { state.operation = listener; return () => {}; },
            async pullWorkspace() {
              if (state.operationMode === "pending") throw Object.assign(new Error("结果待确认"), { code: "SYNC_OPERATION_PENDING", operationId: "fixture-operation" });
              return new Promise(resolve => { state.resolveBackend = resolve; });
            },
            async getOperation({ operationId }) {
              state.queryId = operationId;
              return new Promise(resolve => { state.resolveQuery = resolve; });
            },
          },
        };
        state.host = createMirrorOverlayHost({
          shell,
          drawer: document.querySelector("#drawer"),
          settingsOptions: {
            async runGitHubBoardFileOperation(task) {
              if (state.lock) throw new Error("fixture lock is already held");
              state.lock = true;
              try { return await task(); }
              finally { state.lock = false; }
            },
          },
          menus: [{
            id: "shell-more", title: "更多", element: document.querySelector("#menu"), trigger: document.querySelector("#trigger"),
            isOpen: () => state.menuOpen,
            items: () => state.menuItems || [{ id: "action", label: "执行" }],
            activate: id => state.activated.push(id),
            close() { state.menuOpen = false; },
          }],
          onClosed() { state.closed++; state.settingsOpen = false; },
          onChanged() { state.changes++; },
          onUnavailable(reason) { state.unavailable.push(reason); },
        });
      }, mode);
    }
    const sync = options => page.evaluate(options => window.hostFixture.host.sync(options), options);

    await setup();
    assert.equal(await page.evaluate(() => window.hostFixture.host.enableSettings()), true);
    await sync({ settingsOpen: true, mirrorActive: true, blocked: false });
    await page.waitForFunction(() => window.hostFixture.host.active?.id === "settings");
    await sync({ settingsOpen: true, mirrorActive: true, blocked: false });
    assert.equal(await page.evaluate(() => window.hostFixture.presents.length), 1, "unchanged sync must not refocus/re-present");
    await page.evaluate(() => { document.documentElement.style.setProperty("--fixture-theme", "12 34 56"); window.hostFixture.host.openSection("canvas"); });
    await sync({ settingsOpen: true, mirrorActive: true, blocked: false });
    await page.waitForFunction(() => window.hostFixture.presents.length === 2);
    const updated = await page.evaluate(() => window.hostFixture.presents.at(-1).payload);
    assert.equal(updated.section, "canvas");
    assert.equal(updated.sectionRevision, 1);
    assert.equal(updated.theme.variables["--fixture-theme"].trim(), "12 34 56");
    await sync({ settingsOpen: true, mirrorActive: true, blocked: true });
    await page.waitForFunction(() => !window.hostFixture.host.active);
    assert.equal(await page.locator("#drawer").getAttribute("data-native-overlay"), null);
    await sync({ settingsOpen: true, mirrorActive: true, blocked: false });
    await page.waitForFunction(() => window.hostFixture.host.active?.id === "settings");
    assert.equal(await page.locator("#drawer").getAttribute("data-native-overlay"), "true");
    await page.evaluate(() => { window.hostFixture.failPresent = true; window.hostFixture.host.openSection("workbench"); });
    await sync({ settingsOpen: true, mirrorActive: true, blocked: false });
    await page.waitForFunction(() => window.hostFixture.unavailable.length > 0);
    assert.equal(await page.evaluate(() => window.hostFixture.host.ownsSettings()), false);
    assert.equal(await page.evaluate(() => window.hostFixture.host.enableSettings()), false, "failed native settings must remain DOM-owned until reload");
    assert.equal(await page.locator("#drawer").getAttribute("data-native-overlay"), null);

    await setup();
    await page.evaluate(() => { window.hostFixture.menuOpen = true; });
    await sync({ settingsOpen: false, mirrorActive: true, blocked: false });
    await page.waitForFunction(() => window.hostFixture.host.active?.id === "shell-more");
    const compactBounds = await page.evaluate(() => window.hostFixture.presents.at(-1).bounds);
    assert.equal(compactBounds.width, 232, "native menu must use the DOM menu's compact width");
    assert.equal(compactBounds.height, 46, "one native row must not retain the old extra 50px space");
    await page.evaluate(() => {
      window.hostFixture.menuItems = [{ id: "action", label: "执行" }, { separator: true }, { id: "other", label: "其他" }];
    });
    await sync({ settingsOpen: false, mirrorActive: true, blocked: false });
    await page.waitForFunction(() => window.hostFixture.presents.at(-1).payload.items.length === 3);
    assert.equal(await page.evaluate(() => window.hostFixture.presents.at(-1).bounds.height), 91, "native divider height must not be counted as a full row");
    await page.setViewportSize({ width: 200, height: 80 });
    await sync({ settingsOpen: false, mirrorActive: true, blocked: false });
    const smallBounds = await page.evaluate(() => window.hostFixture.presents.at(-1).bounds);
    assert(smallBounds.width <= 184 && smallBounds.height <= 64 && smallBounds.x + smallBounds.width <= 192 && smallBounds.y + smallBounds.height <= 72, "native compact menu must stay inside short/narrow windows");
    await page.setViewportSize({ width: 1280, height: 800 });
    await sync({ settingsOpen: false, mirrorActive: true, blocked: false });
    assert.equal(await page.evaluate(() => window.hostFixture.presents.at(-1).bounds.height), 91, "native menu should recover after restoring the window size");
    await page.evaluate(() => window.hostFixture.event({ name: "action", surfaceId: "old-menu", payload: { id: "stale" } }));
    assert.deepEqual(await page.evaluate(() => window.hostFixture.activated), []);
    await page.evaluate(() => window.hostFixture.event({ name: "action", surfaceId: "shell-more", payload: { id: "action" } }));
    assert.deepEqual(await page.evaluate(() => window.hostFixture.activated), ["action"]);
    await page.evaluate(() => window.hostFixture.event({ name: "closed", surfaceId: "shell-more", payload: {} }));
    await page.waitForFunction(() => !window.hostFixture.menuOpen && !window.hostFixture.host.active);

    const reopened = [], pendingClose = [];
    for (const surfaceId of ["settings", "shell-more"]) {
      await setup();
      await page.evaluate(surfaceId => {
        const state = window.hostFixture;
        state.delayDismiss = true;
        state.settingsOpen = surfaceId === "settings";
        if (surfaceId === "settings") state.host.enableSettings();
        else state.menuOpen = true;
      }, surfaceId);
      const options = { settingsOpen: surfaceId === "settings", mirrorActive: true, blocked: false };
      await sync(options);
      await page.waitForFunction(surfaceId => window.hostFixture.host.active?.id === surfaceId, surfaceId);
      await page.evaluate(surfaceId => window.hostFixture.event({ name: "closed", surfaceId, payload: {} }), surfaceId);
      await page.waitForFunction(() => window.hostFixture.dismissResolvers.length === 1 && !window.hostFixture.host.active);
      pendingClose.push(await page.evaluate(async surfaceId => {
        const state = window.hostFixture;
        const presents = state.presents.length;
        // MutationObserver / RAF may sync repeatedly before dismiss IPC returns.
        for (let i = 0; i < 5; i++) {
          state.host.sync({ settingsOpen: state.settingsOpen, mirrorActive: true, blocked: false });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        return { surfaceId, closed: state.closed, menuOpen: state.menuOpen,
          inactive: !state.host.active, addedPresents: state.presents.length - presents };
      }, surfaceId));
      // The user reopens before the old native dismiss IPC has acknowledged.
      await page.evaluate(surfaceId => {
        const state = window.hostFixture;
        if (surfaceId === "settings") { state.settingsOpen = true; state.host.openSection("canvas"); }
        else state.menuOpen = true;
      }, surfaceId);
      await sync(options);
      await page.waitForFunction(surfaceId => window.hostFixture.host.active?.id === surfaceId, surfaceId);
      await page.evaluate(async () => {
        window.hostFixture.dismissResolvers.shift()({ ok: true });
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      reopened.push(await page.evaluate(surfaceId => ({
        surfaceId, active: window.hostFixture.host.active?.id,
        closed: window.hostFixture.closed, menuOpen: window.hostFixture.menuOpen,
      }), surfaceId));
    }
    assert.deepEqual(pendingClose, [
      { surfaceId: "settings", closed: 1, menuOpen: false, inactive: true, addedPresents: 0 },
      { surfaceId: "shell-more", closed: 0, menuOpen: false, inactive: true, addedPresents: 0 },
    ], "closing must update DOM state synchronously so pending dismiss cannot re-present itself");
    assert.deepEqual(reopened, [
      { surfaceId: "settings", active: "settings", closed: 1, menuOpen: false },
      { surfaceId: "shell-more", active: "shell-more", closed: 0, menuOpen: true },
    ], "an old native close acknowledgement must not close a reopened settings surface or menu");

    for (const mode of ["success", "pending"]) {
      await setup(mode);
      await page.evaluate(async () => {
        const state = window.hostFixture;
        await state.request("settings.fileOperationBegin", []);
        state.pull = state.request("desktop.githubSync.pullWorkspace", [{ rootPath: "/fixture" }]);
      });
      await page.waitForFunction(mode => mode === "pending" ? Boolean(window.hostFixture.resolveQuery) : Boolean(window.hostFixture.resolveBackend), mode);
      await page.evaluate(() => window.hostFixture.event({ name: "unavailable", surfaceId: "settings", payload: { reason: "fixture renderer crash" } }));
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
      assert.equal(await page.evaluate(() => window.hostFixture.lock), true, `${mode}: renderer crash must not release autosave before the write outcome`);
      if (mode === "pending") {
        assert.equal(await page.evaluate(() => window.hostFixture.queryId), "fixture-operation");
        await page.evaluate(() => window.hostFixture.resolveQuery({ operation: { phase: "completed", result: { pulled: true } } }));
      } else {
        await page.evaluate(() => window.hostFixture.resolveBackend({ pulled: true }));
      }
      await page.evaluate(() => window.hostFixture.pull);
      await page.waitForFunction(() => !window.hostFixture.lock);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, checks: ["settings hide/recovery", "section/theme changes", "unchanged presentation dedupe", "failure keeps DOM ownership", "compact native menu width and divider height", "short-window bounds and recovery", "stale menu event ignored", "menu close recovery", "pending dismiss does not re-present closed settings or menu", "deferred close preserves reopened settings and menu", "renderer crash retains live file lock", "pending journal confirmation retains file lock"] }, null, 2));
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
