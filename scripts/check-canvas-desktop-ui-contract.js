const assert = require("assert");
const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:3000/canvas-office.html";

function createMixedItems({ lockedText = true } = {}) {
  return [
    {
      id: "desktop-shape",
      type: "shape",
      shapeType: "rect",
      x: 120,
      y: 140,
      width: 120,
      height: 80,
      fill: "#ffffff",
      strokeColor: "#2563eb",
    },
    {
      id: "desktop-text",
      type: "text",
      x: 380,
      y: 260,
      width: 180,
      height: 48,
      plainText: "Desktop focus contract",
      text: "Desktop focus contract",
      html: "<div>Desktop focus contract</div>",
      locked: lockedText,
    },
  ];
}

async function loadBoard(page, items, selectedIds) {
  await page.evaluate(({ nextItems, nextSelectedIds }) => {
    globalThis.__canvas2dEngine.loadStructuredBoardForExport({
      items: nextItems,
      selectedIds: nextSelectedIds,
      view: { scale: 1, offsetX: 0, offsetY: 0 },
    });
  }, { nextItems: items, nextSelectedIds: selectedIds });
  await page.waitForTimeout(120);
}

async function getItems(page) {
  return page.evaluate(() => globalThis.__canvas2dEngine.getSnapshot().board.items);
}

async function runEnabledCommand(page, commandId, ...args) {
  await page.waitForFunction(
    (targetId) => globalThis.__canvas2dEngine.getCommandState(targetId)?.enabled === true,
    commandId
  );
  const result = await page.evaluate(
    ({ targetId, commandArgs }) => globalThis.__canvas2dEngine.runCommand(targetId, ...commandArgs),
    { targetId: commandId, commandArgs: args }
  );
  assert.notStrictEqual(result, false, `${commandId} should execute when enabled`);
  return result;
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

    await loadBoard(page, createMixedItems(), ["desktop-shape", "desktop-text"]);
    const runtime = await page.evaluate(() => globalThis.__canvas2dEngine.getCanvasUiRuntimeSnapshot());
    const byId = new Map(runtime.commands.map((command) => [command.id, command]));
    assert.deepStrictEqual(byId.get("selection.toggle-lock")?.shortcuts, ["Ctrl+L"]);
    assert.deepStrictEqual(byId.get("selection.next")?.shortcuts, ["Tab"]);
    assert.deepStrictEqual(byId.get("selection.previous")?.shortcuts, ["Shift+Tab"]);
    assert.strictEqual(byId.has("ui.focus-inspector"), false);
    assert.deepStrictEqual(byId.get("ui.search")?.shortcuts, ["Ctrl+K"]);

    assert.strictEqual(await page.locator("[data-canvas-inspector-host]").count(), 0);

    const canvas = page.locator("#canvas-office-canvas");
    await canvas.focus();
    await page.keyboard.press("Tab");
    assert.deepStrictEqual(
      await page.evaluate(() => globalThis.__canvas2dEngine.getSnapshot().board.selectedIds),
      ["desktop-shape"]
    );
    await page.keyboard.press("Tab");
    assert.deepStrictEqual(
      await page.evaluate(() => globalThis.__canvas2dEngine.getSnapshot().board.selectedIds),
      ["desktop-text"]
    );
    await page.keyboard.press("Shift+Tab");
    assert.deepStrictEqual(
      await page.evaluate(() => globalThis.__canvas2dEngine.getSnapshot().board.selectedIds),
      ["desktop-shape"]
    );

    await loadBoard(page, createMixedItems({ lockedText: false }), ["desktop-shape", "desktop-text"]);
    const beforeMove = await getItems(page);
    await runEnabledCommand(page, "selection.set-geometry", { x: 200 });
    const moved = await getItems(page);
    assert.strictEqual(moved.find((item) => item.id === "desktop-shape").x, 200);
    assert.strictEqual(moved.find((item) => item.id === "desktop-text").x, 460);
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
    assert.deepStrictEqual(
      (await getItems(page)).map((item) => ({ id: item.id, x: item.x })),
      beforeMove.map((item) => ({ id: item.id, x: item.x }))
    );

    await loadBoard(page, createMixedItems(), ["desktop-shape", "desktop-text"]);
    await runEnabledCommand(page, "selection.set-locked", true);
    assert.strictEqual((await getItems(page)).every((item) => item.locked === true), true);
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
    assert.strictEqual((await getItems(page)).find((item) => item.id === "desktop-shape").locked === true, false);
    assert.strictEqual((await getItems(page)).find((item) => item.id === "desktop-text").locked === true, true);

    await loadBoard(page, createMixedItems({ lockedText: false }), ["desktop-shape", "desktop-text"]);
    await runEnabledCommand(page, "selection.group");
    const grouped = await getItems(page);
    assert(grouped.every((item) => item.groupId && item.groupId === grouped[0].groupId));
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
    assert.strictEqual((await getItems(page)).every((item) => !item.groupId), true);

    await loadBoard(page, createMixedItems({ lockedText: false }), ["desktop-shape", "desktop-text"]);
    await runEnabledCommand(page, "selection.align-left");
    assert.deepStrictEqual((await getItems(page)).map((item) => item.x), [120, 120]);
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
    assert.deepStrictEqual((await getItems(page)).map((item) => item.x), [120, 380]);

    await loadBoard(page, createMixedItems({ lockedText: false }), ["desktop-shape"]);
    await runEnabledCommand(page, "selection.layer-front");
    assert.deepStrictEqual((await getItems(page)).map((item) => item.id), ["desktop-text", "desktop-shape"]);
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
    assert.deepStrictEqual((await getItems(page)).map((item) => item.id), ["desktop-shape", "desktop-text"]);

    await canvas.focus();
    await page.keyboard.press("Control+K");
    await page.locator(".canvas2d-engine-search-panel").waitFor({ state: "visible" });
    await page.keyboard.press("Control+K");
    await page.locator(".canvas2d-engine-search-panel").waitFor({ state: "hidden" });

    await loadBoard(page, [createMixedItems({ lockedText: false })[1]], ["desktop-text"]);
    await canvas.focus();
    await page.keyboard.press("Enter");
    await page.locator("#canvas-rich-editor").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !globalThis.__canvas2dEngine.getSnapshot().editingId);
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), "canvas-office-canvas");

    assert.deepStrictEqual(pageErrors, []);
    console.log("[check-canvas-desktop-ui-contract] ok");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[check-canvas-desktop-ui-contract] ${error.stack || error.message}`);
  process.exitCode = 1;
});
