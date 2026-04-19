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
    "../../public/src/engines/canvas2d-core/import/parsers/plainText/plainTextParser.js"
  );
  const runnerModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/parserRunner.js"
  );

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createParserRegistry } = registryModule;
  const { createFallbackStrategyManager } = fallbackModule;
  const { createDiagnosticsModel } = diagnosticsModule;
  const { createPlainTextParser, PLAIN_TEXT_PARSER_ID } = parserModule;
  const { runImportParsePipeline } = runnerModule;

  const registry = createParserRegistry();
  registry.registerParser(createPlainTextParser());

  const descriptor = createInputDescriptor({
    descriptorId: "descriptor-plain-text",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.PLAIN_TEXT,
    entries: [
      {
        entryId: "entry-text",
        kind: "text",
        mimeType: "text/plain",
        raw: {
          text: "First paragraph\nline 2\n\nSecond paragraph",
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

  assert(pipeline.parseResult.ok === true, "plain text parse should succeed");
  assert(pipeline.parseResult.parserId === PLAIN_TEXT_PARSER_ID, "plain text parser id mismatch");
  assert(pipeline.parseResult.result.document.content.length === 2, "paragraph count mismatch");
  assert(pipeline.parseResult.result.document.content[0].content.length === 3, "hard break mapping mismatch");
  assert(pipeline.diagnostics.score >= 90, "plain text diagnostics score should be high");

  const mixedDescriptor = createInputDescriptor({
    descriptorId: "descriptor-mixed-text",
    channel: INPUT_CHANNELS.PASTE_CONTEXT_MENU,
    sourceKind: INPUT_SOURCE_KINDS.MIXED,
    entries: [
      {
        entryId: "entry-text-1",
        kind: "text",
        mimeType: "text/plain",
        raw: { text: "A" },
      },
      {
        entryId: "entry-text-2",
        kind: "code",
        mimeType: "text/plain",
        raw: { code: "const x = 1;" },
      },
    ],
  });

  const mixedResult = await registry.parseDescriptor(mixedDescriptor);
  assert(mixedResult.ok === true, "mixed text parse should succeed");
  assert(mixedResult.result.stats.sourceEntryCount === 2, "source entry count mismatch");

  console.log("[plain-text-parser] ok: 2 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[plain-text-parser] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
