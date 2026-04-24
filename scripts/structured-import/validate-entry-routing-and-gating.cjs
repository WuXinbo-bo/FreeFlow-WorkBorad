"use strict";

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const entryBuilders = await import("../../public/src/engines/canvas2d-core/import/gateway/sharedEntryBuilders.js");
  const detectorModule = await import("../../public/src/engines/canvas2d-core/import/gateway/contentTypeDetector.js");
  const parserRegistryModule = await import("../../public/src/engines/canvas2d-core/import/parsers/parserRegistry.js");

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS, INPUT_ENTRY_KINDS } = protocol;
  const { createEntryFromMimeType } = entryBuilders;
  const { CODE_ENTRY_STRATEGIES } = detectorModule;
  const { createParserRegistry } = parserRegistryModule;

  const latexEntry = createEntryFromMimeType({
    mimeType: "application/x-latex",
    value: "\\frac{1}{2}",
    entryId: "entry-latex",
  });
  assert(latexEntry.kind === INPUT_ENTRY_KINDS.MARKDOWN, "latex mime should map to markdown entry");
  assert(String(latexEntry.raw.markdown || "").includes("\\frac{1}{2}"), "latex markdown should preserve payload");

  const plainCodeDefault = createEntryFromMimeType({
    mimeType: "text/plain",
    value: "'''js\nfunction sum(a, b) {\n  return a + b;\n}\n'''",
    entryId: "entry-code-default",
  });
  assert(plainCodeDefault.kind === INPUT_ENTRY_KINDS.MARKDOWN, "default code strategy should map to markdown");
  assert(/^```/.test(String(plainCodeDefault.raw.markdown || "")), "default code strategy should wrap fenced markdown");

  const plainCodeNative = createEntryFromMimeType({
    mimeType: "text/plain",
    value: "'''js\nfunction sum(a, b) {\n  return a + b;\n}\n'''",
    entryId: "entry-code-native",
    codeEntryStrategy: CODE_ENTRY_STRATEGIES.NATIVE_CODE,
  });
  assert(plainCodeNative.kind === INPUT_ENTRY_KINDS.CODE, "native-code strategy should map to code entry");

  const registry = createParserRegistry({
    resolveEntryKindGate({ parser }) {
      if (parser.id === "html-only") {
        return [INPUT_ENTRY_KINDS.HTML];
      }
      if (parser.id === "text-only") {
        return [INPUT_ENTRY_KINDS.TEXT];
      }
      return [];
    },
  });

  registry.registerParser({
    id: "html-only",
    priority: 50,
    sourceKinds: [INPUT_SOURCE_KINDS.MIXED, INPUT_SOURCE_KINDS.UNKNOWN],
    channels: [INPUT_CHANNELS.PASTE_NATIVE],
    supports() {
      return { matched: true, score: 10, reason: "html-match" };
    },
    async parse() {
      return { parser: "html-only" };
    },
  });

  registry.registerParser({
    id: "text-only",
    priority: 40,
    sourceKinds: [INPUT_SOURCE_KINDS.MIXED, INPUT_SOURCE_KINDS.UNKNOWN],
    channels: [INPUT_CHANNELS.PASTE_NATIVE],
    supports() {
      return { matched: true, score: 10, reason: "text-match" };
    },
    async parse() {
      return { parser: "text-only" };
    },
  });

  const descriptor = createInputDescriptor({
    descriptorId: "descriptor-gate",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.MIXED,
    entries: [
      {
        entryId: "entry-text",
        kind: INPUT_ENTRY_KINDS.TEXT,
        status: "ready",
        errorCode: "none",
        mimeType: "text/plain",
        raw: { text: "plain text body" },
      },
    ],
  });

  const matches = registry.matchDescriptor(descriptor);
  assert(matches.length === 1, "entry-kind gating should leave only one matched parser");
  assert(matches[0].parser.id === "text-only", "text parser should survive entry-kind gating");

  console.log("[entry-routing-and-gating] ok: mime routing, code strategy, parser gating");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[entry-routing-and-gating] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
