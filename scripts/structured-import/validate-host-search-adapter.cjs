const assert = require("node:assert/strict");

async function main() {
  const { buildHostSearchResults } = await import(
    "../../public/src/engines/canvas2d-core/import/host/hostSearchAdapter.js"
  );

  const items = [
    { id: "code-1", type: "codeBlock", title: "python 代码块", plainText: "print('hi')", language: "python" },
    { id: "table-1", type: "table", title: "课程表", table: { rows: [{ cells: [{ plainText: "数学" }] }] } },
    { id: "math-1", type: "mathBlock", title: "公式", formula: "x^2+y^2" },
  ];

  const codeResults = buildHostSearchResults(items, "print", 10);
  assert.equal(codeResults[0].id, "code-1");

  const mathResults = buildHostSearchResults(items, "x^2", 10);
  assert.equal(mathResults[0].id, "math-1");

  console.log("[host-search-adapter] ok: 2 scenarios validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
