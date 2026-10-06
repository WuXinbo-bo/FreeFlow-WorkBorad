const assert = require("node:assert/strict");

async function main() {
  const { extractExternalFilePaths } = await import(
    "../public/src/engines/canvas2d-core/import/protocols/externalCompatibilityOutput.js"
  );
  const { createDragGateway } = await import(
    "../public/src/engines/canvas2d-core/import/gateway/dragGateway.js"
  );
  const { toFileUrl } = await import(
    "../public/src/engines/canvas2d-core/utils.js"
  );

  const items = [
    { type: "image", sourcePath: "/Users/test/画布/diagram.png" },
    { type: "fileCard", sourcePath: "D:\\docs\\report.pdf" },
    { type: "fileCard", sourcePath: "relative/report.pdf" },
  ];
  assert.deepEqual(extractExternalFilePaths(items), [
    "/Users/test/画布/diagram.png",
    "D:\\docs\\report.pdf",
  ]);

  const uriList = "file:///Users/test/My%20File.pdf\nfile:///Users/test/%E7%94%BB.png";
  const descriptor = createDragGateway({}).fromDataTransfer({
    types: ["text/uri-list"],
    files: [],
    getData: (type) => (type === "text/uri-list" ? uriList : ""),
  });
  assert.deepEqual(descriptor.entries.map((entry) => entry.raw.filePath), [
    "/Users/test/My File.pdf",
    "/Users/test/画.png",
  ]);

  const mixedDescriptor = createDragGateway({}).fromDataTransfer({
    types: ["text/uri-list"],
    files: [],
    getData: (type) => (type === "text/uri-list" ? `${uriList}\nhttps://example.com` : ""),
  });
  assert.deepEqual(mixedDescriptor.entries.filter((entry) => entry.kind === "file").map((entry) => entry.raw.filePath), [
    "/Users/test/My File.pdf",
    "/Users/test/画.png",
  ]);
  assert.equal(mixedDescriptor.entries.some((entry) => entry.kind === "uri"), true);
  assert.equal(toFileUrl("/Users/test/notes #1?.png"), "file:///Users/test/notes%20%231%3F.png");

  console.log("macOS frontend compatibility: POSIX and Windows external file paths passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
