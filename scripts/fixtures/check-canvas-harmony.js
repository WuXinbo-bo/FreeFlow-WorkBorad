const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

async function checkCanvasHarmony(page, { screenshotDir } = {}) {
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const history = page.getByRole("dialog", { name: "最近导出", exact: true });
  const search = page.getByRole("dialog", { name: "画布搜索", exact: true });
  const historyTrigger = page.getByRole("button", { name: "查看最近导出记录", exact: true });
  const searchTrigger = page.getByRole("button", { name: "打开画布搜索", exact: true });
  const snapshot = () => page.evaluate(() => {
    const s = window.__canvas2dEngine.getSnapshot();
    return { board: JSON.stringify(s.board), dirty: s.boardDirty };
  });
  const capture = async (name) => {
    if (!screenshotDir) return;
    await fs.mkdir(screenshotDir, { recursive: true });
    await page.waitForFunction(() => {
      const splash = document.querySelector(".boot-splash");
      return !splash || Number(getComputedStyle(splash).opacity) === 0;
    });
    await page.screenshot({ path: path.join(screenshotDir, `${name}.png`) });
  };
  const assertPanel = async (panel) => {
    await settle();
    const result = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const boundary = document.querySelector(".canvas2d-engine-ui").getBoundingClientRect();
      const points = [[4, 4], [r.width - 4, 4], [4, r.height - 4], [r.width - 4, r.height - 4], [r.width / 2, r.height / 2]];
      return {
        width: r.width, parent: el.parentElement.id, shape: el.dataset.shapeInclude,
        inside: r.left >= boundary.left + 10 && r.right <= boundary.right - 10 && r.top >= boundary.top + 10 && r.bottom <= boundary.bottom - 10,
        clickable: points.every(([x, y]) => el.contains(document.elementFromPoint(r.x + x, r.y + y))),
        hits: points.map(([x, y]) => document.elementFromPoint(r.x + x, r.y + y)?.className),
        fitsContent: el.scrollWidth <= el.clientWidth + 1,
      };
    });
    assert(result.width >= 280 && result.width <= 430, JSON.stringify(result));
    assert.equal(result.parent, "global-overlay-layer");
    assert.equal(result.shape, "true");
    assert(result.inside && result.clickable && result.fitsContent, JSON.stringify(result));
  };
  try {
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    const workspaceClose = page.locator(".canvas2d-workspace-panel").getByRole("button", { name: "收起画布工作区", exact: true });
    if (await workspaceClose.isVisible()) await workspaceClose.click();
    const baseline = await snapshot();
    for (let i = 0; i < 4; i += 1) {
      await page.evaluate((collapsed) => window.__canvas2dEngine.setCanvasNavigatorCollapsed(collapsed), i % 2 === 0);
      await historyTrigger.click();
      await assertPanel(history);
      await history.getByText("最近导出", { exact: true }).click();
      assert(await history.isVisible(), "panel interior was treated as an outside click");
      await history.getByRole("button", { name: "关闭最近导出" }).press("Escape");
      assert.equal(await history.count(), 0);
      assert(await historyTrigger.evaluate((el) => document.activeElement === el), "Esc did not restore history trigger focus");
      await searchTrigger.click();
      await assertPanel(search);
      const input = search.locator("input");
      await input.fill("不存在的检索词");
      await input.click({ position: { x: 5, y: 5 } });
      assert(await input.evaluate((el) => document.activeElement === el), "directory covered search input");
      await historyTrigger.click();
      assert.equal(await search.count(), 0, "utility panels were not mutually exclusive");
      await history.getByRole("button", { name: "关闭最近导出" }).click();
      await searchTrigger.click();
      await search.locator("input").press("Escape");
      assert.equal(await search.count(), 0);
      assert(await searchTrigger.evaluate((el) => document.activeElement === el), "Esc did not restore search trigger focus");
    }
    await historyTrigger.click();
    await page.getByRole("button", { name: "框选 (V)", exact: true }).click();
    assert.equal(await history.count(), 0, "outside click did not close history");
    for (const shortcut of ["Control+K", "Meta+K"]) {
      await page.locator("#canvas-office-canvas").focus();
      await page.keyboard.press(shortcut);
      await search.waitFor({ state: "visible" });
      await search.locator("input").focus();
      await page.keyboard.press(shortcut);
      await search.waitFor({ state: "hidden" });
      assert(await searchTrigger.evaluate((el) => document.activeElement === el), "search shortcut did not restore focus from the portal");
    }
    for (const label of ["重置视图", "适配全部内容"]) {
      const button = page.getByRole("button", { name: label, exact: true });
      const offset = await button.evaluate((el) => {
        const b = el.getBoundingClientRect(), s = el.querySelector("svg").getBoundingClientRect();
        return Math.hypot(b.x + b.width / 2 - s.x - s.width / 2, b.y + b.height / 2 - s.y - s.height / 2);
      });
      assert(offset < 0.6, `${label} icon is off-center by ${offset}px`);
      await button.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      assert(await button.evaluate((el) => getComputedStyle(el).outlineStyle !== "none"), "keyboard focus indicator missing");
    }
    assert.deepEqual(await snapshot(), baseline, "UI operations modified canvas data");

    const map = page.locator("#canvas2d-transient-minimap");
    const mapToggle = map.locator("button");
    await page.evaluate(() => window.__canvas2dEngine.setCanvasNavigatorCollapsed(true));
    if (await map.evaluate((el) => el.classList.contains("is-collapsed"))) await mapToggle.click();
    await page.waitForFunction(() => {
      const el = document.getElementById("canvas2d-transient-minimap");
      return el && Number(getComputedStyle(el).opacity) >= 0.999;
    });
    const metrics = await map.evaluate((el) => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect(), canvas = el.querySelector("canvas");
      return { width: r.width, height: r.height, opacity: s.opacity, alpha: canvas.getContext("2d").getImageData(0, 0, 1, 1).data[3], scale: canvas.width / canvas.getBoundingClientRect().width };
    });
    assert.equal(metrics.width, 164); assert.equal(metrics.height, 120);
    assert(Number(metrics.opacity) >= 0.999, "content opacity should remain legible");
    assert(metrics.alpha <= 32, "minimap still draws an opaque background");
    assert(Math.abs(metrics.scale - Math.min(3, await page.evaluate(() => devicePixelRatio))) < 0.01);
    const expanded = await map.boundingBox();
    await mapToggle.click(); await mapToggle.click(); await settle();
    const restored = await map.boundingBox();
    assert.equal(restored.x, expanded.x); assert.equal(restored.y, expanded.y);
    await capture("canvas-harmony-minimap");
    await mapToggle.click();

    // A narrow work area must constrain the panel, not the trigger's width.
    const panel = page.locator(".desktop-clear-stage");
    const initial = await panel.boundingBox();
    for (const width of [420, 600]) {
      const handle = await page.locator("#left-pane-resizer").boundingBox();
      const before = await panel.boundingBox();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 + width - before.width, handle.y + handle.height / 2, { steps: 8 });
      await page.mouse.up(); await settle();
      await historyTrigger.click(); await assertPanel(history);
      await capture(`canvas-harmony-history-${width}`);
      await history.getByRole("button", { name: "关闭最近导出" }).press("Escape");
      await searchTrigger.click(); await assertPanel(search);
      await search.getByRole("button", { name: "关闭搜索" }).click();
    }
    const handle = await page.locator("#left-pane-resizer").boundingBox();
    const before = await panel.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + initial.width - before.width, handle.y + handle.height / 2, { steps: 8 }); await page.mouse.up();
    await settle();

    const originalThemeStyle = await page.locator("html").getAttribute("style");
    try {
      for (const preset of ["minimalist-slate", "midnight-slate-glow", "clear-day", "harbor-blue", "spruce-green"]) {
        await page.evaluate(async (themePreset) => {
          const { applyThemeCssVariables } = await import("/src/theme/themeCssVariables.js");
          applyThemeCssVariables(document.documentElement, { themePreset });
        }, preset);
        await historyTrigger.click();
        await assertPanel(history);
        const appearance = await page.evaluate(() => {
          const stage = document.querySelector(".desktop-clear-stage");
          const edge = getComputedStyle(stage, "::after");
          const panel = document.querySelector(".canvas2d-engine-menu-portal");
          const style = getComputedStyle(panel);
          return { edge: edge.boxShadow, pointerEvents: edge.pointerEvents, scheme: style.colorScheme, ink: style.getPropertyValue("--air-ink").trim(), accent: style.getPropertyValue("--air-accent").trim() };
        });
        assert(appearance.edge.includes("inset") && appearance.edge !== "none", `${preset} lost the canvas edge`);
        assert.equal(appearance.pointerEvents, "none", "decorative edge intercepted input");
        assert.equal(appearance.scheme, "light");
        assert.equal(appearance.ink, "#20252b", `${preset} made canvas controls unreadable`);
        assert.equal(appearance.accent, "#356ae6", `${preset} washed out canvas accents`);
        await capture(`canvas-harmony-${preset}`);
        await history.getByRole("button", { name: "关闭最近导出" }).click();
      }
    } finally {
      await page.locator("html").evaluate((el, style) => {
        if (style === null) el.removeAttribute("style");
        else el.setAttribute("style", style);
      }, originalThemeStyle);
    }

    // Read real persisted records after reload, including long names and a record without a local target.
    const previousHistory = await page.evaluate(() => {
      const storageKey = "ai_worker_canvas2d_export_history_v1";
      const previous = localStorage.getItem(storageKey);
      const s = window.__canvas2dEngine.getSnapshot();
      const boardKey = String(s.boardFilePath || s.boardFileName || "未命名画布").trim().replace(/\\/g, "/").toLowerCase();
      const entries = Array.from({ length: 10 }, (_, i) => ({
        id: `harmony-${i}`, exportedAt: Date.now() - i * 1000, kind: "pdf", scope: "board",
        title: `资料导出-${i}-${"长文件名".repeat(20)}.pdf`, fileName: `资料-${i}.pdf`,
        filePath: i === 9 ? "" : `/tmp/freeflow-harmony-${i}.pdf`,
      }));
      localStorage.setItem(storageKey, JSON.stringify({ [boardKey]: entries }));
      return previous;
    });
    try {
      await page.reload();
      await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
      await page.evaluate(() => window.__canvas2dEngine.whenReady());
      await historyTrigger.click();
      await assertPanel(history);
      assert.equal(await history.locator(".canvas2d-engine-export-history-item").count(), 10);
      assert(await history.locator(".canvas2d-engine-export-history-item").last().isDisabled());
      await history.locator(".canvas2d-engine-export-history-item").last().scrollIntoViewIfNeeded();
      await capture("canvas-harmony-history-records");
      await history.getByRole("button", { name: "关闭最近导出" }).click();
    } finally {
      await page.evaluate((previous) => {
        if (previous === null) localStorage.removeItem("ai_worker_canvas2d_export_history_v1");
        else localStorage.setItem("ai_worker_canvas2d_export_history_v1", previous);
      }, previousHistory);
    }
    assert.deepEqual(errors, []);
    console.log("[check-canvas-harmony] overlay hit areas, close/focus recovery, narrow widths, five themes, persisted records, centered icons and transparent Retina minimap passed");
  } finally {
    page.off("pageerror", onError);
  }
}

module.exports = { checkCanvasHarmony };
