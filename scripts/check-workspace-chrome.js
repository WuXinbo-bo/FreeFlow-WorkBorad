const { chromium } = require("playwright");
const { checkWorkspaceChrome } = require("./fixtures/check-workspace-chrome");

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.addInitScript(() => {
      window.desktopShell = {
        isDesktop: true,
        async listAiMirrorTargets() { return { ok: true, targets: [] }; },
      };
    });
    await page.goto(process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:53127/?desktop=1");
    await checkWorkspaceChrome(page, { screenshotDir: process.env.FREEFLOW_SCREENSHOT_DIR });
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
