import { buildTextTitle, createId, sanitizeText } from "../../../utils.js";
import { RENDER_PAYLOAD_KINDS } from "../rendererPipeline.js";
import { inlineNodesToHtml, inlineNodesToPlainText } from "../text/sharedTextRenderUtils.js";
import { IMPORTED_TEXT_WRAP_TARGET_WIDTH } from "../text/sharedTextRenderUtils.js";
import { deriveNodeSourceOrder } from "../shared/sourceOrder.js";

export const TABLE_RENDERER_ID = "table-renderer";

export function createTableRenderer(options = {}) {
  const id = options.id || TABLE_RENDERER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 76;

  return {
    id,
    version: "1.0.0",
    displayName: "Table Renderer",
    priority,
    payloadKinds: [RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT],
    tags: ["builtin", "table", "canonical-renderer"],
    supports({ renderInput }) {
      const tables = collectTables(renderInput?.payload?.content || []);
      if (!tables.length) {
        return { matched: false, score: -1, reason: "no-tables" };
      }
      return {
        matched: true,
        score: tables.length >= 2 ? 24 : 18,
        reason: tables.length >= 2 ? "multiple-tables" : "table-available",
      };
    },
    async render({ renderInput }) {
      const tables = collectTables(renderInput?.payload?.content || []);
      const operations = tables.map((table, index) => buildTableOperation(table, index, renderInput));
      return {
        planId: `${id}:${renderInput?.descriptorId || "table-render-plan"}`,
        kind: "element-render-plan",
        payloadKind: renderInput?.kind || RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT,
        operations,
        stats: {
          tableCount: operations.length,
          totalRowCount: operations.reduce((sum, operation) => sum + operation.structure.rows.length, 0),
          totalCellCount: operations.reduce(
            (sum, operation) => sum + operation.structure.rows.reduce((rowSum, row) => rowSum + row.cells.length, 0),
            0
          ),
        },
        meta: {
          rendererId: id,
        },
      };
    },
  };
}

function collectTables(nodes = [], context = { quoteDepth: 0, parentType: "doc" }) {
  const result = [];
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  safeNodes.forEach((node, index) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "table") {
      result.push({
        node,
        quoteDepth: context.quoteDepth,
        parentType: context.parentType,
        orderKey: `${context.quoteDepth}:${index}`,
      });
      return;
    }
    if (Array.isArray(node.content) && node.content.length) {
      result.push(
        ...collectTables(node.content, {
          quoteDepth: node.type === "blockquote" ? context.quoteDepth + 1 : context.quoteDepth,
          parentType: node.type,
        })
      );
    }
  });
  return result;
}

function buildTableOperation(table, index, renderInput) {
  const structure = normalizeTableStructure(table.node);
  const title = buildTextTitle(structure.title || `表格 ${index + 1}`);
  const sourceMeta = {
    descriptorId: String(renderInput?.descriptorId || ""),
    parserId: String(renderInput?.parserId || ""),
    entryId: String(renderInput?.entryId || ""),
  };
  return {
    type: "render-table-block",
    sourceNodeType: "table",
    legacyType: "table",
    order: index,
    layout: {
      strategy: "flow-stack",
      stackIndex: index,
      quoteDepth: table.quoteDepth,
      gap: 22,
    },
    element: {
      id: createId("table"),
      type: "table",
      title,
      columns: structure.columns,
      rows: structure.rows.length,
      table: {
        title,
        columns: structure.columns,
        rows: JSON.parse(JSON.stringify(structure.rows)),
        hasHeader: Boolean(structure.hasHeader),
        sourceMeta,
      },
      width: estimateTableWidth(structure),
      height: estimateTableHeight(structure),
      x: 0,
      y: 0,
      locked: false,
      sourceMeta,
    },
    structure: {
      columns: structure.columns,
      rows: structure.rows,
      parentType: table.parentType,
      hasHeader: structure.hasHeader,
    },
    meta: sourceMeta,
    sourceOrder: deriveNodeSourceOrder(table?.node, index),
  };
}

