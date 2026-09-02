import { buildTextTitle, createId, sanitizeText } from "../utils.js";

export const TABLE_MIN_WIDTH = 260;
export const TABLE_MIN_HEIGHT = 84;
export const TABLE_STRUCTURED_IMPORT_KIND = "structured-import-v1";
const DEFAULT_TABLE_COLUMN_COUNT = 3;
const DEFAULT_TABLE_ROW_COUNT = 3;
const IMPORTED_TABLE_TARGET_WIDTH = 820;
const IMPORTED_TABLE_COLUMN_WIDTH = 152;
const IMPORTED_TABLE_MAX_WIDTH = 1280;

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
  const structuredImport = normalizeStructuredTableMeta(element.structuredImport);
  const size = estimateTableElementSize(normalizedTable, Number(element.width) || 0);
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
    height: structuredImport
      ? Math.max(TABLE_MIN_HEIGHT, Number(element.height) || 0, size.height)
      : Math.max(TABLE_MIN_HEIGHT, Number(element.height ?? size.height) || size.height),
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
  const occupied = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => false));
  const matrix = Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => ({
      rowIndex,
      columnIndex,
      plainText: "",
      html: "",
      richTextDocument: null,
      header: rowIndex === 0 && Boolean(normalized.hasHeader),
      align: "",
      colSpan: 1,
      rowSpan: 1,
      covered: false,
      anchorRowIndex: rowIndex,
      anchorColumnIndex: columnIndex,
      sourceRowIndex: rowIndex,
      sourceCellIndex: columnIndex,
    }))
  );

  normalized.rows.forEach((row, rowIndex) => {
    let cursor = 0;
    row.cells.forEach((cell, cellIndex) => {
      while (cursor < columnCount && occupied[rowIndex][cursor]) {
        cursor += 1;
      }
      if (cursor >= columnCount) {
        return;
      }
      const startColumn = Math.min(columnCount - 1, cursor);
      const span = Math.min(columnCount - startColumn, Math.max(1, Number(cell?.colSpan || 1)));
      const rowSpan = Math.min(rowCount - rowIndex, Math.max(1, Number(cell?.rowSpan || 1)));
      for (let y = rowIndex; y < Math.min(rowCount, rowIndex + rowSpan); y += 1) {
        for (let x = startColumn; x < Math.min(columnCount, startColumn + span); x += 1) {
          occupied[y][x] = true;
          matrix[y][x] = {
            rowIndex: y,
            columnIndex: x,
            plainText: y === rowIndex && x === startColumn ? String(cell?.plainText || "") : "",
            html: y === rowIndex && x === startColumn ? String(cell?.html || "") : "",
            richTextDocument:
              y === rowIndex && x === startColumn && cell?.richTextDocument && typeof cell.richTextDocument === "object"
                ? JSON.parse(JSON.stringify(cell.richTextDocument))
                : null,
            header: Boolean(cell?.header),
            align: String(cell?.align || ""),
            value: y === rowIndex && x === startColumn ? cloneTableCellValue(cell?.value) : null,
            valueType: y === rowIndex && x === startColumn ? String(cell?.valueType || "") : "",
            numberFormat: y === rowIndex && x === startColumn ? String(cell?.numberFormat || "") : "",
            colSpan: span,
            rowSpan,
            covered: y !== rowIndex || x !== startColumn,
            anchorRowIndex: rowIndex,
            anchorColumnIndex: startColumn,
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
      if (value && typeof value === "object" && value.covered) {
        return null;
      }
      const text = typeof value === "object" && value
        ? String(value.plainText || value.text || "")
        : String(value || "");
      const html = typeof value === "object" && value ? String(value.html || "").trim() : "";
      return normalizeTableCell(
        {
          plainText: text,
          html,
          richTextDocument:
            typeof value === "object" && value?.richTextDocument && typeof value.richTextDocument === "object"
              ? JSON.parse(JSON.stringify(value.richTextDocument))
              : null,
          header: typeof value === "object" && value != null ? Boolean(value.header) : rowIndex === 0 && hasHeader,
          align: typeof value === "object" && value != null ? value.align : "",
          value: typeof value === "object" && value != null ? value.value : null,
          valueType: typeof value === "object" && value != null ? value.valueType : "",
          numberFormat: typeof value === "object" && value != null ? value.numberFormat : "",
          colSpan: typeof value === "object" && value != null ? value.colSpan : 1,
          rowSpan: typeof value === "object" && value != null ? value.rowSpan : 1,
        },
        rowIndex,
        columnIndex
      );
    }).filter(Boolean);
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

export function getTableMatrixAnchor(matrix = [], rowIndex = 0, columnIndex = 0) {
  const cell = matrix?.[rowIndex]?.[columnIndex];
  if (!cell) {
    return null;
  }
  const anchorRowIndex = Math.max(0, Number(cell.anchorRowIndex ?? rowIndex) || 0);
  const anchorColumnIndex = Math.max(0, Number(cell.anchorColumnIndex ?? columnIndex) || 0);
  return matrix?.[anchorRowIndex]?.[anchorColumnIndex] || cell;
}

export function mergeTableMatrixRange(matrix = [], range = {}) {
  const nextMatrix = cloneTableMatrixWithSpans(matrix);
  if (!nextMatrix.length || !(nextMatrix[0] || []).length) {
    return { matrix: nextMatrix, changed: false, bounds: null };
  }
  const rowCount = nextMatrix.length;
  const columnCount = nextMatrix[0].length;
  const bounds = {
    startRow: Math.max(0, Math.min(rowCount - 1, Number(range.startRow) || 0)),
    endRow: Math.max(0, Math.min(rowCount - 1, Number(range.endRow) || 0)),
    startColumn: Math.max(0, Math.min(columnCount - 1, Number(range.startColumn) || 0)),
    endColumn: Math.max(0, Math.min(columnCount - 1, Number(range.endColumn) || 0)),
  };
  if (bounds.startRow > bounds.endRow) [bounds.startRow, bounds.endRow] = [bounds.endRow, bounds.startRow];
  if (bounds.startColumn > bounds.endColumn) [bounds.startColumn, bounds.endColumn] = [bounds.endColumn, bounds.startColumn];
  expandBoundsToMergedCells(nextMatrix, bounds);
  if (bounds.startRow === bounds.endRow && bounds.startColumn === bounds.endColumn) {
    return { matrix: nextMatrix, changed: false, bounds };
  }
  const anchors = [];
  const seen = new Set();
  for (let rowIndex = bounds.startRow; rowIndex <= bounds.endRow; rowIndex += 1) {
    for (let columnIndex = bounds.startColumn; columnIndex <= bounds.endColumn; columnIndex += 1) {
      const cell = nextMatrix[rowIndex][columnIndex];
      const key = `${cell.anchorRowIndex}:${cell.anchorColumnIndex}`;
      if (!seen.has(key)) {
        seen.add(key);
        anchors.push(getTableMatrixAnchor(nextMatrix, rowIndex, columnIndex));
      }
    }
  }
  const anchor = nextMatrix[bounds.startRow][bounds.startColumn];
  const plainText = anchors.map((cell) => String(cell?.plainText || "").trim()).filter(Boolean).join("\n");
  const html = anchors.map((cell) => String(cell?.html || "").trim()).filter(Boolean).join("<br>");
  for (let rowIndex = bounds.startRow; rowIndex <= bounds.endRow; rowIndex += 1) {
    for (let columnIndex = bounds.startColumn; columnIndex <= bounds.endColumn; columnIndex += 1) {
      const covered = rowIndex !== bounds.startRow || columnIndex !== bounds.startColumn;
      nextMatrix[rowIndex][columnIndex] = {
        ...nextMatrix[rowIndex][columnIndex],
        plainText: covered ? "" : plainText,
        html: covered ? "" : html,
        richTextDocument: null,
        value: null,
        valueType: "",
        numberFormat: "",
        colSpan: bounds.endColumn - bounds.startColumn + 1,
        rowSpan: bounds.endRow - bounds.startRow + 1,
        covered,
        anchorRowIndex: bounds.startRow,
        anchorColumnIndex: bounds.startColumn,
      };
    }
  }
  nextMatrix[bounds.startRow][bounds.startColumn].header = Boolean(anchor.header);
  return { matrix: nextMatrix, changed: true, bounds };
}

export function splitTableMatrixCell(matrix = [], rowIndex = 0, columnIndex = 0) {
  const nextMatrix = cloneTableMatrixWithSpans(matrix);
  const anchor = getTableMatrixAnchor(nextMatrix, rowIndex, columnIndex);
  if (!anchor || (Number(anchor.rowSpan || 1) <= 1 && Number(anchor.colSpan || 1) <= 1)) {
    return { matrix: nextMatrix, changed: false };
  }
  const anchorRowIndex = Number(anchor.anchorRowIndex ?? anchor.rowIndex) || 0;
  const anchorColumnIndex = Number(anchor.anchorColumnIndex ?? anchor.columnIndex) || 0;
  const rowSpan = Math.max(1, Number(anchor.rowSpan || 1));
  const colSpan = Math.max(1, Number(anchor.colSpan || 1));
  for (let y = anchorRowIndex; y < Math.min(nextMatrix.length, anchorRowIndex + rowSpan); y += 1) {
    for (let x = anchorColumnIndex; x < Math.min(nextMatrix[y].length, anchorColumnIndex + colSpan); x += 1) {
      const isAnchor = y === anchorRowIndex && x === anchorColumnIndex;
      nextMatrix[y][x] = {
        ...nextMatrix[y][x],
        plainText: isAnchor ? String(anchor.plainText || "") : "",
        html: isAnchor ? String(anchor.html || "") : "",
        richTextDocument: isAnchor && anchor.richTextDocument ? JSON.parse(JSON.stringify(anchor.richTextDocument)) : null,
        value: isAnchor ? cloneTableCellValue(anchor.value) : null,
        valueType: isAnchor ? String(anchor.valueType || "") : "",
        numberFormat: isAnchor ? String(anchor.numberFormat || "") : "",
        colSpan: 1,
        rowSpan: 1,
        covered: false,
        anchorRowIndex: y,
        anchorColumnIndex: x,
      };
    }
  }
  return { matrix: nextMatrix, changed: true };
}

function cloneTableMatrixWithSpans(matrix = []) {
  return (Array.isArray(matrix) ? matrix : []).map((row, rowIndex) =>
    (Array.isArray(row) ? row : []).map((cell, columnIndex) => ({
      ...(cell && typeof cell === "object" ? cell : { plainText: String(cell || "") }),
      richTextDocument: cell?.richTextDocument && typeof cell.richTextDocument === "object"
        ? JSON.parse(JSON.stringify(cell.richTextDocument))
        : null,
      value: cloneTableCellValue(cell?.value),
      valueType: String(cell?.valueType || ""),
      numberFormat: String(cell?.numberFormat || ""),
      rowIndex,
      columnIndex,
      colSpan: Math.max(1, Number(cell?.colSpan || 1)),
      rowSpan: Math.max(1, Number(cell?.rowSpan || 1)),
      covered: Boolean(cell?.covered),
      anchorRowIndex: Math.max(0, Number(cell?.anchorRowIndex ?? rowIndex) || 0),
      anchorColumnIndex: Math.max(0, Number(cell?.anchorColumnIndex ?? columnIndex) || 0),
    }))
  );
}

function expandBoundsToMergedCells(matrix, bounds) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let rowIndex = bounds.startRow; rowIndex <= bounds.endRow; rowIndex += 1) {
      for (let columnIndex = bounds.startColumn; columnIndex <= bounds.endColumn; columnIndex += 1) {
        const anchor = getTableMatrixAnchor(matrix, rowIndex, columnIndex);
        if (!anchor) continue;
        const anchorRow = Number(anchor.anchorRowIndex ?? anchor.rowIndex) || 0;
        const anchorColumn = Number(anchor.anchorColumnIndex ?? anchor.columnIndex) || 0;
        const endRow = anchorRow + Math.max(1, Number(anchor.rowSpan || 1)) - 1;
        const endColumn = anchorColumn + Math.max(1, Number(anchor.colSpan || 1)) - 1;
        const next = {
          startRow: Math.min(bounds.startRow, anchorRow),
          endRow: Math.max(bounds.endRow, endRow),
          startColumn: Math.min(bounds.startColumn, anchorColumn),
          endColumn: Math.max(bounds.endColumn, endColumn),
        };
        if (next.startRow !== bounds.startRow || next.endRow !== bounds.endRow || next.startColumn !== bounds.startColumn || next.endColumn !== bounds.endColumn) {
          Object.assign(bounds, next);
          changed = true;
        }
      }
    }
  }
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
    width: Math.max(TABLE_MIN_WIDTH, Number(element?.width || 0) || size.width),
    height: Math.max(TABLE_MIN_HEIGHT, Number(element?.height || 0) || size.height, size.height),
  });
}

