const assert = require("assert");
const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:53127/canvas-office.html";

async function getItems(page) {
  return page.evaluate(() => globalThis.__canvas2dEngine.getSnapshot().board.items);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message || String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(globalThis.__canvas2dEngine?.getCanvasUiRuntimeSnapshot));
    await page.evaluate(() => {
      globalThis.__canvas2dEngine.loadStructuredBoardForExport({
        items: [
          { id: "command-a", type: "shape", shapeType: "rect", x: 120, y: 140, width: 100, height: 80 },
          { id: "command-b", type: "shape", shapeType: "rect", x: 380, y: 280, width: 140, height: 90 },
          { id: "command-c", type: "shape", shapeType: "rect", x: 780, y: 430, width: 120, height: 100 },
        ],
        selectedIds: ["command-a", "command-b", "command-c"],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
    });

    const runtime = await page.evaluate(() => globalThis.__canvas2dEngine.getCanvasUiRuntimeSnapshot());
    const registeredHosts = runtime.hosts.filter((entry) => entry.registered).map((entry) => entry.kind);
    assert.deepStrictEqual(registeredHosts.sort(), ["context-menu", "editor", "inspector", "shortcut", "toolbar"].sort());
    const commandIds = runtime.commands.map((command) => command.id);
    runtime.elements.forEach((element) => {
      element.commands.forEach((id) => {
        assert(commandIds.includes(id), `${element.type} references unregistered command ${id}`);
      });
    });
    [
      "selection.align-left",
      "selection.align-center",
      "selection.align-right",
      "selection.align-top",
      "selection.align-middle",
      "selection.align-bottom",
      "selection.distribute-horizontal",
      "selection.distribute-vertical",
      "selection.group-toggle",
      "selection.layer-up",
      "selection.layer-down",
    ].forEach((id) => assert(commandIds.includes(id), `missing command ${id}`));
    assert.strictEqual(runtime.commands.find((command) => command.id === "selection.distribute-horizontal")?.enabled, true);

    const original = await getItems(page);
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("selection.align-right"));
    const aligned = await getItems(page);
    assert.strictEqual(new Set(aligned.map((item) => item.x + item.width)).size, 1);
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
    assert.deepStrictEqual((await getItems(page)).map((item) => item.x), original.map((item) => item.x));

    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("selection.distribute-horizontal"));
    const distributed = (await getItems(page)).slice().sort((left, right) => left.x - right.x);
    const firstGap = distributed[1].x - (distributed[0].x + distributed[0].width);
    const secondGap = distributed[2].x - (distributed[1].x + distributed[1].width);
    assert(Math.abs(firstGap - secondGap) < 0.01);
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("selection.group-toggle"));
      const grouped = await getItems(page);
      assert(grouped.every((item) => item.groupId && item.groupId === grouped[0].groupId));
      await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("selection.group-toggle"));
      assert((await getItems(page)).every((item) => !item.groupId));
    }

    await page.evaluate(() => {
      globalThis.__canvas2dEngine.loadStructuredBoardForExport({
        items: [
          { id: "command-a", type: "shape", shapeType: "rect", x: 120, y: 140, width: 100, height: 80 },
          { id: "command-b", type: "shape", shapeType: "rect", x: 380, y: 280, width: 140, height: 90 },
          { id: "command-c", type: "shape", shapeType: "rect", x: 780, y: 430, width: 120, height: 100 },
        ],
        selectedIds: ["command-a"],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
      globalThis.__canvas2dEngine.runCommand("selection.layer-front");
    });
    assert.strictEqual((await getItems(page)).at(-1).id, "command-a");
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
    assert.deepStrictEqual((await getItems(page)).map((item) => item.id), ["command-a", "command-b", "command-c"]);

    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("selection.toggle-lock"));
    assert.strictEqual((await getItems(page)).find((item) => item.id === "command-a").locked, true);
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
    assert.strictEqual(Boolean((await getItems(page)).find((item) => item.id === "command-a").locked), false);

    await page.evaluate(() => {
      globalThis.__canvas2dEngine.loadStructuredBoardForExport({
        items: [
          { id: "locked", type: "shape", shapeType: "rect", x: 120, y: 140, width: 100, height: 80, locked: true },
          { id: "mutable-a", type: "shape", shapeType: "rect", x: 380, y: 280, width: 140, height: 90 },
          { id: "mutable-b", type: "shape", shapeType: "rect", x: 780, y: 430, width: 120, height: 100 },
        ],
        selectedIds: ["locked", "mutable-a", "mutable-b"],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
    });
    const lockedBaseline = await getItems(page);
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("selection.align-left"));
    let lockedResult = await getItems(page);
    assert.deepStrictEqual(lockedResult.find((item) => item.id === "locked"), lockedBaseline.find((item) => item.id === "locked"));
    assert.strictEqual(
      lockedResult.find((item) => item.id === "mutable-a").x,
      lockedResult.find((item) => item.id === "mutable-b").x
    );
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
    assert.deepStrictEqual(await getItems(page), lockedBaseline);

    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("selection.group"));
    lockedResult = await getItems(page);
    assert.strictEqual(Boolean(lockedResult.find((item) => item.id === "locked").groupId), false);
    assert(lockedResult.find((item) => item.id === "mutable-a").groupId);
    assert.strictEqual(
      lockedResult.find((item) => item.id === "mutable-a").groupId,
      lockedResult.find((item) => item.id === "mutable-b").groupId
    );
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
    assert.deepStrictEqual(await getItems(page), lockedBaseline);

    await page.evaluate(() => {
      globalThis.__canvas2dEngine.loadStructuredBoardForExport({
        items: [
          { id: "locked-a", type: "shape", shapeType: "rect", x: 100, y: 100, width: 80, height: 80, locked: true },
          { id: "locked-b", type: "shape", shapeType: "rect", x: 300, y: 240, width: 80, height: 80, locked: true },
        ],
        selectedIds: ["locked-a", "locked-b"],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
    });
    let lockedRuntime = await page.evaluate(() => globalThis.__canvas2dEngine.getCanvasUiRuntimeSnapshot());
    assert.strictEqual(lockedRuntime.commands.find((command) => command.id === "selection.align-left")?.enabled, false);
    assert.strictEqual(lockedRuntime.commands.find((command) => command.id === "selection.layer-front")?.enabled, false);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("selection.toggle-lock"));
      lockedRuntime = await page.evaluate(() => globalThis.__canvas2dEngine.getCanvasUiRuntimeSnapshot());
      assert.strictEqual(lockedRuntime.commands.find((command) => command.id === "selection.align-left")?.enabled, true);
      await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("selection.toggle-lock"));
      lockedRuntime = await page.evaluate(() => globalThis.__canvas2dEngine.getCanvasUiRuntimeSnapshot());
      assert.strictEqual(lockedRuntime.commands.find((command) => command.id === "selection.align-left")?.enabled, false);
    }

    await page.evaluate(() => {
      globalThis.__canvas2dEngine.loadStructuredBoardForExport({
        items: [
          { id: "command-a", type: "shape", shapeType: "rect", x: 120, y: 140, width: 100, height: 80 },
          { id: "command-b", type: "shape", shapeType: "rect", x: 380, y: 280, width: 140, height: 90 },
          { id: "command-c", type: "shape", shapeType: "rect", x: 780, y: 430, width: 120, height: 100 },
        ],
        selectedIds: ["command-a", "command-b", "command-c"],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
      document.querySelector("#canvas-office-canvas").dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 160,
        clientY: 180,
        button: 2,
      }));
    });
    const alignmentActions = await page.locator("#canvas2d-context-menu [data-action^='align-']").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-action"))
    );
    assert.deepStrictEqual(alignmentActions, [
      "align-left",
      "align-center",
      "align-right",
      "align-top",
      "align-middle",
      "align-bottom",
    ]);
    assert.deepStrictEqual(pageErrors, []);
    console.log("[check-canvas-command-integration] ok");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[check-canvas-command-integration] ${error.stack || error.message}`);
  process.exitCode = 1;
});
