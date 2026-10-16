"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");

(async () => {
  const bundle = await build({ stdin: { contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import Controls from "./public/src/engines/canvas2d-core/ui/index.jsx";
    import { mountGlobalTutorialHost } from "./public/src/runtime/tutorial-system/globalTutorialHost.js";
    window.mountOptionsTest = engine => {
      createRoot(document.getElementById("host")).render(React.createElement(Controls, { engine }));
      window.tutorialHost = mountGlobalTutorialHost({ overlayRoot: document.getElementById("global-overlay-layer") });
    };
  `, resolveDir: ROOT, loader: "jsx" }, bundle: true, write: false, platform: "browser", format: "esm", target: "es2022", define: { "process.env.NODE_ENV": '"production"' } });
  const index = await fs.readFile(path.join(ROOT, "public/index.html"), "utf8");
  const links = Array.from(index.matchAll(/<link rel="stylesheet" href="([^"]+)"\s*\/>/g), match => `<link rel="stylesheet" href="${match[1]}">`).join("");
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].text); return; }
      if (url.pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end(`<!doctype html><html><head>${links}<style>html,body,#host{width:100%;height:100%;margin:0}.canvas2d-engine-ui{position:fixed;inset:0;width:100%;height:100%}#outside-test{position:fixed;left:2px;bottom:2px;z-index:1000}</style></head><body><div id="host"></div><div id="global-overlay-layer" class="global-overlay-layer"></div><div id="settings-center-host"></div><button id="outside-test">Outside</button><script type="module" src="/bundle.js"></script></body></html>`); return; }
      const file = path.resolve(ROOT, "public", `.${url.pathname}`);
      if (!file.startsWith(path.join(ROOT, "public") + path.sep)) throw new Error("Invalid fixture path");
      response.setHeader("Content-Type", file.endsWith(".css") ? "text/css" : "application/octet-stream");
      response.end(await fs.readFile(file));
    } catch { response.statusCode = 404; response.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => typeof window.mountOptionsTest === "function");
    await page.evaluate(() => {
      const listeners = new Set();
      let snapshot = { boardFilePath: "/workspace/board.freeflow", boardFileName: "board.freeflow", boardDirty: false, boardAutosaveEnabled: true, boardLastSavedAt: Date.now(), board: { items: [], selectedIds: [], view: { scale: 1, offsetX: 0, offsetY: 0 }, navigator: { entries: [], collapsed: true }, preferences: { backgroundPattern: "dots" } }, alignmentSnapConfig: { enabled: true, showGuides: true, thresholdPx: 8 }, canvasImageManager: { folderPath: "", items: [] } };
      window.optionsTest = { autosaves: 0, failure: false, updateSection: "" };
      const emit = () => { snapshot = structuredClone(snapshot); listeners.forEach(listener => listener(snapshot)); };
      window.patchOptionsSnapshot = patch => { snapshot = { ...snapshot, ...patch }; emit(); };
      window.addEventListener("freeflow:open-settings", event => { optionsTest.updateSection = event.detail.section; });
      window.mountOptionsTest({
        getSnapshot: () => snapshot,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        getCanvasBoardWorkspace: async () => "/workspace",
        listCanvasBoards: async () => ({ ok: true, boards: [], folderPath: "/workspace" }),
        registerCommand: () => () => {},
        getCanvasNavigatorViewModel: () => snapshot.board.navigator,
        setAlignmentSnapEnabled(enabled) { snapshot.alignmentSnapConfig.enabled = enabled; emit(); return enabled; },
        setAlignmentSnapConfig(patch) { Object.assign(snapshot.alignmentSnapConfig, patch); emit(); return snapshot.alignmentSnapConfig; },
        setBoardBackgroundPattern(pattern) { if (optionsTest.failure) throw new Error("背景保存失败，请重试"); snapshot.board.preferences.backgroundPattern = pattern; emit(); },
        toggleAutosave() { optionsTest.autosaves++; return new Promise(resolve => { optionsTest.finishAutosave = () => { snapshot.boardAutosaveEnabled = !snapshot.boardAutosaveEnabled; emit(); resolve(); }; }); },
        refreshCanvasImageManager: async () => ({}),
      });
    });
    const trigger = page.getByRole("button", { name: "画布选项与帮助", exact: true });
    const panel = page.getByRole("dialog", { name: "画布选项与帮助", exact: true });
    const open = async () => { await trigger.click(); await panel.waitFor(); };
    await open();
    assert.equal(await panel.getByRole("tab", { name: "画布", exact: true }).getAttribute("aria-selected"), "true");
    assert.equal(await panel.getByRole("tab", { name: "画布", exact: true }).evaluate(node => node === document.activeElement), true);
    const initialRect = await panel.boundingBox();
    const autosave = panel.getByRole("switch", { name: "自动保存", exact: true });
    await autosave.click();
    assert.equal(await autosave.isDisabled(), true);
    await autosave.evaluate(button => button.click());
    assert.equal(await page.evaluate(() => optionsTest.autosaves), 1, "pending setting must not submit twice");
    await page.evaluate(() => optionsTest.finishAutosave());
    await page.waitForFunction(() => document.querySelector('[aria-label="自动保存"]').getAttribute("aria-checked") === "false");
    assert.equal(await panel.isVisible(), true, "settings apply without closing the panel");
    const snap = panel.getByRole("switch", { name: "对齐与吸附", exact: true });
    await snap.click();
    assert.equal(await panel.getByRole("button", { name: "宽松", exact: true }).isDisabled(), true);
    await snap.click();
    await panel.getByRole("button", { name: "宽松", exact: true }).click();
    assert.equal(await panel.getByRole("button", { name: "宽松", exact: true }).getAttribute("aria-pressed"), "true");
    await panel.getByRole("switch", { name: "显示参考线", exact: true }).click();
    assert.equal(await panel.getByRole("switch", { name: "显示参考线", exact: true }).getAttribute("aria-checked"), "false");
    await page.evaluate(() => { optionsTest.failure = true; });
    await panel.getByRole("button", { name: "方格", exact: true }).click();
    await panel.getByRole("alert").filter({ hasText: "背景保存失败" }).waitFor();
    await page.evaluate(() => { optionsTest.failure = false; });
    await panel.getByRole("button", { name: "方格", exact: true }).click();
    assert.equal(await panel.getByRole("button", { name: "方格", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await panel.getByRole("alert").count(), 0);
    await page.evaluate(() => patchOptionsSnapshot({ boardSaveError: "磁盘已满" }));
    await panel.getByRole("status").filter({ hasText: "保存失败：磁盘已满" }).waitFor();
    await page.evaluate(() => patchOptionsSnapshot({ boardSaveError: "", boardDirty: true }));
    await panel.getByRole("status").filter({ hasText: "尚未保存到本机" }).waitFor();
    await panel.getByRole("tab", { name: "帮助", exact: true }).click();
    const helpRect = await panel.boundingBox();
    assert.deepEqual(helpRect, initialRect, "tab switch must keep the fixed outer panel position and dimensions");
    assert.equal(await panel.getByRole("button", { name: "欢迎演示", exact: true }).count(), 0, "welcome replay is inside the guide, not a second menu entry");
    await panel.getByText(`v${require("../package.json").version}`, { exact: true }).waitFor();
    assert.equal(await panel.getByRole("link", { name: "1806598228@qq.com", exact: true }).getAttribute("target"), "_blank", "email link must use the desktop external-link route");
    await panel.getByRole("tab", { name: "帮助", exact: true }).press("ArrowLeft");
    assert.equal(await panel.getByRole("tab", { name: "画布", exact: true }).getAttribute("aria-selected"), "true");
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "hidden" });
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
    await open();
    await panel.getByRole("button", { name: "关闭画布选项与帮助", exact: true }).click();
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
    await open();
    await page.getByRole("button", { name: "Outside", exact: true }).click();
    await panel.waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("button", { name: "Outside", exact: true }).evaluate(node => node === document.activeElement), true, "outside click retains the new target focus");
    await open();
    await panel.getByRole("button", { name: /^画布图片管理/ }).click();
    await panel.waitFor({ state: "hidden" });
    const imageManager = page.getByRole("dialog", { name: "画布图片管理", exact: true });
    await imageManager.waitFor();
    await imageManager.getByRole("button", { name: /关闭/ }).first().click();
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true, "image manager exit restores the stable toolbar trigger");
    await open();
    await panel.getByRole("tab", { name: "帮助", exact: true }).click();
    await panel.getByRole("button", { name: /^使用指南/ }).click();
    await panel.waitFor({ state: "hidden" });
    const tutorial = page.getByRole("dialog", { name: "教程中心", exact: true });
    await tutorial.waitFor();
    await tutorial.getByRole("button", { name: "重看欢迎演示", exact: true }).click();
    await page.locator(".global-tutorial-center.is-intro").waitFor();
    await page.locator("[data-global-tutorial-open-center]").click();
    await tutorial.waitFor();
    await tutorial.getByRole("button", { name: "重看欢迎演示", exact: true }).click();
    await page.locator(".global-tutorial-center.is-intro").waitFor();
    await page.locator("[data-global-tutorial-close]").click();
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true, "guide/welcome exit restores the stable toolbar trigger");
    await open();
    await panel.getByRole("tab", { name: "帮助", exact: true }).click();
    await panel.getByRole("button", { name: /^应用更新/ }).click();
    await panel.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => optionsTest.updateSection), "updates");
    await page.evaluate(() => document.getElementById("settings-center-host").remove());
    await open();
    await panel.getByRole("tab", { name: "帮助", exact: true }).click();
    assert.equal(await panel.getByRole("button", { name: /^应用更新/ }).isDisabled(), true, "standalone canvas cannot dispatch an update action without a settings center");
    await panel.getByText("请在 FreeFlow 主窗口中检查更新", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    for (const viewport of [{ width: 390, height: 320 }, { width: 300, height: 600 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await open();
      for (const tab of ["画布", "帮助", "画布"]) {
        await panel.getByRole("tab", { name: tab, exact: true }).click();
        const rect = await panel.boundingBox();
        assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height, `panel clipped at ${JSON.stringify(viewport)}`);
        assert.equal(await panel.evaluate(node => node.scrollWidth <= node.clientWidth), true, "panel must not scroll horizontally");
      }
      await panel.getByRole("button", { name: "工程网格", exact: true }).click();
      await page.keyboard.press("Escape");
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; document.body.classList.add("theme-dark"); });
    await open();
    const palette = await panel.evaluate(node => ({ ink: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor, title: getComputedStyle(node.querySelector("strong")).color }));
    assert.equal(palette.background, "rgb(255, 255, 255)");
    assert.equal(palette.ink, "rgb(32, 37, 43)");
    assert.equal(palette.title, palette.ink, "dark shell must not turn title text light on a light canvas panel");
    await page.keyboard.press("Escape");
    for (let i = 0; i < 8; i++) { await open(); await page.keyboard.press("Escape"); }
    assert.equal(await page.locator(".canvas-options-panel").count(), 0);
    assert.deepEqual(errors, []);
    console.log("[check-canvas-options-panel] actual controls: fixed tabs, persisted snapshots, pending/error/retry, snapping recovery, outside/Escape/focus, image manager, unified guide/welcome replay, updates, small viewport, dark shell, repeated open/close passed");
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