export function applyTableCellContentEdit(previousCell = {}, content = {}) {
  const plainText = sanitizeText(content?.plainText || "");
  const html = String(content?.html || "").trim();
  const contentChanged =
    plainText !== String(previousCell?.plainText || "") ||
    html !== String(previousCell?.html || "").trim();
  return {
    ...(previousCell && typeof previousCell === "object" ? previousCell : {}),
    plainText,
    html,
    richTextDocument:
      content?.richTextDocument && typeof content.richTextDocument === "object"
        ? JSON.parse(JSON.stringify(content.richTextDocument))
        : null,
    value: contentChanged ? null : cloneTableCellValue(previousCell?.value),
    valueType: contentChanged ? "" : String(previousCell?.valueType || ""),
    numberFormat: contentChanged ? "" : String(previousCell?.numberFormat || ""),
  };
}

function normalizeTableRow(row = {}, rowIndex = 0) {
  const hasExplicitCells = Array.isArray(row?.cells) || Array.isArray(row?.content);
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
    cells: normalizedCells.length || hasExplicitCells
      ? normalizedCells
      : [normalizeTableCell({ plainText: "" }, rowIndex, 0)],
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
    richTextDocument:
      cell.richTextDocument && typeof cell.richTextDocument === "object"
        ? JSON.parse(JSON.stringify(cell.richTextDocument))
        : null,
    header: Boolean(cell.header ?? cell?.attrs?.header),
    align: normalizeAlign(cell.align ?? cell?.attrs?.align),
    value: normalizeTableCellValue(cell.value ?? cell.typedValue ?? cell.rawValue, cell.valueType ?? cell.dataType),
    valueType: normalizeTableCellValueType(cell.valueType ?? cell.dataType),
    numberFormat: String(cell.numberFormat || cell.numFmt || "").trim(),
    colSpan: normalizePositiveInteger(cell.colSpan ?? cell?.attrs?.colSpan, 1),
    rowSpan: normalizePositiveInteger(cell.rowSpan ?? cell?.attrs?.rowSpan, 1),
  };
}

