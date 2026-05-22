const assert = require("node:assert/strict");

async function main() {
  const { buildHostSearchResults } = await import(
    "../../public/src/engines/canvas2d-core/import/host/hostSearchAdapter.js"
  );

  const items = [
    { id: "code-1", type: "codeBlock", title: "python 代码块", plainText: "print('hi')", language: "python" },
    { id: "table-1", type: "table", title: "课程表", table: { rows: [{ cells: [{ plainText: "数学" }] }] } },
    { id: "math-1", type: "mathBlock", title: "公式", formula: "x^2+y^2" },
    {
      id: "text-1",
      type: "text",
      text: "参考链接文档",
      structuredImport: {
        linkTokens: [
          {
            url: "https://example.com/docs",
            rangeStart: 2,
            rangeEnd: 4,
            kindHint: "preview-candidate",
            fetchState: "ready",
          },
        ],
        urlMetaCache: {
          "https://example.com/docs": {
            title: "Example Docs",
            description: "API guide",
            siteName: "ExampleSite",
            status: "ok",
          },
        },
      },
    },
  ];

  const codeResults = buildHostSearchResults(items, "print", 10);
  assert.equal(codeResults[0].id, "code-1");

  const mathResults = buildHostSearchResults(items, "x^2", 10);
  assert.equal(mathResults[0].id, "math-1");

  const linkUrlResults = buildHostSearchResults(items, "example.com", 10);
  assert.equal(linkUrlResults[0].id, "text-1");
  assert.equal(linkUrlResults[0].matchLabel, "链接");

  const linkMetaResults = buildHostSearchResults(items, "API guide", 10);
  assert.equal(linkMetaResults[0].id, "text-1");
  assert.equal(linkMetaResults[0].matchLabel, "链接元数据");

  const linkSiteNameResults = buildHostSearchResults(items, "ExampleSite", 10);
  assert.equal(linkSiteNameResults[0].id, "text-1");
  assert.equal(linkSiteNameResults[0].matchLabel, "链接元数据");

  console.log("[host-search-adapter] ok: 5 scenarios validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
