const assert = require("assert");

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createFakeNode() {
  const ownerDocument = {
    createElement: () => ({ className: "", style: {}, src: "", alt: "", draggable: true }),
  };
  return {
    dataset: {},
    children: [],
    isConnected: true,
    ownerDocument,
    style: {},
    replaceChildren(...children) {
      this.children = children;
    },
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  const { createPresentationSnapshotController } = await import(
    "../public/src/engines/canvas2d-core/overlay/presentationSnapshotController.js"
  );
  const requests = new Map();
  const controller = createPresentationSnapshotController({
    capture: (_, { density }) => {
      const request = createDeferred();
      request.density = density;
      requests.set(requests.size + 1, request);
      return request.promise;
    },
    cacheLimit: 2,
  });
  const node = createFakeNode();

  controller.prepare(node, {
    plannedRepresentation: "exact-snapshot",
    signature: "v1",
    generation: 1,
  });
  assert.strictEqual(controller.commit(node, {
    plannedRepresentation: "exact-snapshot",
    signature: "v1",
    generation: 1,
    density: 0.5,
  }), true);
  assert.strictEqual(node.dataset.activeRepresentation, "live-detail", "pending snapshot hid live detail");
  controller.prepare(node, {
    plannedRepresentation: "live-detail",
    signature: "v1",
    generation: 2,
  });
  await flushPromises();
  requests.get(1).resolve({ dataUrl: "data:image/png;base64,stale" });
  await flushPromises();
  assert.strictEqual(node.dataset.activeRepresentation, "live-detail", "stale snapshot replaced restored detail");
  assert.strictEqual(node.children.length, 0, "stale snapshot inserted a node");

  controller.prepare(node, {
    plannedRepresentation: "exact-snapshot",
    signature: "v2",
    generation: 3,
  });
  controller.commit(node, {
    plannedRepresentation: "exact-snapshot",
    signature: "v2",
    generation: 3,
    density: 0.75,
  });
  await flushPromises();
  requests.get(2).resolve({ dataUrl: "data:image/png;base64,current" });
  await flushPromises();
  assert.strictEqual(node.dataset.activeRepresentation, "exact-snapshot", "ready snapshot was not committed");
  assert.strictEqual(node.children.length, 1, "snapshot was not atomically inserted");
  assert.strictEqual(node.children[0].src, "data:image/png;base64,current");

  node.dataset.contentMode = "snapshot";
  controller.prepare(node, {
    plannedRepresentation: "live-detail",
    signature: "v2",
    generation: 4,
  });
  assert.strictEqual(node.dataset.activeRepresentation, "live-detail", "detail representation did not recover");
  assert.strictEqual(node.children.length, 0, "snapshot node survived detail recovery");
  assert.strictEqual(node.dataset.contentMode, undefined, "stale snapshot content state survived recovery");

  controller.prepare(node, {
    plannedRepresentation: "exact-snapshot",
    signature: "v3",
    generation: 5,
  });
  controller.commit(node, {
    plannedRepresentation: "exact-snapshot",
    signature: "v3",
    generation: 5,
  });
  controller.prepare(node, {
    plannedRepresentation: "exact-snapshot",
    signature: "v4",
    generation: 6,
  });
  controller.commit(node, {
    plannedRepresentation: "exact-snapshot",
    signature: "v4",
    generation: 6,
  });
  await flushPromises();
  requests.get(3).resolve({ dataUrl: "data:image/png;base64,old-generation" });
  await flushPromises();
  assert.strictEqual(node.dataset.activeRepresentation, "live-detail", "superseded generation was committed");
  requests.get(4).resolve({ dataUrl: "data:image/png;base64,new-generation" });
  await flushPromises();
  assert.strictEqual(node.dataset.activeRepresentation, "exact-snapshot", "latest generation was not committed");
  assert.strictEqual(node.children[0].src, "data:image/png;base64,new-generation");

  controller.prepare(node, {
    plannedRepresentation: "live-detail",
    generation: 7,
  });
  controller.prepare(node, {
    plannedRepresentation: "exact-snapshot",
    signature: "v4",
    generation: 8,
  });
  assert.strictEqual(controller.commit(node, {
    plannedRepresentation: "exact-snapshot",
    signature: "v4",
    generation: 8,
  }), true, "cached snapshot was not reused");
  assert.strictEqual(node.dataset.activeRepresentation, "exact-snapshot", "cached snapshot was not committed synchronously");
  assert.strictEqual(controller.getSnapshot().cacheSize, 2, "snapshot cache limit was not enforced");

  console.log("[check-presentation-snapshot-controller] ok");
}

main().catch((error) => {
  console.error(`[check-presentation-snapshot-controller] ${error.stack || error.message}`);
  process.exitCode = 1;
});
