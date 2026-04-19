"use strict";

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const registryModule = await import("../../public/src/engines/canvas2d-core/import/parsers/parserRegistry.js");
  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createParserRegistry } = registryModule;

  const registry = createParserRegistry();

  registry.registerParser({
    id: "html-primary",
    priority: 100,
    sourceKinds: [INPUT_SOURCE_KINDS.HTML],
    channels: [INPUT_CHANNELS.PASTE_NATIVE, INPUT_CHANNELS.DRAG_DROP],
    supports() {
      return { matched: true, score: 20, reason: "html-source" };
    },
    async parse({ descriptor }) {
      return { parser: "html-primary", entryCount: descriptor.entries.length };
    },
  });

  registry.registerParser({
    id: "html-fallback",
    priority: 50,
    sourceKinds: [INPUT_SOURCE_KINDS.HTML, INPUT_SOURCE_KINDS.MIXED],
    supports() {
      return true;
    },
    async parse() {
      return { parser: "html-fallback" };
    },
  });

  registry.registerParser({
    id: "markdown-only",
    priority: 80,
    sourceKinds: [INPUT_SOURCE_KINDS.MARKDOWN],
    async parse() {
      return { parser: "markdown-only" };
    },
  });

  const htmlDescriptor = createInputDescriptor({
    descriptorId: "descriptor-html",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.HTML,
    entries: [
      {
        entryId: "entry-html",
        kind: "html",
        mimeType: "text/html",
        raw: { html: "<p>Hello</p>" },
      },
    ],
  });

  const matches = registry.matchDescriptor(htmlDescriptor);
  assert(matches.length === 2, "expected 2 html matches");
  assert(matches[0].parser.id === "html-primary", "primary parser should rank first");

  const parseResult = await registry.parseDescriptor(htmlDescriptor);
  assert(parseResult.ok === true, "parse should succeed");
  assert(parseResult.parserId === "html-primary", "primary parser should parse descriptor");

  const unknownDescriptor = createInputDescriptor({
    descriptorId: "descriptor-unknown",
    channel: INPUT_CHANNELS.PROGRAMMATIC,
    sourceKind: INPUT_SOURCE_KINDS.UNKNOWN,
    entries: [
      {
        entryId: "entry-unknown",
        kind: "unknown",
        status: "partial",
        errorCode: "unsupported-source-kind",
        mimeType: "",
        raw: { text: "raw" },
      },
    ],
  });

  const noMatchResult = await registry.parseDescriptor(unknownDescriptor);
  assert(noMatchResult.ok === false, "unknown descriptor should not parse");
  assert(noMatchResult.status === "no-match", "unknown descriptor should no-match");

  const removed = registry.unregisterParser("markdown-only");
  assert(removed === true, "markdown parser should unregister");

  console.log("[parser-registry] ok: 4 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[parser-registry] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
