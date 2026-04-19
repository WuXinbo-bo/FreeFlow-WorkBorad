"use strict";

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const parserModule = await import("../../public/src/engines/canvas2d-core/import/parsers/parserRegistry.js");
  const fallbackModule = await import(
    "../../public/src/engines/canvas2d-core/import/fallbacks/fallbackStrategyManager.js"
  );
  const diagnosticsModule = await import(
    "../../public/src/engines/canvas2d-core/import/diagnostics/diagnosticsModel.js"
  );

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { PARSER_MATCH_STATUS } = parserModule;
  const { FALLBACK_ACTIONS } = fallbackModule;
  const { createDiagnosticsModel, QUALITY_GRADES } = diagnosticsModule;

  const diagnosticsModel = createDiagnosticsModel();

  const parsedDescriptor = createInputDescriptor({
    descriptorId: "descriptor-good",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.HTML,
    entries: [
      {
        entryId: "entry-html",
        kind: "html",
        mimeType: "text/html",
        raw: { html: "<p>Hello</p>", text: "Hello" },
      },
    ],
  });

  const parsedDiagnostics = diagnosticsModel.buildImportDiagnostics({
    descriptor: parsedDescriptor,
    parseResult: {
      ok: true,
      status: PARSER_MATCH_STATUS.PARSED,
      attempts: [{ parserId: "html", status: PARSER_MATCH_STATUS.PARSED, score: 120 }],
    },
  });
  assert(parsedDiagnostics.score >= 90, "parsed diagnostics should score high");
  assert(parsedDiagnostics.grade === QUALITY_GRADES.EXCELLENT, "parsed diagnostics grade mismatch");

  const fallbackDiagnostics = diagnosticsModel.buildImportDiagnostics({
    descriptor: createInputDescriptor({
      descriptorId: "descriptor-fallback",
      channel: INPUT_CHANNELS.DRAG_DROP,
      sourceKind: INPUT_SOURCE_KINDS.MARKDOWN,
      entries: [
        {
          entryId: "entry-markdown",
          kind: "markdown",
          mimeType: "text/markdown",
          raw: { markdown: "# Title" },
        },
      ],
    }),
    parseResult: {
      ok: false,
      status: PARSER_MATCH_STATUS.NO_MATCH,
    },
    fallbackResult: {
      ok: true,
      action: FALLBACK_ACTIONS.USE_MARKDOWN_AS_TEXT,
    },
  });
  assert(fallbackDiagnostics.score < 90, "fallback diagnostics should lose score");
  assert(
    fallbackDiagnostics.losses.some((loss) => loss.area === "structure"),
    "fallback diagnostics should include structure loss"
  );

  const brokenDiagnostics = diagnosticsModel.buildImportDiagnostics({
    descriptor: createInputDescriptor({
      descriptorId: "descriptor-broken",
      channel: INPUT_CHANNELS.PROGRAMMATIC,
      sourceKind: INPUT_SOURCE_KINDS.UNKNOWN,
      status: "unsupported",
      entries: [],
    }),
    parseResult: {
      ok: false,
      status: PARSER_MATCH_STATUS.NO_MATCH,
    },
    fallbackResult: {
      ok: false,
      action: FALLBACK_ACTIONS.REPORT_UNSUPPORTED,
    },
  });
  assert(brokenDiagnostics.score < 40, "broken diagnostics should score low");
  assert(
    brokenDiagnostics.diagnostics.some((item) => item.level === "error"),
    "broken diagnostics should include errors"
  );

  console.log("[diagnostics-model] ok: 3 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[diagnostics-model] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
