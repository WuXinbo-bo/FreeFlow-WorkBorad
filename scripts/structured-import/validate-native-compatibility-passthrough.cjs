"use strict";

async function main() {
  const passthroughModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/legacy/nativeCompatibilityPassthrough.js"
  );

  const { buildNativeElementFromPassthroughOperation } = passthroughModule;

  const node = buildNativeElementFromPassthroughOperation({
    type: "bridge-native-item",
    legacyType: "flowNode",
    element: {
      id: "flow-node-1",
      type: "flowNode",
      plainText: "Node",
      width: 260,
      height: 120,
      x: 0,
      y: 0,
    },
    structure: {
      entryId: "entry-native-1",
      originId: "native-1",
      legacyType: "flowNode",
    },
    meta: {
      descriptorId: "descriptor-native-1",
      parserId: "internal-legacy-compatibility-parser",
    },
  });

  assert(node.type === "flowNode", "native passthrough type mismatch");
  assert(node.legacyCompatibility != null, "native compatibility meta missing");
  assert(node.legacyCompatibility.legacyType === "flowNode", "native compatibility legacy type mismatch");
  assert(
    node.legacyCompatibility.sourceMeta.parserId === "internal-legacy-compatibility-parser",
    "native compatibility parser mismatch"
  );

  console.log("[native-compatibility-passthrough] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[native-compatibility-passthrough] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
