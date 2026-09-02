"use strict";

const assert = require("node:assert/strict");

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const parserModule = await import("../../public/src/engines/canvas2d-core/import/parsers/uriList/uriListParser.js");
  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createUriListParser } = parserModule;
  const parser = createUriListParser();
  const descriptor = createInputDescriptor({
    descriptorId: "uri-list",
    channel: INPUT_CHANNELS.DRAG_DROP,
    sourceKind: INPUT_SOURCE_KINDS.URI_LIST,
    entries: [{
      entryId: "uris",
      kind: "uri",
      mimeType: "text/uri-list",
      raw: { uri: "# source\nhttps://example.com/a\njavascript:alert(1)\nhttps://example.com/b" },
    }],
  });
  const result = await parser.parse({ descriptor });
  assert.equal(result.document.content.length, 2);
  assert.equal(result.stats.rejectedCount, 1);
  assert.equal(result.document.content[0].content[0].marks[0].type, "link");
  assert.equal(result.document.content[0].content[0].marks[0].attrs.href, "https://example.com/a");
  console.log("[uri-list-parser] ok: safe links retained and unsafe schemes rejected");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