function normalizeTableStructure(tableNode = {}) {
  const rows = (Array.isArray(tableNode?.content) ? tableNode.content : [])
    .filter((row) => row?.type === "tableRow")
    .map((row, rowIndex) => normalizeTableRow(row, rowIndex));

  const columns = Math.max(
    Number(tableNode?.attrs?.columns) || 0,
    rows.reduce((max, row) => Math.max(max, row.columnSpanWidth), 0)
  );
  const hasHeader = rows.some((row) => row.cells.some((cell) => cell.header));
  const firstMeaningfulCell = rows
    .flatMap((row) => row.cells)
    .map((cell) => cell.plainText.trim())
    .find(Boolean);

  return {
    columns,
    rows,
    hasHeader,
    title: firstMeaningfulCell || "表格",
  };
}

function normalizeTableRow(rowNode = {}, rowIndex = 0) {
  const cells = (Array.isArray(rowNode?.content) ? rowNode.content : [])
    .filter((cell) => isTableCellNode(cell))
    .map((cell, cellIndex) => normalizeTableCell(cell, rowIndex, cellIndex));

  return {
    rowIndex,
    cells,
    columnSpanWidth: cells.reduce((sum, cell) => sum + cell.colSpan, 0),
  };
}

function isTableCellNode(cell = {}) {
  const type = String(cell?.type || "").trim().toLowerCase();
  return type === "tablecell" || type === "tableheadercell" || type === "tableheader";
}

function normalizeTableCell(cellNode = {}, rowIndex = 0, cellIndex = 0) {
  const segments = collectTableCellTextSegments(cellNode.content || []);
  const plainText = sanitizeText(segments.map((segment) => segment.plainText).join("\n")).trim();
  const html = segments.map((segment) => segment.html).filter(Boolean).join("<br>");

  return {
    rowIndex,
    cellIndex,
    plainText,
    html,
    header: Boolean(cellNode?.attrs?.header),
    align: normalizeAlign(cellNode?.attrs?.align),
    colSpan: normalizePositiveInteger(cellNode?.attrs?.colSpan, 1),
    rowSpan: normalizePositiveInteger(cellNode?.attrs?.rowSpan, 1),
  };
}

function collectTableCellTextSegments(nodes = []) {
  const result = [];
  const safeNodes = Array.isArray(nodes) ? nodes : [];

  safeNodes.forEach((node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "paragraph") {
      const plainText = inlineNodesToPlainText(node.content || []);
      const html = inlineNodesToHtml(node.content || []);
      if (plainText.trim() || html.trim()) {
        result.push({ plainText, html });
      }
      return;
    }
    if (node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList") {
      const plainText = collectNestedListPlainText(node);
      const html = collectNestedListHtml(node);
      if (plainText.trim() || html.trim()) {
        result.push({ plainText, html });
      }
      return;
    }
    if (node.type === "codeBlock") {
      const code = sanitizeText(String(node.text || ""));
      if (code.trim()) {
        result.push({
          plainText: code,
          html: `<pre><code>${escapeHtml(code)}</code></pre>`,
        });
      }
      return;
    }
    if (node.type === "mathBlock") {
      const math = String(node.text || "").trim();
      if (math) {
        result.push({
          plainText: math,
          html: `<div data-role="math-block">${escapeHtml(math)}</div>`,
        });
      }
    }
  });

  return result;
}

function collectNestedListPlainText(listNode) {
  const items = flattenListNode(listNode, 0, Number(listNode?.attrs?.start) || 1);
  return items
    .map((item) => {
      const indent = "  ".repeat(item.level);
      const marker = item.kind === "taskItem"
        ? item.checked
          ? "[x] "
          : "[ ] "
        : item.kind === "orderedListItem"
          ? `${item.orderedIndex}. `
          : "• ";
      return `${indent}${marker}${item.plainText}`.trimEnd();
    })
    .join("\n");
}

