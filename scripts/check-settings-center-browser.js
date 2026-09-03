"use strict";

const { chromium } = require("playwright");

const BASE_URL = process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:3000/?desktop=1";

function assert(condition, message, detail) {
  if (!condition) throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function openSettings(page) {
  const drawer = page.locator("#insight-drawer");
  if (!(await drawer.evaluate((element) => element.classList.contains("is-open")))) {
    await page.locator("#conversation-settings-btn").evaluate((button) => button.click());
  }
  await page.waitForFunction(() => document.querySelector("#insight-drawer")?.classList.contains("is-open"));
  await page.waitForSelector("[data-settings-section=general]");
}

async function openSection(page, section) {
  await page.locator(`[data-settings-section="${section}"]`).click();
  await page.waitForFunction(
    (name) => document.querySelector(`[data-settings-section="${name}"]`)?.classList.contains("is-active"),
    section
  );
}

async function saveSettings(page) {
  const button = page.locator('[data-settings-action="save"]');
  await button.waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector('[data-settings-action="save"]')?.disabled);
  await button.click();
}

async function main() {
  const sourceResponse = await fetch(new URL("/api/settings-center", BASE_URL));
  const sourceSnapshot = await sourceResponse.json();
  assert(sourceResponse.ok && sourceSnapshot.ok, "settings snapshot endpoint is unavailable", sourceSnapshot);

  let revision = 1;
  let conflictNextSave = false;
  let failNextSave = false;
  const successfulPosts = [];
  const snapshot = clone(sourceSnapshot);
  snapshot.revision = `browser-${revision}`;
  snapshot.sections.general = {
    ...snapshot.sections.general,
    productName: "FreeFlow",
    workspaceName: "Browser Workspace",
    workspaceSubtitle: "Browser Settings Contract",
    assistantName: "Browser Assistant",
  };
  snapshot.sections.ai = {
    agent: {
      ...snapshot.sections.ai.agent,
      provider: "codex",
      cliPath: "",
      workspaceRoot: "D:\\FreeFlow-WorkBoard",
      defaultModel: "gpt-5.6-codex",
      reasoningEffort: "high",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      queueWhileRunning: true,
      showReasoning: true,
    },
  };
  snapshot.sections.canvas.autosaveEnabled = true;
  snapshot.sections.canvas.linkSemanticsEnabled = true;
  snapshot.sections.permissions.allowedRoots = ["D:\\FreeFlow-WorkBoard"];
  for (const key of Object.keys(snapshot.sections.permissions.permissions || {})) {
    snapshot.sections.permissions.permissions[key] = false;
  }
  let agentWorkspaceValid = false;
  let agentSession = null;
  let agentSessionCreates = 0;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/api/agent/runtime?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        runtime: {
          provider: "codex",
          available: true,
          authenticated: true,
          state: agentWorkspaceValid ? "ready" : "configuration-required",
          workspaceValid: agentWorkspaceValid,
          error: agentWorkspaceValid ? "" : "默认工作区未授权",
          version: "codex-cli test",
          account: { type: "chatgpt", email: "tester@example.com" },
          models: [
            { id: "gpt-5.6-codex", displayName: "GPT-5.6 Codex" },
            { id: "gpt-5.5-codex", displayName: "GPT-5.5 Codex" },
          ],
          settings: clone(snapshot.sections.ai.agent),
        },
      }),
    });
  });
  await page.route("**/api/agent/sessions", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, sessions: agentSession ? [agentSession] : [] }),
      });
      return;
    }
    agentSessionCreates += 1;
    const now = Date.now();
    agentSession = {
      id: "settings-agent-session",
      provider: "codex",
      providerThreadId: "",
      title: "新会话",
      preview: "",
      workspaceRoot: snapshot.sections.ai.agent.workspaceRoot,
      model: snapshot.sections.ai.agent.defaultModel,
      reasoningEffort: snapshot.sections.ai.agent.reasoningEffort,
      approvalPolicy: snapshot.sections.ai.agent.approvalPolicy,
      sandboxMode: snapshot.sections.ai.agent.sandboxMode,
      status: "idle",
      revision: 1,
      messages: [],
      turns: [],
      activities: [],
      approvals: [],
      pendingInputs: [],
      attachments: [],
      createdAt: now,
      updatedAt: now,
    };
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, session: agentSession }) });
  });
  await page.route("**/api/agent/sessions/settings-agent-session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: agentSession }) });
  });
  await page.route("**/api/settings-center", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
      return;
    }
    const payload = route.request().postDataJSON();
    if (conflictNextSave) {
      conflictNextSave = false;
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, code: "SETTINGS_REVISION_CONFLICT", error: "revision conflict" }) });
      return;
    }
    if (failNextSave) {
      failNextSave = false;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, code: "SETTINGS_SAVE_FAILED", error: "forced save failure" }) });
      return;
    }
    successfulPosts.push(clone(payload));
    snapshot.sections = clone(payload.sections);
    snapshot.sections.general.productName = "FreeFlow";
    snapshot.revision = `browser-${++revision}`;
    agentWorkspaceValid = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.body.classList.contains("app-booting"), null, { timeout: 15_000 });
    await page.waitForFunction(() => document.querySelector(".agent-runtime-notice strong")?.textContent.includes("配置 AI 工作区"));
    assert(agentSessionCreates === 0 && (await page.locator("#clear-btn").isDisabled()), "invalid Agent workspace created a session before settings recovery");

    await page.locator("#conversation-shell-more").evaluate((button) => button.click());
    await page.waitForFunction(() => !document.querySelector("#conversation-shell-menu")?.classList.contains("is-hidden"));
    const moreMenuContract = await page.evaluate(() => ({
      labels: Array.from(document.querySelectorAll("#conversation-shell-menu .conversation-shell-menu-label"), (node) => node.textContent.trim()),
      leakedAiControls: document.querySelectorAll('#conversation-shell-menu [id*="model"], #conversation-shell-menu [data-settings-path^="ai."]').length,
    }));
    assert(
      JSON.stringify(moreMenuContract.labels) === JSON.stringify(["固定界面", "开启全屏", "左右换位", "恢复默认布局", "穿透", "刷新", "关闭"]) && moreMenuContract.leakedAiControls === 0,
      "the More menu contains settings or AI controls",
      moreMenuContract
    );
    await page.locator("#conversation-shell-more").evaluate((button) => button.click());

    await openSettings(page);
    await openSection(page, "ai");
    const aiPlacement = await page.evaluate(() => ({
      cli: Boolean(document.querySelector('[data-settings-path="ai.agent.cliPath"]')),
      workspace: Boolean(document.querySelector('[data-settings-path="ai.agent.workspaceRoot"]')),
      model: Boolean(document.querySelector('[data-settings-path="ai.agent.defaultModel"]')),
      reasoning: Boolean(document.querySelector('[data-settings-path="ai.agent.reasoningEffort"]')),
      approval: Boolean(document.querySelector('[data-settings-path="ai.agent.approvalPolicy"]')),
      sandbox: Boolean(document.querySelector('[data-settings-path="ai.agent.sandboxMode"]')),
      providerControls: document.querySelectorAll('[data-settings-path^="ai.provider"], [data-settings-path^="ai.profiles"]').length,
      moreAiControls: document.querySelectorAll('#conversation-shell-menu [data-settings-path^="ai."]').length,
    }));
    assert(
      aiPlacement.cli && aiPlacement.workspace && aiPlacement.model && aiPlacement.reasoning && aiPlacement.approval && aiPlacement.sandbox && aiPlacement.providerControls === 0 && aiPlacement.moreAiControls === 0,
      "Codex settings are not exclusively owned by the AI settings section",
      aiPlacement
    );
    await page.locator('[data-settings-path="ai.agent.defaultModel"]').selectOption("gpt-5.5-codex");
    await page.locator('[data-settings-path="ai.agent.reasoningEffort"]').selectOption("xhigh");
    await page.locator('[data-settings-path="ai.agent.sandboxMode"]').selectOption("read-only");
    await saveSettings(page);
    await page.waitForFunction(() => document.querySelector(".settings-center-save-state")?.textContent.includes("已保存"));
    await page.waitForFunction(() => !document.querySelector("#clear-btn")?.disabled && document.querySelector("#conversation-title")?.textContent === "新会话");
    assert(agentSessionCreates === 1, "saving a valid Agent workspace did not create the first new-history session", { agentSessionCreates });
    assert(
      successfulPosts.at(-1).sections.ai.agent.defaultModel === "gpt-5.5-codex" &&
        successfulPosts.at(-1).sections.ai.agent.reasoningEffort === "xhigh" &&
        successfulPosts.at(-1).sections.ai.agent.sandboxMode === "read-only",
      "Codex defaults were not submitted"
    );

    await openSection(page, "general");
    await page.locator('[data-settings-path="general.workspaceName"]').fill("Saved Workspace");
    await page.locator('[data-settings-path="general.assistantName"]').fill("Saved Assistant");
    await saveSettings(page);
    await page.waitForFunction(() => document.querySelector("#brand-name")?.textContent === "Saved Workspace");
    assert((await page.locator("#prompt-input").getAttribute("placeholder"))?.includes("Saved Assistant"), "assistant name was not applied to the prompt");

    await page.locator('[data-settings-path="general.workspaceSubtitle"]').fill("Unsaved conflict draft");
    conflictNextSave = true;
    await saveSettings(page);
    await page.waitForFunction(() => document.querySelector(".settings-center-save-state")?.textContent.includes("其他位置更新"));
    assert((await page.locator('[data-settings-path="general.workspaceSubtitle"]').inputValue()) === "Unsaved conflict draft", "revision conflict discarded the local draft");
    await page.locator('[data-settings-action="reload"]').click();
    await page.waitForSelector('[data-settings-path="general.workspaceSubtitle"]');
    assert((await page.locator('[data-settings-path="general.workspaceSubtitle"]').inputValue()) === snapshot.sections.general.workspaceSubtitle, "reload did not recover the committed snapshot");

    const committedTheme = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-bg-start-rgb"));
    await openSection(page, "appearance");
    await page.locator('[data-theme-preset="midnight-slate-glow"]').click();
    const previewTheme = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-bg-start-rgb"));
    assert(previewTheme !== committedTheme, "theme preset did not preview immediately");
    failNextSave = true;
    await saveSettings(page);
    await page.waitForFunction(() => document.querySelector(".settings-center-save-state")?.textContent.includes("forced save failure"));
    const failedTheme = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-bg-start-rgb"));
    assert(failedTheme === committedTheme, "failed save did not restore the committed theme", { committedTheme, previewTheme, failedTheme });
    assert(!(await page.locator('[data-settings-action="save"]').isDisabled()), "failed save discarded the editable draft");
    await page.locator('[data-settings-action="cancel"]').click();
    await page.waitForFunction(() => !document.querySelector("#insight-drawer")?.classList.contains("is-open"));

    await openSettings(page);
    await openSection(page, "permissions");
    await page.locator('#settings-center-host [data-permission-key="appControl"]').check();
    const postCountBeforeRisk = successfulPosts.length;
    await saveSettings(page);
    await page.waitForSelector(".settings-center-risk-confirm");
    assert(successfulPosts.length === postCountBeforeRisk, "high-risk permission saved without confirmation");
    await page.locator('[data-settings-action="confirm-risk"]').click();
    await page.waitForFunction(() => document.querySelector(".settings-center-save-state")?.textContent.includes("已保存"));

    await page.evaluate(() => {
      const engine = globalThis.__canvas2dEngine;
      globalThis.__settingsCanvasCalls = [];
      for (const method of ["setAutosaveEnabled", "setLinkSemanticEnabled"]) {
        const original = engine?.[method]?.bind(engine);
        if (!original) continue;
        engine[method] = (...args) => { globalThis.__settingsCanvasCalls.push({ method, enabled: args[0], options: args[1] || {} }); return original(...args); };
      }
    });
    await openSection(page, "canvas");
    await page.locator('[data-settings-path="canvas.autosaveEnabled"]').uncheck();
    await page.locator('[data-settings-path="canvas.linkSemanticsEnabled"]').uncheck();
    await saveSettings(page);
    await page.waitForFunction(() => document.querySelector(".settings-center-save-state")?.textContent.includes("已保存"));
    const canvasCalls = await page.evaluate(() => globalThis.__settingsCanvasCalls || []);
    assert(canvasCalls.some((item) => item.method === "setAutosaveEnabled" && item.enabled === false) && canvasCalls.some((item) => item.method === "setLinkSemanticEnabled" && item.enabled === false), "canvas preferences were not applied", canvasCalls);

    await openSection(page, "workbench");
    const currentSide = await page.locator('[data-settings-path="workbench.defaultCanvasPanelSide"]:checked').inputValue();
    const targetSide = currentSide === "left" ? "right" : "left";
    await page.locator(`[data-settings-path="workbench.defaultCanvasPanelSide"][value="${targetSide}"]`).check();
    await saveSettings(page);
    await page.waitForFunction(() => document.querySelector(".settings-center-save-state")?.textContent.includes("已保存"));
    assert((await page.locator(".canvas-stage").getAttribute("data-workspace-dock")) === targetSide, "workbench preference was not applied");

    await page.setViewportSize({ width: 680, height: 720 });
    await page.waitForTimeout(100);
    const compact = await page.evaluate(() => {
      const drawer = document.querySelector("#insight-drawer");
      const content = document.querySelector(".settings-center-content");
      const footer = document.querySelector(".settings-center-footer");
      const rect = drawer.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, contentOverflow: content.scrollWidth - content.clientWidth, drawerOverflow: drawer.scrollWidth - drawer.clientWidth, footerBottom: footer.getBoundingClientRect().bottom };
    });
    assert(compact.left >= 0 && compact.right <= 680 && compact.top >= 0 && compact.bottom <= 720 && compact.contentOverflow <= 1 && compact.drawerOverflow <= 1 && compact.footerBottom <= 720, "settings center is clipped in the compact viewport", compact);
    assert(pageErrors.length === 0, "settings interactions caused page errors", pageErrors);
  } finally {
    await context.close();
    await browser.close();
  }

  console.log("[check-settings-center-browser] Codex settings ownership and recovery paths passed");
}

main().catch((error) => {
  console.error(`[check-settings-center-browser] ${error.stack || error.message}`);
  process.exitCode = 1;
});
