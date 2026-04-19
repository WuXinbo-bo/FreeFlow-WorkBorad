"use strict";

async function main() {
  const rendererModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/rendererPipeline.js"
  );
  const registryModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/legacyElementAdapterRegistry.js"
  );
  const adapterModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/file/fileCardLegacyAdapter.js"
  );

  const { normalizeRenderInput } = rendererModule;
  const { createLegacyElementAdapterRegistry } = registryModule;
  const { createFileCardLegacyAdapter, FILE_CARD_LEGACY_ADAPTER_ID } = adapterModule;

  const registry = createLegacyElementAdapterRegistry();
  registry.registerAdapter(createFileCardLegacyAdapter());

  const renderInput = normalizeRenderInput({
    descriptor: { descriptorId: "descriptor-file-card-bridge-1" },
    parseResult: {
      parserId: "file-resource-compatibility-adapter",
      result: {
        compatibility: {
          kind: "legacy-element-adapter",
          adapterType: "fileCard",
          parserId: "file-resource-compatibility-adapter",
          descriptorId: "descriptor-file-card-bridge-1",
          items: [
            {
              entryId: "entry-file-1",
              originId: "descriptor-file-card-bridge-1-file-0",
              legacyType: "fileCard",
              name: "board-summary.docx",
              fileName: "board-summary.docx",
              title: "board-summary",
              ext: "docx",
              mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              sourcePath: "D:\\docs\\board-summary.docx",
              fileId: "file-1",
              resourceId: "descriptor-file-card-bridge-1:entry-file-1",
              size: 1048576,
              sizeLabel: "1.00 MB",
            },
          ],
        },
      },
    },
  });

  const matches = registry.matchAdapters(renderInput);
  assert(matches.length === 1, "fileCard legacy adapter match count mismatch");

  const result = await registry.adapt(renderInput);
  assert(result.ok === true, "fileCard legacy adapter should succeed");
  assert(result.adapterId === FILE_CARD_LEGACY_ADAPTER_ID, "fileCard legacy adapter id mismatch");
  assert(result.result.operations.length === 1, "fileCard bridge operation count mismatch");

  const operation = result.result.operations[0];
  assert(operation.type === "bridge-file-card", "fileCard bridge operation type mismatch");
  assert(operation.element.type === "fileCard", "legacy fileCard element type mismatch");
  assert(operation.element.sourcePath === "D:\\docs\\board-summary.docx", "legacy fileCard sourcePath mismatch");
  assert(operation.element.fileName === "board-summary.docx", "legacy fileCard fileName mismatch");
  assert(operation.element.ext === "docx", "legacy fileCard ext mismatch");
  assert(operation.element.size === 1048576, "legacy fileCard size mismatch");

  console.log("[file-card-legacy-adapter] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[file-card-legacy-adapter] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
