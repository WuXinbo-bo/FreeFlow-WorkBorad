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
    scheduleWork: (callback) => {
      const id = setTimeout(callback, 0);
      return () => clearTimeout(id);
    },
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
  await flushPromises();
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
  await flushPromises();
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
  await flushPromises();
  assert.strictEqual(node.dataset.activeRepresentation, "live-detail", "superseded generation was committed");
  assert(requests.has(4), "snapshot queue did not advance after the stale capture completed");
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
  assert(controller.getCacheStats().byteSize > 0, "snapshot cache did not account for retained bytes");
  assert.strictEqual(controller.getCacheStats().maxEntries, 2, "snapshot cache lost its entry budget");

  controller.prepare(node, {
    plannedRepresentation: "frozen-detail",
    signature: "",
    generation: 8,
  });
  assert.strictEqual(node.dataset.activeRepresentation, "frozen-detail", "frozen detail was reported as live detail");

  const queuedRequests = [];
  const scheduledWork = [];
  const queuedController = createPresentationSnapshotController({
    capture: (targetNode) => {
      const request = createDeferred();
      request.node = targetNode;
      queuedRequests.push(request);
      return request.promise;
    },
    scheduleWork: (callback) => {
      scheduledWork.push(callback);
      return () => {};
    },
  });
  const queuedNodes = [createFakeNode(), createFakeNode()];
  queuedController.setPaused(true);
  queuedNodes.forEach((queuedNode, index) => {
    const signature = `queued-${index}`;
    queuedController.prepare(queuedNode, {
      plannedRepresentation: "exact-snapshot",
      signature,
      generation: 1,
    });
    queuedController.commit(queuedNode, {
      plannedRepresentation: "exact-snapshot",
      signature,
      generation: 1,
    });
  });
  assert.deepStrictEqual(
    queuedController.getSnapshot(),
    { cacheSize: 0, pendingCount: 2, queuedCount: 2, activeCount: 0, paused: true },
    "paused snapshot controller started capture work"
  );
  queuedController.setPaused(false);
  assert.strictEqual(scheduledWork.length, 1, "snapshot queue did not schedule idle work after recovery");
  scheduledWork.shift()();
  await flushPromises();
  assert.strictEqual(queuedRequests.length, 1, "snapshot queue exceeded single-capture concurrency");
  queuedRequests[0].resolve({ dataUrl: "data:image/png;base64,queued-0" });
  await flushPromises();
  assert.strictEqual(scheduledWork.length, 1, "snapshot queue did not schedule the next idle capture");
  scheduledWork.shift()();
  await flushPromises();
  assert.strictEqual(queuedRequests.length, 2, "snapshot queue did not resume its second capture");
  queuedRequests[1].resolve({ dataUrl: "data:image/png;base64,queued-1" });
  await flushPromises();
  assert.deepStrictEqual(
    queuedController.getSnapshot(),
    { cacheSize: 2, pendingCount: 0, queuedCount: 0, activeCount: 0, paused: false },
    "snapshot queue retained work after both captures completed"
  );

  const canceledRequests = [];
  const canceledController = createPresentationSnapshotController({
    capture: () => {
      canceledRequests.push(true);
      return Promise.resolve({ dataUrl: "data:image/png;base64,unexpected" });
    },
    scheduleWork: () => () => {},
  });
  const canceledNode = createFakeNode();
  canceledController.setPaused(true);
  canceledController.prepare(canceledNode, {
    plannedRepresentation: "exact-snapshot",
    signature: "canceled",
    generation: 1,
  });
  canceledController.commit(canceledNode, {
    plannedRepresentation: "exact-snapshot",
    signature: "canceled",
    generation: 1,
  });
  canceledController.remove(canceledNode);
  await flushPromises();
  canceledController.setPaused(false);
  assert.deepStrictEqual(
    canceledController.getSnapshot(),
    { cacheSize: 0, pendingCount: 0, queuedCount: 0, activeCount: 0, paused: false },
    "removed node retained a stale queued snapshot"
  );
  assert.strictEqual(canceledRequests.length, 0, "removed node started a stale snapshot capture");

  const stableGenerationRequest = createDeferred();
  const stableGenerationController = createPresentationSnapshotController({
    capture: () => stableGenerationRequest.promise,
    scheduleWork: (callback) => {
      callback();
      return () => {};
    },
  });
  const stableGenerationNode = createFakeNode();
  stableGenerationController.prepare(stableGenerationNode, {
    plannedRepresentation: "exact-snapshot",
    signature: "same-content",
    generation: 1,
  });
  stableGenerationController.commit(stableGenerationNode, {
    plannedRepresentation: "exact-snapshot",
    signature: "same-content",
    generation: 1,
  });
  stableGenerationController.prepare(stableGenerationNode, {
    plannedRepresentation: "exact-snapshot",
    signature: "same-content",
    generation: 2,
  });
  stableGenerationController.commit(stableGenerationNode, {
    plannedRepresentation: "exact-snapshot",
    signature: "same-content",
    generation: 2,
  });
  stableGenerationRequest.resolve({ dataUrl: "data:image/png;base64,stable", width: 120, height: 60 });
  await flushPromises();
  assert.strictEqual(
    stableGenerationNode.dataset.activeRepresentation,
    "exact-snapshot",
    "same-signature generation change canceled a valid pending snapshot"
  );
  assert.strictEqual(stableGenerationNode.dataset.presentationSnapshotGeneration, "2");

  console.log("[check-presentation-snapshot-controller] ok");
}

main().catch((error) => {
  console.error(`[check-presentation-snapshot-controller] ${error.stack || error.message}`);
  process.exitCode = 1;
});
