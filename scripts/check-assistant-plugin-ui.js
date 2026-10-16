"use strict";

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const { chromium } = require("playwright");
const { createSettingsCenterService } = require(root + "/src/backend/services/settingsCenterService");
const { getDefaultUiSettings } = require(root + "/src/backend/models/uiSettingsModel");
const { getDefaultAgentSettings } = require(root + "/src/backend/agent/agentSettingsModel");
(async () => {
  const service = createSettingsCenterService({ uiSettingsService: { readUiSettingsStore: async () => getDefaultUiSettings() }, permissionsService: { readPermissionsStore: async () => ({ permissions: {}, allowedRoots: [] }) }, agentSettingsService: { readAgentSettings: async () => getDefaultAgentSettings() } });
  const core = await service.readSettingsSnapshot({ includeAi: false });
  const full = await service.readSettingsSnapshot({ includeAi: true });
  let plugin = { installed: false, desiredEnabled: false, activeEnabled: false, phase: "idle", downloadAvailable: true };
  let pendingStatuses = [];
  let calls = [], posts = [], polls = 0, ai = 0;
  const json = (res, data, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    calls.push(u.pathname + u.search);
    if (u.pathname === "/api/settings-center") {
      if (req.method === "POST") {
        let body = "";
        for await (const c of req) body += c;
        posts.push(JSON.parse(body));
        return json(res, { ...core, sections: JSON.parse(body).sections });
      }
      return json(res, u.searchParams.has("includeAi") ? full : core);
    }
    if (u.pathname.startsWith("/api/plugins/assistant/")) {
      const action = u.pathname.split("/").pop();
      if (req.method === "POST") assert.equal(req.headers["x-freeflow-plugin"], "1");
      if (action === "status") {
        polls++;
        if (pendingStatuses.length) plugin = pendingStatuses.shift();
      }
      if (action === "install") {
        plugin = { ...plugin, phase: "not-installed", operationPending: true };
        pendingStatuses = [{ ...plugin, phase: "downloading", progress: { receivedBytes: 600 } }];
      }
      if (action === "cancel") {
        pendingStatuses = [];
        plugin = { ...plugin, phase: "cancelled", operationPending: false, progress: null };
      }
      if (action === "enabled") {
        let body = "";
        for await (const c of req) body += c;
        const enabled = JSON.parse(body).enabled;
        plugin = { ...plugin, desiredEnabled: enabled, activeEnabled: enabled ? plugin.activeEnabled : false, restartRequired: enabled };
      }
      if (action === "uninstall") plugin = { installed: false, activeEnabled: false, desiredEnabled: false, phase: "idle" };
      if (action === "import") {
        for await (const c of req) {
        }
        plugin = { installed: false, activeEnabled: false, desiredEnabled: false, phase: "not-installed", operationPending: true };
        pendingStatuses = [
          { ...plugin, phase: "checking" },
          { installed: true, activeEnabled: false, desiredEnabled: true, restartRequired: true, version: "1.0.0", phase: "ready", operationPending: false },
        ];
      }
      return json(res, { ok: true, plugin }, ["install", "import"].includes(action) ? 202 : 200);
    }
    if (u.pathname === "/test") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<link rel="stylesheet" href="/ui.settings-center.css"><div id="insight-drawer" class="ui-chrome-drawer"><div id="host" class="settings-center-host"></div></div><script type="module">import {mountSettingsCenter} from '/src/components/settings/settingsCenter.js';window.aiCalls=0;window.center=mountSettingsCenter(document.querySelector('#host'),{apiRoutes:{settingsCenter:'/api/settings-center'},readJsonResponse:r=>r.json(),agentClient:{getRuntime:async()=>{window.aiCalls++;return {runtime:{providers:{}}}},listBackups:async()=>{window.aiCalls++;return {backups:[]}}}});window.ready=true;<\/script>`);
      return;
    }
    try {
      const file = path.join(root, "public", decodeURIComponent(u.pathname));
      const data = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": u.pathname.endsWith(".js") ? "text/javascript" : u.pathname.endsWith(".css") ? "text/css" : "text/html" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  let errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/test`);
    await page.waitForFunction(() => window.ready);
    await page.evaluate(() => center.open());
    assert.equal(await page.locator("[data-settings-section=ai]").count(), 0);
    assert.equal(await page.evaluate(() => aiCalls), 0);
    await page.locator("[data-settings-section=plugins]").click();
    await page.locator("[data-settings-action=plugin-install]").click();
    await page.waitForSelector(".settings-center-plugin-track.is-indeterminate", { timeout: 2500 });
    assert.equal(await page.locator(".settings-center-plugin-state").textContent(), "正在准备", "accepted install is busy before manager starts");
    assert.equal(await page.locator("[role=progressbar]").getAttribute("aria-valuenow"), null);
    await page.waitForTimeout(800);
    assert.ok(polls >= 2);
    await page.evaluate(() => center.close());
    let count = polls;
    await page.waitForTimeout(1e3);
    assert.equal(polls, count, "polling stops on close");
    await page.evaluate(() => center.open());
    await page.locator("[data-settings-action=plugin-cancel]").click();
    await page.waitForSelector("[data-settings-action=plugin-install]");
    count = polls;
    await page.waitForTimeout(1e3);
    assert.equal(polls, count, "polling stops after cancellation");
    await page.locator("[data-assistant-plugin-package]").setInputFiles({ name: "assistant.ffplugin", mimeType: "application/octet-stream", buffer: Buffer.from("signed test fixture") });
    await page.waitForFunction(() => document.querySelector(".settings-center-plugin-state")?.textContent === "正在检查");
    await page.waitForSelector(".settings-center-plugin-notice");
    assert.equal(await page.locator("[data-settings-section=ai]").count(), 0, "pending restart does not expose AI");
    await page.locator("[data-settings-action=plugin-disable-confirm]").click();
    await page.locator("[data-settings-action=plugin-disable]").click();
    await page.waitForSelector("[data-settings-action=plugin-enable]");
    await page.locator("[data-settings-action=plugin-enable]").click();
    await page.waitForSelector(".settings-center-plugin-notice");
    plugin = { installed: true, activeEnabled: true, desiredEnabled: true, version: "1.0.0", phase: "idle" };
    await page.evaluate(() => center.reload());
    assert.equal(await page.evaluate(() => aiCalls), 0, "ordinary reload does not start assistant");
    await page.locator("[data-settings-section=canvas]").click();
    await page.locator('[data-settings-path="canvas.workspaceDirectory"]').fill("/tmp/my-workspace");
    await page.locator("[data-settings-section=ai]").click();
    await page.waitForFunction(() => window.aiCalls === 2);
    assert.ok(calls.some((p) => p.includes("includeAi=1")));
    await page.locator("[data-settings-section=canvas]").click();
    assert.equal(await page.locator('[data-settings-path="canvas.workspaceDirectory"]').inputValue(), "/tmp/my-workspace", "dirty core survives AI snapshot switch");
    await page.locator("[data-settings-section=plugins]").click();
    await page.locator("[data-settings-action=plugin-disable-confirm]").click();
    await page.locator("[data-settings-action=plugin-disable]").click();
    await page.waitForSelector("[data-settings-action=plugin-enable]");
    assert.equal(await page.locator("[data-settings-section=ai]").count(), 0);
    await page.locator("[data-settings-section=canvas]").click();
    assert.equal(await page.locator('[data-settings-path="canvas.workspaceDirectory"]').inputValue(), "/tmp/my-workspace");
    await page.locator("[data-settings-action=save]").click();
    await page.waitForFunction(() => document.querySelector(".settings-center-save-state")?.textContent.includes("保存并应用"));
    assert.equal(posts.length, 1);
    assert.ok(!posts[0].sections.ai, "hidden AI excluded from core save");
    assert.equal(await page.evaluate(() => aiCalls), 2);
    await page.locator("[data-settings-section=plugins]").click();
    await page.locator("[data-settings-action=plugin-uninstall-confirm]").click();
    await page.locator("[data-settings-action=plugin-uninstall-cancel]").click();
    assert.equal(plugin.installed, true);
    await page.locator("[data-settings-action=plugin-uninstall-confirm]").click();
    await page.locator("[data-settings-action=plugin-uninstall]").click();
    await page.waitForSelector("[data-settings-action=plugin-install]");
    assert.equal(plugin.installed, false);
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => center.close());
      await page.evaluate(() => center.open());
    }
    const lifecycleResult = await page.evaluate(async () => {
      center.close();
      document.body.innerHTML = '<section class="conversation-panel"><header id="assistant-plugin-header"></header><div id="assistant-plugin-history"></div><div id="thread-viewport"><div id="chat-log"></div><div id="assistant-plugin-thread-controls"></div></div><div id="assistant-plugin-composer"></div></section>';
      const { prepareAssistantUI, mountAssistant } = await import("/src/runtime/assistant-plugin/assistantEntry.js");
      const clean = await prepareAssistantUI({ document, templateUrl: "/src/runtime/assistant-plugin/assistantTemplate.html" });
      let runtimeCalls = 0, openCalls = 0, renders = 0, creates = 0, slowResolve;
      const client = {
        getRuntime: () => {
          runtimeCalls++;
          return runtimeCalls === 1 ? new Promise((resolve) => {
            slowResolve = resolve;
          }) : Promise.resolve({ runtime: { available: false, ready: false, state: "stopped", error: "current lifecycle" } });
        },
        listSessions: async () => ({ sessions: [] }),
        createSession: async () => {
          creates++;
          throw Error("stale response created a session");
        }
      };
      const { controller } = mountAssistant({ document, client, onOpenSettings: () => openCalls++, onRuntime: () => renders++ });
      const pending = controller.initialize();
      controller.destroy();
      await controller.initialize();
      const beforeStale = renders;
      slowResolve({ runtime: { available: true, ready: true, state: "ready" } });
      await pending;
      if (renders !== beforeStale || creates) throw Error("late initialization modified a later activation");
      const clickSettings = () => {
        document.querySelector("#chat-log").innerHTML = "<button data-agent-open-settings>Settings</button>";
        document.querySelector("[data-agent-open-settings]").click();
      };
      clickSettings();
      if (openCalls !== 1) throw Error("active controller listener missing");
      controller.destroy();
      clickSettings();
      if (openCalls !== 1) throw Error("destroyed controller still owns shared DOM events");
      for (let index = 0; index < 20; index++) {
        await controller.initialize();
        controller.destroy();
      }
      const stoppedCalls = runtimeCalls;
      window.dispatchEvent(new Event("freeflow:agent-data-restored"));
      await Promise.resolve();
      if (runtimeCalls !== stoppedCalls) throw Error("destroyed global restore listener retained");
      await controller.initialize();
      clickSettings();
      if (openCalls !== 2) throw Error("repeated activations duplicated shared DOM events");
      controller.destroy();
      clean();
      if (document.querySelector("#chat-form")) throw Error("template cleanup retained assistant controls");
      return { runtimeCalls, openCalls, renders, activationCycles: 20 };
    });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, checks: ["no AI startup", "accepted install polling", "unknown-size download", "visible-only polling", "cancel recovery", "local import checking to ready", "local import and next-start activation", "manual disable enable uninstall", "lazy AI and dirty core preservation", "hidden AI omitted from saves", "10 rapid open close cycles"], polls, lifecycle: lifecycleResult }));
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
