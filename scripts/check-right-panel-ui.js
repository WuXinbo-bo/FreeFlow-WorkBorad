"use strict";

// Use the shipped markup/CSS and production layout functions without starting
// Electron, installing the assistant, or reading a user's workspace/profile.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const root = path.resolve(__dirname, "../public");
  const artifacts = process.env.FREEFLOW_SCREENSHOT_DIR || await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-right-panel-ui-"));
  await fs.mkdir(artifacts, { recursive: true });
  const html = (await fs.readFile(path.join(root, "index.html"), "utf8")).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const runtime = await fs.readFile(path.join(root, "src/runtime/workbenchRuntime.js"), "utf8");
  const extract = (start, next) => {
    const begin = runtime.indexOf(start), end = runtime.indexOf(next, begin + start.length);
    assert(begin >= 0 && end > begin, `Production function moved: ${start}`);
    return runtime.slice(begin, end);
  };
  const functions = [
    extract("function normalizeRightPanelView(", "function getModelSourceLabel("),
    extract("function syncRightPanelWindowSlider()", "function renderRightPanelSwitchLockState()"),
    extract("function renderRightPanelSwitchLockState()", "function scheduleRightPanelWindowSliderSync()"),
    extract("function syncRightPanelWindowControlsLayout()", "function syncScreenSourceToolbarLayout()"),
    extract("function syncConversationShellMenuLayout()", "function scheduleConversationShellMenuLayoutSync()"),
    extract("function getScreenSourcePreviewBounds()", "function waitForScreenSourceLayoutStability()"),
    extract("function renderRightPanelView()", "async function setActiveRightPanelView("),
  ].join("\n");
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/fixture.html") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); return; }
    const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": file.endsWith(".css") ? "text/css" : /\.m?js$/.test(file) ? "text/javascript" : "application/octet-stream" });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
    await page.evaluate(() => {
      const panel = document.querySelector(".conversation-panel");
      const actions = document.querySelector(".app-global-shell-actions");
      document.body.replaceChildren(panel, actions);
      document.body.className = "desktop-mode";
      panel.style.cssText = "left:20px;top:20px;width:600px;height:700px;min-width:0!important;min-height:0!important;";
      document.body.appendChild(Object.assign(document.createElement("input"), { id: "outside", ariaLabel: "外部输入" }));
      document.querySelector("#outside").style.cssText = "position:fixed;right:10px;bottom:10px;width:180px;";
    });
    await page.addScriptTag({ content: `
      let assistantPluginState = { activeEnabled: false };
      let rightPanelSwitchLocked = false;
      const state = { activeRightPanelView: 'screen', desktopShellState: {} };
      const conversationPanel = document.querySelector('.conversation-panel');
      const conversationHeaderToplineEl = document.querySelector('.conversation-header-topline');
      const rightPanelWindowControlsEl = document.querySelector('.right-panel-window-controls');
      const rightPanelWindowStripEl = document.querySelector('#right-panel-window-strip');
      const rightPanelWindowSliderEl = document.querySelector('#right-panel-window-slider');
      const rightPanelSwitchLockBtn = document.querySelector('#right-panel-switch-lock-btn');
      const rightPanelViewTabEls = [...document.querySelectorAll('[data-right-panel-view]')];
      const appGlobalShellActionsEl = document.querySelector('.app-global-shell-actions');
      const screenSourceHeaderSlotEl = document.querySelector('#screen-source-header-slot');
      const screenSourcePanelEl = document.querySelector('#screen-source-panel');
      const screenSourcePreviewShellEl = document.querySelector('.screen-source-preview-shell');
      const conversationShellMenuEl = document.querySelector('#conversation-shell-menu');
      const conversationShellMoreBtn = document.querySelector('#conversation-shell-more');
      document.body.appendChild(conversationShellMenuEl);
      const noop = () => {};
      const setActiveClipboardZone = noop, closeConversationModelMenu = noop,
        closeScreenSourceHeaderMenu = noop, closeScreenSourceOverflowMenu = noop,
        scheduleScreenSourceHeaderMenuLayoutSync = noop, syncEmbeddedWindowOverlayVisibility = noop,
        renderScreenSourceState = noop, syncComposerOffset = noop, scheduleDesktopWindowShapeSync = noop,
        scheduleEmbeddedScreenSourceSync = noop;
      const waitForScreenSourceLayoutStability = () => Promise.resolve();
      const scheduleRightPanelWindowSliderSync = () => syncRightPanelWindowSlider();
      const isScreenSourcePreviewAvailable = () => screenSourcePreviewShellEl.getBoundingClientRect().width > 0;
      ${functions}
      window.panelFixture = {
        state, resize(width) { conversationPanel.style.width = width + 'px'; syncRightPanelWindowControlsLayout(); },
        setPlugin(plugin) {
          assistantPluginState = plugin;
          document.body.classList.toggle('assistant-plugin-enabled', !!plugin.activeEnabled);
          renderRightPanelView(); renderRightPanelSwitchLockState(); syncRightPanelWindowControlsLayout();
        },
        bounds: getScreenSourcePreviewBounds, layoutMenu: syncConversationShellMenuLayout,
      };
    ` });
    await page.evaluate(async () => {
      const { createConversationAssistantChrome } = await import("/src/runtime/conversationAssistant/chrome.js");
      const { applyThemeCssVariables } = await import("/src/theme/themeCssVariables.js");
      const byId = id => document.getElementById(id);
      const noOp = () => {};
      panelFixture.pendingSuspends = [];
      panelFixture.pendingResumes = [];
      const elements = {
        conversationShellMenuEl: byId("conversation-shell-menu"), conversationShellMoreBtn: byId("conversation-shell-more"),
        conversationShellPinBtn: byId("conversation-shell-pin-btn"), conversationSettingsBtn: byId("conversation-settings-btn"),
      };
      const chrome = createConversationAssistantChrome({
        state: { desktopShellState: {}, drawerOpen: false }, elements,
        scheduleShellMenuLayout: () => panelFixture.layoutMenu(), scheduleWindowShapeSync: noOp,
        syncEmbeddedWindowOverlayVisibility: noOp,
        suspendScreenSourceForShellMenu: async () => { if (panelFixture.deferSuspend) await new Promise(resolve => panelFixture.pendingSuspends.push(resolve)); },
        resumeScreenSourceAfterShellMenuClose: async () => { if (panelFixture.deferResume) await new Promise(resolve => panelFixture.pendingResumes.push(resolve)); },
        suspendScreenSourceForDrawer: async () => {},
        setDrawerOpen: () => byId("outside").focus(),
        desktopActions: { pinBtn: { click: () => byId("outside").focus() } },
      });
      chrome.bindEvents();
      document.addEventListener("click", event => {
        if (!event.target.closest("#conversation-shell-menu,#conversation-shell-more,#conversation-settings-btn")) void chrome.setShellMenuOpen(false);
      });
      panelFixture.chrome = chrome;
      panelFixture.theme = theme => applyThemeCssVariables(document.documentElement, theme);
      panelFixture.theme({ themePreset: "minimalist-slate" });
    });

    let cases = 0;
    for (const width of [600, 420, 360, 320]) {
      await page.evaluate(width => panelFixture.resize(width), width);
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const plugin of [
          { installed: false, activeEnabled: false },
          { installed: true, desiredEnabled: true, activeEnabled: false, restartRequired: true },
          { installed: true, desiredEnabled: true, activeEnabled: true },
          { installed: true, desiredEnabled: false, activeEnabled: false },
          { installed: false, activeEnabled: false },
        ]) {
          await page.evaluate(plugin => panelFixture.setPlugin(plugin), plugin);
          const geometry = await page.evaluate(() => {
            const strip = document.querySelector("#right-panel-window-strip"), tab = document.querySelector("#right-panel-tab-screen");
            const controls = document.querySelector(".right-panel-window-controls").getBoundingClientRect();
            const panel = document.querySelector(".conversation-panel").getBoundingClientRect();
            return {
              assistant: document.querySelector("#right-panel-tab-assistant").checkVisibility(),
              lock: document.querySelector("#right-panel-switch-lock-btn").checkVisibility(),
              slider: document.querySelector("#right-panel-window-slider").checkVisibility(),
              backing: getComputedStyle(strip, "::before").display,
              stripWidth: strip.getBoundingClientRect().width, tabWidth: tab.getBoundingClientRect().width,
              fullLabel: tab.querySelector(".right-panel-tab-label").checkVisibility(),
              inside: controls.left >= panel.left && controls.right <= panel.right,
            };
          });
          assert.equal(geometry.assistant, plugin.activeEnabled);
          assert.equal(geometry.lock, plugin.activeEnabled);
          assert.equal(geometry.slider, plugin.activeEnabled);
          assert(geometry.inside, `${width}: header overflow ${JSON.stringify(geometry)}`);
          if (!plugin.activeEnabled) {
            assert.equal(geometry.backing, "none");
            assert(geometry.stripWidth - geometry.tabWidth < 1, "mirror-only left an unused column");
            assert(geometry.fullLabel, "a single title should not use the compact two-tab label");
          }
          cases++;
        }
      }
    }

    const colors = [];
    for (const themePreset of ["minimalist-slate", "midnight-slate-glow", "clear-day", "harbor-blue", "spruce-green"]) {
      colors.push(await page.evaluate(themePreset => {
        panelFixture.theme({ themePreset });
        const button = document.querySelector("#screen-source-embed-toggle-btn");
        const panel = document.querySelector("#screen-source-header-panel");
        document.body.appendChild(panel);
        panel.classList.remove("is-hidden");
        const probe = document.createElement("span");
        probe.style.cssText = "background:rgb(var(--app-button-rgb));color:rgb(var(--app-button-text-rgb));";
        panel.appendChild(probe);
        const actual = getComputedStyle(button), expected = getComputedStyle(probe);
        const result = { themePreset, actual: actual.backgroundColor, expected: expected.backgroundColor, text: actual.color, expectedText: expected.color, border: actual.borderColor };
        probe.remove();
        return result;
      }, themePreset));
    }
    for (const color of colors) { assert.equal(color.actual, color.expected); assert.equal(color.text, color.expectedText); }
    assert(new Set(colors.map(color => color.actual)).size >= 4, "mirror buttons kept a fixed color across themes");
    await page.evaluate(() => { panelFixture.theme({ themePreset: "minimalist-slate" }); document.querySelector("#screen-source-header-panel").classList.add("is-hidden"); panelFixture.resize(600); });

    for (const scale of [1, 0.72, 1.25, 1]) {
      const bounds = await page.evaluate(scale => {
        const panel = document.querySelector(".conversation-panel");
        panel.style.transformOrigin = "top left";
        panel.style.transform = `scale(${scale})`;
        const shell = document.querySelector(".screen-source-preview-shell");
        const video = document.querySelector("#screen-source-video");
        video.classList.remove("is-hidden");
        const rect = video.getBoundingClientRect(), frame = shell.getBoundingClientRect();
        return { native: panelFixture.bounds(), video: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, gap: (rect.x - frame.x) / scale };
      }, scale);
      for (const key of ["x", "y", "width", "height"]) assert(Math.abs(bounds.native[key] - bounds.video[key]) < 1.1, `${scale}: native/video ${key} disagree ${JSON.stringify(bounds)}`);
      assert(bounds.gap >= 3 && bounds.gap <= 5, "preview retained the extra 14px native inset");
    }
    await page.evaluate(() => { document.querySelector(".conversation-panel").style.transform = ""; });
    await page.screenshot({ path: path.join(artifacts, "right-panel-mirror-only.png") });

    const menu = page.locator("#conversation-shell-menu"), trigger = page.locator("#conversation-shell-more");
    for (const height of [800, 220, 160, 800]) {
      await page.setViewportSize({ width: 1000, height });
      for (let repeat = 0; repeat < 3; repeat++) {
        await trigger.focus();
        await page.keyboard.press("ArrowDown");
        await page.waitForFunction(() => document.activeElement?.id === "conversation-shell-pin-btn");
        const geometry = await menu.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, top: rect.top, bottom: rect.bottom, height: innerHeight, rowHeight: element.querySelector("button").getBoundingClientRect().height };
        });
        assert.equal(geometry.width, 232);
        assert.equal(geometry.rowHeight, 32);
        assert(geometry.top >= 0 && geometry.bottom <= height + 1, `short menu escaped ${JSON.stringify(geometry)}`);
        await page.keyboard.press("End");
        assert.equal(await page.evaluate(() => document.activeElement.id), "conversation-shell-close-btn");
        const visible = await page.evaluate(() => {
          const item = document.activeElement.getBoundingClientRect(), menu = document.querySelector("#conversation-shell-menu").getBoundingClientRect();
          return item.top >= menu.top && item.bottom <= menu.bottom;
        });
        assert(visible, "keyboard focus stayed outside the short menu's scroll viewport");
        await page.keyboard.press("Escape");
        assert.equal(await menu.isVisible(), false);
        assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
      }
    }
    await trigger.click();
    await page.locator("#outside").click();
    assert.equal(await menu.isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), "outside", "outside click must keep its focus");
    await trigger.click(); await trigger.click();
    assert.equal(await menu.isVisible(), false);
    await trigger.click(); await page.locator("#conversation-shell-pin-btn").click();
    assert.equal(await menu.isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), "outside", "menu actions must not steal a destination's focus");
    await trigger.click(); await page.locator("#conversation-settings-btn").click();
    assert.equal(await page.evaluate(() => document.activeElement.id), "outside", "opening settings must retain its own focus");
    await trigger.focus(); await page.keyboard.press("ArrowUp");
    assert.equal(await page.evaluate(() => document.activeElement.id), "conversation-shell-close-btn");
    await page.screenshot({ path: path.join(artifacts, "right-panel-more.png") });
    await page.keyboard.press("Escape");

    // Native focus IPC can resolve after a user has already dismissed the menu.
    for (const closeBy of ["outside", "settings", "trigger"]) {
      await page.evaluate(() => { panelFixture.deferSuspend = true; });
      await trigger.focus(); await page.keyboard.press("ArrowDown");
      await page.waitForFunction(() => panelFixture.pendingSuspends.length === 1);
      await page.locator(closeBy === "outside" ? "#outside" : closeBy === "settings" ? "#conversation-settings-btn" : "#conversation-shell-more").click();
      await page.evaluate(async () => {
        panelFixture.deferSuspend = false;
        panelFixture.pendingSuspends.shift()();
        await new Promise(resolve => requestAnimationFrame(resolve));
      });
      assert.equal(await menu.isVisible(), false, `delayed open resurrected after ${closeBy}`);
      assert.equal(await page.evaluate(() => document.activeElement.id), closeBy === "trigger" ? "conversation-shell-more" : "outside", `delayed open stole ${closeBy} focus`);
    }
    await page.evaluate(() => {
      panelFixture.deferSuspend = true;
      panelFixture.firstOpen = panelFixture.chrome.setShellMenuOpen(true);
      panelFixture.secondOpen = panelFixture.chrome.setShellMenuOpen(true);
    });
    await page.waitForFunction(() => panelFixture.pendingSuspends.length === 2);
    await page.evaluate(async () => { panelFixture.pendingSuspends.pop()(); await panelFixture.secondOpen; });
    assert.equal(await menu.isVisible(), true);
    await page.evaluate(async () => {
      panelFixture.deferSuspend = false;
      await panelFixture.chrome.setShellMenuOpen(false);
      panelFixture.pendingSuspends.shift()();
      await panelFixture.firstOpen;
    });
    assert.equal(await menu.isVisible(), false, "an older open must not resurrect a newer closed menu");
    await trigger.click();
    await page.evaluate(() => { panelFixture.deferResume = true; panelFixture.oldClose = panelFixture.chrome.setShellMenuOpen(false); });
    await page.waitForFunction(() => panelFixture.pendingResumes.length === 1);
    await trigger.focus(); await page.keyboard.press("ArrowDown");
    await page.waitForFunction(() => document.activeElement.id === "conversation-shell-pin-btn");
    await page.evaluate(async () => { panelFixture.deferResume = false; panelFixture.pendingResumes.shift()(); await panelFixture.oldClose; });
    assert.equal(await menu.isVisible(), true, "old resume acknowledgement closed the reopened menu");
    assert.equal(await page.evaluate(() => document.activeElement.id), "conversation-shell-pin-btn", "old resume acknowledgement moved keyboard focus");
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, pluginGeometryCases: cases, checks: ["pending restart/active/disable/uninstall recovery", "narrow title and two-tab layouts", "five live theme palettes", "native/video content box equality", "short-menu keyboard scrolling and recovery", "outside/action/settings focus ownership", "delayed native focus IPC cancellation and reordered recovery"], artifacts }, null, 2));
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
