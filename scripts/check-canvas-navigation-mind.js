"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const BASE_URL = process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:3001/?desktop=1";
const only = process.env.CANVAS_FIX_CASE;

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(180);
}

async function load(page, items, selectedIds = [], scale = 1) {
  await page.evaluate(({ items, selectedIds, scale }) => {
    window.__canvas2dEngine.loadStructuredBoardForExport({
      items, selectedIds, view: { scale, offsetX: 0, offsetY: 0 }, navigator: { collapsed: true, entries: [] },
    });
    window.__canvas2dEngine.setTool("select");
  }, { items, selectedIds, scale });
  await settle(page);
}

async function checkNavigator(page) {
  await load(page, []);
  const minimap = page.locator("#canvas2d-transient-minimap");
  const origin = await minimap.boundingBox();
  const anchor = await page.locator(".canvas2d-engine-corner-top-left .canvas2d-floating-card-info").boundingBox();
  assert(Math.abs(origin.x - anchor.x) <= 3, `minimap stayed displaced with directory closed: ${JSON.stringify({ origin, anchor })}`);
  for (let index = 0; index < 3; index += 1) {
    await page.locator(".canvas2d-navigator-tab").click();
    await settle(page);
    const opened = await minimap.boundingBox();
    const directory = await page.locator(".canvas2d-navigator-panel").boundingBox();
    assert(opened.x >= directory.x + directory.width + 8, "minimap did not avoid the open directory");
    await page.locator(".canvas2d-navigator-dock-collapse").click();
    await settle(page);
    const restored = await minimap.boundingBox();
    assert(Math.abs(restored.x - origin.x) <= 1 && Math.abs(restored.y - origin.y) <= 1,
      `minimap did not return: ${JSON.stringify({ origin, opened, restored })}`);
  }
}

async function checkLines(page) {
  const zero = await page.evaluate(async () => {
    const { createShapeElement, moveShapeElement } = await import("/src/engines/canvas2d-core/elements/shapes.js");
    const line = createShapeElement("arrow", { x: 80, y: 60 }, { x: 0, y: 0 });
    return { line, moved: moveShapeElement(line, -20, 30) };
  });
  assert.equal(zero.line.endX, 0);
  assert.equal(zero.line.endY, 0);
  assert.equal(zero.moved.endX, -20);
  assert.equal(zero.moved.endY, 30);
  for (const shapeType of ["line", "arrow"]) {
    for (const handle of ["start", "end"]) {
      const fixed = { x: 340, y: 410 };
      for (const target of [{ x: 470, y: 530 }, { x: 210, y: 530 }, { x: 210, y: 290 }, { x: 470, y: 290 }, { x: 340, y: 530 }, { x: 210, y: 410 }]) {
        const start = handle === "start" ? { x: 470, y: 530 } : fixed;
        const end = handle === "end" ? { x: 470, y: 530 } : fixed;
        const item = { id: "line-test", type: "shape", shapeType, x: 340, y: 410, width: 130, height: 120, startX: start.x, startY: start.y, endX: end.x, endY: end.y };
        await load(page, [item], [item.id]);
        const canvas = await page.locator("#canvas-office-canvas").boundingBox();
        const moving = handle === "start" ? start : end;
        await page.mouse.move(canvas.x + moving.x, canvas.y + moving.y);
        await page.mouse.down();
        await page.mouse.move(canvas.x + target.x, canvas.y + target.y, { steps: 6 });
        await page.mouse.up();
        await settle(page);
        const next = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.find((item) => item.id === "line-test"));
        assert(Math.abs(next[`${handle}X`] - target.x) < 2 && Math.abs(next[`${handle}Y`] - target.y) < 2,
          `${shapeType} ${handle} failed to follow ${JSON.stringify(target)}: ${JSON.stringify(next)}`);
        const other = handle === "start" ? "end" : "start";
        assert.equal(next[`${other}X`], fixed.x);
        assert.equal(next[`${other}Y`], fixed.y);
        if (target.x === moving.x && target.y === moving.y) continue;
        await page.evaluate(() => window.__canvas2dEngine.undo());
        await settle(page);
        const undone = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items[0]);
        assert.equal(undone[`${handle}X`], moving.x);
        await page.evaluate(() => window.__canvas2dEngine.redo());
        await settle(page);
        const redone = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items[0]);
        assert.equal(redone[`${handle}X`], next[`${handle}X`]);
      }
    }
  }
}

