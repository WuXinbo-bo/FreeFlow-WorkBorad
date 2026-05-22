"use strict";

async function main() {
  const protocolModule = await import(
    "../../public/src/engines/canvas2d-core/import/protocols/copyDowngradeRules.js"
  );

  const {
    buildDowngradedCopyPayloadFromItems,
    downgradeItemForCopy,
    COPY_DOWNGRADE_RULES_VERSION,
  } = protocolModule;

  const items = [
    {
      id: "code-1",
      type: "codeBlock",
      language: "js",
      plainText: "console.log(1);",
    },
    {
      id: "table-1",
      type: "table",
      table: {
        rows: [
          {
            cells: [
              { plainText: "Name", header: true, colSpan: 1, rowSpan: 1, align: "left" },
              { plainText: "Value", header: true, colSpan: 1, rowSpan: 1, align: "center" },
            ],
          },
          {
            cells: [
              { plainText: "alpha", colSpan: 1, rowSpan: 1, align: "left" },
              { plainText: "42", colSpan: 1, rowSpan: 1, align: "right" },
            ],
          },
        ],
      },
    },
    {
      id: "math-1",
      type: "mathBlock",
      formula: "\\frac{a}{b}",
      fallbackText: "$$\\frac{a}{b}$$",
      displayMode: true,
    },
    {
      id: "file-1",
      type: "fileCard",
      fileName: "report.pdf",
      structuredImport: {
        compatibilityFragment: {
          sourcePath: "D:\\docs\\report.pdf",
        },
      },
    },
  ];

  const codeEntry = downgradeItemForCopy(items[0], 0);
  assert(codeEntry.text.includes("console.log(1);"), "code downgrade text mismatch");
  assert(codeEntry.html.includes("<pre"), "code downgrade html mismatch");

  const payload = buildDowngradedCopyPayloadFromItems(items, {
    source: "canvas",
    createdAt: 456,
  });

  assert(payload.version === COPY_DOWNGRADE_RULES_VERSION, "downgrade rules version mismatch");
  assert(payload.createdAt === 456, "downgrade createdAt mismatch");
  assert(payload.entries.length === 4, "downgrade entry count mismatch");
  assert(payload.text.includes("Name\tValue"), "table downgrade text mismatch");
  assert(payload.html.includes("<table"), "table downgrade html mismatch");
  assert(payload.html.includes("$$\\frac{a}{b}$$"), "math downgrade html mismatch");
  assert(payload.text.includes("[文件] report.pdf"), "fileCard downgrade text mismatch");

  console.log("[copy-downgrade-rules] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[copy-downgrade-rules] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
