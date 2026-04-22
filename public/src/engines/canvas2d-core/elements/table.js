import { buildTextTitle, createId, sanitizeText } from "../utils.js";

export const TABLE_MIN_WIDTH = 260;
export const TABLE_MIN_HEIGHT = 84;
export const TABLE_STRUCTURED_IMPORT_KIND = "structured-import-v1";
const DEFAULT_TABLE_COLUMN_COUNT = 3;
const DEFAULT_TABLE_ROW_COUNT = 3;

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

function normalizeTableSourceMeta(value = {}) {
  if (!value || typeof value !== "object") {
    return {};
  }
  const normalized = {};
  if (value.descriptorId != null && String(value.descriptorId).trim()) {
    normalized.descriptorId = String(value.descriptorId).trim();
  }
  if (value.parserId != null && String(value.parserId).trim()) {
    normalized.parserId = String(value.parserId).trim();
  }
  if (value.entryId != null && String(value.entryId).trim()) {
    normalized.entryId = String(value.entryId).trim();
  }
  return normalized;
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
    sourceMeta: {},
  };
}

export function createEditableTableStructure(columnCount = DEFAULT_TABLE_COLUMN_COUNT, rowCount = DEFAULT_TABLE_ROW_COUNT) {
  const safeColumnCount = Math.max(1, Math.floor(Number(columnCount) || DEFAULT_TABLE_COLUMN_COUNT));
  const safeRowCount = Math.max(1, Math.floor(Number(rowCount) || DEFAULT_TABLE_ROW_COUNT));
  const rows = Array.from({ length: safeRowCount }, (_, rowIndex) => ({
    rowIndex,
    cells: Array.from({ length: safeColumnCount }, (_, cellIndex) =>
      normalizeTableCell(
        {
          plainText: rowIndex === 0 ? `列 ${cellIndex + 1}` : "",
          header: rowIndex === 0,
        },
        rowIndex,
        cellIndex
      )
    ),
  }));
  return normalizeTableStructure({
    title: "表格",
    columns: safeColumnCount,
    hasHeader: true,
    rows,
  });
}

export function createEditableTableElement(point, options = {}) {
  return createTableElement(point, createEditableTableStructure(options.columns, options.rows));
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
  const structuredImport = normalizeStructuredTableMeta(element.structuredImport);
  const sourceMeta = normalizeTableSourceMeta(element.sourceMeta);
  const mergedSourceMeta = {
    ...normalizeTableSourceMeta(structuredImport?.sourceMeta),
    ...sourceMeta,
  };
  const resolvedStructuredImport = structuredImport
    ? {
      ...structuredImport,
      sourceMeta: mergedSourceMeta,
    }
    : null;
  return {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "table",
    title: String(element.title || normalizedTable.title || base.title),
    columns: normalizedTable.columns,
    rows: normalizedTable.rows.length,
    table: normalizedTable,
    width: Math.max(TABLE_MIN_WIDTH, Number(element.width ?? size.width) || size.width),
    height: Math.max(TABLE_MIN_HEIGHT, Number(element.height ?? size.height) || size.height),
    x: Number(element.x ?? base.x) || 0,
    y: Number(element.y ?? base.y) || 0,
    locked: Boolean(element.locked ?? base.locked),
    createdAt: Number(element.createdAt) || base.createdAt,
    sourceMeta: mergedSourceMeta,
    structuredImport: resolvedStructuredImport,
  };
}

export function normalizeTableStructure(structure = {}) {
  const safeRows = Array.isArray(structure?.rows)
    ? structure.rows
    : Array.isArray(structure?.content)
      ? structure.content
      : [];
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

export function getTableCellText(structure = {}, rowIndex = 0, columnIndex = 0) {
  const matrix = flattenTableStructureToMatrix(structure);
  return String(matrix?.[rowIndex]?.[columnIndex]?.plainText || "");
}

export function flattenTableStructureToMatrix(structure = {}) {
  const normalized = normalizeTableStructure(structure);
  const rowCount = Math.max(1, normalized.rows.length || 1);
  const columnCount = Math.max(1, Number(normalized.columns || 1));
  const matrix = Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => ({
      rowIndex,
      columnIndex,
      plainText: "",
      header: rowIndex === 0 && Boolean(normalized.hasHeader),
      align: "",
      sourceRowIndex: rowIndex,
      sourceCellIndex: columnIndex,
    }))
  );

  normalized.rows.forEach((row, rowIndex) => {
    let cursor = 0;
    row.cells.forEach((cell, cellIndex) => {
      while (cursor < columnCount && matrix[rowIndex][cursor].plainText) {
        cursor += 1;
      }
      const startColumn = Math.min(columnCount - 1, cursor);
      const span = Math.max(1, Number(cell?.colSpan || 1));
      const rowSpan = Math.max(1, Number(cell?.rowSpan || 1));
      for (let y = rowIndex; y < Math.min(rowCount, rowIndex + rowSpan); y += 1) {
        for (let x = startColumn; x < Math.min(columnCount, startColumn + span); x += 1) {
          matrix[y][x] = {
            rowIndex: y,
            columnIndex: x,
            plainText: y === rowIndex && x === startColumn ? String(cell?.plainText || "") : "",
            header: Boolean(cell?.header),
            align: String(cell?.align || ""),
            sourceRowIndex: rowIndex,
            sourceCellIndex: cellIndex,
          };
        }
      }
      cursor = startColumn + span;
    });
  });

  return matrix;
}

