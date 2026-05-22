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
    "../../public/src/engines/canvas2d-core/import/parsers/math/latexMathParser.js"
  );
  const runnerModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/parserRunner.js"
  );

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createParserRegistry } = registryModule;
  const { createFallbackStrategyManager } = fallbackModule;
  const { createDiagnosticsModel } = diagnosticsModule;
  const { createLatexMathParser, LATEX_MATH_PARSER_ID } = parserModule;
  const { runImportParsePipeline } = runnerModule;

  const registry = createParserRegistry();
  registry.registerParser(createLatexMathParser());

  const displayDescriptor = createInputDescriptor({
    descriptorId: "descriptor-math-1",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.MATH_FORMULA,
    entries: [
      {
        entryId: "entry-math-display",
        kind: "math",
        mimeType: "text/plain",
        raw: {
          latex: "$$\n\\int_0^1 x^2 \\\\, dx\n$$",
        },
        meta: {},
      },
    ],
  });

  const displayPipeline = await runImportParsePipeline({
    descriptor: displayDescriptor,
    registry,
    fallbackManager: createFallbackStrategyManager(),
    diagnosticsModel: createDiagnosticsModel(),
  });

  assert(displayPipeline.parseResult.ok === true, "display math parse should succeed");
  assert(displayPipeline.parseResult.parserId === LATEX_MATH_PARSER_ID, "math parser id mismatch");
  const displayNode = displayPipeline.parseResult.result.document.content[0];
  assert(displayNode.type === "mathBlock", "display math should map to mathBlock");
  assert(displayNode.attrs.sourceFormat === "latex", "math source format mismatch");
  assert(displayPipeline.diagnostics.score >= 90, "math diagnostics score should be high");

  const inlineDescriptor = createInputDescriptor({
    descriptorId: "descriptor-math-2",
    channel: INPUT_CHANNELS.PASTE_CONTEXT_MENU,
    sourceKind: INPUT_SOURCE_KINDS.MATH_FORMULA,
    entries: [
      {
        entryId: "entry-math-inline",
        kind: "text",
        mimeType: "text/plain",
        raw: {
          text: "行内公式：$a^2 + b^2 = c^2$，价格 $12.99 不应被误判，另一个公式是 \\(x+y\\)。",
        },
        meta: {},
      },
    ],
  });

  const inlineResult = await registry.parseDescriptor(inlineDescriptor);
  assert(inlineResult.ok === true, "inline math parse should succeed");
  const paragraph = inlineResult.result.document.content[0];
  assert(paragraph.type === "paragraph", "inline math should map to paragraph");
  const mathInlineNodes = paragraph.content.filter((node) => node.type === "mathInline");
  assert(mathInlineNodes.length === 2, "inline math count mismatch");
  const textJoined = paragraph.content.filter((node) => node.type === "text").map((node) => node.text).join("");
  assert(textJoined.includes("12.99"), "currency-like text should remain plain text");

  const standaloneDescriptor = createInputDescriptor({
    descriptorId: "descriptor-math-3",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.MATH_FORMULA,
    entries: [
      {
        entryId: "entry-math-standalone",
        kind: "math",
        mimeType: "text/plain",
        raw: {
          latex: "x = \\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a}",
        },
        meta: {},
      },
    ],
  });
  const standaloneResult = await registry.parseDescriptor(standaloneDescriptor);
  assert(standaloneResult.ok === true, "standalone math parse should succeed");
  const standaloneNode = standaloneResult.result.document.content[0];
  assert(standaloneNode.type === "mathBlock", "standalone formula should map to mathBlock");
  assert(standaloneNode.text.includes("\\\\frac"), "standalone formula text mismatch");

  console.log("[latex-math-parser] ok: 3 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[latex-math-parser] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
