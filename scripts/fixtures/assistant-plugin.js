"use strict";

let bundledAssets;

async function mockAssistantPlugin(page, { mockAgentRuntime = false, installed = true } = {}) {
  // Exercise the real plugin UI without a signing key or a locally installed component.
  const path = require("node:path");
  const fs = require("node:fs/promises");
  const root = path.resolve(__dirname, "../..");
  const bundle = bundledAssets ? null : await require("esbuild").build({
    entryPoints: [path.join(root, "public/src/runtime/assistant-plugin/assistantEntry.js")],
    bundle: true, write: false, format: "esm", platform: "browser", target: "es2022",
  });
  const assets = bundledAssets || {
    "assistant.js": ["text/javascript", bundle.outputFiles[0].text],
    "assistant.html": ["text/html", await fs.readFile(path.join(root, "public/src/runtime/assistant-plugin/assistantTemplate.html"), "utf8")],
    "assistant.css": ["text/css", await fs.readFile(path.join(root, "public/ui.agent-assistant.css"), "utf8")],
  };
  bundledAssets = assets;
  await page.route("**/api/plugins/assistant/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/status")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, plugin: { installed, desiredEnabled: installed, activeEnabled: installed, version: installed ? "browser-fixture" : null, phase: installed ? "ready" : "not-installed" } }) });
    const asset = assets[pathname.split("/").pop()];
    if (asset) return route.fulfill({ status: 200, contentType: asset[0], body: asset[1] });
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Unknown plugin fixture route" }) });
  });
  await page.route("**/api/ui-settings", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, hasShownStartupTutorial: true, lastTutorialIntroVersion: "2.0.2", dismissedTutorialIntroVersion: "2.0.2" } });
  });
  if (mockAgentRuntime) await page.route("**/api/agent/**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, sessions: [], backups: [], runtime: { available: false, ready: false, state: "stopped", providers: {}, error: "" } }),
  }));
}

module.exports = { mockAssistantPlugin };
