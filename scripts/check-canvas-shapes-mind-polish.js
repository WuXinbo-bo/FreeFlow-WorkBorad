"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:53127/canvas-office.html";

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__canvas2dEngine?.getSnapshot);
    await page.evaluate(() => window.__canvas2dEngine.whenReady());

    const geometry = await page.evaluate(async () => {
      const [{ normalizeShapeElement }, { hitTestElement }, { getMindNodeFontSize, getMindNodeStyle }, { applyMindMapAutoLayout }, { createSceneVectorRenderer }] = await Promise.all([
        import("/src/engines/canvas2d-core/elements/shapes.js"),
        import("/src/engines/canvas2d-core/hitTest.js"),
        import("/src/engines/canvas2d-core/elements/mindStyle.js"),
        import("/src/engines/canvas2d-core/elements/mindMap.js"),
        import("/src/engines/canvas2d-core/scene/sceneVectorRenderer.js"),
      ]);
      const diamond = normalizeShapeElement({ id: "rotated-diamond", shapeType: "diamond", x: 200, y: 200, width: 100, height: 100, rotation: 45 });
      const fonts = [0, 1, 2, 3].map(getMindNodeFontSize);
      const tree = [
        { id: "root", type: "mindNode", rootId: "root", childrenIds: ["branch"], depth: 3, fontSize: 12, x: 100, y: 100, width: 220, height: 80, text: "Root", plainText: "Root", html: "<p>Root</p>" },
        { id: "branch", type: "mindNode", rootId: "root", parentId: "root", childrenIds: ["leaf"], depth: 0, fontSize: 12, order: 0, x: 400, y: 100, width: 220, height: 80, text: "Branch", plainText: "Branch", html: "<p>Branch</p>" },
        { id: "leaf", type: "mindNode", rootId: "root", parentId: "branch", childrenIds: [], depth: 0, fontSize: 12, order: 0, x: 700, y: 100, width: 220, height: 80, text: "Leaf", plainText: "Leaf", html: "<p>Leaf</p>" },
      ];
      const laidOut = applyMindMapAutoLayout(tree, "root");
      const normalizedShapes = ["rect", "roundRect", "ellipse", "diamond", "arrow", "line", "highlight"]
        .map((shapeType) => normalizeShapeElement({ id: shapeType, shapeType }).shapeType);
      const rotatedTip = hitTestElement([diamond], { x: 285.35, y: 214.65 }, 1)?.id;
      const rotatedCorner = hitTestElement([diamond], { x: 200, y: 200 }, 1)?.id || "";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      document.body.appendChild(svg);
      const vector = createSceneVectorRenderer({ host: svg });
      vector.sync({
        items: [
          { id: "rect", type: "shape", shapeType: "rect", x: 10, y: 10, width: 80, height: 50, radius: 18 },
          { id: "round", type: "shape", shapeType: "roundRect", x: 100, y: 10, width: 80, height: 50, radius: 28 },
          { id: "diamond", type: "shape", shapeType: "diamond", x: 200, y: 10, width: 80, height: 50 },
          ...laidOut,
        ],
        selectedIds: ["root"],
        view: { scale: 1 },
      });
      const result = {
        normalizedShapes,
        rotatedTip,
        rotatedCorner,
        fonts,
        mind: laidOut.map(({ id, depth, fontSize }) => ({ id, depth, fontSize })),
        rectRadius: svg.querySelector('[data-scene-key="shape:rect"] .canvas2d-scene-shape-body').getAttribute("rx"),
        roundRectRadius: svg.querySelector('[data-scene-key="shape:round"] .canvas2d-scene-shape-body').getAttribute("rx"),
        diamondTag: svg.querySelector('[data-scene-key="shape:diamond"] .canvas2d-scene-shape-body').tagName,
        selectedNode: {
          depth: svg.querySelector('[data-scene-key="mind-node:root"]').dataset.mindDepth,
          selected: svg.querySelector('[data-scene-key="mind-node:root"]').dataset.selected,
          stroke: svg.querySelector('[data-scene-key="mind-node:root"] .canvas2d-scene-mind-node-body').getAttribute("stroke"),
        },
      };
      vector.clear();
      svg.remove();
      return result;
    });
    assert.deepEqual(geometry.normalizedShapes, ["rect", "roundRect", "ellipse", "diamond", "arrow", "line", "highlight"]);
    assert.equal(geometry.rotatedTip, "rotated-diamond", "rotated diamond tip was not hittable");
    assert.equal(geometry.rotatedCorner, "", "rotated diamond accepted a point outside its path");
    assert.deepEqual(geometry.fonts, [22, 18, 16, 15]);
    assert.deepEqual(geometry.mind.map((item) => item.fontSize), [22, 18, 16]);
    assert.notEqual(geometry.rectRadius, geometry.roundRectRadius, "round rectangle is visually identical to rectangle");
    assert.equal(geometry.diamondTag.toLowerCase(), "polygon");
    assert.deepEqual(geometry.selectedNode, { depth: "0", selected: "true", stroke: "#367eaa" });

    await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      engine.loadStructuredBoardForExport({
        items: [
          { id: "shape-a", type: "shape", shapeType: "roundRect", x: 160, y: 180, width: 180, height: 110, radius: 28, strokeColor: "#334155", fillColor: "transparent", strokeWidth: 2 },
          { id: "shape-b", type: "shape", shapeType: "diamond", x: 390, y: 180, width: 160, height: 110, strokeColor: "#334155", fillColor: "transparent", strokeWidth: 2 },
        ],
        selectedIds: ["shape-a", "shape-b"],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
      engine.setTool("select");
    });
    await page.getByRole("toolbar", { name: "图形样式" }).waitFor();
    const toolbarBounds = await page.getByRole("toolbar", { name: "图形样式" }).boundingBox();
    assert(toolbarBounds && toolbarBounds.x >= 0 && toolbarBounds.x + toolbarBounds.width <= 1440, "shape style toolbar escaped the viewport");
    await page.evaluate(() => window.__canvas2dEngine.setSelectedShapeStyle({ strokeColor: "#2563eb", fillColor: "#dbeafe", strokeWidth: 4 }));
    let shapeItems = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items);
    assert(shapeItems.every((item) => item.strokeColor === "#2563eb" && item.fillColor === "#dbeafe" && item.strokeWidth === 4), "batch style was not applied to every selected shape");
    for (let cycle = 0; cycle < 3; cycle += 1) {
      assert(await page.evaluate(() => window.__canvas2dEngine.undo()), "shape style undo failed");
      shapeItems = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items);
      assert(shapeItems.every((item) => item.strokeColor === "#334155" && item.fillColor === "transparent" && item.strokeWidth === 2), "shape style undo did not restore baseline");
      assert(await page.evaluate(() => window.__canvas2dEngine.redo()), "shape style redo failed");
      shapeItems = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items);
      assert(shapeItems.every((item) => item.strokeColor === "#2563eb" && item.fillColor === "#dbeafe" && item.strokeWidth === 4), "shape style redo lost the batch update");
    }
    await page.getByRole("button", { name: "边框颜色：红色" }).click();
    assert((await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items)).every((item) => item.strokeColor === "#dc2626"));

    await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      engine.loadStructuredBoardForExport({
        items: [{ id: "formula", type: "mathBlock", formula: "\\frac{a}{b}=c", fallbackText: "$$\\frac{a}{b}=c$$", displayMode: true, x: 320, y: 260, width: 360, height: 120 }],
        selectedIds: ["formula"],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
      engine.setTool("select");
      engine.runCommand("element.edit");
    });
    const formulaEditor = page.locator("#canvas-text-editor");
    await page.waitForFunction(() => !document.querySelector("#canvas-text-editor")?.classList.contains("is-hidden"));
    const initialMathSize = await formulaEditor.evaluate((node) => ({ fontSize: getComputedStyle(node).fontSize, value: node.value }));
    assert.equal(initialMathSize.fontSize, "15px");
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.evaluate(() => {
        const engine = window.__canvas2dEngine;
        engine.zoomIn(); engine.zoomIn(); engine.zoomOut(); engine.zoomOut();
      });
      await settle(page);
      const currentSize = await formulaEditor.evaluate((node) => ({ fontSize: getComputedStyle(node).fontSize, value: node.value, hidden: node.classList.contains("is-hidden") }));
      assert.equal(currentSize.fontSize, "15px", "math editor font changed with camera zoom");
      assert.equal(currentSize.value, initialMathSize.value, "math draft changed during camera zoom");
      assert.equal(currentSize.hidden, false, "math editor failed to stay active during camera zoom");
    }
    await page.evaluate(() => window.__canvas2dEngine.runCommand("canvas.cancel"));
    await page.waitForFunction(() => !window.__canvas2dEngine.getSnapshot().editingId);
    await page.evaluate(() => window.__canvas2dEngine.runCommand("element.edit"));
    await page.waitForFunction(() => !document.querySelector("#canvas-text-editor")?.classList.contains("is-hidden"));
    assert.equal(await formulaEditor.inputValue(), initialMathSize.value, "math editor draft was not restored on re-entry");
    await page.evaluate(() => window.__canvas2dEngine.runCommand("canvas.cancel"));
    await page.waitForFunction(() => !window.__canvas2dEngine.getSnapshot().editingId);

    await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      engine.loadStructuredBoardForExport({
        items: [
          { id: "mind-root", type: "mindNode", rootId: "mind-root", childrenIds: ["mind-child"], depth: 0, fontSize: 22, x: 180, y: 190, width: 240, height: 92, text: "Project direction", plainText: "Project direction", html: "<p>Project direction</p>" },
          { id: "mind-child", type: "mindNode", rootId: "mind-root", parentId: "mind-root", childrenIds: [], depth: 1, order: 0, fontSize: 18, x: 500, y: 190, width: 220, height: 80, text: "Research", plainText: "Research", html: "<p>Research</p>" },
        ],
        selectedIds: ["mind-root"],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
      engine.setTool("select");
    });
    await page.waitForFunction(() => {
      const node = document.querySelector('.canvas2d-rich-item[data-id="mind-root"]');
      return node && node.dataset.mindDepth === "0";
    });
    const rootTypography = await page.locator('.canvas2d-rich-item[data-id="mind-root"]').evaluate((node) => ({
      fontSize: getComputedStyle(node).fontSize,
      fontWeight: getComputedStyle(node).fontWeight,
      textAlign: getComputedStyle(node).textAlign,
    }));
    assert.equal(rootTypography.fontSize, "22px");
    assert.equal(rootTypography.fontWeight, "700");
    assert.equal(rootTypography.textAlign, "center");

    await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      engine.loadStructuredBoardForExport({
        items: [{ id: "keyboard-root", type: "mindNode", rootId: "keyboard-root", childrenIds: [], depth: 0, fontSize: 22, x: 180, y: 190, width: 240, height: 92, text: "Root", plainText: "Root", html: "<p>Root</p>" }],
        selectedIds: ["keyboard-root"],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
      engine.setTool("select");
    });
    await page.locator("#canvas-office-canvas").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.querySelector("#canvas-rich-editor")?.classList.contains("is-hidden"));
    await page.locator("#canvas-rich-editor").fill("Keyboard child");
    await page.evaluate(() => window.__canvas2dEngine.runCommand("canvas.save"));
    let keyboardNodes = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items);
    const child = keyboardNodes.find((item) => item.id !== "keyboard-root");
    assert.equal(child?.parentId, "keyboard-root", "Enter on root did not create a child node");
    await page.locator("#canvas-office-canvas").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.querySelector("#canvas-rich-editor")?.classList.contains("is-hidden"));
    await page.locator("#canvas-rich-editor").fill("Keyboard sibling");
    await page.evaluate(() => window.__canvas2dEngine.runCommand("canvas.save"));
    keyboardNodes = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items);
    const sibling = keyboardNodes.find((item) => item.id !== "keyboard-root" && item.id !== child.id);
    assert.equal(sibling?.parentId, "keyboard-root", "Enter on child did not create a sibling");
    assert(await page.evaluate(() => window.__canvas2dEngine.undo()), "mind keyboard action undo failed");
    assert.equal((await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items)).some((item) => item.id === sibling.id), false);
    assert(await page.evaluate(() => window.__canvas2dEngine.redo()), "mind keyboard action redo failed");

    await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      engine.loadStructuredBoardForExport({
        items: [{ id: "mind-edit-root", type: "mindNode", rootId: "mind-edit-root", childrenIds: [], depth: 0, fontSize: 22, x: 180, y: 190, width: 240, height: 92, text: "Root", plainText: "Root", html: "<p>Root</p>" }],
        selectedIds: ["mind-edit-root"],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
      engine.setTool("select");
    });
    await page.locator("#canvas-office-canvas").focus();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.keyboard.press("F2");
      await page.waitForFunction(() => !document.querySelector("#canvas-rich-editor")?.classList.contains("is-hidden"));
      assert.equal(await page.locator("#canvas-rich-editor").evaluate((node) => getComputedStyle(node).textAlign), "center");
      await page.evaluate(() => {
        const engine = window.__canvas2dEngine;
        engine.zoomIn(); engine.zoomOut(); engine.zoomIn(); engine.zoomOut();
      });
      await settle(page);
      assert.equal(await page.locator("#canvas-rich-editor").evaluate((node) => node.classList.contains("is-hidden")), false, "mind editor disappeared during repeated zoom");
      await page.evaluate(() => window.__canvas2dEngine.runCommand("canvas.cancel"));
      await page.waitForFunction(() => !window.__canvas2dEngine.getSnapshot().editingId);
    }
    assert.deepEqual(errors, [], "page errors occurred during shape/mind interactions");
    console.log("[check-canvas-shapes-mind-polish] shape geometry, batch styles, undo/redo, math typography/recovery, mind hierarchy and repeated edit/zoom recovery passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
