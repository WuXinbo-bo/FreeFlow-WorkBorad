"use strict";

// Mount the real workspace component without Electron, user files, or generated bundles.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");

async function main() {
  const fixture = `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { BoardWorkspacePanel } from "./public/src/engines/canvas2d-core/ui/BoardWorkspacePanel.jsx";
    const home = "/fixture/工作区名称很长也不应该挤走切换按钮";
    const other = "/fixture/第二工作区";
    const board = (folder, name) => ({ filePath: folder + "/" + name + ".freeflow", name: name + ".freeflow", modifiedAt: 1 });
    const state = window.fixture = {
      home, other, folder: home, boards: [board(home, "Alpha"), board(home, "Beta"), board(home, "很长的画布标题".repeat(15)), board(other, "Second")],
      snapshot: { boardFilePath: home + "/Alpha.freeflow", boardFileName: "Alpha.freeflow", boardDirty: false, boardSaveError: "", board: { items: [] } },
      pickMode: "cancel", pickTarget: other, saveMode: "success", connected: false, calls: [],
    };
    const syncResult = () => ({ ok: true, rootPath: state.folder, checkedAt: Date.now(), total: 3, counts: { "local-changed": 1, "remote-only": 1 }, items: [{ localPath: state.snapshot.boardFilePath, state: "local-changed" }] });
    window.desktopShell = {
      listCanvasBoards() {},
      githubSync: {
        async getStatus() { return { connected: state.connected, ...(state.connected ? { repository: { owner: "fixture", repo: "private" }, ledger: { boards: {} } } : {}) }; },
        async planWorkspace() { state.calls.push("check"); return syncResult(); },
        async syncWorkspace() { state.calls.push("upload"); return { ok: true, results: [], refreshed: syncResult() }; },
        async pullWorkspace() { state.calls.push("pull"); return { ok: true, results: [], refreshed: syncResult() }; },
      },
    };
    const bridge = {
      async getCanvasBoardWorkspace() { return state.folder; },
      async listCanvasBoards(folder) { return { ok: true, folderPath: folder, boards: state.boards.filter(board => board.filePath.startsWith(folder + "/")) }; },
      async pickCanvasWorkspaceFolder() {
        state.calls.push("pick");
        if (state.pickMode === "pending") await new Promise(resolve => { state.releasePick = resolve; });
        if (state.pickMode === "error") throw new Error("目录选择失败 fixture");
        if (state.pickMode === "cancel" || state.pickMode === "pending") return "";
        state.folder = state.pickTarget; return state.folder;
      },
      async saveBoard(options) {
        state.calls.push({ save: options });
        if (state.saveMode === "pending") await new Promise(resolve => { state.releaseSave = resolve; });
        if (state.saveMode === "error") { state.setSnapshot({ boardSaveError: "磁盘只读 fixture" }); return false; }
        state.setSnapshot({ boardDirty: false, boardSaveError: "" }); return true;
      },
      async openBoardAtPath(filePath) {
        state.calls.push({ open: filePath });
        state.setSnapshot({ boardFilePath: filePath, boardFileName: filePath.split("/").pop(), boardDirty: false }); return true;
      },
      getSnapshot() { return state.snapshot; },
      async withBoardFileOperation(task) { return task(); },
    };
    function Fixture() {
      const [snapshot, setSnapshot] = useState(state.snapshot);
      const [width, setWidth] = useState(288);
      state.setSnapshot = update => { state.snapshot = { ...state.snapshot, ...update }; setSnapshot(state.snapshot); };
      state.setWidth = setWidth;
      return <div className="canvas2d-navigation-panels"><div className="canvas2d-navigation-docks canvas-chrome-surface" style={{ "--workspace-width": width + "px" }}>
        <BoardWorkspacePanel bridge={bridge} snapshot={snapshot} width={width} onWidthChange={setWidth} />
      </div></div>;
    }
    createRoot(document.getElementById("root")).render(<Fixture />);
  `;
  const build = await esbuild.build({
    absWorkingDir: ROOT, stdin: { contents: fixture, resolveDir: ROOT, loader: "jsx" },
    bundle: true, write: false, platform: "browser", format: "esm", define: { "process.env.NODE_ENV": '"production"' },
  });
  const css = await fs.readFile(path.join(ROOT, "public/ui.workspace.css"));
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-workspace-panel-ui-"));
  const server = http.createServer((req, res) => {
    if (req.url === "/fixture.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(build.outputFiles[0].contents); }
    else if (req.url === "/ui.workspace.css") { res.writeHead(200, { "Content-Type": "text/css" }); res.end(css); }
    else { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end('<!doctype html><html><head><link rel="stylesheet" href="/ui.workspace.css"><style>body{margin:0;background:#edf0f3}button,select,input{box-sizing:border-box}#global-overlay-layer{position:fixed;inset:0;z-index:10000;pointer-events:none}</style></head><body><div id="root"></div><div id="global-overlay-layer"></div><script type="module" src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 700, height: 780 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const panel = page.getByRole("complementary", { name: "画布工作区" });
    const search = panel.getByRole("textbox", { name: "搜索画布", exact: true });
    const pick = panel.getByRole("button", { name: "切换工作区", exact: true });
    const current = panel.locator(".canvas2d-workspace-row.is-current");
    const currentMenu = current.locator("[data-workspace-more]");
    const idle = () => page.waitForFunction(() => document.querySelector(".canvas2d-workspace-panel")?.getAttribute("aria-busy") === "false");
    await current.waitFor();
    assert.equal(await panel.locator(".canvas2d-workspace-current").count(), 0);
    assert.equal(await panel.getByRole("button", { name: "切换到上一个画布", exact: true }).count(), 0);
    assert.equal(await panel.locator(".canvas2d-workspace-sync").count(), 0);
    assert.equal(await current.locator("small").count(), 0, "ordinary local status must not repeat on every row");
    for (const width of [260, 288, 360]) {
      await page.evaluate(width => window.fixture.setWidth(width), width);
      await page.waitForFunction(width => Math.abs(document.querySelector(".canvas2d-navigation-docks").getBoundingClientRect().width - width) < 1, width);
      const geometry = await panel.evaluate(node => {
        const inside = element => { const a = node.getBoundingClientRect(); const b = element.getBoundingClientRect(); return b.left >= a.left - 1 && b.right <= a.right + 1; };
        const head = node.querySelector(".canvas2d-workspace-list-head");
        const children = [...head.children].map(element => element.getBoundingClientRect());
        return {
          overflow: [...node.querySelectorAll("button,input,select")].filter(element => element.checkVisibility() && !inside(element)).map(element => element.getAttribute("aria-label") || element.textContent),
          headOverflow: head.scrollWidth > head.clientWidth,
          sameRow: children.every(rect => Math.abs(rect.top + rect.height / 2 - children[0].top - children[0].height / 2) < 1),
          ordered: children.slice(1).every((rect, index) => rect.left >= children[index].right),
        };
      });
      assert.deepEqual(geometry.overflow, [], `${width}px controls overflowed`);
      assert.equal(geometry.headOverflow, false, `${width}px list header overflowed`);
      assert(geometry.sameRow && geometry.ordered, `${width}px metadata lost its compact row`);
      await page.screenshot({ path: path.join(artifacts, `workspace-${width}.png`) });
    }
    await page.evaluate(() => {
      const state = window.fixture;
      state.normalBoards = state.boards;
      const alpha = state.boards[0];
      state.boards = [alpha, ...Array.from({ length: 999 }, (_, index) => ({ filePath: state.home + "/" + index + ".freeflow", name: index + ".freeflow", modifiedAt: 1 }))];
      state.setWidth(260);
      window.dispatchEvent(new Event("freeflow:workspace-files-changed"));
    });
    await panel.locator('.canvas2d-workspace-list-head > span[title="1000 个画布"]').getByText("1000", { exact: true }).waitFor();
    assert.equal(await panel.locator(".canvas2d-workspace-list-head").evaluate(node => node.scrollWidth <= node.clientWidth), true, "four-digit counts overflowed the 260px header");
    await page.screenshot({ path: path.join(artifacts, "workspace-260-many.png") });
    await page.evaluate(() => { window.fixture.boards = window.fixture.normalBoards; window.dispatchEvent(new Event("freeflow:workspace-files-changed")); });
    await panel.locator(".canvas2d-workspace-list-head > span").getByText("3 个画布", { exact: true }).waitFor();
    for (let cycle = 0; cycle < 4; cycle += 1) {
      await currentMenu.click();
      await page.waitForFunction(() => document.activeElement?.textContent === "保存当前画布");
      await page.keyboard.press("End");
      assert.equal(await page.evaluate(() => document.activeElement.textContent), "打开回收站");
      await page.keyboard.press("Home");
      await page.keyboard.press("Escape");
      assert.equal(await currentMenu.evaluate(node => node === document.activeElement), true, "menu escape lost its trigger focus");
    }
    await page.setViewportSize({ width: 400, height: 260 });
    await currentMenu.click();
    const menuBox = await page.getByRole("menu").boundingBox();
    assert(menuBox.y >= 8 && menuBox.y + menuBox.height <= 252, "expanded current menu escaped the short viewport");
    await page.keyboard.press("End");
    assert.equal(await page.evaluate(() => { const a = document.activeElement.getBoundingClientRect(); const b = document.activeElement.parentElement.getBoundingClientRect(); return a.top >= b.top && a.bottom <= b.bottom; }), true, "keyboard menu selection did not scroll into view");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 700, height: 780 });
    await currentMenu.click();
    await search.click();
    assert.equal(await page.getByRole("menu").count(), 0, "outside click retained the menu");

    await page.evaluate(() => { window.fixture.saveMode = "pending"; window.fixture.setSnapshot({ boardDirty: true }); });
    const save = current.getByRole("button", { name: "保存当前画布", exact: true });
    await save.click();
    await page.waitForFunction(() => !!window.fixture.releaseSave);
    assert.equal(await save.isDisabled(), true);
    await page.evaluate(() => window.fixture.releaseSave());
    await idle();
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "保存当前画布");
    assert.equal(await page.evaluate(() => window.fixture.snapshot.boardDirty), false);
    assert.deepEqual(await page.evaluate(() => window.fixture.calls.find(call => call.save)), { save: { exactPath: true } });
    await page.evaluate(() => { window.fixture.saveMode = "error"; window.fixture.setSnapshot({ boardDirty: true }); });
    await save.click();
    await panel.getByRole("alert").filter({ hasText: "磁盘只读 fixture" }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.snapshot.boardDirty), true, "failed save discarded dirty state");
    await page.evaluate(() => { window.fixture.saveMode = "success"; });
    await save.click();
    await idle();
    assert.equal(await panel.getByRole("alert").count(), 0, "successful save did not clear previous errors");

    const beforePick = await page.evaluate(() => ({ ...window.fixture.snapshot }));
    for (const mode of ["cancel", "error", "pending", "cancel"]) {
      await page.evaluate(mode => { window.fixture.pickMode = mode; }, mode);
      await pick.click();
      if (mode === "pending") {
        await page.waitForFunction(() => !!window.fixture.releasePick);
        assert.equal(await pick.isDisabled(), true);
        await page.evaluate(() => window.fixture.releasePick());
      }
      await idle();
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "切换工作区");
      assert.deepEqual(await page.evaluate(() => window.fixture.snapshot), beforePick, "picker exit changed the open board");
    }
    await page.evaluate(() => { window.fixture.pickMode = "success"; });
    await pick.click();
    await panel.getByText("Second", { exact: true }).waitFor();
    await panel.getByRole("status").filter({ hasText: "位于工作区外" }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.fixture.snapshot), beforePick, "switching a browsed folder moved the open board");
    await page.evaluate(() => { window.fixture.pickTarget = window.fixture.home; });
    await pick.click();
    await current.waitFor();
    await search.fill("Beta");
    assert.equal(await panel.locator(".canvas2d-workspace-row").count(), 1);
    assert.equal(await current.count(), 0, "filtered-out current board was rendered again in a standalone row");
    await search.press("Enter");
    await page.waitForFunction(() => window.fixture.snapshot.boardFileName === "Beta.freeflow");
    await search.fill("");
    await currentMenu.click();
    await page.getByRole("menuitem", { name: "切换到上一个画布", exact: true }).click();
    await page.waitForFunction(() => window.fixture.snapshot.boardFileName === "Alpha.freeflow");
    await idle();
    await panel.getByRole("tab", { name: "最近打开", exact: true }).click();
    assert.equal(await panel.locator(".canvas2d-workspace-row").count(), 2);
    await panel.getByRole("tab", { name: "工作区", exact: true }).click();

    await page.evaluate(() => { window.fixture.connected = true; window.dispatchEvent(new Event("freeflow:github-sync-status")); });
    await panel.getByRole("button", { name: "检查同步", exact: true }).click();
    await panel.getByRole("button", { name: "上传", exact: true }).waitFor();
    await panel.getByRole("button", { name: "拉取", exact: true }).waitFor();
    await panel.getByRole("button", { name: "上传", exact: true }).click();
    await idle();
    await panel.getByRole("button", { name: "拉取", exact: true }).click();
    await idle();
    assert.equal(await page.evaluate(() => window.fixture.calls.includes("upload") && window.fixture.calls.includes("pull")), true);
    await page.evaluate(() => { window.fixture.connected = false; window.dispatchEvent(new Event("freeflow:github-sync-status")); });
    await page.waitForFunction(() => !document.querySelector(".canvas2d-workspace-sync"));
    await panel.getByRole("button", { name: "收起画布工作区", exact: true }).click();
    const expand = panel.getByRole("button", { name: "展开画布工作区", exact: true });
    assert.equal(await expand.getAttribute("aria-expanded"), "false");
    await expand.click();
    await current.waitFor();
    assert.deepEqual(errors, []);
    console.log(`[check-workspace-panel-ui] compact widths, keyboard/menu recovery, save/picker recovery, outside workspace, filtering, previous switch and connected sync passed; screenshots: ${artifacts}`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