function collectNestedListHtml(listNode) {
  const tagName = listNode?.type === "orderedList" ? "ol" : "ul";
  const attrs = [];
  if (listNode?.type === "orderedList" && Number(listNode?.attrs?.start) > 1) {
    attrs.push(` start="${Number(listNode.attrs.start)}"`);
  }
  const items = flattenListNode(listNode, 0, Number(listNode?.attrs?.start) || 1, true);
  return `<${tagName}${attrs.join("")}>${items.map((item) => item.html).join("")}</${tagName}>`;
}

function flattenListNode(listNode, level = 0, orderedStart = 1, includeHtml = false) {
  const content = Array.isArray(listNode?.content) ? listNode.content : [];
  const result = [];

  content.forEach((itemNode, index) => {
    if (!itemNode || typeof itemNode !== "object") {
      return;
    }
    const paragraphs = [];
    const nested = [];

    (Array.isArray(itemNode.content) ? itemNode.content : []).forEach((child) => {
      if (child?.type === "paragraph") {
        paragraphs.push({
          plainText: inlineNodesToPlainText(child.content || []),
          html: inlineNodesToHtml(child.content || []),
        });
      } else if (child && typeof child === "object" && (child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList")) {
        nested.push(...flattenListNode(child, level + 1, Number(child?.attrs?.start) || 1, includeHtml));
      }
    });

    const plainText = sanitizeText(paragraphs.map((paragraph) => paragraph.plainText).join("\n")).trim();
    const htmlBody = paragraphs.map((paragraph) => paragraph.html).filter(Boolean).join("<br>");
    const orderedIndex = listNode?.type === "orderedList" ? orderedStart + index : null;
    const isTask = itemNode?.type === "taskItem";

    result.push({
      kind: isTask ? "taskItem" : listNode?.type === "orderedList" ? "orderedListItem" : "bulletListItem",
      checked: isTask ? Boolean(itemNode?.attrs?.checked) : null,
      orderedIndex,
      level,
      plainText,
      html: includeHtml
        ? `<li>${isTask ? `${itemNode?.attrs?.checked ? "☑" : "☐"} ` : ""}${htmlBody}</li>`
        : "",
    });
    result.push(...nested);
  });

  return result;
}

function estimateTableWidth(structure) {
  const columns = Math.max(1, Number(structure?.columns) || 1);
  const columnWidths = new Array(columns).fill(120);

  structure.rows.forEach((row) => {
    let columnIndex = 0;
    row.cells.forEach((cell) => {
      const width = estimateCellWidth(cell.plainText);
      const span = Math.max(1, cell.colSpan);
      const distributed = Math.max(104, Math.round(width / span));
      for (let offset = 0; offset < span && columnIndex + offset < columnWidths.length; offset += 1) {
        columnWidths[columnIndex + offset] = Math.max(columnWidths[columnIndex + offset], distributed);
      }
      columnIndex += span;
    });
  });

  const measuredWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  return Math.max(260, Math.min(1200, Math.max(IMPORTED_TEXT_WRAP_TARGET_WIDTH, measuredWidth)));
}

function estimateTableHeight(structure) {
  const rowHeights = structure.rows.map((row) =>
    Math.max(
      42,
      ...row.cells.map((cell) => {
        const lineCount = Math.max(1, sanitizeText(cell.plainText || "").split("\n").length);
        return Math.round(22 + lineCount * 22);
      })
    )
  );
  return Math.max(84, Math.min(1600, rowHeights.reduce((sum, height) => sum + height, 0)));
}

function estimateCellWidth(plainText) {
  const lines = sanitizeText(plainText || "").split("\n");
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return Math.max(120, Math.min(320, Math.round(36 + longest * 8.4)));
}

function normalizeAlign(value) {
  const align = String(value || "").trim().toLowerCase();
  return ["left", "center", "right"].includes(align) ? align : "";
}

function normalizePositiveInteger(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
