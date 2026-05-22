const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

async function main() {
  const builderModule = await import(
    pathToFileURL(
      path.join(__dirname, "..", "public", "src", "engines", "canvas2d-core", "export", "word", "buildWordExportAst.js")
    ).href
  );
  const { compileWordExportAstToDocxBuffer } = require(path.join(__dirname, "..", "electron", "wordDocxCompiler.js"));

  const richTextItem = {
    id: "text-a",
    type: "text",
    x: 360,
    y: 100,
    width: 320,
    height: 120,
    fontSize: 18,
    color: "#0f172a",
    html: "<p>正文</p>",
    plainText: "正文",
    richTextDocument: {
      blocks: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "正文" },
            { type: "footnoteRef", attrs: { refId: "note-1" } },
          ],
        },
        {
          type: "footnote-definition",
          attrs: { id: "note-1" },
          blocks: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "脚注内容" }],
            },
          ],
        },
      ],
    },
  };

  const codeBlockItem = {
    id: "code-a",
    type: "codeBlock",
    x: 40,
    y: 104,
    width: 420,
    height: 140,
    language: "js",
    code: "console.log('hello world');",
    plainText: "console.log('hello world');",
  };

  const tableItem = {
    id: "table-a",
    type: "table",
    x: 60,
    y: 280,
    width: 560,
    height: 220,
    title: "表格",
    table: {
      title: "表格",
      columns: 2,
      hasHeader: true,
      rows: [
        {
          rowIndex: 0,
          cells: [
            { plainText: "列1", header: true, colSpan: 1, rowSpan: 1 },
            { plainText: "列2", header: true, colSpan: 1, rowSpan: 1 },
          ],
        },
        {
          rowIndex: 1,
          cells: [
            { plainText: "A1", header: false, colSpan: 1, rowSpan: 1 },
            { plainText: "A2", header: false, colSpan: 1, rowSpan: 1 },
          ],
        },
      ],
    },
  };

  const mathItem = {
    id: "math-a",
    type: "mathBlock",
    x: 680,
    y: 302,
    width: 300,
    height: 96,
    formula: "\\frac{a}{b}=c",
    displayMode: true,
  };

  const skippedImage = {
    id: "image-a",
    type: "image",
    x: 20,
    y: 30,
    width: 100,
    height: 80,
  };

  const selection = [richTextItem, codeBlockItem, tableItem, mathItem, skippedImage];
  const plan = builderModule.buildSelectionWordExportPlan(selection);

  assert.deepStrictEqual(
    plan.orderedEntries.map((entry) => entry.id),
    ["code-a", "text-a", "table-a", "math-a"],
    "selection reading order is incorrect"
  );
  assert.strictEqual(plan.skippedEntries.length, 1, "unsupported items should be skipped");
  assert.strictEqual(plan.skippedEntries[0].id, "image-a", "image item should be skipped");

  const ast = builderModule.buildWordExportAstFromCanvasSelection(selection, {
    title: "多选导出测试",
  });

  assert.strictEqual(ast.kind, "freeflow-word-export");
  assert.strictEqual(ast.version, 1);
  assert.strictEqual(ast.meta.title, "多选导出测试");
  assert.deepStrictEqual(ast.meta.orderedItemIds, ["code-a", "text-a", "table-a", "math-a"]);
  assert.strictEqual(ast.meta.skippedItems.length, 1, "AST metadata should preserve skipped items");
  assert.ok(Array.isArray(ast.sections) && ast.sections.length === 1, "AST should contain a single section");
  assert.ok(Array.isArray(ast.sections[0].children) && ast.sections[0].children.length > 0, "AST should contain children");

  const topLevelTypes = ast.sections[0].children.map((child) => child.type);
  assert.ok(topLevelTypes.includes("codeBlock"), "AST should contain codeBlock node");
  assert.ok(topLevelTypes.includes("table"), "AST should contain table node");
  assert.ok(topLevelTypes.includes("mathBlock"), "AST should contain mathBlock node");

  const footnoteIds = (Array.isArray(ast.footnotes) ? ast.footnotes : []).map((entry) => entry.id);
  assert.ok(footnoteIds.includes("text-a::note-1"), "footnote id should be namespaced by item id");

  const paragraphWithFootnote = ast.sections[0].children.find(
    (child) => child.type === "paragraph" && Array.isArray(child.children) && child.children.some((inline) => inline.type === "footnoteRef")
  );
  assert.ok(paragraphWithFootnote, "paragraph should preserve footnote reference");
  assert.strictEqual(
    paragraphWithFootnote.children.find((inline) => inline.type === "footnoteRef").refId,
    "text-a::note-1",
    "footnote reference should use namespaced id"
  );

  const buffer = await compileWordExportAstToDocxBuffer(ast);
  assert.ok(Buffer.isBuffer(buffer), "compiled docx result should be a Buffer");
  assert.ok(buffer.byteLength > 2048, "compiled docx buffer is unexpectedly small");

  console.log(JSON.stringify({
    ok: true,
    orderedItemIds: ast.meta.orderedItemIds,
    skippedItems: ast.meta.skippedItems,
    topLevelTypes,
    footnoteIds,
    bufferBytes: buffer.byteLength,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
