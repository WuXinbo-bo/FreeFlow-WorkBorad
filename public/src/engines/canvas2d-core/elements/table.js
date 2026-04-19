import { buildTextTitle, createId, sanitizeText } from "../utils.js";

export const TABLE_MIN_WIDTH = 260;
export const TABLE_MIN_HEIGHT = 84;
export const TABLE_STRUCTURED_IMPORT_KIND = "structured-import-v1";

export function normalizeStructuredTableMeta(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    kind: TABLE_STRUCTURED_IMPORT_KIND,
    sourceNodeType: String(value.sourceNodeType || "").trim() || "table",
    canonicalFragment: value.canonicalFragment && typeof value.canonicalFragment === "object"
      ? JSON.parse(JSON.stringify(value.canonicalFragment))
      : null,
    sourceMeta: value.sourceMeta && typeof value.sourceMeta === "object" ? { ...value.sourceMeta } : {},
  };
}

export function createTableElement(point, structure = {}) {
  const normalizedStructure = normalizeTableStructure(structure);
  const size = estimateTableElementSize(normalizedStructure);
  return {
    id: createId("table"),
    type: "table",
    title: buildTextTitle(normalizedStructure.title || "表格"),
    columns: normalizedStructure.columns,
    rows: normalizedStructure.rows.length,
    table: normalizedStructure,
    width: size.width,
    height: size.height,
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    locked: false,
    createdAt: Date.now(),
    structuredImport: null,
  };
}

export function normalizeTableElement(element = {}) {
  const base = createTableElement(
    { x: Number(element.x) || 0, y: Number(element.y) || 0 },
    element.table || {
      title: element.title || "表格",
      columns: element.columns,
      rows: element.rowData || [],
      hasHeader: Boolean(element.hasHeader),
    }
  );
  const normalizedTable = normalizeTableStructure(element.table || base.table || {});
  const size = estimateTableElementSize(normalizedTable);
  return {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "table",
    title: String(element.title || normalizedTable.title || base.title),
    columns: Math.max(1, Number(element.columns ?? normalizedTable.columns) || normalizedTable.columns),
    rows: Math.max(0, Number(element.rows ?? normalizedTable.rows.length) || normalizedTable.rows.length),
    table: normalizedTable,
    width: Math.max(TABLE_MIN_WIDTH, Number(element.width ?? size.width) || size.width),
    height: Math.max(TABLE_MIN_HEIGHT, Number(element.height ?? size.height) || size.height),
    x: Number(element.x ?? base.x) || 0,
    y: Number(element.y ?? base.y) || 0,
    locked: Boolean(element.locked ?? base.locked),
    createdAt: Number(element.createdAt) || base.createdAt,
    structuredImport: normalizeStructuredTableMeta(element.structuredImport),
  };
}

export function normalizeTableStructure(structure = {}) {
  const safeRows = Array.isArray(structure?.rows) ? structure.rows : [];
  const normalizedRows = safeRows.map((row, rowIndex) => normalizeTableRow(row, rowIndex));
  const columns = Math.max(
    1,
    Number(structure?.columns) || 0,
    normalizedRows.reduce((max, row) => Math.max(max, row.cells.reduce((sum, cell) => sum + cell.colSpan, 0)), 0)
  );
  const title = String(structure?.title || inferTableTitle(normalizedRows) || "表格");
  return {
    title,
    columns,
    hasHeader: Boolean(structure?.hasHeader) || normalizedRows.some((row) => row.cells.some((cell) => cell.header)),
    rows: normalizedRows,
  };
}

function normalizeTableRow(row = {}, rowIndex = 0) {
  const cells = Array.isArray(row?.cells) ? row.cells : [];
  return {
    rowIndex,
    cells: cells.map((cell, cellIndex) => normalizeTableCell(cell, rowIndex, cellIndex)),
  };
}

function normalizeTableCell(cell = {}, rowIndex = 0, cellIndex = 0) {
  const plainText = sanitizeText(cell.plainText || cell.text || "");
  return {
    rowIndex,
    cellIndex,
    plainText,
    html: String(cell.html || ""),
    header: Boolean(cell.header),
    align: normalizeAlign(cell.align),
    colSpan: normalizePositiveInteger(cell.colSpan, 1),
    rowSpan: normalizePositiveInteger(cell.rowSpan, 1),
  };
}

function estimateTableElementSize(structure = {}) {
  const columns = Math.max(1, Number(structure?.columns) || 1);
  const width = Math.max(TABLE_MIN_WIDTH, Math.min(1200, columns * 140));
  const rows = Array.isArray(structure?.rows) ? structure.rows : [];
  const height = Math.max(
    TABLE_MIN_HEIGHT,
    Math.min(
      1600,
      rows.reduce((sum, row) => {
        const rowHeight = Math.max(
          42,
          ...row.cells.map((cell) => Math.max(42, 22 + Math.max(1, cell.plainText.split("\n").length) * 20))
        );
        return sum + rowHeight;
      }, 0) || TABLE_MIN_HEIGHT
    )
  );
  return { width, height };
}

function inferTableTitle(rows = []) {
  for (const row of rows) {
    for (const cell of row.cells) {
      const text = sanitizeText(cell.plainText || "").trim();
      if (text) {
        return text;
      }
    }
  }
  return "";
}

function normalizeAlign(value) {
  const align = String(value || "").trim().toLowerCase();
  return ["left", "center", "right"].includes(align) ? align : "";
}

function normalizePositiveInteger(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
