"use strict";

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const registryModule = await import("../../public/src/engines/canvas2d-core/import/parsers/parserRegistry.js");
  const hostModule = await import("../../public/src/engines/canvas2d-core/import/parsers/customParserHost.js");

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createParserRegistry } = registryModule;
  const { createCustomParserHost, normalizeCustomParserDefinition } = hostModule;

  const registry = createParserRegistry();
  const host = createCustomParserHost({ registry });

  const normalized = normalizeCustomParserDefinition({
    namespace: "demo",
    localId: "markdown-extra",
    priority: 30,
    sourceKinds: [INPUT_SOURCE_KINDS.MARKDOWN],
    channels: [INPUT_CHANNELS.PASTE_NATIVE],
    parse: async () => ({ ok: true, parser: "custom" }),
  });
  assert(normalized.id === "custom:demo/markdown-extra", "normalized custom parser id mismatch");

  host.stageParser({
    namespace: "demo",
    localId: "markdown-extra",
    priority: 30,
    sourceKinds: [INPUT_SOURCE_KINDS.MARKDOWN],
    channels: [INPUT_CHANNELS.PASTE_NATIVE],
    parse: async () => ({ ok: true, parser: "custom" }),
  });

  assert(host.isEnabled() === false, "custom parser host should be disabled by default");
  assert(host.listStagedParsers().length === 1, "staged parsers mismatch");
  assert(host.listActiveParsers().length === 0, "active parsers should be empty when disabled");
  assert(registry.listParsers().length === 0, "registry should stay empty before enable");

  host.enable();
  assert(host.isEnabled() === true, "custom parser host should enable");
  assert(host.listActiveParsers().length === 1, "active parsers mismatch after enable");
  assert(registry.listParsers().length === 1, "registry should receive custom parser after enable");

  const result = await registry.parseDescriptor(
    createInputDescriptor({
      descriptorId: "descriptor-md",
      channel: INPUT_CHANNELS.PASTE_NATIVE,
      sourceKind: INPUT_SOURCE_KINDS.MARKDOWN,
      entries: [
        {
          entryId: "entry-md",
          kind: "markdown",
          mimeType: "text/markdown",
          raw: { markdown: "# title" },
        },
      ],
    })
  );
  assert(result.ok === true, "custom parser should parse through registry");
  assert(result.parserId === "custom:demo/markdown-extra", "custom parser id mismatch in parse result");

  host.disable();
  assert(host.isEnabled() === false, "custom parser host should disable");
  assert(registry.listParsers().length === 0, "registry should remove custom parser after disable");

  console.log("[custom-parser-host] ok: 4 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[custom-parser-host] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