function mind(id, x, y, depth = 0, parentId = "", childrenIds = []) {
  const text = depth === 0 ? "Project direction" : depth === 1 ? "Research and design" : "Explore the details";
  return { id, type: "mindNode", x, y, width: 220, height: 80, text, plainText: text, html: `<p>${text}</p>`, depth, parentId, rootId: "root", childrenIds, branchSide: "right" };
}

async function checkMind(page) {
  const items = [mind("root", 100, 350, 0, "", ["branch"]), mind("branch", 408, 350, 1, "root", ["leaf"]), mind("leaf", 716, 350, 2, "branch")];
  const radii = [];
  for (const scale of [1, 0.25, 2, 0.5, 1]) {
    await load(page, items, [], scale);
    const radius = await page.locator('[data-scene-key="mind-node:root"] .canvas2d-scene-mind-node-body').getAttribute("rx");
    radii.push(Number(radius));
  }
  assert(radii.every((radius) => radius === radii[0]), `mind node radius changed in scene coordinates: ${radii}`);
  const result = await page.evaluate(async () => {
    const { applyMindMapAutoLayout } = await import("/src/engines/canvas2d-core/elements/mindMap.js");
    const items = window.__canvas2dEngine.getSnapshot().board.items;
    const input = items.map((item) => ({ ...item, x: item.id === "root" ? 100 : -500, y: -500 }));
    const once = applyMindMapAutoLayout(input, "root");
    const twice = applyMindMapAutoLayout(once, "root");
    return { once, twice };
  });
  assert.deepEqual(result.once, result.twice, "mind layout needs repeated passes to settle");
  const tree = [
      mind("root", 50, 450, 0, "", ["branch", "branch-b"]),
      mind("branch", 350, 350, 1, "root", ["leaf", "leaf-b"]),
      mind("branch-b", 350, 650, 1, "root"),
      mind("leaf", 650, 300, 2, "branch"),
      mind("leaf-b", 650, 450, 2, "branch"),
  ];
  await load(page, [], [], 0.75);
  const canvas = await page.locator('#canvas-office-canvas').boundingBox();
  const clip = { x: Math.ceil(canvas.x + 650 * 0.75 - 2), y: Math.ceil(canvas.y + 300 * 0.75 - 2), width: 170, height: 60 };
  const empty = await page.screenshot({ clip });
  await load(page, tree, [], 0.75);
  const geometry = () => page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.map(({id,x,y,width,height}) => ({id,x,y,width,height})));
  const beforeZoom = await geometry();
  for (const direction of ['zoomOut', 'zoomIn']) {
    for (let step = 0; step < 8; step += 1) {
      await page.evaluate(direction => window.__canvas2dEngine[direction](), direction);
      await settle(page);
    }
  }
  assert.deepEqual(await geometry(), beforeZoom, 'zoom changed mind node geometry');
  await load(page, tree, [], 0.75);
  if (process.env.CANVAS_FIX_SCREENSHOTS) await page.screenshot({ path: "tmp/mind-desktop.png" });
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await page.evaluate(() => window.__canvas2dEngine.toggleMindNodeCollapsed("branch"));
    await settle(page);
    assert.equal(await page.locator('[data-scene-key="mind-node:leaf"]').count(), 0, 'collapsed child still has a vector body');
    assert.deepEqual(await page.screenshot({ clip }), empty, 'collapsed child left painted pixels');
    if (process.env.CANVAS_FIX_SCREENSHOTS) await page.screenshot({ path: "tmp/mind-collapsed.png" });
    await page.evaluate(() => window.__canvas2dEngine.toggleMindNodeCollapsed("branch"));
    await settle(page);
    assert.equal(await page.locator('[data-scene-key="mind-node:leaf"]').count(), 1, 'expanded child failed to return');
  }
  await page.evaluate(() => {
    for (let i = 0; i < 6; i += 1) window.__canvas2dEngine.toggleMindNodeCollapsed('branch');
  });
  await settle(page);
  assert.equal(await page.locator('[data-scene-key="mind-node:leaf"]').count(), 1, 'rapid collapse/expand lost child');
  assert(await page.evaluate(() => window.__canvas2dEngine.promoteMindNode('leaf')));
  assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.find(n => n.id === 'leaf').parentId), 'root');
  assert(await page.evaluate(() => window.__canvas2dEngine.demoteMindNode('leaf')));
  assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.find(n => n.id === 'leaf').parentId), 'branch');
  for (const command of ['addMindChildNode', 'addMindSiblingNode']) {
    assert(await page.evaluate(command => window.__canvas2dEngine[command]('branch'), command));
    await settle(page);
    const editingId = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().editingId);
    const editor = page.locator('#canvas-rich-editor');
    await editor.focus();
    await page.keyboard.insertText('A longer node label that wraps across several lines and remains inside its frame.');
    await settle(page);
    await page.mouse.click(canvas.x + 60, canvas.y + 700);
    await settle(page);
    const state = await page.evaluate(id => {
      const s = window.__canvas2dEngine.getSnapshot();
      return { editingId: s.editingId, node: s.board.items.find(n => n.id === id) };
    }, editingId);
    assert(!state.editingId, 'new mind node editor failed to close');
    assert(state.node?.height > 72, `long label did not grow its frame: ${JSON.stringify(state)}`);
    const labelFrame = await page.locator(`.canvas2d-rich-item[data-id="${editingId}"]`).boundingBox();
    assert(labelFrame && labelFrame.height <= state.node.height * 0.75 + 2, 'long label overflows its node');
    await page.evaluate(() => window.__canvas2dEngine.undo());
    await page.evaluate(() => window.__canvas2dEngine.redo());
    await settle(page);
    const restored = await page.evaluate(id => window.__canvas2dEngine.getSnapshot().board.items.find(n => n.id === id), state.node.id);
    assert.equal(restored.plainText, state.node.plainText, 'node text failed redo');
  }
  const canvasText = await page.evaluate(async () => {
    const { createRenderer } = await import('/src/engines/canvas2d-core/renderer.js');
    const renderer = createRenderer();
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    const item = { id: 'export-node', type: 'mindNode', x: 40, y: 40, width: 220, height: 80, depth: 0, fontSize: 18, text: 'FreeFlow canvas', plainText: 'FreeFlow canvas', html: '<p>FreeFlow canvas</p>' };
    renderer.render({ ctx, canvas, items: [item], selectedIds: [], view: { scale: 1, offsetX: 0, offsetY: 0 }, pixelRatio: 1, renderTextInCanvas: true });
    const pixels = ctx.getImageData(58, 54, 170, 30).data;
    let dark = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 100 && pixels[index + 1] < 100 && pixels[index + 2] < 100 && pixels[index + 3] > 0) dark += 1;
    }
    renderer.destroy?.();
    return dark;
  });
  assert(canvasText > 50, 'canvas/export rendering lost mind node text');
  if (process.env.CANVAS_FIX_SCREENSHOTS) {
    await load(page, tree, ['branch'], 0.75);
    await page.screenshot({ path: "tmp/mind-selected.png" });
    await page.setViewportSize({ width: 1100, height: 800 });
    await settle(page);
    await page.screenshot({ path: "tmp/mind-small.png" });
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
  const failures = [];
  try {
    await page.route("**/api/ui-settings", (route) => route.fulfill({ json: { ok: true, hasShownStartupTutorial: true, lastTutorialIntroVersion: "1.2.0", dismissedTutorialIntroVersion: "1.2.0" } }));
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
    for (const [name, check] of Object.entries({ navigator: checkNavigator, lines: checkLines, mind: checkMind })) {
      if (only && only !== name) continue;
      try { await check(page); console.log(`${name}: passed`); }
      catch (error) { failures.push(`${name}: ${error.message}`); }
    }
  } finally { await browser.close(); }
  assert.equal(failures.length, 0, failures.join("\n"));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
