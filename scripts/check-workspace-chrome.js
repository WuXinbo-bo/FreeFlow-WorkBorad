const { chromium } = require("playwright");
const { mockAssistantPlugin } = require("./fixtures/assistant-plugin");
const { checkWorkspaceChrome } = require("./fixtures/check-workspace-chrome");
const { checkCanvasHarmony } = require("./fixtures/check-canvas-harmony");

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    // The layout fixture deliberately leaves selected shapes and panels changed.
    // Give each independent contract a fresh page so its baseline is meaningful.
    for (const check of [checkWorkspaceChrome, checkCanvasHarmony]) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      try {
        await mockAssistantPlugin(page, { mockAgentRuntime: true });
        await page.addInitScript(() => {
          window.desktopShell = {
            isDesktop: true,
            async listAiMirrorTargets() { return { ok: true, targets: [] }; },
          };
        });
        await page.goto(process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:53127/?desktop=1");
        await check(page, { screenshotDir: process.env.FREEFLOW_SCREENSHOT_DIR });
      } finally { await page.close(); }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
