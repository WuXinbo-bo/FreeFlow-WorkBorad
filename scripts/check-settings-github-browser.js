#!/usr/bin/env node

// Browser contract for the standalone GitHub settings page.  The GitHub client
// below is deliberately an in-page mock: this test exercises the real settings
// component, event delegation, rendering and state transitions without reading
// or changing the developer's settings or contacting GitHub.
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");

function assert(condition, message, detail) {
  if (!condition) throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function createSnapshot() {
  return {
    ok: true,
    schemaVersion: 1,
    revision: "github-browser-1",
    sections: {
      general: { productName: "FreeFlow", workspaceName: "GitHub Browser", workspaceSubtitle: "settings", assistantName: "Assistant", updateCheckEnabled: true },
      ai: { agent: { activeProvider: "codex", queueWhileRunning: true, showReasoning: true, providers: { codex: {}, claude: {} } } },
      appearance: { themePreset: "minimalist-slate" },
      workbench: { defaultCanvasPanelSide: "right", clickThroughShortcut: "CommandOrControl+Shift+X" },
      canvas: { defaultBoardDirectory: "", workspaceDirectory: "", exportImageDirectory: "", autosaveEnabled: true, linkSemanticsEnabled: true },
      permissions: { permissions: {}, allowedRoots: [] },
    },
  };
}

function startStaticServer() {
  const server = http.createServer((request, res) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    if (pathname === "/fixture.html" || pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<!doctype html><html><body><div id=host></div></body></html>");
      return;
    }
    if (!pathname.startsWith("/public/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const file = path.join(repoRoot, pathname.slice(1));
    if (!file.startsWith(path.join(repoRoot, "public"))) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end();
        return;
      }
      const type = file.endsWith(".js") ? "text/javascript" : "text/plain";
      res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function selector(locators) {
  return locators.join(",");
}

async function firstVisible(page, locators, name) {
  const combined = selector(locators);
  const locator = page.locator(combined).first();
  await locator.waitFor({ state: "attached" }).catch(() => {});
  assert(await locator.count() > 0 && await locator.isVisible(), `${name} control is missing`, combined);
  return locator;
}

async function main() {
  const snapshot = createSnapshot();
  const server = await startStaticServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/settings-center", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(clone(snapshot)) });
  });

  try {
    await page.goto(`${baseUrl}/fixture.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      const state = {
        connected: false,
        method: "token",
        pollCount: 0,
        flowCount: 0,
        repository: null,
        deviceFlow: null,
      };
      const repos = [{ owner: { login: "freeflow-test" }, name: "private-board", private: true, default_branch: "trunk" }];
      const status = () => ({ ok: true, connected: state.connected, auth: state.connected ? { method: state.method, user: { login: "freeflow-test", id: 7 } } : null, repository: state.repository, ledger: { boards: {} } });
      window.__githubMock = {
        platform: "darwin",
        githubSync: {
          async getStatus() { return status(); },
          async connectToken({ token }) {
            if (token !== "pat-test") throw new Error("令牌无效");
            state.connected = true;
            state.method = "token";
            return { connected: true, user: { login: "freeflow-test", id: 7 } };
          },
          async startDeviceFlow() {
            state.flowCount += 1;
            state.pollCount = 0;
            state.deviceFlow = { device_code: state.flowCount === 1 ? "expired-flow" : "good-flow", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", interval: 1 };
            return state.deviceFlow;
          },
          async pollDeviceFlow() {
            if (!state.deviceFlow) throw new Error("授权流程不存在");
            state.pollCount += 1;
            if (state.deviceFlow.device_code === "expired-flow") throw new Error("设备授权码已过期，请重新开始");
            if (state.pollCount === 1) return { pending: true, interval: 2 };
            state.connected = true;
            state.method = "device-flow";
            return { pending: false, connected: true, user: { login: "freeflow-test", id: 7 } };
          },
          async listRepositories() { return { repositories: repos, user: { login: "freeflow-test" } }; },
          async setRepository(input) { state.repository = { ...input }; return { ok: true }; },
          async disconnect() { state.connected = false; state.repository = null; return { ok: true }; },
          async sync() { return { ok: true }; },
          async createRepository() { throw new Error("create is outside this browser contract"); },
        },
      };
      const module = await import("/public/src/components/settings/settingsCenter.js");
      window.__settingsController = module.mountSettingsCenter(document.querySelector("#host"), {
        apiRoutes: { settingsCenter: "/api/settings-center" },
        readJsonResponse: (response) => response.json(),
        desktopShell: window.__githubMock,
        isDesktop: true,
        agentClient: null,
        onThemePreview: (theme) => { window.__themePreview = theme; },
        onRequestClose: () => { window.__closeCount = (window.__closeCount || 0) + 1; },
      });
      await window.__settingsController.open();
    });

    const nav = page.locator('[data-settings-section="github"]');
    assert(await nav.count() === 1, "GitHub sync is not a dedicated settings section");
    assert(await page.locator('[data-settings-section]').count() >= 8, "settings navigation did not expose the GitHub section");
    await nav.click();
    await page.waitForSelector("text=GitHub 画布同步");

    const tokenMethod = await firstVisible(page, [
      '[data-github-auth-method="token"]', '[data-github-method="token"]', '[data-settings-action="github-method-token"]',
    ], "token auth method");
    await tokenMethod.click();
    await page.waitForSelector("[data-github-token]");
    assert(await page.locator("[data-github-client-id]").count() === 0 && await page.locator("[data-github-app-type]").count() === 0, "PAT mode still presents Device Flow fields");
    await page.locator("[data-github-token]").fill("pat-test");
    await page.locator('[data-settings-action="github-token-connect"]').click();
    await page.waitForFunction(() => document.body.textContent.includes("freeflow-test"));

    await page.locator('[data-settings-action="github-repositories"]').click();
    await page.waitForFunction(() => Boolean(document.querySelector('[data-github-repository] option[value="freeflow-test/private-board"]')));
    await page.locator("[data-github-repository]").selectOption("freeflow-test/private-board");
    await page.locator('[data-settings-action="github-repository-save"]').click();
    await page.waitForFunction(() => document.body.textContent.includes("freeflow-test/private-board"));
    await page.locator('[data-settings-action="github-disconnect"]').click();
    await page.waitForSelector('[data-settings-action="github-token-connect"]');

    const deviceMethod = await firstVisible(page, [
      '[data-github-auth-method="device-flow"]', '[data-github-method="device-flow"]', '[data-settings-action="github-method-device-flow"]',
    ], "Device Flow auth method");
    await deviceMethod.click();
    await page.waitForSelector("[data-github-client-id]");
    assert(await page.locator("[data-github-token]").count() === 0 && await page.locator("[data-github-app-type]").count() === 1, "Device Flow mode did not expose only app credentials");
    await page.locator("[data-github-client-id]").fill("public-client-id");
    await page.locator('[data-settings-action="github-connect"]').click();
    await page.waitForSelector("text=ABCD-EFGH");
    await page.locator('[data-settings-action="github-poll"]').click();
    await page.waitForFunction(() => document.body.textContent.includes("已过期") || document.body.textContent.includes("过期"));
    await page.waitForSelector('[data-settings-action="github-connect"]');

    await page.locator('[data-settings-action="github-connect"]').click();
    await page.waitForSelector("text=ABCD-EFGH");
    await page.locator('[data-settings-action="github-poll"]').click();
    await page.waitForFunction(() => document.body.textContent.includes("仍在等待授权"));
    await page.locator('[data-settings-section="general"]').click();
    await page.locator('[data-settings-section="github"]').click();
    assert(await page.locator("text=ABCD-EFGH").count() === 1, "switching settings sections lost or stale-filled Device Flow state");
    await page.locator('[data-settings-action="github-poll"]').click();
    await page.waitForFunction(() => document.body.textContent.includes("已连接"));

    await page.locator('[data-settings-action="github-disconnect"]').click();
    assert(await page.locator('[data-settings-action="github-connect"]').count() === 1, "disconnect did not restore the unconnected state");
    assert(pageErrors.length === 0, "GitHub settings caused browser errors", pageErrors);
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("[check-settings-github-browser] Dedicated GitHub settings, PAT/Device Flow switching, retry, repository binding, and disconnect passed");
}

main().catch((error) => {
  console.error(`[check-settings-github-browser] ${error.stack || error.message}`);
  process.exitCode = 1;
});
