const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { checkCanvasTrackpad } = require("./fixtures/check-canvas-trackpad");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(process.env.CANVAS_TEST_URL || "http://127.0.0.1:53127/canvas-office.html");
    await page.waitForFunction(() => window.__canvas2dEngine);
    await checkCanvasTrackpad(page);
    assert.deepEqual(errors, []);
    console.log("[check-canvas-trackpad-browser] pinch/pan, pointer anchoring, editor routing, rapid cycles and blur recovery passed");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
