"use strict";
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createSnapshot, startStaticServer } = require("./check-settings-github-browser");

(async () => {
  const server = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/settings-center", route => route.fulfill({ json: createSnapshot() }));
  await page.route("**/api/plugins/assistant/status", route => route.fulfill({ json: { ok: true, plugin: { installed: false, activeEnabled: false, phase: "not-installed" } } }));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
    await page.evaluate(async () => {
      window.testState = { connected: true, failRefresh: false, busyOnce: false, failList: false, pending: false, queries: 0, uploads: 0, picks: 0, pulls: [], events: [], lock: false, release: null, holdRead: false, journal: [], queryIds: [], plans: 0, holdJournal: false };
      const state = window.testState;
      const repository = { owner: "test", repo: "private", branch: "trunk" };
      const status = () => ({ connected: state.connected, repository, auth: { user: { login: "test" } }, ledger: { boards: {} } });
      const plan = () => ({ rootPath: "/workspace", checkedAt: Date.now(), counts: { "remote-only": 1 }, items: [{ boardId: "remote", state: state.localPlan ? "remote-renamed" : "remote-only", localHash: state.localPlan ? "same-content" : "", localPath: "/workspace/remote.freeflow" }] });
      const desktopShell = {
        pickCanvasBoardPath: async () => { state.picks++; return { filePath: "/elsewhere/remote.freeflow" }; },
        githubSync: {
          getStatus: async () => {
            if (state.holdRead) { const saved = status(); await new Promise(resolve => state.release = resolve); return saved; }
            if (state.busyOnce) { state.busyOnce = false; throw Object.assign(new Error("busy"), { code: "SYNC_BUSY" }); }
            if (state.failRefresh) throw new Error("offline status");
            return status();
          },
          getWorkspace: async () => { if (state.failList) throw new Error("remote list unavailable"); return { boards: [{ boardId: "remote", name: "远端资料", syncState: "remote-only" }] }; },
          listBoards: async () => { if (state.failList) throw new Error("remote list unavailable"); return { boards: [{ boardId: "remote", name: "远端资料", syncState: "remote-only" }] }; },
          getOperations: async () => { const saved = structuredClone(state.journal); if (state.holdJournal) await new Promise(resolve => state.releaseJournal = resolve); return { operations: saved }; },
          planWorkspace: async () => { state.plans++; state.journal.forEach(operation => { if (operation.phase === "interrupted") operation.reviewedAt = Date.now(); }); return plan(); },
          syncWorkspace: async () => {
            state.uploads++;
            if (state.pending) { state.journal = [{ id: "task-1", phase: "running", updatedAt: Date.now() }]; throw Object.assign(new Error("pending"), { code: "SYNC_OPERATION_PENDING", operationId: "task-1" }); }
            state.failRefresh = true;
            return { operationCompleted: true, rootPath: "/workspace", refreshed: plan(), results: [{ boardId: "remote", ledgerWarning: "本机同步记录写入未完成" }] };
          },
          pullWorkspace: async () => { state.busyOnce = true; return { operationCompleted: true, rootPath: "/workspace", refreshed: plan(), results: [] }; },
          pull: async payload => { state.pulls.push(payload); state.failRefresh = true; return { pulled: true, filePath: "/workspace/remote.freeflow" }; },
          getOperation: async ({ operationId }) => {
            state.queryIds.push(operationId);
            if (state.lostOperation) { state.journal = [{ id: operationId, phase: "interrupted", updatedAt: Date.now() }]; throw Object.assign(new Error("not found"), { code: "SYNC_OPERATION_NOT_FOUND" }); }
            state.queries++;
            if (state.queries === 1) throw new Error("query offline");
            if (state.queries === 2) return { operation: { id: operationId, phase: "running" } };
            state.journal = [{ id: operationId, phase: "completed", updatedAt: Date.now() }];
            return { operation: { id: operationId, phase: "completed", result: { operationCompleted: true, rootPath: "/workspace", refreshed: plan(), results: [] } } };
          },
        },
      };
      const { mountSettingsCenter } = await import("/public/src/components/settings/settingsCenter.js");
      window.center = mountSettingsCenter(document.querySelector("#host"), {
        isDesktop: true, desktopShell, apiRoutes: { settingsCenter: "/api/settings-center" }, readJsonResponse: response => response.json(),
        getGitHubSyncWorkspaceContext: async () => ({ workspaceRoot: "/workspace", boardPath: "/workspace/current.freeflow" }),
        prepareGitHubSyncWorkspace: async () => ({ workspaceRoot: "/workspace", boardPath: "/workspace/current.freeflow" }),
        runGitHubBoardFileOperation: async task => { state.lock = true; try { return await task(); } finally { state.lock = false; } },
      });
      window.addEventListener("freeflow:workspace-files-changed", event => state.events.push(event.detail));
      await window.center.open();
      window.center.openSection("github");
    });
    await page.locator('[data-settings-action="github-workspace-sync"]').click();
    await page.waitForFunction(() => document.querySelector(".settings-center-save-state")?.textContent.includes("上传处理完成"));
    await page.waitForFunction(() => document.body.textContent.includes("offline status"));
    assert.match(await page.locator(".settings-center-save-state").textContent(), /上传处理完成/);
    assert.match(await page.locator(".settings-center-github-readiness").textContent(), /本机同步记录写入未完成/, "confirmed ledger warning survives supplemental status failure");
    assert.equal(await page.evaluate(() => testState.events.length), 1, "successful upload emits event before supplemental refresh");
    await page.evaluate(() => { testState.failRefresh = false; });
    await page.locator('[data-settings-action="github-workspace-pull"]').click();
    await page.waitForFunction(() => document.body.textContent.includes("busy"));
    await page.waitForFunction(() => !document.body.textContent.includes("状态尚未更新"), { timeout: 3500 });
    assert.equal(await page.evaluate(() => testState.events.length), 2, "busy supplemental status recovers without repeating writes");
    await page.evaluate(() => { testState.localPlan = true; });
    await page.locator('[data-settings-action="github-workspace-plan"]').click();
    await page.waitForFunction(() => document.querySelector(".settings-center-save-state")?.textContent.includes("检查完成"));
    await page.locator('[data-github-page="remote"]').first().click();
    await page.locator('[data-settings-action="github-pull"]').waitFor();
    await page.locator('[data-settings-action="github-pull"]').click();
    await page.waitForFunction(() => testState.pulls.length === 1 && testState.events.length === 3);
    assert.deepEqual(await page.evaluate(() => ({ picks: testState.picks, root: testState.pulls[0].rootPath, path: testState.pulls[0].boardPath })), { picks: 0, root: "/workspace", path: "" }, "default single pull delegates current-root rename planning to backend without a stale explicit path or save dialog");
    await page.evaluate(() => { testState.failRefresh = false; testState.failList = true; });
    await page.locator('[data-settings-action="github-workspace"]').click();
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes("remote list unavailable"));
    await page.locator('[data-github-page="workspace"]').first().click();
    assert.match(await page.locator('[role="alert"]').textContent(), /remote list unavailable/, "errors stay visible across task pages");
    await page.evaluate(() => { testState.failList = false; testState.pending = true; testState.queries = 0; });
    await page.locator('[data-settings-action="github-workspace-sync"]').click();
    await page.waitForFunction(() => testState.queries >= 1);
    assert.equal(await page.evaluate(() => testState.lock), true, "uncertain result retains engine file-operation lock");
    assert.equal(await page.locator('[data-settings-action="github-workspace-sync"]').isDisabled(), true);
    await page.locator('[data-settings-action="github-confirm-operation"]').click();
    await page.waitForFunction(() => testState.queries >= 3 && !testState.lock, { timeout: 4500 });
    assert.equal(await page.evaluate(() => testState.uploads), 2, "pending operation is queried instead of uploaded again");
    await page.evaluate(() => { testState.lostOperation = true; });
    await page.locator('[data-settings-action="github-workspace-sync"]').click();
    await page.waitForFunction(() => !testState.lock && document.body.textContent.includes("未找到上次操作"));
    assert.equal(await page.locator('[data-settings-action="github-workspace-sync"]').isDisabled(), true, "unknown missing task blocks repeated writes");
    assert.equal(await page.locator('[data-settings-action="github-workspace-plan"]').isEnabled(), true, "checking differences remains available for interrupted task");
    await page.locator('[data-settings-action="github-workspace-plan"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-settings-action="github-workspace-sync"]')?.disabled);
    assert.equal(await page.evaluate(() => testState.uploads), 3, "missing task recovery only checks instead of resubmitting upload");
    await page.evaluate(async () => {
      testState.journal = [
        { id: "reviewed", phase: "interrupted", updatedAt: 10, reviewedAt: 11, error: { message: "旧任务已核对" } },
        { id: "restart-task", phase: "interrupted", updatedAt: 20, error: { message: "重启前的任务未确认" } },
      ];
      center.close(); await center.open();
    });
    await page.waitForFunction(() => document.body.textContent.includes("重启前的任务未确认"));
    assert.equal(await page.locator('[data-settings-action="github-workspace-sync"]').isDisabled(), true, "unreviewed interrupted journal blocks writes on reopen");
    const plansBefore = await page.evaluate(() => testState.plans);
    await page.locator('[data-settings-action="github-confirm-operation"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-settings-action="github-workspace-sync"]')?.disabled);
    assert.equal(await page.evaluate(() => testState.plans), plansBefore + 1, "interrupted recovery checks folder instead of querying or resubmitting");
    await page.evaluate(async () => {
      testState.lostOperation = false; testState.queries = 0; testState.queryIds = [];
      testState.journal = [{ id: "resume-task", phase: "confirming", updatedAt: Date.now() }];
      center.close(); await center.open();
    });
    await page.waitForFunction(() => document.querySelector('[data-settings-action="github-confirm-operation"]')?.textContent.includes("继续确认"));
    await page.locator('[data-settings-action="github-confirm-operation"]').click();
    await page.waitForFunction(() => testState.queries === 1 && testState.lock);
    assert.equal(await page.locator('[data-settings-action="github-workspace-sync"]').isDisabled(), true);
    await page.waitForFunction(() => testState.queries >= 3 && !testState.lock, { timeout: 4500 });
    assert.deepEqual(await page.evaluate(() => [...new Set(testState.queryIds)]), ["resume-task"], "reopen continues only the original operation id");
    assert.equal(await page.evaluate(() => testState.uploads), 3, "resuming journal never uploads again");
    await page.evaluate(async () => {
      testState.holdJournal = true;
      testState.journal = [{ id: "stale", phase: "interrupted", updatedAt: Date.now(), error: { message: "不应回填的旧任务" } }];
      center.close(); void center.open();
    });
    await page.waitForFunction(() => typeof testState.releaseJournal === "function");
    await page.evaluate(() => { testState.holdJournal = false; testState.journal = []; testState.pending = false; });
    await page.locator('[data-settings-action="github-workspace-sync"]').click();
    await page.waitForFunction(() => testState.uploads === 4 && !testState.lock);
    await page.evaluate(() => testState.releaseJournal());
    assert.equal(await page.locator('[data-settings-action="github-workspace-sync"]').isEnabled(), true, "stale journal cannot restore write guard after newer successful operation");
    assert.equal(await page.getByText("不应回填的旧任务", { exact: false }).count(), 0);
    await page.evaluate(async () => { testState.failRefresh = false; testState.connected = false; center.close(); await center.open(); });
    await page.waitForFunction(() => document.querySelector(".settings-center-github-overview strong")?.textContent === "未连接");
    assert.equal(await page.locator('[data-settings-action="github-workspace-sync"]').isDisabled(), true, "reopening refreshes externally changed connection state");
    assert.deepEqual(errors, []);
    console.log("[check-settings-sync-lifecycle] confirmed results, partial refresh/busy recovery, single pull events/default folder, visible errors, pending task lock/query, persistent journal recovery/stale rejection and reopen passed");
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
