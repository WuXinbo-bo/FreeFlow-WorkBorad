"use strict";

async function main() {
  const rendererModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/rendererPipeline.js"
  );
  const registryModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/legacyElementAdapterRegistry.js"
  );

  const { normalizeRenderInput } = rendererModule;
  const {
    createLegacyElementAdapterRegistry,
    LEGACY_ADAPTER_MATCH_STATUS,
  } = registryModule;

  const registry = createLegacyElementAdapterRegistry();

  registry.registerAdapter({
    id: "legacy-file-card-adapter",
    priority: 100,
    adapterTypes: ["fileCard"],
    legacyTypes: ["fileCard"],
    supports({ compatibility }) {
      return {
        matched: Array.isArray(compatibility?.items) && compatibility.items.length > 0,
        score: 12,
        reason: "file-card-items-available",
      };
    },
    async adapt({ compatibility }) {
      return {
        planId: "legacy-file-card-plan-1",
        kind: "legacy-bridge-plan",
        adapterType: compatibility.adapterType,
        operations: compatibility.items.map((item) => ({
          type: "bridge-file-card",
          entryId: item.entryId,
          legacyType: item.legacyType,
        })),
        stats: {
          itemCount: compatibility.items.length,
        },
      };
    },
  });

  registry.registerAdapter({
    id: "legacy-native-items-adapter",
    priority: 90,
    adapterTypes: ["native-items"],
    legacyTypes: ["image", "flowNode", "flowEdge", "mindNode", "shape", "text"],
    supports({ compatibility }) {
      return {
        matched: Array.isArray(compatibility?.items) && compatibility.items.length > 0,
        score: 8,
        reason: "native-items-available",
      };
    },
    async adapt({ compatibility }) {
      return {
        planId: "legacy-native-items-plan-1",
        kind: "legacy-bridge-plan",
        adapterType: compatibility.adapterType,
        operations: compatibility.items.map((item) => ({
          type: "bridge-native-item",
          legacyType: item.legacyType,
          originId: item.originId,
        })),
        stats: {
          itemCount: compatibility.items.length,
        },
      };
    },
  });

  const fileCompatibilityInput = normalizeRenderInput({
    descriptor: { descriptorId: "descriptor-legacy-1" },
    parseResult: {
      parserId: "file-resource-compatibility-adapter",
      result: {
        compatibility: {
          kind: "legacy-element-adapter",
          adapterType: "fileCard",
          items: [
            { entryId: "entry-file-1", originId: "file-1", legacyType: "fileCard" },
          ],
        },
      },
    },
  });

  const fileMatches = registry.matchAdapters(fileCompatibilityInput);
  assert(fileMatches.length === 1, "file adapter match count mismatch");
  assert(fileMatches[0].adapter.id === "legacy-file-card-adapter", "file adapter ranking mismatch");

  const fileResult = await registry.adapt(fileCompatibilityInput);
  assert(fileResult.ok === true, "file adapter should succeed");
  assert(fileResult.status === LEGACY_ADAPTER_MATCH_STATUS.ADAPTED, "file adapter status mismatch");
  assert(fileResult.adapterId === "legacy-file-card-adapter", "file adapter id mismatch");
  assert(fileResult.result.operations[0].type === "bridge-file-card", "file bridge operation mismatch");

  const nativeCompatibilityInput = normalizeRenderInput({
    descriptor: { descriptorId: "descriptor-legacy-2" },
    parseResult: {
      parserId: "internal-legacy-compatibility-parser",
      result: {
        compatibility: {
          kind: "legacy-element-adapter",
          adapterType: "native-items",
          items: [
            { entryId: "entry-native-1", originId: "native-1", legacyType: "image" },
            { entryId: "entry-native-2", originId: "native-2", legacyType: "shape" },
          ],
        },
      },
    },
  });

  const nativeResult = await registry.adapt(nativeCompatibilityInput);
  assert(nativeResult.ok === true, "native adapter should succeed");
  assert(nativeResult.adapterId === "legacy-native-items-adapter", "native adapter id mismatch");
  assert(nativeResult.result.operations.length === 2, "native bridge operation count mismatch");

  const removed = registry.unregisterAdapter("legacy-native-items-adapter");
  assert(removed === true, "legacy native adapter should unregister");

  console.log("[legacy-element-adapter-registry] ok: 2 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[legacy-element-adapter-registry] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