export function createTableStructureFromMatrix(matrix = [], options = {}) {
  const safeRows = Array.isArray(matrix) ? matrix : [];
  const columnCount = Math.max(
    1,
    Number(options.columns || 0),
    safeRows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0)
  );
  const hasHeader = options.hasHeader !== false;
  const rows = Array.from({ length: Math.max(1, safeRows.length || 1) }, (_, rowIndex) => {
    const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
      const value = safeRows?.[rowIndex]?.[columnIndex];
      const text = typeof value === "object" && value
        ? String(value.plainText || value.text || "")
        : String(value || "");
      return normalizeTableCell(
        {
          plainText: text,
          header: typeof value === "object" && value != null ? Boolean(value.header) : rowIndex === 0 && hasHeader,
          align: typeof value === "object" && value != null ? value.align : "",
        },
        rowIndex,
        columnIndex
      );
    });
    return {
      rowIndex,
      cells,
    };
  });
  return normalizeTableStructure({
    title: String(options.title || "表格"),
    columns: columnCount,
    hasHeader,
    rows,
  });
}

export function updateTableElementStructure(element = {}, structure = {}) {
  const normalizedTable = normalizeTableStructure(structure);
  const size = estimateTableElementSize(normalizedTable);
  return normalizeTableElement({
    ...element,
    title: String(element?.title || normalizedTable.title || "表格"),
    columns: normalizedTable.columns,
    rows: normalizedTable.rows.length,
    table: normalizedTable,
    width: Math.max(TABLE_MIN_WIDTH, Number(element?.width || 0) || size.width, size.width),
    height: Math.max(TABLE_MIN_HEIGHT, Number(element?.height || 0) || size.height, size.height),
  });
}

function normalizeTableRow(row = {}, rowIndex = 0) {
  const cells = Array.isArray(row?.cells)
    ? row.cells
    : Array.isArray(row?.content)
      ? row.content
      : [];
  const normalizedCells = cells
    .filter((cell) => isTableCellLike(cell))
    .map((cell, cellIndex) => normalizeTableCell(cell, rowIndex, cellIndex));
  return {
    rowIndex,
    cells: normalizedCells.length ? normalizedCells : [normalizeTableCell({ plainText: "" }, rowIndex, 0)],
  };
}

function normalizeTableCell(cell = {}, rowIndex = 0, cellIndex = 0) {
  const plainText = sanitizeText(
    cell.plainText || cell.text || extractCanonicalCellText(cell.content || [])
  );
  return {
    rowIndex,
    cellIndex,
    plainText,
    html: String(cell.html || "").trim(),
    header: Boolean(cell.header ?? cell?.attrs?.header),
    align: normalizeAlign(cell.align ?? cell?.attrs?.align),
    colSpan: normalizePositiveInteger(cell.colSpan ?? cell?.attrs?.colSpan, 1),
    rowSpan: normalizePositiveInteger(cell.rowSpan ?? cell?.attrs?.rowSpan, 1),
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

function isTableCellLike(cell = {}) {
  const type = String(cell?.type || "").trim().toLowerCase();
  return !type || type === "tablecell" || type === "tableheader" || type === "tableheadercell";
}

function extractCanonicalCellText(nodes = []) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const fragments = [];
  safeNodes.forEach((node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "paragraph" || node.type === "heading") {
      const inline = Array.isArray(node.content) ? node.content : [];
      fragments.push(
        sanitizeText(
          inline
            .map((entry) => String(entry?.text || ""))
            .join("")
        )
      );
      return;
    }
    if (node.type === "text") {
      fragments.push(String(node.text || ""));
      return;
    }
    if (Array.isArray(node.content) && node.content.length) {
      fragments.push(extractCanonicalCellText(node.content));
    }
  });
  return fragments.filter(Boolean).join("\n");
}

function normalizeAlign(value) {
  const align = String(value || "").trim().toLowerCase();
  return ["left", "center", "right"].includes(align) ? align : "";
}

function normalizePositiveInteger(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
