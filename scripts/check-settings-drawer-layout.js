"use strict";

// Exercise the actual half-width drawer and component in an isolated browser.
// All settings, plugin and GitHub responses are fixtures; no user data is read.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { createSettingsCenterService } = require("../src/backend/services/settingsCenterService");
const { getDefaultUiSettings } = require("../src/backend/models/uiSettingsModel");
const { getDefaultAgentSettings } = require("../src/backend/agent/agentSettingsModel");

const root = path.resolve(__dirname, "..");
const publicRoot = path.join(root, "public");
const styles = ["styles.css", "ui.tokens.css", "ui.shell.css", "ui.air-canvas.css", "ui.chrome-system.css", "ui.canvas-chrome.css", "ui.delivery.css", "ui.settings-center.css", "ui.right-panel.css", "ui.workspace.css", "ui.file-workstation.css", "ui.icons.css"];
const viewports = [{ width: 800, height: 900 }, { width: 900, height: 900 }, { width: 1024, height: 900 }, { width: 1280, height: 900 }, { width: 1440, height: 900 }, { width: 1024, height: 540 }, { width: 800, height: 480 }];
const sections = ["canvas", "github", "plugins", "appearance", "workbench", "ai", "updates"];

async function main() {
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-settings-drawer-"));
  const service = createSettingsCenterService({
    uiSettingsService: { readUiSettingsStore: async () => getDefaultUiSettings() },
    permissionsService: { readPermissionsStore: async () => ({ permissions: {}, allowedRoots: [] }) },
    agentSettingsService: { readAgentSettings: async () => getDefaultAgentSettings() },
  });
  const core = await service.readSettingsSnapshot({ includeAi: false });
  const full = await service.readSettingsSnapshot({ includeAi: true });
  const longDirectory = "/Users/freeflow/Documents/工作区/调研资料/" + "long-directory-name-".repeat(8);
  for (const snapshot of [core, full]) Object.assign(snapshot.sections.canvas, { defaultBoardDirectory: longDirectory, workspaceDirectory: longDirectory, exportImageDirectory: longDirectory });
  let plugin = { installed: true, activeEnabled: true, desiredEnabled: true, version: "1.0.0", phase: "ready", downloadAvailable: true, selfCheck: { ok: true } };
  let statusCount = 0;
  let rejectDirectorySave = false;
  const json = (res, value) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/settings-center") {
      if (req.method === "POST" && rejectDirectorySave) {
        for await (const chunk of req) void chunk;
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "目录无法保存", fieldErrors: { "canvas.workspaceDirectory": "目录不可写（测试）" } }));
        return;
      }
      return json(res, url.searchParams.has("includeAi") ? full : core);
    }
    if (url.pathname.startsWith("/api/plugins/assistant/")) {
      if (url.pathname.endsWith("/status")) {
        statusCount++;
        if (plugin.phase === "downloading") plugin = { ...plugin, progress: { ...plugin.progress, receivedBytes: statusCount * 1024 } };
      }
      return json(res, { ok: true, plugin });
    }
    if (url.pathname === "/fixture.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><head><meta charset="utf-8">${styles.map(name => `<link rel="stylesheet" href="/${name}">`).join("")}</head><body>
        <aside id="insight-drawer" class="insight-drawer glass-panel ui-chrome-drawer is-open" role="dialog" aria-modal="false" aria-label="系统设置" aria-hidden="false">
          <header class="settings-center-frame-header"><h3>系统设置</h3><button id="drawer-close-btn" type="button" aria-label="关闭系统设置"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
          <div id="settings-center-host" class="settings-center-host"></div>
        </aside></body></html>`);
      return;
    }
    const file = path.resolve(publicRoot, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(publicRoot + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      const data = await fs.readFile(file);
      const type = /\.m?js$/.test(file) ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: viewports[4], reducedMotion: "reduce" });
  page.setDefaultTimeout(8000);
  const errors = [];
  const failures = [];
  const measurements = [];
  page.on("pageerror", error => errors.push(error.message));
  const check = (condition, message, detail) => { if (!condition) failures.push({ message, detail }); };
  async function openSection(section) {
    const pluginRefresh = section === "plugins" ? page.waitForResponse(response => new URL(response.url()).pathname === "/api/plugins/assistant/status") : null;
    const category = page.locator("[data-settings-category]");
    if (await category.count() && await category.isVisible()) await category.selectOption(section);
    else await page.locator(`.settings-center-nav [data-settings-section="${section}"]`).click();
    await page.locator(".settings-center-section-heading h4").waitFor();
    if (section === "ai") await page.waitForFunction(() => !document.querySelector(".settings-center-content")?.textContent.includes("正在读取 AI 助手设置"));
    if (pluginRefresh) { await pluginRefresh; await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
  }
  async function geometry(label) {
    const result = await page.evaluate(() => {
      const drawer = document.querySelector("#insight-drawer");
      const host = document.querySelector(".settings-center-host");
      const content = document.querySelector(".settings-center-content");
      const rect = drawer.getBoundingClientRect();
      const visible = element => element.checkVisibility() && element.getBoundingClientRect().width > 0;
      const overflowing = [];
      for (const element of [drawer, host, content, ...host.querySelectorAll(".settings-center-group,.settings-center-plugin-card,.settings-center-footer,.settings-center-path-row,.settings-center-github-board,.settings-center-github-file-details,.settings-center-github-conflict-details,.settings-center-plugin-more-actions")]) {
        if (visible(element) && element.scrollWidth > element.clientWidth + 2) overflowing.push({ selector: element.className, scroll: element.scrollWidth, client: element.clientWidth });
      }
      const outside = [];
      for (const element of host.querySelectorAll("button,input,select,textarea,summary")) {
        if (!visible(element)) continue;
        const control = element.getBoundingClientRect();
        if (control.left < rect.left - 1 || control.right > rect.right + 1) outside.push({ text: element.getAttribute("data-settings-path") || element.getAttribute("data-settings-action") || element.textContent.slice(0, 35), left: control.left, right: control.right });
      }
      const overlaps = [];
      for (const row of host.querySelectorAll(".settings-center-path-row")) {
        const input = row.querySelector("input").getBoundingClientRect();
        for (const button of row.querySelectorAll("button")) {
          const action = button.getBoundingClientRect();
          if (Math.min(input.right, action.right) - Math.max(input.left, action.left) > 1 && Math.min(input.bottom, action.bottom) - Math.max(input.top, action.top) > 1) overlaps.push(button.textContent);
        }
      }
      for (const row of host.querySelectorAll(".settings-center-github-board .settings-center-inline-actions")) {
        const buttons = Array.from(row.querySelectorAll("button"), button => button.getBoundingClientRect());
        for (let left = 0; left < buttons.length; left++) for (let right = left + 1; right < buttons.length; right++) {
          const a = buttons[left], b = buttons[right];
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push("remote board action buttons");
        }
      }
      const footer = document.querySelector(".settings-center-footer").getBoundingClientRect();
      const header = document.querySelector(".settings-center-frame-header").getBoundingClientRect();
      const category = host.querySelector("[data-settings-category]");
      return { width: rect.width, height: rect.height, viewport: innerWidth, contentWidth: content.clientWidth, overflowing, outside, overlaps, footerVisible: footer.bottom <= rect.bottom + 1 && footer.top >= header.bottom, headerVisible: header.top >= rect.top - 1, categoryVisible: Boolean(category && visible(category)), navVisible: visible(host.querySelector(".settings-center-nav")) };
    });
    const expectedWidth = Math.max(Math.min(560, result.viewport * 0.52), Math.min(420, result.viewport - 16));
    check(Math.abs(result.width - expectedWidth) < 2, label + ": actual half-drawer width", { actual: result.width, expected: expectedWidth });
    check(!result.overflowing.length, label + ": horizontal scroll overflow", result.overflowing);
    check(!result.outside.length, label + ": control outside drawer", result.outside);
    check(!result.overlaps.length, label + ": path buttons overlap input", result.overlaps);
    check(result.footerVisible && result.headerVisible, label + ": header/footer fit short drawer", result);
    check(result.width < 522 ? result.categoryVisible && !result.navVisible : result.navVisible, label + ": navigation responds to container width", result);
    measurements.push({ label, width: result.width, contentWidth: result.contentWidth });
    return result;
  }
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
    await page.evaluate(async () => {
      const { mountSettingsCenter } = await import("/src/components/settings/settingsCenter.js");
      const { applyThemeCssVariables } = await import("/src/theme/themeCssVariables.js");
      let connected = false;
      let repository = null;
      const longPath = "/Users/freeflow/Documents/调研工作区/" + "long-directory-name-".repeat(8);
      const boards = [
        { boardId: "fixture-synced-" + "a".repeat(64), name: "已同步画布-" + "long-board-title-".repeat(10), localPath: longPath + "/weekly-report.freeflow", syncState: "synced", updatedAt: "2026-10-16T09:00:00Z" },
        { boardId: "fixture-conflict", name: "双方修改待处理-" + "long-conflicting-title-".repeat(8), localPath: longPath + "/研究资料-存在冲突.freeflow", syncState: "conflict", updatedAt: "2026-10-16T09:00:00Z" },
        { boardId: "fixture-deleted", name: "远端删除可恢复-" + "long-deleted-title-".repeat(8), localPath: longPath + "/已删除但本机保留.freeflow", syncState: "deleted", deletedAt: Date.parse("2026-10-16T09:00:00Z") },
        { boardId: "fixture-remote-only", name: "另一台设备的新画布", updatedAt: "2026-10-16T09:00:00Z" },
      ];
      window.__directoryCalls = { picks: 0, reveals: [] };
      window.__workspaceCalls = [];
      window.__workspaceEvents = [];
      window.__repositoryCalls = [];
      window.__boardStateCalls = [];
      window.__prepareCount = 0;
      window.__liveWorkspace = { workspaceRoot: "/Users/test/当前工作区", boardPath: "/Users/test/当前工作区/当前.freeflow" };
      window.addEventListener("freeflow:workspace-files-changed", event => window.__workspaceEvents.push(event.detail));
      const plan = {
        rootPath: window.__liveWorkspace.workspaceRoot, total: 6,
        counts: { "local-only": 2, "remote-only": 1, "both-changed": 1, "up-to-date": 1, "deleted-remote": 1 },
        items: [
          { boardId: boards[0].boardId, state: "up-to-date", localHash: "local-existing", localPath: window.__liveWorkspace.workspaceRoot + "/weekly-report.freeflow" },
          { boardId: "fixture-conflict", state: "both-changed", localHash: "local-changed", localPath: window.__liveWorkspace.workspaceRoot + "/研究资料.freeflow" },
          { boardId: "fixture-deleted", state: "deleted-remote", localHash: "local-preserved", localPath: window.__liveWorkspace.workspaceRoot + "/已删除但本机保留.freeflow" },
          { boardId: "fixture-remote-only", state: "remote-only", localHash: "", localPath: window.__liveWorkspace.workspaceRoot + "/另一台设备的新画布.freeflow" },
          { boardId: "fixture-local-uploaded", name: "可上传的本地资料", state: "local-only" }, { boardId: "fixture-local-failed", name: "待重试的本地资料", state: "local-only" },
        ],
      };
      let latestPlan = plan;
      window.__desktop = {
        platform: "darwin",
        pickDirectory: async () => {
          window.__directoryCalls.picks++;
          if (window.__cancelNextDirectoryPick) { window.__cancelNextDirectoryPick = false; return { canceled: true }; }
          return { canceled: false, filePath: "/tmp/selected-directory" };
        },
        revealPath: async value => { window.__directoryCalls.reveals.push(value); return { ok: true }; },
        githubSync: {
          getStatus: async () => ({ ok: true, connected, auth: connected ? { method: "token", user: { login: "freeflow-browser-test" } } : null, repository, ledger: { boards: {} } }),
          connectToken: async () => { connected = true; return { connected: true, user: { login: "freeflow-browser-test" } }; },
          listRepositories: async () => ({ repositories: [{ owner: { login: "freeflow-browser-test" }, name: "private-workspace-with-a-long-repository-name", private: true, default_branch: "trunk" }] }),
          setRepository: async input => { window.__repositoryCalls.push(input); repository = input; return { ok: true }; }, disconnect: async () => { connected = false; repository = null; return { ok: true }; },
          getWorkspace: async () => ({ workspace: { boards, lastCommitSha: "0123456789abcdef" } }),
          listBoards: async () => ({ boards }),
          getBoardState: async input => { window.__boardStateCalls.push(input); if (!input.boardPath) throw new Error("empty boardPath must never be queried"); return { state: "up-to-date" }; },
          planWorkspace: async input => { window.__workspaceCalls.push({ action: "plan", input }); return latestPlan; },
          syncWorkspace: async input => {
            window.__workspaceCalls.push({ action: "sync", input });
            latestPlan = { ...plan, items: plan.items.map(item => item.boardId === "fixture-local-uploaded" ? { ...item, state: "up-to-date" } : item), counts: { "local-only": 1, "remote-only": 1, "both-changed": 1, "up-to-date": 2, "deleted-remote": 1 } };
            return { ok: true, mode: "workspace", rootPath: plan.rootPath, plan, results: [{ boardId: "fixture-local-uploaded", state: "synced" }, { boardId: "fixture-local-failed", state: "error", error: "同步期间本地画布发生变化" }], refreshed: latestPlan, counts: latestPlan.counts };
          },
          pullWorkspace: async input => {
            window.__workspaceCalls.push({ action: "pull", input });
            const remote = boards.find(board => board.boardId === "fixture-remote-only");
            remote.localPath = input.rootPath + "/另一台设备的新画布.freeflow";
            remote.syncState = "synced";
            latestPlan = { ...latestPlan, items: latestPlan.items.map(item => item.boardId === remote.boardId ? { ...item, state: "up-to-date", localHash: "pulled-local-hash", localPath: remote.localPath } : item), counts: { "local-only": 1, "both-changed": 1, "up-to-date": 3, "deleted-remote": 1 } };
            return { ok: true, mode: "workspace", rootPath: input.rootPath, plan, results: [{ boardId: remote.boardId, pulled: true, filePath: remote.localPath }], refreshed: latestPlan, counts: latestPlan.counts };
          },
          reconcile: async ({ resolution }) => {
            if (resolution) return { ok: true };
            const error = new Error("检测到同一画布的修改，请检查冲突详情后选择处理方式");
            error.code = "SYNC_CONFLICT";
            error.conflicts = [{ path: "elements.long-element-id-" + "a".repeat(100) + ".content" }, { path: "settings.metadata.title" }];
            error.artifacts = { directory: longPath + "/三方恢复副本/" + "conflict-artifacts-".repeat(7) };
            throw error;
          },
        },
      };
      window.__center = mountSettingsCenter(document.querySelector("#settings-center-host"), {
        apiRoutes: { settingsCenter: "/api/settings-center" }, readJsonResponse: response => response.json(), desktopShell: window.__desktop, isDesktop: true,
        agentClient: { getRuntime: async () => ({ runtime: { providers: {} } }), listBackups: async () => ({ backups: [] }) },
        getGitHubSyncWorkspaceContext: async () => {
          if (window.__contextError) throw new Error("current workspace unavailable");
          if (window.__delayContext) return new Promise(resolve => { window.__resolveContext = () => { window.__delayContext = false; resolve({ ...window.__liveWorkspace }); }; });
          return { ...window.__liveWorkspace };
        },
        prepareGitHubSyncWorkspace: async () => { window.__prepareCount++; return { ...window.__liveWorkspace }; },
        onThemePreview: theme => { window.__preview = theme; applyThemeCssVariables(document.documentElement, theme); },
        onRequestClose: () => { window.__center.close(); document.querySelector("#insight-drawer").classList.remove("is-open"); document.querySelector("#insight-drawer").setAttribute("aria-hidden", "true"); },
      });
      document.querySelector("#drawer-close-btn").addEventListener("click", () => { window.__center.close(); document.querySelector("#insight-drawer").classList.remove("is-open"); document.querySelector("#insight-drawer").setAttribute("aria-hidden", "true"); });
      await window.__center.open();
      applyThemeCssVariables(document.documentElement, {});
    });
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const section of sections) {
        await openSection(section);
        const label = `${viewport.width}x${viewport.height}-${section}`;
        await geometry(label);
        if (["canvas", "github", "plugins"].includes(section)) await page.screenshot({ path: path.join(artifacts, label + ".png") });
      }
    }
    await page.setViewportSize(viewports[4]);
    await openSection("canvas");
    const draftPath = "/tmp/unsaved-layout-check";
    const workspaceInput = page.locator('[data-settings-path="canvas.workspaceDirectory"]');
    const openDirectory = page.locator('[data-settings-action="reveal-directory"][data-path-target="canvas.workspaceDirectory"]');
    const workspaceMore = page.locator('[data-settings-action="toggle-path-details"][data-path-target="canvas.workspaceDirectory"]');
    check(await page.locator('.settings-center-path-details:visible').count() === 0, "all three directory forms start folded");
    check(await page.locator('[data-path-summary="canvas.workspaceDirectory"]').getAttribute("title") === longDirectory, "short directory summary retains full path on hover");
    await workspaceMore.focus();
    await workspaceMore.press("Enter");
    check(await workspaceInput.isVisible() && await workspaceMore.getAttribute("aria-expanded") === "true", "keyboard opens directory details with accessible state");
    check(await page.locator('[data-path-full="canvas.workspaceDirectory"]').textContent() === longDirectory, "expanded details show the complete path");
    await workspaceInput.fill("");
    check(await openDirectory.isDisabled(), "empty directory disables Open");
    await workspaceInput.fill(draftPath);
    check(await openDirectory.isEnabled(), "entering directory immediately enables Open");
    await workspaceInput.fill("");
    check(await openDirectory.isDisabled(), "clearing directory immediately disables Open again");
    await page.locator('[data-settings-action="pick-directory"][data-path-target="canvas.workspaceDirectory"]').click();
    await page.waitForFunction(() => document.querySelector('[data-settings-path="canvas.workspaceDirectory"]')?.value === "/tmp/selected-directory");
    check(await page.evaluate(() => document.activeElement?.dataset.settingsAction === "pick-directory" && document.activeElement?.dataset.pathTarget === "canvas.workspaceDirectory"), "directory selection restores focus to the same row");
    await openDirectory.click();
    check(await page.evaluate(() => window.__directoryCalls.picks === 1 && window.__directoryCalls.reveals[0] === "/tmp/selected-directory"), "directory selection and Open use the desktop filePath contract");
    await workspaceInput.fill(draftPath);
    check(await page.locator('[data-path-summary="canvas.workspaceDirectory"]').textContent() === draftPath, "manual path changes immediately update the compact summary");
    await page.evaluate(() => { window.__cancelNextDirectoryPick = true; });
    await page.locator('[data-settings-action="pick-directory"][data-path-target="canvas.workspaceDirectory"]').click();
    check(await workspaceInput.inputValue() === draftPath, "cancelled picker preserves the directory draft");
    for (let index = 0; index < 4; index++) {
      await workspaceMore.click();
      check(await workspaceInput.isVisible() === (index % 2 === 1), "repeated directory expand/collapse restores visibility", index);
    }
    for (const viewport of [viewports[0], viewports[4]]) {
      await page.setViewportSize(viewport);
      for (const button of await page.locator('[data-settings-action="toggle-path-details"]').all()) {
        if (await button.getAttribute("aria-expanded") === "false") await button.click();
      }
      await geometry(`expanded-directories-${viewport.width}`);
      await page.screenshot({ path: path.join(artifacts, `expanded-directories-${viewport.width}.png`) });
    }
    await page.locator(".settings-center-content").evaluate(element => { element.style.maxWidth = "260px"; });
    await geometry("expanded-directories-260-content");
    await page.locator(".settings-center-content").evaluate(element => { element.style.removeProperty("max-width"); });
    await workspaceMore.click();
    rejectDirectorySave = true;
    await page.locator('[data-settings-action="save"]').click();
    await page.waitForFunction(() => document.querySelector('[data-field-error="canvas.workspaceDirectory"]')?.textContent.includes("目录不可写"));
    rejectDirectorySave = false;
    check(await workspaceInput.isVisible() && await workspaceInput.getAttribute("aria-invalid") === "true", "save error opens the affected directory and marks the field");
    check(await workspaceInput.inputValue() === draftPath, "save error preserves the unsaved directory");
    await workspaceInput.fill(draftPath + "-edited");
    check(await page.locator('[data-field-error="canvas.workspaceDirectory"]').textContent() === "" && await workspaceInput.getAttribute("aria-invalid") === "false", "editing the directory clears its stale field error");
    await workspaceInput.fill(draftPath);
    await openSection("plugins");
    const more = page.locator(".settings-center-plugin-more");
    await more.locator("summary").click();
    await page.locator('[data-settings-action="plugin-check"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-settings-action="plugin-check"]')?.disabled);
    check(await more.getAttribute("open") !== null, "plugin update check preserves expanded more menu");
    await more.locator("summary").click();
    await page.evaluate(() => window.__center.open());
    check(await more.getAttribute("open") === null, "plugin refresh preserves collapsed more menu");
    await openSection("canvas");
    check(await page.locator('[data-settings-path="canvas.workspaceDirectory"]').inputValue() === draftPath, "unsaved canvas directory survives section and plugin refresh");
    await page.locator("#drawer-close-btn").click();
    check(await page.locator("#insight-drawer").getAttribute("aria-hidden") === "true", "drawer closes");
    await page.evaluate(async () => { document.querySelector("#insight-drawer").classList.add("is-open"); document.querySelector("#insight-drawer").setAttribute("aria-hidden", "false"); await window.__center.open(); });
    check(await page.locator('[data-settings-path="canvas.workspaceDirectory"]').inputValue() === draftPath, "drawer reopens with draft intact");

    await openSection("appearance");
    const presets = await page.locator("[data-theme-preset]").evaluateAll(elements => elements.map(element => element.dataset.themePreset));
    check(presets.length === 5, "all five themes are available", presets);
    const signatures = new Set();
    for (const preset of presets) {
      await openSection("appearance");
      await page.locator(`[data-theme-preset="${preset}"]`).click();
      const signature = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--theme-panel-surface-rgb") + getComputedStyle(document.documentElement).getPropertyValue("--theme-panel-text-rgb"));
      signatures.add(signature);
      await openSection("plugins");
      await geometry("theme-" + preset);
      await page.screenshot({ path: path.join(artifacts, "theme-" + preset + ".png") });
      await openSection("github");
      for (const tab of ["workspace", "remote", "connection"]) {
        await page.locator(`[data-github-page="${tab}"]`).first().click();
        for (const viewport of [viewports[0], viewports[4]]) { await page.setViewportSize(viewport); await geometry(`theme-${preset}-${tab}-${viewport.width}`); }
      }
    }
    check(signatures.size === 5, "five themes apply distinct real theme variables", [...signatures]);
    for (const viewport of [viewports[0], viewports[4]]) {
      await page.setViewportSize(viewport);
      await openSection("plugins");
      await page.evaluate(() => {
        const list = document.querySelector(".settings-center-plugin-list");
        for (let index = 1; index < 4; index++) {
          const copy = list.firstElementChild.cloneNode(true);
          copy.dataset.pluginId = "layout-fixture-" + index;
          copy.removeAttribute("aria-labelledby");
          copy.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
          list.append(copy);
        }
      });
      await geometry(`multiple-cards-${viewport.width}`);
      await page.screenshot({ path: path.join(artifacts, `multiple-cards-${viewport.width}.png`) });
    }
    await page.setViewportSize(viewports[0]);
    await page.evaluate(() => { window.__delayContext = true; });
    await openSection("github");
    await page.locator('[data-github-page="connection"]').first().click();
    await page.locator("[data-github-token]").fill("fixture-token");
    await page.evaluate(() => window.__resolveContext());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check(await page.locator("[data-github-token]").inputValue() === "fixture-token", "late workspace context preserves typed token");
    await page.locator("#drawer-close-btn").click();
    await page.evaluate(async () => { document.querySelector("#insight-drawer").classList.add("is-open"); document.querySelector("#insight-drawer").setAttribute("aria-hidden", "false"); await window.__center.open(); });
    check(await page.locator("[data-github-token]").inputValue() === "", "close clears unsubmitted token");
    await page.locator('.settings-center-auth-method:has([data-github-auth-method="device-flow"])').click();
    check(await page.locator("[data-github-token]").count() === 0, "device authorization hides token");
    await page.locator('.settings-center-auth-method:has([data-github-auth-method="token"])').click();
    await page.locator("[data-github-token]").fill("fixture-token");
    await page.locator('[data-settings-action="github-token-connect"]').click();
    await page.waitForSelector('[data-settings-action="github-repositories"]');
    check(await page.locator("[data-github-token]").count() === 0, "connection removes submitted token");
    await page.locator('[data-settings-action="github-repositories"]').click();
    await page.waitForFunction(() => document.querySelector("[data-github-repository]")?.options.length > 1);
    await page.locator("[data-github-repository]").selectOption({ index: 1 });
    await page.locator('[data-settings-action="github-repository-save"]').click();
    await page.waitForFunction(() => window.__repositoryCalls.length === 1);
    check(await page.evaluate(() => window.__repositoryCalls[0]?.branch === "trunk"), "binding preserves real default branch");
    await page.evaluate(() => window.__center.reload());
    const repositoryDetails = page.locator("[data-settings-details=github-repository]");
    if (await repositoryDetails.getAttribute("open") === null) await repositoryDetails.locator("summary").click();
    await page.locator('[data-settings-action="github-repository-save"]').click();
    await page.waitForFunction(() => window.__repositoryCalls.length === 2);
    check(await page.evaluate(() => window.__repositoryCalls[1]?.branch === "trunk"), "saving bound repository preserves non-main branch");
    for (const tab of ["connection", "workspace", "remote"]) {
      await page.locator(`[data-github-page="${tab}"]`).first().click();
      if (tab === "remote") await page.locator('.settings-center-github-board[data-github-board-id="fixture-conflict"]').waitFor();
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await geometry(`github-${tab}-${viewport.width}x${viewport.height}`);
      }
      await page.screenshot({ path: path.join(artifacts, `github-${tab}.png`) });
    }
    const conflict = page.locator('.settings-center-github-board[data-github-board-id="fixture-conflict"]');
    check(await conflict.locator('.settings-center-github-board-state').textContent() === "上次检查 · 存在冲突", "cached conflict is labelled as last check");
    check(await page.locator('[data-settings-details="github-synced"]').getAttribute("open") === null, "synced boards are initially folded");
    check(await page.evaluate(() => window.__prepareCount === 0), "browsing never saves current canvas");
    await conflict.locator('[data-settings-action="github-reconcile"]').click();
    await conflict.locator('.settings-center-github-conflict-details > summary').click();
    await conflict.locator('.settings-center-github-file-details > summary').click();
    await page.evaluate(() => window.__center.open());
    check(await conflict.locator('.settings-center-github-conflict-details').getAttribute("open") !== null, "refresh retains expanded conflict details");
    for (const viewport of viewports) { await page.setViewportSize(viewport); await geometry(`github-conflict-${viewport.width}x${viewport.height}`); }
    await page.locator('[data-github-page="workspace"]').first().click();
    await page.locator('[data-settings-action="github-workspace-plan"]').click();
    await page.waitForFunction(() => window.__workspaceCalls.length === 1);
    await page.waitForFunction(() => document.querySelector('.settings-center-save-state')?.textContent.includes("检查完成"));
    check(await page.evaluate(() => window.__workspaceEvents.length === 0), "plan never emits file changes");
    await page.locator('[data-settings-action="github-workspace-sync"]').click();
    await page.waitForFunction(() => window.__workspaceCalls.length === 2);
    await page.waitForFunction(() => document.querySelector('.settings-center-save-state')?.textContent.includes("失败"));
    check(await page.locator('[role="alert"]').textContent().then(text => text.includes("待重试的本地资料") && text.includes("同步期间本地画布发生变化")), "partial failure stays visible with name and reason");
    await page.locator('[data-settings-action="github-workspace-pull"]').click();
    await page.waitForFunction(() => window.__workspaceCalls.length === 3 && window.__workspaceEvents.length === 2);
    check(await page.evaluate(() => window.__workspaceCalls.every(call => call.input.rootPath === window.__liveWorkspace.workspaceRoot && call.input.boardPath === window.__liveWorkspace.boardPath)), "all bulk operations use real current workspace");
    check(await page.evaluate(() => window.__prepareCount === 3), "only explicit file operations prepare canvas");
    check(await page.locator('[role="alert"]').count() === 0, "next completed action clears old failure details");
    await page.locator('[data-github-page="remote"]').first().click();
    const imported = page.locator('.settings-center-github-board[data-github-board-id="fixture-remote-only"]');
    check(await imported.locator('.settings-center-github-board-state').textContent() === "已是最新", "pulled board reflects current plan");
    check(await imported.locator('.settings-center-github-local').textContent() === "本机文件 · /Users/test/当前工作区/另一台设备的新画布.freeflow", "pulled board shows current local path");
    await page.evaluate(async () => { window.__contextError = true; await window.__center.open(); });
    check(await conflict.locator('.settings-center-github-board-state').textContent() === "上次检查 · 存在冲突", "missing context never reuses old workspace plan");
    await page.evaluate(async () => { window.__contextError = false; await window.__center.open(); });
    check(await conflict.locator('.settings-center-github-board-state').textContent() === "双方都有修改", "restored current workspace restores plan");

    plugin = { ...plugin, phase: "downloading", operationPending: true, progress: { receivedBytes: 1, totalBytes: 8 * 1024 * 1024 } };
    await openSection("plugins");
    await page.waitForSelector('[data-settings-action="plugin-cancel"]');
    await page.locator("[data-settings-category]").focus();
    const beforePoll = statusCount;
    await page.waitForResponse(response => new URL(response.url()).pathname === "/api/plugins/assistant/status", { timeout: 2500 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check(statusCount > beforePoll, "real plugin polling occurred");
    check(await page.evaluate(() => document.activeElement?.hasAttribute("data-settings-category")), "plugin polling preserves keyboard focus in compact navigation");
    await geometry("plugin-downloading-420");
    await page.screenshot({ path: path.join(artifacts, "plugin-downloading-420.png") });
    await page.evaluate(() => window.__center.close());
    const pollsAfterClose = statusCount;
    await page.waitForTimeout(850);
    check(statusCount === pollsAfterClose, "closing drawer stops plugin polling");
    check(errors.length === 0, "browser has no uncaught errors", errors);
    await fs.writeFile(path.join(artifacts, "results.json"), JSON.stringify({ measurements, failures, errors }, null, 2));
    assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
    console.log(`[check-settings-drawer-layout] ${measurements.length} real drawer/page/theme layouts passed, including short heights, draft restoration, menu persistence and polling focus. Screenshots: ${artifacts}`);
  } finally {
    await fs.writeFile(path.join(artifacts, "results.json"), JSON.stringify({ measurements, failures, errors }, null, 2));
    await page.screenshot({ path: path.join(artifacts, "final-state.png") }).catch(() => {});
    await page.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    console.log(`[check-settings-drawer-layout] Evidence: ${artifacts}`);
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
