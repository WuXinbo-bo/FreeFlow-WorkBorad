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
    "../../public/src/engines/canvas2d-core/import/parsers/code/codeParser.js"
  );
  const runnerModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/parserRunner.js"
  );

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createParserRegistry } = registryModule;
  const { createFallbackStrategyManager } = fallbackModule;
  const { createDiagnosticsModel } = diagnosticsModule;
  const { createCodeParser, CODE_PARSER_ID } = parserModule;
  const { runImportParsePipeline } = runnerModule;

  const registry = createParserRegistry();
  registry.registerParser(createCodeParser());

  const descriptor = createInputDescriptor({
    descriptorId: "descriptor-code-1",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.CODE,
    entries: [
      {
        entryId: "entry-code",
        kind: "code",
        mimeType: "text/x-python",
        name: "demo.py",
        raw: {
          code: [
            "def normalize_items(items):",
            "    result = []",
            "",
            "    for item in items:",
            "        if item is None:",
            "            continue",
            "        result.append(item.strip())",
            "",
            "    return result",
          ].join("\n"),
        },
        meta: {
          language: "python",
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

  assert(pipeline.parseResult.ok === true, "code parse should succeed");
  assert(pipeline.parseResult.parserId === CODE_PARSER_ID, "code parser id mismatch");
  const block = pipeline.parseResult.result.document.content[0];
  assert(block.type === "codeBlock", "code block missing");
  assert(block.attrs.language === "python", "code language mismatch");
  assert(block.text.includes("result.append"), "code content mismatch");
  assert(pipeline.diagnostics.score >= 90, "code diagnostics score should be high");

  const inferredDescriptor = createInputDescriptor({
    descriptorId: "descriptor-code-2",
    channel: INPUT_CHANNELS.PASTE_CONTEXT_MENU,
    sourceKind: INPUT_SOURCE_KINDS.CODE,
    entries: [
      {
        entryId: "entry-code-inferred",
        kind: "text",
        mimeType: "text/plain",
        name: "script.ps1",
        raw: {
          text: [
            "Get-ChildItem -Path .",
            "Write-Host \"hello\"",
          ].join("\n"),
        },
        meta: {},
      },
    ],
  });

  const inferredResult = await registry.parseDescriptor(inferredDescriptor);
  assert(inferredResult.ok === true, "inferred code parse should succeed");
  const inferredBlock = inferredResult.result.document.content[0];
  assert(inferredBlock.type === "codeBlock", "inferred code block missing");
  assert(inferredBlock.attrs.language === "powershell", "inferred language mismatch");

  console.log("[code-parser] ok: 2 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[code-parser] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