function normalizeTableCellValueType(value = "") {
  const type = String(value || "").trim().toLowerCase();
  if (["number", "boolean", "date", "string"].includes(type)) {
    return type;
  }
  return "";
}

function normalizeTableCellValue(value, valueType = "") {
  const type = normalizeTableCellValueType(valueType);
  if (!type) {
    return null;
  }
  if (type === "number") {
    if (value == null || (typeof value === "string" && !value.trim()) || typeof value === "boolean") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    if (/^(true|1)$/i.test(String(value ?? "").trim())) return true;
    if (/^(false|0)$/i.test(String(value ?? "").trim())) return false;
    return null;
  }
  if (type === "date") {
    if (value == null || (typeof value === "string" && !value.trim())) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return String(value ?? "");
}

function cloneTableCellValue(value) {
  if (value == null || typeof value !== "object") {
    return value ?? null;
  }
  return JSON.parse(JSON.stringify(value));
}

function estimateTableElementSize(structure = {}, widthHint = 0) {
  const columns = Math.max(1, Number(structure?.columns) || 1);
  const estimatedWidth = Math.min(
    IMPORTED_TABLE_MAX_WIDTH,
    Math.max(IMPORTED_TABLE_TARGET_WIDTH, columns * IMPORTED_TABLE_COLUMN_WIDTH)
  );
  const width = Math.max(TABLE_MIN_WIDTH, Number(widthHint) || estimatedWidth);
  const rows = Array.isArray(structure?.rows) ? structure.rows : [];
  const columnWidth = width / columns;
  const rowHeights = rows.map(() => 42);
  rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell) => {
      const columnSpan = Math.max(1, Number(cell.colSpan) || 1);
      const rowSpan = Math.min(rows.length - rowIndex, Math.max(1, Number(cell.rowSpan) || 1));
      const contentWidth = Math.max(48, columnWidth * columnSpan - 24);
      const charactersPerLine = Math.max(4, Math.floor(contentWidth / 8.4));
      const visualLineCount = String(cell.plainText || "")
        .split("\n")
        .reduce((sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).length / charactersPerLine)), 0);
      const requiredHeight = Math.max(42, 22 + visualLineCount * 20);
      const currentHeight = rowHeights.slice(rowIndex, rowIndex + rowSpan).reduce((sum, value) => sum + value, 0);
      if (requiredHeight <= currentHeight) {
        return;
      }
      const increase = Math.ceil((requiredHeight - currentHeight) / rowSpan);
      for (let offset = 0; offset < rowSpan; offset += 1) {
        rowHeights[rowIndex + offset] += increase;
      }
    });
  });
  const height = Math.max(
    TABLE_MIN_HEIGHT,
    Math.min(1600, rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) || TABLE_MIN_HEIGHT)
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
