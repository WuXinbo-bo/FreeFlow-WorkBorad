const assert = require("assert");

async function main() {
  const { createElementTypeRegistry } = await import(
    "../public/src/engines/canvas2d-core/runtime/elementTypeRegistry.js"
  );
  const { createElementLifecycleManager } = await import(
    "../public/src/engines/canvas2d-core/runtime/elementLifecycleManager.js"
  );
  const { createFrameContext } = await import(
    "../public/src/engines/canvas2d-core/runtime/frameContext.js"
  );
  const { createElementInvalidation, invalidationToRenderPatch } = await import(
    "../public/src/engines/canvas2d-core/runtime/elementInvalidation.js"
  );
  const { createElementResourceManager } = await import(
    "../public/src/engines/canvas2d-core/runtime/elementResourceManager.js"
  );
  const { createElementAdapterManager } = await import(
    "../public/src/engines/canvas2d-core/runtime/elementAdapterManager.js"
  );
  const { createScenePresentationCoordinator } = await import(
    "../public/src/engines/canvas2d-core/scene/scenePresentationCoordinator.js"
  );

  const transitions = [];
  const registry = createElementTypeRegistry({ fallbackType: "text" });
  registry.register({
    type: "text",
    aliases: ["richText"],
    normalize: (item) => ({ ...item, type: "text" }),
    getBounds: (item) => ({ left: item.x, top: item.y, right: item.x + item.width, bottom: item.y + item.height }),
    translate: (item, dx, dy) => ({ ...item, x: item.x + dx, y: item.y + dy }),
    capabilities: { render: "canvas-dom", hitTest: "bounds", editor: "rich-text", overlay: "rich" },
    lifecycle: {
      onEnter: (_item, context) => transitions.push(`${context.itemId}:${context.from}->${context.to}`),
    },
  });
  registry.register({
    type: "image",
    normalize: (item) => ({ ...item, type: "image" }),
    getBounds: (item) => ({ left: item.x, top: item.y, right: item.x + item.width, bottom: item.y + item.height }),
    translate: (item, dx, dy) => ({ ...item, x: item.x + dx, y: item.y + dy }),
    capabilities: { resource: "image" },
  });
  registry.register({
    type: "shape",
    normalize: (item) => ({ ...item, type: "shape" }),
    getBounds: (item) => ({ left: item.x, top: item.y, right: item.x + item.width, bottom: item.y + item.height }),
    translate: (item, dx, dy) => ({ ...item, x: item.x + dx, y: item.y + dy }),
    capabilities: { render: "canvas", hitTest: "path", editor: "none", overlay: "none" },
  });
  assert.strictEqual(registry.resolve("richText").type, "text");
  assert.strictEqual(registry.resolve("unknown").type, "text");
  assert.strictEqual(registry.validate().ok, true);
  assert.deepStrictEqual(registry.invoke({ type: "shape", x: 1, y: 2 }, "translate", 3, 4), {
    type: "shape",
    x: 4,
    y: 6,
  });
  const registryRevision = registry.getRevision();
  assert.throws(() => registry.register({
    type: "sticker",
    aliases: ["shape"],
    normalize: (entry) => entry,
    getBounds: () => ({}),
    translate: (entry) => entry,
  }), /already registered/);
  assert.strictEqual(registry.resolve("sticker", { fallback: false }), null);
  assert.strictEqual(registry.resolve("shape", { fallback: false })?.type, "shape");
  assert.strictEqual(registry.getRevision(), registryRevision);

  const frame = createFrameContext({
    frameId: 7,
    view: { scale: 1.25, offsetX: 12, offsetY: 18 },
    sceneRevision: 4,
  });
  assert.strictEqual(Object.isFrozen(frame), true);
  assert.strictEqual(Object.isFrozen(frame.view), true);

  const presentation = createScenePresentationCoordinator({
    view: { scale: 1, offsetX: 10, offsetY: 20 },
    viewport: { width: 800, height: 600, pixelRatio: 1 },
  });
  const initialPresentation = presentation.getSnapshot();
  assert.strictEqual(Object.isFrozen(initialPresentation), true);
  assert.strictEqual(initialPresentation.cameraMatrix.css, "matrix(1, 0, 0, 1, 10, 20)");
  presentation.updateViewport({ width: 960, height: 640, pixelRatio: 2 });
  const resizedPresentation = presentation.getSnapshot();
  assert.strictEqual(resizedPresentation.cameraRevision, initialPresentation.cameraRevision);
  assert.strictEqual(resizedPresentation.viewportRevision, initialPresentation.viewportRevision + 1);
  assert.deepStrictEqual(resizedPresentation.camera, initialPresentation.camera);
  presentation.updateCamera({ scale: 1.25, offsetX: 12, offsetY: 24 });
  assert.strictEqual(presentation.getSnapshot().cameraRevision, initialPresentation.cameraRevision + 1);

  const firstSession = presentation.beginInteraction("pointer-pan");
  assert.strictEqual(presentation.getSnapshot().interaction.phase, "active");
  assert.strictEqual(presentation.settleInteraction(firstSession), true);
  assert.strictEqual(presentation.getSnapshot().interaction.phase, "settling");
  const secondSession = presentation.beginInteraction("wheel-zoom");
  assert.notStrictEqual(secondSession, firstSession);
  assert.strictEqual(presentation.finishInteraction(firstSession), false);
  assert.strictEqual(presentation.getSnapshot().interaction.phase, "active");
  assert.strictEqual(presentation.settleInteraction(secondSession), true);
  assert.strictEqual(presentation.finishInteraction(secondSession), true);
  assert.strictEqual(presentation.getSnapshot().interaction.phase, "steady");

  const lifecycle = createElementLifecycleManager({ registry });
  const item = { id: "a", type: "text", x: 0, y: 0, width: 10, height: 10 };
  lifecycle.reconcile({ items: [item], visibleIds: ["a"], frameContext: frame });
  assert.strictEqual(lifecycle.getState("a"), "visible");
  lifecycle.reconcile({ items: [item], visibleIds: ["a"], interactingIds: ["a"], frameContext: frame });
  assert.strictEqual(lifecycle.getState("a"), "interacting");
  lifecycle.reconcile({ items: [item], visibleIds: ["a"], frameContext: frame });
  assert.strictEqual(lifecycle.getState("a"), "settling");
  lifecycle.finishSettling(frame);
  assert.strictEqual(lifecycle.getState("a"), "visible");
  for (let index = 0; index < 4; index += 1) {
    lifecycle.reconcile({ items: [item], visibleIds: ["a"], editingId: "a", frameContext: frame });
    lifecycle.reconcile({ items: [item], visibleIds: ["a"], frameContext: frame });
    lifecycle.finishSettling(frame);
  }
  assert.strictEqual(lifecycle.getState("a"), "visible");
  lifecycle.reconcile({ items: [], visibleIds: [], frameContext: frame });
  assert.strictEqual(lifecycle.getState("a"), "unmounted");
  assert(transitions.includes("a:interacting->settling"));
  assert(transitions.includes("a:settling->visible"));

  const manyItems = Array.from({ length: 1000 }, (_, index) => ({
    id: `bulk-${index}`,
    type: "text",
    x: index,
    y: index,
    width: 10,
    height: 10,
  }));
  const bulkSnapshot = lifecycle.reconcile({
    items: manyItems,
    visibleIds: ["bulk-4", "bulk-8"],
    sceneRevision: 9,
    frameContext: frame,
  });
  assert.strictEqual(bulkSnapshot.stats.totalElements, 1000);
  assert.strictEqual(bulkSnapshot.stats.evaluatedElements, 2);

  const patch = invalidationToRenderPatch(
    createElementInvalidation(["geometry", "overlay"], ["a", "a"])
  );
  assert.deepStrictEqual(patch.itemIds, ["a"]);
  assert.strictEqual(patch.sceneDirty, true);
  assert.strictEqual(patch.hitTestDirty, true);
  assert.strictEqual(patch.overlayDirty, true);

  const adapters = createElementAdapterManager();
  const adapterCalls = [];
  const removeBaseAdapter = adapters.register("editor", { run: () => adapterCalls.push("base") });
  const removeOverrideAdapter = adapters.register("editor", { run: () => adapterCalls.push("override") });
  adapters.invoke("editor", "run");
  assert.strictEqual(removeOverrideAdapter(), true);
  adapters.invoke("editor", "run");
  assert.strictEqual(removeOverrideAdapter(), false);
  assert.strictEqual(removeBaseAdapter(), true);
  assert.deepStrictEqual(adapterCalls, ["override", "base"]);

  const resourceSyncs = [];
  const resources = createElementResourceManager({ registry });
  const removeBaseResource = resources.register("image", {
    sync: (items, context) => resourceSyncs.push(`base:${context.sceneRevision}:${items.map((entry) => entry.id).join(",")}`),
  });
  const removeOverrideResource = resources.register("image", {
    sync: (items, context) => resourceSyncs.push(`override:${context.sceneRevision}:${items.map((entry) => entry.id).join(",")}`),
  });
  resources.sync([{ id: "image-a", type: "image" }], { sceneRevision: 1 });
  resources.sync([{ id: "image-a", type: "image" }], { sceneRevision: 1 });
  assert.strictEqual(removeOverrideResource(), true);
  resources.sync([{ id: "image-a", type: "image" }], { sceneRevision: 1 });
  resources.sync([], { sceneRevision: 2 });
  resources.sync([{ id: "image-a", type: "image" }], { sceneRevision: 3 });
  assert.deepStrictEqual(resourceSyncs, [
    "override:1:image-a",
    "base:1:image-a",
    "base:2:",
    "base:3:image-a",
  ]);
  assert.strictEqual(removeBaseResource(), true);

  const disposable = registry.clone();
  assert.strictEqual(disposable.unregister("shape"), true);
  assert.strictEqual(disposable.resolve("shape").type, "text");

  console.log("[check-element-runtime-architecture] ok");
}

main().catch((error) => {
  console.error(`[check-element-runtime-architecture] ${error.stack || error.message}`);
  process.exitCode = 1;
});
