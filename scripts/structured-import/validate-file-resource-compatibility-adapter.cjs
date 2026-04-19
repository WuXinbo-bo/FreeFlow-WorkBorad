"use strict";

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const registryModule = await import("../../public/src/engines/canvas2d-core/import/parsers/parserRegistry.js");
  const fallbackModule = await import(
    "../../public/src/engines/canvas2d-core/import/fallbacks/fallbackStrategyManager.js"
  );
  const diagnosticsModule = await import(
    "../../public/src/engines/canvas2d-core/import/diagnostics/diagnosticsModel.js"
  );
  const parserModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/file/fileResourceCompatibilityAdapter.js"
  );
  const runnerModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/parserRunner.js"
  );

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createParserRegistry } = registryModule;
  const { createFallbackStrategyManager } = fallbackModule;
  const { createDiagnosticsModel } = diagnosticsModule;
  const {
    createFileResourceCompatibilityAdapter,
    FILE_RESOURCE_COMPATIBILITY_ADAPTER_ID,
  } = parserModule;
  const { runImportParsePipeline } = runnerModule;

  const registry = createParserRegistry();
  registry.registerParser(createFileResourceCompatibilityAdapter());

  const descriptor = createInputDescriptor({
    descriptorId: "descriptor-file-1",
    channel: INPUT_CHANNELS.PASTE_CONTEXT_MENU,
    sourceKind: INPUT_SOURCE_KINDS.FILE_RESOURCE,
    entries: [
      {
        entryId: "entry-file-1",
        kind: "file",
        mimeType: "application/pdf",
        name: "Project Plan.pdf",
        size: 40960,
        raw: {
          filePath: "D:\\docs\\Project Plan.pdf",
        },
        meta: {
          displayName: "Project Plan.pdf",
        },
      },
    ],
  });

  const pipeline = await runImportParsePipeline({
    descriptor,
    registry,
    fallbackManager: createFallbackStrategyManager(),
    diagnosticsModel: createDiagnosticsModel(),
  });

  assert(pipeline.parseResult.ok === true, "file compatibility parse should succeed");
  assert(
    pipeline.parseResult.parserId === FILE_RESOURCE_COMPATIBILITY_ADAPTER_ID,
    "file compatibility parser id mismatch"
  );
  assert(!pipeline.parseResult.result.document, "file compatibility result should not expose canonical document");
  assert(
    pipeline.parseResult.result.compatibility.adapterType === "fileCard",
    "adapter type mismatch"
  );
  const item = pipeline.parseResult.result.compatibility.items[0];
  assert(item.legacyType === "fileCard", "legacyType mismatch");
  assert(item.name === "Project Plan.pdf", "file name mismatch");
  assert(item.title === "Project Plan", "file title mismatch");
  assert(item.ext === "pdf", "file ext mismatch");
  assert(item.sourcePath === "D:\\docs\\Project Plan.pdf", "file path mismatch");
  assert(item.sizeLabel === "40.0 KB", "sizeLabel mismatch");
  assert(pipeline.diagnostics.score >= 90, "file diagnostics score should be high");

  const dragDescriptor = createInputDescriptor({
    descriptorId: "descriptor-file-2",
    channel: INPUT_CHANNELS.DRAG_DROP,
    sourceKind: INPUT_SOURCE_KINDS.FILE_RESOURCE,
    entries: [
      {
        entryId: "entry-file-2",
        kind: "file",
        mimeType: "text/plain",
        name: "notes.txt",
        size: 12,
        raw: {
          filePath: "D:\\tmp\\notes.txt",
        },
        meta: {},
      },
    ],
  });

  const dragResult = await registry.parseDescriptor(dragDescriptor);
  assert(dragResult.ok === true, "drag file compatibility parse should succeed");
  const dragItem = dragResult.result.compatibility.items[0];
  assert(dragItem.ext === "txt", "drag ext mismatch");
  assert(dragItem.resourceId === "descriptor-file-2:entry-file-2", "resourceId mismatch");

  console.log("[file-resource-compatibility-adapter] ok: 2 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[file-resource-compatibility-adapter] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
