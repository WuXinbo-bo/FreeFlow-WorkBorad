const assert = require("node:assert/strict");

async function main() {
  const flattenMenuActions = (schema = []) =>
    (Array.isArray(schema) ? schema : []).flatMap((entry) => [
      ...(entry?.action ? [entry.action] : []),
      ...(Array.isArray(entry?.items) ? flattenMenuActions(entry.items) : []),
    ]);
  const assertUniqueMenuActions = (schema) => {
    const actions = flattenMenuActions(schema);
    assert.equal(new Set(actions).size, actions.length, `duplicate menu actions: ${actions.join(", ")}`);
  };
  const {
    getCopyMenuItems,
    getExportMenuItems,
    normalizeCopyExportElementType,
    resolveCopyExportAction,
  } = await import("../public/src/engines/canvas2d-core/export/copyExportProtocol.js");
  const {
    createFileCardContextMenuSchema,
    createImageContextMenuSchema,
    createMathContextMenuSchema,
  } = await import("../public/src/engines/canvas2d-core/contextMenu/menuSchemaBuilders.js");
  const { buildTextElementFromMathElement } = await import(
    "../public/src/engines/canvas2d-core/elements/mathText.js"
  );
  const {
    applyTableCellContentEdit,
    flattenTableStructureToMatrix,
    normalizeTableStructure,
  } = await import(
    "../public/src/engines/canvas2d-core/elements/table.js"
  );
  const { downgradeItemForCopy } = await import(
    "../public/src/engines/canvas2d-core/import/protocols/copyDowngradeRules.js"
  );
  const { getTableFormatDegradations } = await import(
    "../public/src/engines/canvas2d-core/elements/tableFormats.js"
  );
  const {
    buildTableWorksheet,
    createStructuredExportRuntime,
  } = await import("../public/src/engines/canvas2d-core/export/runtime/createStructuredExportRuntime.js");
  const { CANVAS_OPERATION_STATUS } = await import(
    "../public/src/engines/canvas2d-core/operations/canvasOperationResult.js"
  );
  const XLSX = await import("../public/vendor/xlsx/xlsx.mjs");

  assert(getCopyMenuItems("codeBlock").some((entry) => entry.action === "code-copy-text-html"));
  assert.deepEqual(resolveCopyExportAction("image-copy-bitmap").targetTypes, ["image"]);
  assert.deepEqual(resolveCopyExportAction("file-copy-original").targetTypes, ["fileCard"]);
  assert.deepEqual(resolveCopyExportAction("math-copy-latex").targetTypes, ["mathBlock", "mathInline", "text"]);

  const latexMath = buildTextElementFromMathElement({
    id: "math-latex",
    type: "mathBlock",
    formula: "x^2 + y^2",
    sourceFormat: "latex",
    displayMode: true,
  });
  assert.equal(latexMath.type, "text");
  assert.equal(normalizeCopyExportElementType(latexMath), "math");
  assert.deepEqual(getCopyMenuItems("mathBlock", { item: latexMath }).map((entry) => entry.format), ["latex"]);
  assert(getExportMenuItems("mathBlock", { item: latexMath }).some((entry) => entry.action === "math-export-latex"));
  assert(!getExportMenuItems("mathBlock", { item: latexMath }).some((entry) => entry.action === "math-export-mathml"));
  const latexMathMenu = createMathContextMenuSchema(latexMath);
  assert(latexMathMenu.some((entry) => entry.label === "复制内容"));
  assertUniqueMenuActions(latexMathMenu);

  const mathmlMath = buildTextElementFromMathElement({
    id: "math-mathml",
    type: "mathBlock",
    formula: "<math><mi>x</mi></math>",
    sourceFormat: "mathml",
    displayMode: true,
  });
  assert.deepEqual(getCopyMenuItems("mathBlock", { item: mathmlMath }).map((entry) => entry.format), ["mathml"]);
  const mathmlDowngrade = downgradeItemForCopy(mathmlMath, 0);
  assert.equal(mathmlDowngrade.downgradedFrom, "math");
  assert.equal(mathmlDowngrade.sourceFormat, "mathml");
  assert.equal(mathmlDowngrade.html, "<math><mi>x</mi></math>");
  assert(!mathmlDowngrade.html.includes("<p>"));

  const imageData = { id: "image-data", type: "image", dataUrl: "data:image/png;base64,AA==" };
  assert.deepEqual(
    getCopyMenuItems("image", {
      item: imageData,
      runtime: { bitmapClipboard: true, fileClipboard: false },
    }).map((entry) => entry.format),
    ["bitmap"]
  );
  const imageRemote = {
    id: "image-remote",
    type: "image",
    structuredImport: { canonicalFragment: { attrs: { src: "https://example.test/image.png" } } },
  };
  assert.deepEqual(
    getCopyMenuItems("image", {
      item: imageRemote,
      runtime: { bitmapClipboard: true, fileClipboard: false },
    }).map((entry) => entry.format),
    ["bitmap", "source-link"]
  );
  const imageLocal = { id: "image-local", type: "image", sourcePath: "D:\\assets\\image.png" };
  const imageMenu = createImageContextMenuSchema(imageLocal, {
    bitmapClipboard: true,
    fileClipboard: true,
  });
  assert(imageMenu.some((entry) => entry.label === "复制内容"));
  assert.equal(flattenMenuActions(imageMenu).filter((action) => action === "image-export-png").length, 1);
  assertUniqueMenuActions(imageMenu);

  const fileCard = {
    id: "file-a",
    type: "fileCard",
    fileName: "report.pdf",
    sourcePath: "D:\\docs\\report.pdf",
    ext: "pdf",
  };
  assert.deepEqual(
    getCopyMenuItems("fileCard", { item: fileCard, runtime: { fileClipboard: true } }).map((entry) => entry.format),
    ["file", "path", "filename"]
  );
  const fileCardMenu = createFileCardContextMenuSchema(fileCard, { fileClipboard: true });
  assert(fileCardMenu.some((entry) => entry.label === "导出"));
  assertUniqueMenuActions(fileCardMenu);

  const table = normalizeTableStructure({
    title: "Metrics",
    columns: 2,
    hasHeader: true,
    rows: [
      {
        cells: [
          {
            plainText: "Metrics",
            html: "<strong>Metrics</strong>",
            header: true,
            align: "center",
            colSpan: 2,
          },
        ],
      },
      {
        cells: [
          { plainText: "42", value: 42, valueType: "number", numberFormat: "0", align: "right" },
          { plainText: "Enabled", value: true, valueType: "boolean", align: "center" },
        ],
      },
      {
        cells: [
          { plainText: "12.5%", value: 0.125, valueType: "number", numberFormat: "0.0000%", align: "right" },
          { plainText: "Custom format", value: "Custom format", valueType: "string", align: "left" },
        ],
      },
    ],
  });
  const matrix = flattenTableStructureToMatrix(table);
  const emptyTypedTable = normalizeTableStructure({
    columns: 2,
    rows: [{
      cells: [
        { plainText: "", value: null, valueType: "number" },
        { plainText: "", value: null, valueType: "date" },
      ],
    }],
  });
  const emptyTypedMatrix = flattenTableStructureToMatrix(emptyTypedTable);
  assert.equal(emptyTypedMatrix[0][0].value, null);
  assert.equal(emptyTypedMatrix[0][1].value, null);
  const emptyTypedSheet = buildTableWorksheet(emptyTypedMatrix, { hasHeader: false });
  assert.equal(emptyTypedSheet.A1.t, "s");
  assert.equal(emptyTypedSheet.A1.v, "");
  assert.equal(emptyTypedSheet.B1.t, "s");
  assert.equal(emptyTypedSheet.B1.v, "");
  const sheet = buildTableWorksheet(matrix, { hasHeader: true });
  assert.deepEqual(sheet["!merges"], [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]);
  assert.equal(sheet.A2.t, "n");
  assert.equal(sheet.A2.v, 42);
  assert.equal(sheet.A2.z, "0");
  assert.equal(sheet.A2.s.alignment.horizontal, "right");
  assert.equal(sheet.B2.t, "b");
  assert.equal(sheet.B2.v, true);
  assert.equal(sheet.B2.s.alignment.horizontal, "center");
  assert.equal(sheet.A1.s.font.bold, true);
  assert.deepEqual(sheet["!autofilter"], { ref: "A1:B3" });

  const originalTypedCell = matrix[1][0];
  const unchangedTypedCell = applyTableCellContentEdit(originalTypedCell, {
    plainText: originalTypedCell.plainText,
    html: originalTypedCell.html,
    richTextDocument: originalTypedCell.richTextDocument,
  });
  assert.equal(unchangedTypedCell.value, 42);
  assert.equal(unchangedTypedCell.valueType, "number");
  assert.equal(unchangedTypedCell.numberFormat, "0");
  const changedTypedCell = applyTableCellContentEdit(originalTypedCell, {
    plainText: "43",
    html: originalTypedCell.html,
    richTextDocument: originalTypedCell.richTextDocument,
  });
  assert.equal(changedTypedCell.value, null);
  assert.equal(changedTypedCell.valueType, "");
  assert.equal(changedTypedCell.numberFormat, "");

  const degradationCodes = getTableFormatDegradations(matrix, "csv").map((entry) => entry.code);
  assert(degradationCodes.includes("merged-cells"));
  assert(degradationCodes.includes("cell-alignment"));
  assert(degradationCodes.includes("typed-values"));
  assert(degradationCodes.includes("rich-cell-content"));

  const saved = [];
  let savedWorkbookBytes = null;
  const exportRuntime = createStructuredExportRuntime({
    fileAdapter: {
      saveBlobAsFile: async (blob, options) => {
        saved.push({ text: await blob.text(), options });
        return { ok: true, path: `D:\\tmp\\${options.defaultName}.${options.extension}` };
      },
      saveBytesAsFile: async (bytes, options) => {
        savedWorkbookBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        saved.push({ bytes: savedWorkbookBytes, options });
        return { ok: true, path: "D:\\tmp\\metrics.xlsx", size: savedWorkbookBytes.byteLength };
      },
    },
  });
  const tableItem = { id: "table-a", type: "table", title: "Metrics", table };
  const csvResult = await exportRuntime.exportTableItem(tableItem, "csv");
  assert.equal(csvResult.operationResult.status, CANVAS_OPERATION_STATUS.DEGRADED);
  assert.equal(csvResult.operationResult.degradedCount, 4);
  assert(csvResult.message.includes("合并单元格"));

  const xlsxResult = await exportRuntime.exportTableItem(tableItem, "xlsx");
  assert.equal(xlsxResult.operationResult.status, CANVAS_OPERATION_STATUS.DEGRADED);
  assert.equal(xlsxResult.operationResult.degradedCount, 1);
  assert(xlsxResult.message.includes("单元格富格式"));
  assert(savedWorkbookBytes instanceof Uint8Array && savedWorkbookBytes.byteLength > 0);
  const reopenedWorkbook = XLSX.read(savedWorkbookBytes, {
    type: "array",
    cellDates: true,
    cellStyles: true,
  });
  const reopenedSheet = reopenedWorkbook.Sheets.Table;
  assert.deepEqual(reopenedSheet["!merges"], [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]);
  assert.equal(reopenedSheet.A2.t, "n");
  assert.equal(reopenedSheet.A2.v, 42);
  assert.equal(reopenedSheet.A2.z, "0");
  assert.equal(reopenedSheet.B2.t, "b");
  assert.equal(reopenedSheet.B2.v, true);
  assert.equal(reopenedSheet.A3.t, "n");
  assert.equal(reopenedSheet.A3.v, 0.125);
  assert.equal(reopenedSheet.A3.z, "0.0000%");

  const workbookContainer = XLSX.CFB.read(savedWorkbookBytes, { type: "buffer" });
  const stylesEntry = XLSX.CFB.find(workbookContainer, "/xl/styles.xml");
  const worksheetEntry = XLSX.CFB.find(workbookContainer, "/xl/worksheets/sheet1.xml");
  assert(stylesEntry?.content && worksheetEntry?.content);
  const stylesXml = new TextDecoder().decode(stylesEntry.content);
  const worksheetXml = new TextDecoder().decode(worksheetEntry.content);
  const cellXfsBody = stylesXml.match(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/)?.[1] || "";
  const cellXfs = cellXfsBody.match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) || [];
  const readCellStyle = (address) => {
    const styleIndex = Number(
      worksheetXml.match(new RegExp(`<c\\b[^>]*\\br="${address}"[^>]*\\bs="(\\d+)"[^>]*>`))?.[1]
    );
    assert(Number.isInteger(styleIndex) && styleIndex >= 0, `${address} is missing its XLSX style index`);
    return cellXfs[styleIndex] || "";
  };
  const a1Style = readCellStyle("A1");
  const a2Style = readCellStyle("A2");
  const b2Style = readCellStyle("B2");
  const a3Style = readCellStyle("A3");
  assert(a1Style.includes('applyFont="1"'), a1Style);
  assert(a1Style.includes('horizontal="center"'), a1Style);
  assert(a2Style.includes('horizontal="right"'), a2Style);
  assert(b2Style.includes('horizontal="center"'), b2Style);
  assert(a3Style.includes('horizontal="right"'), a3Style);
  const customFormatIds = Array.from(
    stylesXml.matchAll(/<numFmt\b[^>]*\bnumFmtId="(\d+)"[^>]*\bformatCode="0\.0000%"[^>]*\/>/g)
  );
  assert.equal(customFormatIds.length, 1);

  const mathResult = await exportRuntime.exportMathItem(latexMath, "latex");
  assert.equal(mathResult.operationResult.status, CANVAS_OPERATION_STATUS.SUCCESS);
  assert.equal(saved.at(-1).text, "x^2 + y^2");
  assert.equal(saved.at(-1).options.extension, "tex");

  console.log("[check-canvas-semantic-transfer] ok: protocols, fidelity and degradation validated");
}

main().catch((error) => {
  console.error(`[check-canvas-semantic-transfer] ${error.stack || error.message}`);
  process.exitCode = 1;
});
