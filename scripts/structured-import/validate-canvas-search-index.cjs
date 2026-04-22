const assert = require("node:assert/strict");

async function main() {
  const { buildCanvasSearchResults } = await import(
    "../../public/src/engines/canvas2d-core/search/canvasSearchIndex.js"
  );

  const items = [
    {
      id: "text-1",
      type: "text",
      text: "链接语义测试",
      structuredImport: {
        linkTokens: [
          {
            url: "https://example.com/docs/getting-started",
            rangeStart: 0,
            rangeEnd: 4,
            kindHint: "preview-candidate",
          },
        ],
        urlMetaCache: {
          "https://example.com/docs/getting-started": {
            title: "Example Docs",
            description: "Structured import guide",
            siteName: "Example",
          },
        },
      },
    },
    {
      id: "node-1",
      type: "flowNode",
      title: "流程节点",
      text: "普通节点内容",
    },
  ];

  const domainResults = buildCanvasSearchResults(items, "example.com", 10);
  assert.equal(domainResults[0].id, "text-1");
  assert.equal(domainResults[0].matchLabel, "链接");

  const titleResults = buildCanvasSearchResults(items, "Example Docs", 10);
  assert.equal(titleResults[0].id, "text-1");
  assert.equal(titleResults[0].matchLabel, "链接元数据");

  const descriptionResults = buildCanvasSearchResults(items, "Structured import guide", 10);
  assert.equal(descriptionResults[0].id, "text-1");
  assert.equal(descriptionResults[0].matchLabel, "链接元数据");

  const siteResults = buildCanvasSearchResults(items, "example", 10);
  assert.equal(siteResults[0].id, "text-1");

  console.log("[canvas-search-index] ok: 4 scenarios validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
