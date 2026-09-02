const assert = require("assert");

async function main() {
  const { canvasElementRegistry } = await import(
    "../public/src/engines/canvas2d-core/elements/index.js"
  );
  const { createCanvasUiRuntime, CANVAS_UI_HOST_KINDS } = await import(
    "../public/src/engines/canvas2d-core/uiRuntime/canvasUiRuntime.js"
  );
  const { getCanvasShortcutFromEvent, normalizeCanvasShortcut } = await import(
    "../public/src/engines/canvas2d-core/uiRuntime/commandRegistry.js"
  );
  const { createCanvas2DReactBridge } = await import(
    "../public/src/engines/canvas2d-core/reactBridge.js"
  );

  const runtime = createCanvasUiRuntime({ elementRegistry: canvasElementRegistry });
  const calls = [];
  const remove = runtime.commands.register({
    id: "selection.delete",
    label: "删除",
    category: "selection",
    destructive: true,
    shortcuts: ["Delete"],
    when: (context) => context.selectedCount > 0,
    execute: (context, reason) => calls.push(`${context.selectedCount}:${reason}`),
  });
  assert.strictEqual(runtime.commands.canRun("selection.delete", { selectedCount: 0 }), false);
  assert.strictEqual(runtime.commands.canRun("selection.delete", { selectedCount: 2 }), true);
  runtime.commands.run("selection.delete", { selectedCount: 2 }, "keyboard");
  assert.deepStrictEqual(calls, ["2:keyboard"]);
  assert.strictEqual(normalizeCanvasShortcut("command+shift+z"), "Ctrl+Shift+Z");
  assert.strictEqual(
    getCanvasShortcutFromEvent({ key: "Tab", shiftKey: true, ctrlKey: false, metaKey: false, altKey: false }),
    "Shift+Tab"
  );
  assert.strictEqual(runtime.commands.resolveShortcut("Delete", { selectedCount: 2 })?.id, "selection.delete");
  assert.strictEqual(runtime.commands.resolveShortcut("Delete", { selectedCount: 0 }), null);
  assert.strictEqual(runtime.commands.list({ selectedCount: 0 })[0].enabled, false);
  assert.throws(() => runtime.commands.register({ id: "selection.delete", execute() {} }), /already registered/);

  const snapshot = runtime.getSnapshot({ selectedCount: 1 });
  assert.strictEqual(Object.isFrozen(snapshot), true);
  assert.strictEqual(snapshot.elements.length, 13);
  snapshot.elements.forEach((entry) => {
    assert(entry.type);
    assert(entry.inspector);
    assert(entry.contextMenu);
    assert(entry.acceptance.length > 0, `${entry.type} acceptance contract is empty`);
  });
  assert.strictEqual(runtime.getElementUx("fileCard").preview, "document");
  assert.strictEqual(runtime.getElementUx("mathBlock").editor, "math");
  assert.deepStrictEqual(snapshot.hosts.map((entry) => entry.kind), CANVAS_UI_HOST_KINDS);
  assert.strictEqual(snapshot.input.mouse, true);
  assert.strictEqual(snapshot.input.touch, false);
  assert.strictEqual(snapshot.input.pinchZoom, false);
  assert.strictEqual(snapshot.input.pen, false);
  assert.deepStrictEqual(snapshot.input.reserved, ["touch", "pinchZoom", "pen"]);

  const host = {};
  const unregisterHost = runtime.registerHost("toolbar", host);
  assert.strictEqual(runtime.getHost("toolbar"), host);
  assert.strictEqual(unregisterHost(), true);
  assert.strictEqual(runtime.getHost("toolbar"), null);
  assert.strictEqual(remove(), true);
  assert.strictEqual(remove(), false);

  const commandCalls = [];
  const bridge = createCanvas2DReactBridge({
    runCommand(id, ...args) {
      commandCalls.push([id, ...args]);
      return id;
    },
  });
  bridge.copySelection();
  bridge.pasteSelection({ x: 12, y: 18 });
  bridge.toggleSelectionLock();
  bridge.toggleSelectionGroup();
  bridge.alignSelection("right");
  bridge.distributeSelection("vertical");
  bridge.moveSelectionLayer("up");
  assert.deepStrictEqual(commandCalls, [
    ["selection.copy"],
    ["selection.paste", { x: 12, y: 18 }],
    ["selection.toggle-lock"],
    ["selection.group-toggle"],
    ["selection.align-right"],
    ["selection.distribute-vertical"],
    ["selection.layer-up"],
  ]);
  console.log("[check-canvas-ui-runtime] ok");
}

main().catch((error) => {
  console.error(`[check-canvas-ui-runtime] ${error.stack || error.message}`);
  process.exitCode = 1;
});
