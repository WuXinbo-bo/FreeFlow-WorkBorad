"use strict";

async function main() {
  const rendererModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/rendererPipeline.js"
  );
  const registryModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/legacyElementAdapterRegistry.js"
  );
  const adapterModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/legacy/nativePassthroughAdapter.js"
  );

  const { normalizeRenderInput } = rendererModule;
  const { createLegacyElementAdapterRegistry } = registryModule;
  const { createNativePassthroughAdapter, NATIVE_PASSTHROUGH_ADAPTER_ID } = adapterModule;

  const registry = createLegacyElementAdapterRegistry();
  registry.registerAdapter(createNativePassthroughAdapter());

  const renderInput = normalizeRenderInput({
    descriptor: { descriptorId: "descriptor-native-bridge-1" },
    parseResult: {
      parserId: "internal-legacy-compatibility-parser",
      result: {
        compatibility: {
          kind: "legacy-element-adapter",
          adapterType: "native-items",
          parserId: "internal-legacy-compatibility-parser",
          descriptorId: "descriptor-native-bridge-1",
          items: [
            {
              entryId: "entry-native-1",
              originId: "native-1",
              legacyType: "flowNode",
              item: {
                id: "flow-node-1",
                type: "flowNode",
                plainText: "Pipeline node",
                width: 260,
                height: 120,
              },
            },
            {
              entryId: "entry-native-2",
              originId: "native-2",
              legacyType: "shape",
              item: {
                id: "shape-1",
                type: "shape",
                shapeType: "arrow",
                width: 220,
                height: 24,
              },
            },
          ],
        },
      },
    },
  });

  const matches = registry.matchAdapters(renderInput);
  assert(matches.length === 1, "native passthrough adapter match count mismatch");

  const result = await registry.adapt(renderInput);
  assert(result.ok === true, "native passthrough adapter should succeed");
  assert(result.adapterId === NATIVE_PASSTHROUGH_ADAPTER_ID, "native passthrough adapter id mismatch");
  assert(result.result.operations.length === 2, "native passthrough operation count mismatch");
  assert(result.result.operations[0].type === "bridge-native-item", "native passthrough operation type mismatch");
  assert(result.result.operations[0].element.type === "flowNode", "flowNode passthrough type mismatch");
  assert(result.result.operations[1].element.shapeType === "arrow", "shape passthrough payload mismatch");

  console.log("[native-passthrough-adapter] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[native-passthrough-adapter] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
