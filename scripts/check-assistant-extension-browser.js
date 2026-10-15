"use strict";
const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-extension-ui-"));
  process.env.FREEFLOW_HOME_DIR = temp;
  process.env.FREEFLOW_USER_DATA_DIR = path.join(temp, "AppData");
  process.env.FREEFLOW_LEGACY_PROJECT_DATA_DIR = path.join(temp, "legacy");
  let runtime;
  let browser;
  try {
    runtime = require("../src/backend");
    const server = await runtime.startServer(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    const agentRequests = [];
    page.on("pageerror", (error) => { errors.push(error.message); console.error("PAGE", error.message); });
    page.on("request", (request) => { if (request.url().includes("/api/agent") || request.url().includes("/extensions/ai-assistant/")) agentRequests.push(request.url()); });
    await page.addInitScript(() => {
      localStorage.setItem("ai_worker_right_panel_view_v1", "screen");
      globalThis.__FREEFLOW_STARTUP_CONTEXT = { ok: true, startup: {}, cached: {}, remote: {} };
    });
    await page.goto(base);
    await page.waitForFunction(() => !document.body.classList.contains("app-booting"), null, { timeout: 20000 });
    assert.equal(await page.locator("#chat-form").count(), 0);
    assert.equal(await page.locator("#screen-source-panel").isVisible(), true);
    assert.equal(await page.locator("#right-panel-tab-assistant").isVisible(), false);
    assert.deepEqual(agentRequests, []);
    assert.equal(runtime.assistantHost.child, null);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("freeflow:open-settings", { detail: { section: "extensions" } })));
    await page.locator('[data-settings-action="extension-install"]').waitFor({ state: "visible" });
    assert.equal(await page.locator('[data-settings-section="ai"]').count(), 0);
    let failInstall = true;
    let delayStaleStatus = true;
    await page.route("**/api/extensions/ai-assistant/install", async (route) => {
      if (!failInstall) return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 700));
      failInstall = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "模拟下载中断", assistant: { ...runtime.extensionManager.status(), operation: "" } }) });
    });
    await page.route("**/api/extensions", async (route) => {
      if (!delayStaleStatus) return route.continue();
      delayStaleStatus = false;
      const stale = { ...runtime.extensionManager.status(), operation: "install" };
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, assistant: stale }) });
    });
    await page.locator('[data-settings-action="extension-install"]').click();
    await page.getByText("模拟下载中断", { exact: true }).waitFor();
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('[data-settings-action="extension-install"]').isVisible(), true, "late progress response must not leave failed download stuck");
    await page.unroute("**/api/extensions");
    await page.locator('[data-settings-action="extension-install"]').click();
    try { await page.waitForFunction(() => document.body.dataset.assistantEnabled === "true", null, { timeout: 10000 }); }
    catch (error) { console.error(await page.evaluate(() => ({ text: document.querySelector("#settings-center-host")?.innerText, url: location.href }))); throw error; }
    await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
    assert.equal(await page.locator("#chat-form").count(), 1);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("freeflow:open-settings", { detail: { section: "appearance" } })));
    await page.locator('[data-settings-section="ai"]').waitFor();
    await page.locator('[data-settings-section="ai"]').click();
    await page.locator('[data-settings-action="agent-setup-continue"]').waitFor();
    assert.equal(await page.locator(".settings-center-content").getByText("选择 AI 服务", { exact: true }).isVisible(), true);
    await page.locator('[data-settings-section="extensions"]').click();
    await page.locator('[data-settings-action="extension-disable"]').click();
    await page.waitForFunction(() => !document.body.dataset.assistantEnabled);
    await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
    assert.equal(await page.locator("#chat-form").count(), 0);
    assert.equal(runtime.assistantHost.child, null);
    await page.reload();
    await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
    assert.equal(await page.locator("#chat-form").count(), 0);
    assert.equal(await page.locator("#screen-source-panel").isVisible(), true);
    assert.deepEqual(errors, []);
    console.log("[assistant-extension-browser] fresh mirror-only UI, zero assistant requests, download/enable, settings, disable/reload passed");
  } finally { await browser?.close(); await runtime?.stopServer(); await fs.rm(temp, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
