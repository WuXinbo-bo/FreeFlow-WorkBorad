const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");

async function checkWorkspaceChrome(page, { screenshotDir } = {}) {
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  const engineReady = () => page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
  const rect = (selector) => page.locator(selector).first().evaluate((element) => {
    const r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  });
  const minimap = page.locator("#canvas2d-transient-minimap");
  const mapToggle = minimap.locator("button");
  const mapCollapsed = () => minimap.evaluate((element) => element.classList.contains("is-collapsed"));
  const addSceneItem = (id) => page.evaluate((id) => {
    const engine = window.__canvas2dEngine;
    const board = engine.getSnapshot().board;
    engine.loadStructuredBoardForExport({
      ...board,
      items: [...board.items, { id, type: "shape", shapeType: "rect", x: 800, y: 300, width: 120, height: 80 }],
      selectedIds: [id],
    });
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, id);
  const setDirectory = async (collapsed) => {
    await page.evaluate((value) => window.__canvas2dEngine.setCanvasNavigatorCollapsed(value), collapsed);
    await page.waitForFunction((value) => Boolean(document.querySelector(".canvas2d-navigator-tab")) === value, collapsed);
  };
  const capture = async (name) => {
    if (!screenshotDir) return;
    await fs.mkdir(screenshotDir, { recursive: true });
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".boot-splash")).opacity) === 0);
    await page.screenshot({ path: path.join(screenshotDir, `${name}.png`) });
  };
  const overlap = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
  const resizePanel = async (side, width) => {
    const selector = side === "right" ? ".conversation-panel" : ".desktop-clear-stage";
    const before = await rect(selector);
    const handle = await rect(`#${side}-pane-resizer`);
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 400), { x, y });
    assert(hit?.includes(`${side}-pane-resizer`), `${side} resize handle was covered: ${JSON.stringify({ hit, before, handle, body: await page.locator("body").getAttribute("class"), panelClass: await page.locator(selector).getAttribute("class"), panelStyle: await page.locator(selector).getAttribute("style") })}`);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (side === "right" ? before.width - width : width - before.width), y, { steps: 12 });
    await page.mouse.up();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const resized = await rect(selector);
    assert(Math.abs(resized.width - width) < 2, `actual ${side} panel resize did not reach ${width}: ${JSON.stringify({ before, handle, resized, hit, body: await page.locator("body").getAttribute("class"), panelStyle: await page.locator(selector).getAttribute("style") })}`);
    if (side === "right") {
      const frozenWidth = await page.locator('[data-pane-resize-viewport="right"]').evaluate((element) => element.style.width);
      assert.equal(frozenWidth, "", "right header retained stale frozen geometry after resize");
    }
  };

  try {
    await engineReady();
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    const assistantEnabled = await page.evaluate(async () => {
      const response = await fetch("/api/plugins/assistant/status");
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error("Could not read assistant plugin status");
      return Boolean(result.plugin?.activeEnabled);
    });
    assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("assistant-plugin-enabled")), assistantEnabled, "assistant UI did not match the active plugin state");
    for (const id of ["#right-panel-tab-assistant", "#right-panel-switch-lock-btn"]) {
      assert.equal(await page.locator(id).isVisible(), assistantEnabled, `${id} visibility did not match the active plugin state`);
    }
    await page.locator(assistantEnabled ? "#right-panel-tab-assistant" : "#right-panel-tab-screen").click();
    const baseline = await page.evaluate(() => ({
      dirty: window.__canvas2dEngine.getSnapshot().boardDirty,
      board: JSON.stringify(window.__canvas2dEngine.getSnapshot().board),
    }));
    assert(await mapCollapsed(), "fresh profile minimap must start collapsed");
    for (let cycle = 0; cycle < 5; cycle += 1) {
      await setDirectory(true);
      await setDirectory(false);
      assert(await mapCollapsed(), "directory opening expanded the minimap");
    }
    const after = await page.evaluate(() => ({
      dirty: window.__canvas2dEngine.getSnapshot().boardDirty,
      board: JSON.stringify(window.__canvas2dEngine.getSnapshot().board),
    }));
    assert.deepEqual(after, baseline, "directory toggles changed shared canvas content or dirty status");

    await setDirectory(true);
    await mapToggle.click();
    await page.waitForFunction(() => document.querySelector("#canvas2d-transient-minimap")?.offsetWidth >= 163);
    assert.equal(await mapCollapsed(), false);
    const stats = () => minimap.locator("canvas").evaluate((canvas) => canvas.__ffMinimapStats);
    const expandedStats = await stats();
    await mapToggle.click();
    await page.waitForFunction(() => document.querySelector("#canvas2d-transient-minimap")?.offsetWidth <= 38);
    const collapsedStats = await stats();
    await addSceneItem("minimap-collapsed-edit");
    assert.equal((await stats()).snapshotRenderCount, collapsedStats.snapshotRenderCount, "collapsed minimap kept redrawing snapshots");
    assert.equal((await stats()).viewportRenderCount, collapsedStats.viewportRenderCount, "collapsed minimap kept redrawing the viewport");
    await mapToggle.click();
    await page.waitForFunction((count) => document.querySelector("#canvas2d-transient-minimap canvas")?.__ffMinimapStats?.snapshotRenderCount > count, expandedStats.snapshotRenderCount);
    await mapToggle.click();
    await page.reload();
    await engineReady();
    assert(await mapCollapsed(), "minimap must start closed after reload");
    assert(await page.locator(".canvas2d-navigator-tab").isVisible(), "local directory preference was lost after reload");
    await mapToggle.click();
    await page.waitForFunction(() => document.querySelector("#canvas2d-transient-minimap")?.offsetWidth >= 163);
    await page.reload();
    await engineReady();
    assert(await mapCollapsed(), "previous manual expansion reopened the minimap after reload");
    await mapToggle.click();
    await page.waitForFunction(() => document.querySelector("#canvas2d-transient-minimap canvas")?.__ffMinimapStats?.viewportRenderCount > 0);

    const toolbar = await rect(".canvas2d-engine-toolbar");
    const left = await rect('[data-stage-panel-controls="left"]');
    assert(!overlap(toolbar, left), "top canvas controls overlap the toolbar");
    assert(Math.abs(toolbar.y + toolbar.height / 2 - left.y - left.height / 2) <= 2, "canvas top controls are not vertically aligned");
    for (const side of ["left", "right"]) {
      assert((await rect(`.workspace-drag-band.is-top[data-stage-panel-frame="${side}"]`)).height <= 12, `${side} top drag rail covers header controls`);
    }
    await capture("workspace-wide");

    for (const width of [420, 360, 320, 600]) {
      await resizePanel("right", width);
      for (const mode of assistantEnabled ? ["assistant", "screen", "assistant"] : ["screen"]) {
        await page.locator(`#right-panel-tab-${mode}`).click();
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const controls = await rect('[data-stage-panel-controls="right"]');
        const tabs = await rect(".right-panel-window-controls");
        const panel = await rect(".conversation-panel");
        const actions = await rect(".app-global-shell-actions");
        const headerLayout = await page.locator(".conversation-header-topline").evaluate((element) => ({
          rect: element.getBoundingClientRect().toJSON(),
          reserve: element.style.getPropertyValue("--right-global-actions-reserve"),
          classes: element.className,
        }));
        assert(!overlap(controls, tabs) && !overlap(tabs, actions), `right header overlaps at ${width}/${mode}: ${JSON.stringify({ controls, tabs, panel, actions, headerLayout })}`);
        assert(tabs.right <= panel.right && tabs.x >= panel.x, `header escaped the ${width}px panel`);
        assert(Math.abs(controls.y + controls.height / 2 - tabs.y - tabs.height / 2) <= 4, `header fell to another row at ${width}/${mode}: ${JSON.stringify({ controls, tabs, panel, actions })}`);
        for (const id of assistantEnabled ? ["#right-panel-tab-assistant", "#right-panel-tab-screen", "#right-panel-switch-lock-btn"] : ["#right-panel-tab-screen"]) {
          const hit = await page.locator(id).evaluate((button) => {
            const r = button.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            const points = [r.top + 4, r.top + r.height / 2, r.bottom - 4].map((y) => {
              const target = document.elementFromPoint(r.x + r.width / 2, y);
              return { y, inside: button.contains(target), target: target?.className };
            });
            return { rect: r.toJSON(), width: r.width, inside: points.every((point) => point.inside), points, target: hit?.outerHTML.slice(0, 400), viewport: button.closest(".pane-resize-viewport")?.style.cssText, body: document.body.className };
          });
          assert(hit.width >= 24 && hit.inside, `header button is not hittable: ${width}/${mode}/${id}: ${JSON.stringify(hit)}`);
        }
      }
      await capture(`right-panel-${width}`);
    }
    await resizePanel("right", 600);
    await setDirectory(false);
    const originalLeftWidth = (await rect(".desktop-clear-stage")).width;
    await resizePanel("left", 320);
    const occluded = overlap(await rect(".canvas2d-navigator-panel"), await rect("#canvas2d-transient-minimap"));
    await page.waitForFunction((blocked) => {
      const map = document.querySelector("#canvas2d-transient-minimap");
      return blocked ? getComputedStyle(map).visibility === "hidden" || map.classList.contains("is-space-constrained") : getComputedStyle(map).visibility === "visible";
    }, occluded);
    assert.equal(await mapCollapsed(), false, "temporary occlusion changed the minimap preference");
    const hiddenStats = await stats();
    await addSceneItem("minimap-occluded-edit");
    const constrained = await minimap.evaluate((element) => element.classList.contains("is-space-constrained"));
    if (occluded || constrained) assert.equal((await stats()).snapshotRenderCount, hiddenStats.snapshotRenderCount, "occluded minimap kept redrawing snapshots");
    else await page.waitForFunction((count) => document.querySelector("#canvas2d-transient-minimap canvas")?.__ffMinimapStats?.snapshotRenderCount > count, hiddenStats.snapshotRenderCount);
    await setDirectory(true);
    const workspaceCollapse = page.locator(".canvas2d-workspace-panel").getByRole("button", { name: "收起画布工作区", exact: true });
    if (await workspaceCollapse.isVisible()) await workspaceCollapse.click();
    await page.waitForFunction(() => {
      const map = document.querySelector("#canvas2d-transient-minimap");
      return getComputedStyle(map).visibility === "visible" && !map.classList.contains("is-space-constrained");
    });
    if (occluded || constrained) await page.waitForFunction((count) => document.querySelector("#canvas2d-transient-minimap canvas")?.__ffMinimapStats?.snapshotRenderCount > count, hiddenStats.snapshotRenderCount);
    assert.equal(await mapCollapsed(), false, "minimap did not restore after occlusion");
    const recoveredStats = await stats();
    assert(recoveredStats.snapshotRenderCount > 0 && recoveredStats.viewportRenderCount > 0, "restored minimap is blank");
    await capture("canvas-narrow-recovered");
    await resizePanel("left", originalLeftWidth);
    for (let cycle = 0; cycle < 6; cycle += 1) {
      await mapToggle.click();
      await mapToggle.click();
      await setDirectory(false);
      await setDirectory(true);
    }
    assert.equal(await mapCollapsed(), false, "rapid map/directory switches lost the selected state");
    await mapToggle.click();
    assert(await mapCollapsed());
    for (const side of ["left", "right"]) {
      await page.locator(`[data-stage-panel-action="close"][data-stage-panel-side="${side}"]`).click();
      const restore = page.locator(`#restore-${side}-pane-btn`);
      await restore.waitFor({ state: "visible" });
      const frame = await restore.boundingBox();
      const viewportHeight = await page.evaluate(() => window.innerHeight);
      assert(Math.abs(frame.y + frame.height / 2 - viewportHeight / 2) <= 2, `${side} restore control did not stay vertically centered`);
      assert(Math.abs(frame.width - 26) <= 1 && Math.abs(frame.height - 72) <= 1, `${side} restore control is not the slim edge handle: ${JSON.stringify(frame)}`);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      assert(side === "left" ? frame.x <= 1 : Math.abs(frame.x + frame.width - viewportWidth) <= 1, `${side} restore control is not aligned to the viewport edge: ${JSON.stringify(frame)}`);
    }
    await capture("both-panels-collapsed");
    for (const side of ["left", "right"]) {
      await page.locator(`#restore-${side}-pane-btn`).click();
      await page.waitForFunction((side) => document.querySelector(`#restore-${side}-pane-btn`)?.classList.contains("is-hidden"), side);
    }
    assert.deepEqual(errors, [], "workspace chrome generated browser errors");
    console.log("[workspace-chrome] layout, local preferences, directory isolation, occlusion/recovery and rapid toggles passed");
  } finally {
    page.off("pageerror", onError);
  }
}

module.exports = { checkWorkspaceChrome };
