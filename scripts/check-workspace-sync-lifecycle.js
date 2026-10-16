"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const { build } = require("esbuild");

(async () => {
  const bundle = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { BoardWorkspacePanel } from "./public/src/engines/canvas2d-core/ui/BoardWorkspacePanel.jsx"; window.mountWorkspace = (bridge, snapshot) => createRoot(document.getElementById("host")).render(React.createElement(BoardWorkspacePanel, { bridge, snapshot }));', resolveDir: path.resolve(__dirname, ".."), loader: "jsx" }, bundle: true, write: false, platform: "browser", format: "iife", target: "es2022", define: { "process.env.NODE_ENV": '"production"' } });
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", request.url === "/bundle.js" ? "text/javascript" : "text/html");
    response.end(request.url === "/bundle.js" ? bundle.outputFiles[0].text : '<!doctype html><div id="host"></div><script src="/bundle.js"></script>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => {
      const state = window.workspaceTest = { uploads: 0, queries: 0, queryIds: [], events: 0, guard: false, pending: false, failRefresh: false, interrupt: false, failAfterLocal: false };
      const plan = () => ({ ok: true, rootPath: "/workspace", total: 1, checkedAt: Date.now(), counts: { "local-changed": 1, "remote-changed": 1 }, items: [{ boardId: "board", localPath: "/workspace/board.freeflow", state: "local-changed" }] });
      window.desktopShell = {
        listCanvasBoards() {},
        githubSync: {
          async getStatus() { if (state.failRefresh) throw new Error("status offline"); return { connected: true, repository: { owner: "test", repo: "private", branch: "main" }, ledger: { boards: {} } }; },
          async planWorkspace() { return plan(); },
          async syncWorkspace() {
            state.uploads++;
            if (state.failAfterLocal) throw Object.assign(new Error("remote changed after local merge"), { code: "REMOTE_CHANGED", localChanged: true, filePath: "/workspace/board.freeflow" });
            if (state.pending) throw Object.assign(new Error("pending"), { code: "SYNC_OPERATION_PENDING", operationId: "sidebar-task" });
            state.failRefresh = true;
            return { ok: true, refreshed: plan(), counts: {}, results: [] };
          },
          async getOperation({ operationId }) {
            state.queryIds.push(operationId); state.queries++;
            if (state.queries === 1) throw new Error("query offline");
            if (state.interrupt) return { operation: { id: operationId, phase: "interrupted", error: { code: "COMMIT_CONFIRMED_RECHECK", message: "远端已确认，需要检查差异" } } };
            if (state.queries < 3) return { operation: { id: operationId, phase: "running" } };
            return { operation: { id: operationId, phase: "completed", result: { ok: true, refreshed: plan(), counts: {}, results: [] } } };
          },
        },
      };
      const bridge = {
        getCanvasBoardWorkspace: async () => "/workspace",
        listCanvasBoards: async () => ({ ok: true, folderPath: "/workspace", boards: [{ filePath: "/workspace/board.freeflow", name: "board" }] }),
        withBoardFileOperation: async task => { state.guard = true; try { return await task(); } finally { state.guard = false; } },
      };
      window.addEventListener("freeflow:workspace-files-changed", () => state.events++);
      window.mountWorkspace(bridge, { boardFilePath: "/workspace/board.freeflow", boardFileName: "board.freeflow", board: { items: [] } });
    });
    const panel = page.getByRole("complementary", { name: "画布工作区" });
    await panel.getByRole("button", { name: "检查同步", exact: true }).click();
    await panel.locator(".canvas2d-workspace-sync-summary").filter({ hasText: "待上传 1" }).waitFor();
    await panel.getByRole("button", { name: "上传", exact: true }).click();
    await page.waitForFunction(() => workspaceTest.events === 1 && !workspaceTest.guard);
    await panel.getByText("上传完成", { exact: true }).waitFor();
    await panel.getByRole("alert").filter({ hasText: "status offline" }).waitFor();
    assert.equal(await page.evaluate(() => workspaceTest.uploads), 1, "supplemental refresh failure does not resubmit a successful upload");
    await page.evaluate(() => { workspaceTest.failRefresh = false; workspaceTest.pending = true; });
    await panel.getByRole("button", { name: "上传", exact: true }).click();
    await page.waitForFunction(() => workspaceTest.queries === 1);
    assert.equal(await page.evaluate(() => workspaceTest.guard), true, "pending sidebar task retains file-operation guard after query failure");
    assert.equal(await panel.getByRole("button", { name: "上传", exact: true }).isDisabled(), true);
    await page.waitForFunction(() => workspaceTest.queries >= 3 && !workspaceTest.guard);
    assert.deepEqual(await page.evaluate(() => [...new Set(workspaceTest.queryIds)]), ["sidebar-task"]);
    assert.equal(await page.evaluate(() => workspaceTest.uploads), 2);
    await page.evaluate(() => { workspaceTest.queries = 0; workspaceTest.interrupt = true; });
    await panel.getByRole("button", { name: "上传", exact: true }).click();
    await page.waitForFunction(() => !workspaceTest.guard && document.body.textContent.includes("远端已确认"));
    assert.equal(await panel.getByRole("button", { name: "上传", exact: true }).isDisabled(), true, "interrupted task blocks further writes");
    await panel.getByRole("button", { name: "检查同步", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".canvas2d-workspace-panel")?.getAttribute("aria-busy") || document.querySelector(".canvas2d-workspace-panel").getAttribute("aria-busy") === "false");
    assert.equal(await panel.getByRole("button", { name: "上传", exact: true }).isEnabled(), true, "successful check restores sidebar controls");
    await page.evaluate(() => { workspaceTest.pending = false; workspaceTest.failAfterLocal = true; });
    const eventsBefore = await page.evaluate(() => workspaceTest.events);
    await panel.getByRole("button", { name: "上传", exact: true }).click();
    await page.waitForFunction(() => !workspaceTest.guard && document.body.textContent.includes("remote changed after local merge"));
    assert.equal(await page.evaluate(() => workspaceTest.events), eventsBefore + 1, "local merge failure still refreshes local workspace");
    assert.deepEqual(errors, []);
    console.log("[check-workspace-sync-lifecycle] confirmed result/broken refresh, same-id pending guard/query, interrupted/check recovery, and changed-local failure refresh passed");
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
