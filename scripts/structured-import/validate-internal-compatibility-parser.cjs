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
    "../../public/src/engines/canvas2d-core/import/parsers/legacy/internalCompatibilityParser.js"
  );
  const runnerModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/parserRunner.js"
  );

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createParserRegistry } = registryModule;
  const { createFallbackStrategyManager } = fallbackModule;
  const { createDiagnosticsModel } = diagnosticsModule;
  const {
    createInternalCompatibilityParser,
    INTERNAL_COMPATIBILITY_PARSER_ID,
  } = parserModule;
  const { runImportParsePipeline } = runnerModule;

  const registry = createParserRegistry();
  registry.registerParser(createInternalCompatibilityParser());

  const descriptor = createInputDescriptor({
    descriptorId: "descriptor-internal-1",
    channel: INPUT_CHANNELS.INTERNAL_COPY,
    sourceKind: INPUT_SOURCE_KINDS.INTERNAL_ITEMS,
    entries: [
      {
        entryId: "entry-internal-1",
        kind: "internal-payload",
        mimeType: "application/x-freeflow-canvas",
        raw: {
          internalPayload: {
            type: "canvas2d",
            items: [
              { type: "text", text: "hello", plainText: "hello", html: "<p>hello</p>" },
              { type: "image", name: "demo.png", sourcePath: "D:\\assets\\demo.png" },
              { type: "fileCard", name: "readme.md", sourcePath: "D:\\docs\\readme.md", size: 12 },
              { type: "node", text: "node text" },
              { type: "edge", startId: "a", endId: "b" },
              { type: "shape", shapeType: "rect", x: 10, y: 20, width: 80, height: 40 },
            ],
          },
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

  assert(pipeline.parseResult.ok === true, "internal compatibility parse should succeed");
  assert(
    pipeline.parseResult.parserId === INTERNAL_COMPATIBILITY_PARSER_ID,
    "internal compatibility parser id mismatch"
  );
  assert(
    pipeline.parseResult.result.compatibility.adapterType === "native-items",
    "adapter type mismatch"
  );
  const items = pipeline.parseResult.result.compatibility.items;
  assert(items.length === 6, "compatibility item count mismatch");
  assert(items.some((item) => item.legacyType === "text"), "text compatibility item missing");
  assert(items.some((item) => item.legacyType === "image"), "image compatibility item missing");
  assert(items.some((item) => item.legacyType === "fileCard"), "fileCard compatibility item missing");
  assert(items.some((item) => item.legacyType === "flowNode"), "flowNode compatibility item missing");
  assert(items.some((item) => item.legacyType === "flowEdge"), "flowEdge compatibility item missing");
  assert(items.some((item) => item.legacyType === "shape"), "shape compatibility item missing");
  assert(pipeline.diagnostics.score >= 90, "internal diagnostics score should be high");

  const mixedAliasDescriptor = createInputDescriptor({
    descriptorId: "descriptor-internal-2",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.MIXED,
    entries: [
      {
        entryId: "entry-internal-2",
        kind: "internal-payload",
        mimeType: "application/x-freeflow-canvas2d",
        raw: {
          internalPayload: {
            type: "canvas2d",
            items: [
              { type: "mind", text: "mind" },
              { type: "file", name: "spec.pdf", sourcePath: "D:\\spec.pdf" },
            ],
          },
        },
      },
    ],
  });

  const mixedResult = await registry.parseDescriptor(mixedAliasDescriptor);
  assert(mixedResult.ok === true, "mixed internal compatibility parse should succeed");
  const typeCounts = mixedResult.result.stats.typeCounts;
  assert(typeCounts.mindNode === 1, "mindNode alias mismatch");
  assert(typeCounts.fileCard === 1, "file alias mismatch");

  console.log("[internal-compatibility-parser] ok: 2 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[internal-compatibility-parser] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
