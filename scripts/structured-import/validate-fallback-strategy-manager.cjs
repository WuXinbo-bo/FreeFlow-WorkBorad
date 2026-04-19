"use strict";

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const parserRegistryModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/parserRegistry.js"
  );
  const fallbackModule = await import(
    "../../public/src/engines/canvas2d-core/import/fallbacks/fallbackStrategyManager.js"
  );

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { PARSER_MATCH_STATUS } = parserRegistryModule;
  const { createFallbackStrategyManager, FALLBACK_ACTIONS } = fallbackModule;

  const manager = createFallbackStrategyManager();

  const htmlDescriptor = createInputDescriptor({
    descriptorId: "descriptor-html",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.HTML,
    entries: [
      {
        entryId: "entry-html",
        kind: "html",
        mimeType: "text/html",
        raw: { html: "<h1>Hello</h1>", text: "Hello" },
      },
    ],
  });

  const htmlFallback = manager.resolve({
    descriptor: htmlDescriptor,
    parseResult: {
      ok: false,
      status: PARSER_MATCH_STATUS.NO_MATCH,
    },
  });
  assert(htmlFallback.ok === true, "html fallback should resolve");
  assert(htmlFallback.action === FALLBACK_ACTIONS.USE_HTML_AS_TEXT, "html fallback action mismatch");

  const fileDescriptor = createInputDescriptor({
    descriptorId: "descriptor-file",
    channel: INPUT_CHANNELS.DRAG_DROP,
    sourceKind: INPUT_SOURCE_KINDS.FILE_RESOURCE,
    entries: [
      {
        entryId: "entry-file",
        kind: "file",
        mimeType: "application/pdf",
        name: "demo.pdf",
        raw: { filePath: "D:\\tmp\\demo.pdf" },
      },
    ],
  });

  const fileFallback = manager.resolve({
    descriptor: fileDescriptor,
    parseResult: {
      ok: false,
      status: PARSER_MATCH_STATUS.NO_MATCH,
    },
  });
  assert(fileFallback.action === FALLBACK_ACTIONS.USE_FILE_RESOURCES, "file fallback action mismatch");

  const plainTextDescriptor = createInputDescriptor({
    descriptorId: "descriptor-text",
    channel: INPUT_CHANNELS.PASTE_CONTEXT_MENU,
    sourceKind: INPUT_SOURCE_KINDS.PLAIN_TEXT,
    entries: [
      {
        entryId: "entry-text",
        kind: "text",
        mimeType: "text/plain",
        raw: { text: "fallback text" },
      },
    ],
  });

  const plainTextFallback = manager.resolve({
    descriptor: plainTextDescriptor,
    parseResult: {
      ok: false,
      status: PARSER_MATCH_STATUS.FAILED,
    },
  });
  assert(
    plainTextFallback.action === FALLBACK_ACTIONS.USE_PLAIN_TEXT,
    "plain text fallback action mismatch"
  );

  const unsupportedDescriptor = createInputDescriptor({
    descriptorId: "descriptor-unsupported",
    channel: INPUT_CHANNELS.PROGRAMMATIC,
    sourceKind: INPUT_SOURCE_KINDS.UNKNOWN,
    status: "unsupported",
    entries: [
      {
        entryId: "entry-unknown",
        kind: "unknown",
        status: "partial",
        errorCode: "unsupported-source-kind",
        mimeType: "",
        raw: { text: "" },
      },
    ],
  });

  const unsupportedFallback = manager.resolve({
    descriptor: unsupportedDescriptor,
    parseResult: {
      ok: false,
      status: PARSER_MATCH_STATUS.NO_MATCH,
    },
  });
  assert(
    unsupportedFallback.action === FALLBACK_ACTIONS.REPORT_UNSUPPORTED,
    "unsupported fallback should report unsupported"
  );

  console.log("[fallback-strategy-manager] ok: 4 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[fallback-strategy-manager] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
