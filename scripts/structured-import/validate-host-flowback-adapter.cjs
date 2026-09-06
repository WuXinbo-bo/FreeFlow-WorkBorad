const assert = require("node:assert/strict");

async function main() {
  const { buildHostFlowbackPayload, buildHostPasteBackDescriptor } = await import(
    "../../public/src/engines/canvas2d-core/import/host/hostFlowbackAdapter.js"
  );

  const payload = buildHostFlowbackPayload([
    { id: "text-1", type: "text", text: "hello", plainText: "hello", html: "<p>hello</p>" },
    { id: "file-1", type: "fileCard", fileName: "a.txt", sourcePath: "D:\\a.txt" },
  ]);

  assert.equal(payload.externalOutput.stats.itemCount, 2);
  assert.equal(payload.pasteDescriptor.entries.length >= 2, true);
  assert.equal(payload.dragDescriptor.channel, "drag-drop");
  assert.equal(
    payload.pasteDescriptor.entries.some((entry) => entry.kind === "markdown" && entry.raw.markdown.includes("hello")),
    true,
    "flowback paste descriptor omitted Markdown"
  );

  const markdownDescriptor = buildHostPasteBackDescriptor({
    text: "",
    html: "",
    markdown: "```javascript\nconst value = 1;\n```",
    filePaths: [],
  });
  assert.equal(markdownDescriptor.sourceKind, "markdown", "Markdown-only flowback used the wrong source kind");

  console.log("[host-flowback-adapter] ok: 1 scenario validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
