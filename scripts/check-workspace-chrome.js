const { chromium } = require("playwright");
const assert = require("node:assert/strict");
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
    // The independent canvas page falls back to body portals without the shell overlay.
    const standalone = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await standalone.goto(new URL("canvas-office.html", process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:53127/").href);
      await standalone.getByRole("button", { name: "画布选项与帮助", exact: true }).waitFor();
      assert.equal(await standalone.locator("#global-overlay-layer").count(), 0);
      await standalone.evaluate(() => window.__canvas2dEngine.whenReady());
      await standalone.evaluate(() => window.__canvas2dEngine.setCanvasNavigatorCollapsed(true));
      await standalone.getByTitle("框选 (V)", { exact: true }).click();
      for (const [triggerName, panelName, closeName] of [
        ["查看最近导出记录", "最近导出", "关闭最近导出"],
        ["打开画布搜索", "画布搜索", "关闭搜索"],
        ["画布选项与帮助", "画布选项与帮助", "关闭画布选项与帮助"],
      ]) {
        await standalone.getByRole("button", { name: triggerName, exact: true }).click();
        const panel = standalone.getByRole("dialog", { name: panelName, exact: true });
        await panel.waitFor();
        await panel.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const engine = window.__canvas2dEngine;
          const board = engine.getSnapshot().board, view = board.view;
          const canvas = document.getElementById("canvas-office-canvas").getBoundingClientRect();
          const id = "standalone-layering-shape";
          engine.loadStructuredBoardForExport({
            ...board,
            items: [...board.items.filter(item => item.id !== id), { id, type: "shape", shapeType: "rect", x: (rect.x + rect.width / 2 - canvas.left - view.offsetX) / view.scale - 60, y: (rect.y + Math.min(100, rect.height / 2) - canvas.top - view.offsetY + 14) / view.scale, width: 120, height: 80 }],
            selectedIds: [id],
          });
        });
        const shapeToolbar = standalone.getByRole("toolbar", { name: "图形样式", exact: true });
        await shapeToolbar.waitFor();
        const hit = await panel.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const shape = document.querySelector(".canvas2d-shape-style-popover").getBoundingClientRect();
          const left = Math.max(rect.left, shape.left), right = Math.min(rect.right, shape.right);
          const top = Math.max(rect.top, shape.top), bottom = Math.min(rect.bottom, shape.bottom);
          return { parent: element.parentElement.tagName, overlaps: right > left && bottom > top, inside: element.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2)) };
        });
        assert.equal(hit.parent, "BODY");
        assert(hit.overlaps && hit.inside, `${panelName} body portal is covered: ${JSON.stringify(hit)}`);
        await panel.getByRole("button", { name: closeName, exact: true }).click();
        await shapeToolbar.getByRole("button", { name: "边框颜色：蓝色", exact: true }).click();
        assert.equal(await standalone.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.find(item => item.id === "standalone-layering-shape").strokeColor), "#2563eb");
      }
      console.log("[workspace-chrome] standalone history/search/options body portals and selected shape toolbar close/recovery passed");
    } finally { await standalone.close(); }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
