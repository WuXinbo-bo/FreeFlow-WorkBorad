const assert = require("assert");
const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:53127/canvas-office.html";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__canvas2dEngine?.getCanvasPerformanceSnapshot().resources.pools["retained-frame"].byteSize > 0);
    const initialBoard = await page.evaluate(() => JSON.stringify(window.__canvas2dEngine.getSnapshot().board));
    const foregroundBudget = await page.evaluate(() => window.__canvas2dEngine.getCanvasPerformanceSnapshot().resources.budgetBytes);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(80);
      const hidden = await page.evaluate(() => window.__canvas2dEngine.getCanvasPerformanceSnapshot());
      assert.strictEqual(hidden.backgroundSuspended, true);
      assert.strictEqual(hidden.prewarm.paused, true);
      assert.strictEqual(hidden.resources.pools["retained-frame"].byteSize, 0);
      assert(hidden.resources.budgetBytes < foregroundBudget, "hidden page kept its foreground cache budget");
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      assert.strictEqual(await page.evaluate(() => window.__canvas2dEngine.getCanvasPerformanceSnapshot().resources.budgetBytes), foregroundBudget);
      await page.waitForFunction(() => {
        const snapshot = window.__canvas2dEngine.getCanvasPerformanceSnapshot();
        return !snapshot.backgroundSuspended && !snapshot.prewarm.paused && snapshot.resources.pools["retained-frame"].byteSize > 0;
      });
    }
    await page.evaluate(() => {
      for (let cycle = 0; cycle < 10; cycle += 1) {
        for (const hidden of [true, false]) {
          Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
          document.dispatchEvent(new Event("visibilitychange"));
        }
      }
    });
    await page.waitForFunction(() => window.__canvas2dEngine.getCanvasPerformanceSnapshot().resources.pools["retained-frame"].byteSize > 0);
    assert.strictEqual(await page.evaluate(() => JSON.stringify(window.__canvas2dEngine.getSnapshot().board)), initialBoard);
    const releasedBytes = await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      engine.unmount();
      const pools = engine.getCanvasPerformanceSnapshot().resources.pools;
      return pools["retained-frame"].byteSize + pools["live-layers"].byteSize + pools.tile.byteSize;
    });
    assert.strictEqual(releasedBytes, 0, "unmount retained renderer surfaces");
    assert.deepStrictEqual(errors, []);
    console.log("[check-canvas-background-lifecycle] hide/show, rapid recovery and unmount passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
