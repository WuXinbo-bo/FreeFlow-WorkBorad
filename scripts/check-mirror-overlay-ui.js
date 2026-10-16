"use strict";

// Exercise the real settings component and typed menu without Electron or user data.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { createSettingsCenterService } = require("../src/backend/services/settingsCenterService");
const { getDefaultUiSettings } = require("../src/backend/models/uiSettingsModel");

async function main() {
  const root = path.resolve(__dirname, "../public");
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-mirror-overlay-ui-"));
  const service = createSettingsCenterService({
    uiSettingsService: { readUiSettingsStore: async () => getDefaultUiSettings() },
    permissionsService: { readPermissionsStore: async () => ({ permissions: {}, allowedRoots: [] }) },
  });
  let snapshot = await service.readSettingsSnapshot({ includeAi: false });
  let releaseSave = null;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const json = value => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if (url.pathname === "/api/settings-center") {
      if (req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        await new Promise(resolve => { releaseSave = resolve; });
        snapshot = { ...snapshot, sections: JSON.parse(body).sections };
      }
      json(snapshot);
      return;
    }
    if (url.pathname.startsWith("/api/plugins/assistant/")) {
      json({ ok: true, plugin: { installed: false, activeEnabled: false, desiredEnabled: false, phase: "idle" } });
      return;
    }
    const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      const content = await fs.readFile(file);
      const type = file.endsWith(".html") ? "text/html; charset=utf-8" : file.endsWith(".css") ? "text/css" : /\.m?js$/.test(file) ? "text/javascript" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(content);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 560, height: 760 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.overlayCalls = [];
      window.overlayEvents = [];
      window.githubConnected = false;
      window.planMode = "success";
      window.mirrorOverlay = {
        onPresent(listener) { window.presentOverlay = listener; },
        ready() { window.overlayReady = true; },
        emit(event, payload) { window.overlayEvents.push({ event, payload }); },
        async request(method, args = []) {
          window.overlayCalls.push({ method, args });
          const context = { boardPath: "/fixture/board.freeflow", workspaceRoot: "/fixture" };
          const plan = { rootPath: "/fixture", checkedAt: Date.now(), counts: {}, items: [] };
          if (method === "desktop.getShortcutSettings") return { ok: true, settings: { clickThroughAccelerator: "Command+Shift+X", clickThroughDisplay: "Cmd + Shift + X" } };
          if (method === "desktop.githubSync.getStatus") return { connected: window.githubConnected, ...(window.githubConnected ? { repository: { owner: "fixture", repo: "private", branch: "main" } } : {}) };
          if (method === "desktop.githubSync.getOperations") return { operations: [] };
          if (method === "desktop.githubSync.getWorkspace") return { workspace: { boards: [] } };
          if (method === "desktop.githubSync.listBoards") return { boards: [] };
          if (["settings.workspaceContext", "settings.prepareWorkspace"].includes(method)) return context;
          if (method === "settings.fileOperationBegin") return { leaseId: "fixture-lease" };
          if (method === "desktop.githubSync.planWorkspace") {
            if (window.planMode === "pending") return { ok: false, error: "结果待确认", errorDetails: { code: "SYNC_OPERATION_PENDING", operationId: "fixture-operation" } };
            if (window.planMode === "conflict") return { ok: false, error: "磁盘已有更改", errorDetails: { code: "SYNC_CONFLICT", localChanged: true } };
            return plan;
          }
          if (method === "desktop.githubSync.getOperation") return { operation: { phase: "completed", result: plan } };
          return { ok: true };
        },
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/mirror-overlay.html`);
    await page.waitForFunction(() => window.overlayReady);
    let sectionRevision = 0;
    async function showSettings(section, options = {}) {
      await page.evaluate(({ section, revision, options }) => window.presentOverlay({
        surfaceId: "settings", kind: "settings", payload: { platform: "darwin", section, sectionRevision: revision, ...options },
      }), { section, revision: ++sectionRevision, options });
      await page.waitForSelector(".settings-center-section-heading h4");
    }

    await showSettings("canvas");
    const directory = page.locator('[data-settings-path="canvas.workspaceDirectory"]');
    assert.equal(await directory.isVisible(), false, "directory paths start folded in the native overlay");
    await page.locator('[data-settings-action="toggle-path-details"][data-path-target="canvas.workspaceDirectory"]').click();
    await directory.fill("/fixture/draft");
    await page.locator("#overlay-close").click();
    assert.equal(await page.locator("#insight-drawer").isVisible(), false);
    await showSettings("canvas");
    assert.equal(await directory.inputValue(), "/fixture/draft", "closing must preserve unsaved settings");
    assert.equal(await directory.isVisible(), true, "closing must preserve expanded directory details");
    await page.locator('[data-settings-action="save"]').click();
    await page.waitForFunction(() => document.querySelector('[data-settings-action="save"]')?.disabled);
    await page.evaluate(() => window.presentOverlay({ surfaceId: "settings", kind: "settings", payload: { command: "request-close" } }));
    assert.equal(await page.locator("#insight-drawer").isVisible(), true, "saving must block close");
    assert.equal(await page.evaluate(() => window.overlayEvents.at(-1).event), "close-blocked");
    assert.ok(releaseSave, "save request must reach the fixture endpoint");
    releaseSave();
    releaseSave = null;
    await page.waitForFunction(() => document.querySelector(".settings-center-save-state")?.textContent.includes("设置已保存并应用"));
    assert.equal(await page.evaluate(() => window.overlayCalls.some(item => item.method === "settings.applySnapshot")), true);

    const measurements = [];
    for (const width of [560, 420, 320]) {
      await page.setViewportSize({ width, height: 640 });
      for (const section of ["appearance", "canvas", "workbench", "plugins", "updates"]) {
        await showSettings(section);
        const geometry = await page.evaluate(() => ({
          width: document.querySelector("#insight-drawer").getBoundingClientRect().width,
          overflow: [...document.querySelectorAll(".settings-center-host button,.settings-center-host input,.settings-center-host select")]
            .filter(element => element.checkVisibility() && element.getBoundingClientRect().width > 0)
            .filter(element => element.getBoundingClientRect().left < -1 || element.getBoundingClientRect().right > innerWidth + 1)
            .map(element => element.dataset.settingsPath || element.textContent.slice(0, 30)),
        }));
        assert.equal(geometry.width, width);
        assert.deepEqual(geometry.overflow, [], `${width}/${section} controls must remain inside the native view`);
        measurements.push({ width, section });
      }
    }
    await page.setViewportSize({ width: 560, height: 760 });
    await showSettings("workbench");
    await page.locator("[data-settings-shortcut]").click();
    await page.waitForFunction(() => document.querySelector("[data-settings-shortcut]")?.dataset.recording === "true");
    await page.keyboard.press("Meta+Shift+Y");
    await page.locator("#overlay-close").focus();
    await page.waitForFunction(() => window.overlayCalls.some(item => item.method === "desktop.setShortcutRecording" && item.args[0] === false));
    assert.equal(await page.locator("[data-settings-shortcut]").inputValue(), "Cmd + Shift + Y");
    assert.equal(await page.evaluate(() => window.overlayCalls.some(item => item.method === "desktop.setShortcutRecording" && item.args[0] === true)), true);
    await page.evaluate(revision => window.presentOverlay({ surfaceId: "settings", kind: "settings", payload: { section: "appearance", sectionRevision: revision } }), sectionRevision);
    assert.equal(await page.locator(".settings-center-section-heading h4").textContent(), "工作台习惯", "geometry/theme refresh must not change navigation");
    await page.evaluate(() => window.presentOverlay({ surfaceId: "settings", kind: "settings", visible: false, payload: null }));
    assert.equal(await page.locator("#insight-drawer").isVisible(), false);
    await page.evaluate(revision => window.presentOverlay({ surfaceId: "settings", kind: "settings", payload: { section: "appearance", sectionRevision: revision } }), sectionRevision);
    assert.equal(await page.locator(".settings-center-section-heading h4").textContent(), "工作台习惯");
    await page.screenshot({ path: path.join(artifacts, "settings.png") });

    await page.evaluate(() => { window.githubConnected = true; window.planMode = "pending"; });
    await showSettings("github");
    await page.waitForFunction(() => !document.querySelector('[data-settings-action="github-workspace-plan"]')?.disabled);
    await page.locator('[data-settings-action="github-workspace-plan"]').click();
    await page.waitForFunction(() => window.overlayCalls.some(item => item.method === "settings.fileOperationEnd"));
    assert.equal(await page.evaluate(() => window.overlayCalls.some(item => item.method === "desktop.githubSync.getOperation" && item.args[0].operationId === "fixture-operation")), true, "errorDetails must retain pending operation metadata");
    const leaseSequence = await page.evaluate(() => window.overlayCalls.filter(item => ["settings.fileOperationBegin", "desktop.githubSync.planWorkspace", "desktop.githubSync.getOperation", "settings.fileOperationEnd"].includes(item.method)).map(item => item.method));
    assert.deepEqual(leaseSequence, ["settings.fileOperationBegin", "desktop.githubSync.planWorkspace", "desktop.githubSync.getOperation", "settings.fileOperationEnd"]);
    await page.waitForFunction(() => !document.querySelector('[data-settings-action="github-workspace-plan"]')?.disabled);
    await page.evaluate(() => { window.planMode = "conflict"; });
    await page.locator('[data-settings-action="github-workspace-plan"]').click();
    await page.waitForFunction(() => window.overlayCalls.filter(item => item.method === "settings.fileOperationEnd").length === 2);
    assert.equal(await page.evaluate(() => window.overlayEvents.some(item => item.event === "runtime-event" && item.payload.type === "freeflow:workspace-files-changed" && item.payload.detail?.localChanged)), true, "failure metadata and lease cleanup must survive RPC");

    await page.locator("#overlay-close").click();
    const menuItems = [{ id: "one", label: "设置", icon: "settings" }, { separator: true }, { id: "skip", label: "不可用", disabled: true }, { id: "two", label: "全屏", active: true }];
    await page.evaluate(items => window.presentOverlay({ surfaceId: "shell-more", kind: "menu", payload: { items } }), menuItems);
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.actionId), "two");
    await page.evaluate(items => window.presentOverlay({ surfaceId: "shell-more", kind: "menu", payload: { items } }), menuItems.map(item => item.id === "two" ? { ...item, label: "退出全屏" } : item));
    assert.equal(await page.evaluate(() => document.activeElement.dataset.actionId), "two", "refresh must preserve hovered/focused action");
    await page.keyboard.press("Enter");
    assert.deepEqual(await page.evaluate(() => window.overlayEvents.at(-1)), { event: "action", payload: { surfaceId: "shell-more", id: "two" } });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#overlay-menu").isVisible(), false);
    const longTargetLabel = "很长的 AI 镜像目标名称：".repeat(12);
    const compactItems = [...Array.from({ length: 8 }, (_, index) => ({ id: `compact-${index}`, label: index ? `操作 ${index + 1}` : longTargetLabel, active: index === 0 })), { separator: true }, { id: "last", label: "最后一项" }];
    for (const themePreset of ["minimalist-slate", "midnight-slate-glow", "spruce-green"]) {
      await page.setViewportSize({ width: 232, height: 160 });
      await page.evaluate(async ({ items, themePreset }) => {
        const { buildThemeCssVariables } = await import("/src/theme/themeCssVariables.js");
        await window.presentOverlay({ surfaceId: "shell-more", kind: "menu", payload: { items, theme: { variables: buildThemeCssVariables({ themePreset }) } } });
      }, { items: compactItems, themePreset });
      const styles = await page.evaluate(() => {
        const first = document.querySelector(".mirror-overlay-menu-item"), menu = document.querySelector("#overlay-menu");
        return { height: first.getBoundingClientRect().height, color: getComputedStyle(first).color, expectedText: getComputedStyle(menu).color, overflowing: menu.scrollHeight > menu.clientHeight };
      });
      assert.equal(styles.height, 32);
      assert.equal(styles.color, styles.expectedText, "native target selection must retain readable theme text");
      assert(styles.overflowing);
      assert.equal(await page.locator('[data-action-id="compact-0"]').getAttribute("title"), longTargetLabel, "ellipsized target names must remain available in full");
      assert.equal(await page.locator("#overlay-menu").evaluate(element => element.scrollWidth <= element.clientWidth), true, "long target labels must not widen the compact menu");
      await page.keyboard.press("End");
      const endFocus = await page.evaluate(() => {
        const item = document.activeElement.getBoundingClientRect(), menu = document.querySelector("#overlay-menu").getBoundingClientRect();
        return { id: document.activeElement.dataset.actionId, visible: item.top >= menu.top && item.bottom <= menu.bottom };
      });
      assert.equal(endFocus.id, "last");
      assert(endFocus.visible, "native keyboard selection must scroll into a short viewport");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#overlay-menu").isVisible(), false);
    }
    await page.setViewportSize({ width: 560, height: 760 });
    await page.evaluate(() => window.presentOverlay({ surfaceId: "shell-more", kind: "menu", payload: { items: [{ id: "safe", label: "<img src=x onerror=alert(1)>" }, null, { id: "bad", label: 5 }, { id: "safe", label: "duplicate" }] } }));
    assert.equal(await page.locator(".mirror-overlay-menu-item").count(), 1);
    assert.equal(await page.locator("#overlay-menu img").count(), 0);
    await page.evaluate(() => window.presentOverlay({ kind: "event", payload: { type: "freeflow:workspace-files-changed", detail: { noEcho: true } } }));
    assert.equal(await page.evaluate(() => window.overlayEvents.some(item => item.event === "runtime-event" && item.payload.detail?.noEcho)), false);
    await page.evaluate(() => window.open("https://github.com/login/device"));
    assert.equal(await page.evaluate(() => window.overlayCalls.at(-1).method), "desktop.openExternal");
    await page.screenshot({ path: path.join(artifacts, "menu.png") });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, geometryCases: measurements.length, checks: ["draft recovery", "save-close guard", "section recovery", "shortcut native relay", "pending-operation metadata", "file-operation lease finally", "typed menu keyboard and focus", "malformed menu filtering", "host event no echo", "safe external links"], artifacts }, null, 2));
  } finally {
    releaseSave?.();
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
