const assert = require("assert");

async function main() {
  const {
    canvasElementRegistry,
    getElementBounds,
    moveElement,
    normalizeElement,
    resizeElement,
  } = await import("../public/src/engines/canvas2d-core/elements/index.js");
  const {
    getCopyMenuItems,
    getElementTransferCapabilities,
    getExportMenuItems,
    resolveCopyExportAction,
  } = await import("../public/src/engines/canvas2d-core/export/copyExportProtocol.js");
  const {
    createCodeBlockContextMenuSchema,
    createElementTransferActionsSchema,
    createRichEditorContextMenuSchema,
    createRichTextItemContextMenuSchema,
    createTableContextMenuSchema,
  } = await import("../public/src/engines/canvas2d-core/contextMenu/menuSchemaBuilders.js");

  const expectedTypes = [
    "shape",
    "image",
    "fileCard",
    "codeBlock",
    "table",
    "mathBlock",
    "mathInline",
    "mindNode",
    "mindSummary",
    "mindRelationship",
    "flowNode",
    "flowEdge",
    "text",
  ];
  const validation = canvasElementRegistry.validate({
    requiredCapabilities: ["normalize", "getBounds", "translate", "resize", "render", "lod", "hitTest", "handles", "editor", "overlay", "resource", "layer", "cache", "marquee", "visibility", "objectCopy", "contentCopy", "selectionCopy", "copyExportProtocol", "visualExport", "semanticExport", "dependencyClosure", "measurement", "persistence"],
  });
  assert.strictEqual(validation.ok, true, validation.missing.join(", "));
  assert.deepStrictEqual(validation.types, expectedTypes);
  expectedTypes.forEach((type) => {
    const capabilities = getElementTransferCapabilities(type);
    assert(capabilities, `missing transfer capabilities for ${type}`);
    assert.strictEqual(capabilities.objectCopy, true, `${type} must support object copy`);
    assert.deepStrictEqual(capabilities.visualExport, ["png", "pdf"], `${type} visual export mismatch`);
    assert(capabilities.measurement !== "", `${type} measurement contract missing`);
    assert(capabilities.persistence !== "", `${type} persistence contract missing`);
    const copyMenu = getCopyMenuItems(type);
    const exportMenu = getExportMenuItems(type);
    assert.strictEqual(copyMenu.length > 0, capabilities.contentCopy !== "none", `${type} copy menu mismatch`);
    assert.strictEqual(exportMenu.length > 0, capabilities.semanticExport.length > 0 && capabilities.copyExportProtocol !== "none", `${type} export menu mismatch`);
  });

  assert.deepStrictEqual(resolveCopyExportAction("copy-text-html").targetTypes, ["flowNode", "text"]);
  assert.deepStrictEqual(resolveCopyExportAction("table-export-xlsx").targetTypes, ["table"]);
  assert.deepStrictEqual(resolveCopyExportAction("code-export-source").targetTypes, ["codeBlock"]);

  const transferLabels = (schema) => schema.map((entry) => entry.label);
  assert.deepStrictEqual(
    transferLabels(createElementTransferActionsSchema("text")),
    ["剪切", "复制元素", "复制内容", "粘贴", "导出"]
  );
  assert(transferLabels(createRichTextItemContextMenuSchema()).includes("复制内容"));
  assert(transferLabels(createCodeBlockContextMenuSchema()).includes("复制内容"));
  assert(transferLabels(createTableContextMenuSchema()).includes("复制内容"));
  assert(transferLabels(createRichEditorContextMenuSchema()).includes("复制选区"));

  assert.strictEqual(normalizeElement({ type: "file", name: "a" }).type, "fileCard");
  assert.strictEqual(normalizeElement({ type: "code", code: "x" }).type, "codeBlock");
  assert.strictEqual(normalizeElement({ type: "richText", text: "x" }).type, "text");
  const unknown = normalizeElement({ type: "pluginWidget", text: "x", pluginState: { value: 42 } });
  assert.strictEqual(unknown.type, "text");
  assert.strictEqual(unknown.unknownElement.originalType, "pluginWidget");
  assert.deepStrictEqual(unknown.unknownElement.payload.pluginState, { value: 42 });

  const rect = { id: "rect", type: "shape", shapeType: "rect", x: 10, y: 20, width: 100, height: 80 };
  assert.deepStrictEqual(getElementBounds(rect), {
    left: 10,
    top: 20,
    width: 100,
    height: 80,
    right: 110,
    bottom: 100,
  });
  assert.deepStrictEqual(moveElement(rect, 5, -4), {
    ...rect,
    x: 15,
    y: 16,
    startX: 15,
    startY: 16,
    endX: 15,
    endY: 16,
  });
  assert.deepStrictEqual(resizeElement(rect, "se", { x: 15, y: 25 }), {
    ...rect,
    x: 10,
    y: 20,
    width: 24,
    height: 24,
    startX: 10,
    startY: 20,
    endX: 15,
    endY: 25,
  });

  const line = { id: "line", type: "shape", shapeType: "line", startX: 40, startY: 30, endX: 10, endY: 70 };
  assert.deepStrictEqual(getElementBounds(line), {
    left: 10,
    top: 30,
    width: 30,
    height: 40,
    right: 40,
    bottom: 70,
  });
  const resizedLine = resizeElement(line, "start", { x: 4, y: 8 });
  assert.strictEqual(resizedLine.startX, 4);
  assert.strictEqual(resizedLine.startY, 8);
  assert.strictEqual(resizedLine.endX, 10);
  assert.strictEqual(resizedLine.endY, 70);

  const edge = { id: "edge", type: "flowEdge", fromId: "a", toId: "b" };
  assert.strictEqual(moveElement(edge, 20, 30), edge);
  assert.strictEqual(resizeElement(edge, "se", { x: 20, y: 30 }), edge);

  const fileCard = { id: "file", type: "fileCard", x: 0, y: 0, width: 300, height: 120 };
  const resizedFile = resizeElement(fileCard, "se", { x: 40, y: 30 });
  assert.strictEqual(resizedFile.width, 200);
  assert.strictEqual(resizedFile.height, 96);

  const mindSummary = { id: "summary", type: "mindSummary", x: 0, y: 0, width: 220, height: 72 };
  const resizedSummary = resizeElement(mindSummary, "se", { x: 220, y: 40 });
  assert.strictEqual(resizedSummary.width, 220);
  assert.strictEqual(resizedSummary.height, 72);

  console.log(`[check-builtin-element-registry] ok: ${validation.types.length} types`);
}

main().catch((error) => {
  console.error(`[check-builtin-element-registry] ${error.stack || error.message}`);
  process.exitCode = 1;
});
