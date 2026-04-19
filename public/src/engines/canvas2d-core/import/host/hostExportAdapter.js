import { buildExportReadyBoardItems } from "../../export/buildExportReadyBoardItems.js";
import { clone, sanitizeText } from "../../utils.js";

export function buildHostExportSnapshot(board, options = {}) {
  const items = Array.isArray(board?.items) ? board.items : [];
  const selectedIds = Array.isArray(board?.selectedIds) ? board.selectedIds : [];
  const exportItems = options.selectedOnly
    ? items.filter((item) => selectedIds.includes(item.id))
    : items.slice();
  const normalizedItems = buildExportReadyBoardItems(exportItems).map((item) => adaptItemForExport(item));

  return {
    kind: "host-export-snapshot",
    selectedOnly: Boolean(options.selectedOnly),
    itemCount: normalizedItems.length,
    items: normalizedItems,
    summary: {
      typeCounts: countTypes(normalizedItems),
      text: normalizedItems.map((item) => String(item.exportText || "")).filter(Boolean).join("\n"),
    },
    view: board?.view ? clone(board.view) : null,
  };
}

function adaptItemForExport(item) {
  if (!item || typeof item !== "object") {
    return item;
  }
  if (item.type === "codeBlock") {
    return {
      ...item,
      exportText: sanitizeText(item.plainText || item.text || ""),
      exportHtml: `<pre><code>${escapeHtml(item.plainText || item.text || "")}</code></pre>`,
    };
  }
  if (item.type === "table") {
    const rows = Array.isArray(item?.table?.rows) ? item.table.rows : [];
    const exportText = rows
      .map((row) => (Array.isArray(row.cells) ? row.cells : []).map((cell) => cell?.plainText || "").join("\t"))
      .join("\n");
    return {
      ...item,
      exportText,
      exportHtml: rows.length ? `<table>${rows.map(renderTableRowHtml).join("")}</table>` : "",
    };
  }
  if (item.type === "mathBlock" || item.type === "mathInline") {
    const exportText = String(item.fallbackText || item.formula || "");
    return {
      ...item,
      exportText,
      exportHtml: `<span data-export-role="${item.type}">${escapeHtml(exportText)}</span>`,
    };
  }
  if (item.type === "image") {
    const src = item?.structuredImport?.canonicalFragment?.attrs?.src || item?.sourcePath || item?.dataUrl || "";
    const alt = item?.structuredImport?.canonicalFragment?.attrs?.alt || item?.name || "图片";
    return {
      ...item,
      exportText: `[图片] ${alt}`,
      exportHtml: src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">` : "",
    };
  }
  if (item.type === "fileCard") {
    const label = item?.fileName || item?.name || "文件";
    const path = item?.sourcePath || item?.structuredImport?.compatibilityFragment?.sourcePath || "";
    return {
      ...item,
      exportText: path ? `[文件] ${label}\n${path}` : `[文件] ${label}`,
      exportHtml: `<div data-export-role="file-card"><strong>[文件]</strong> ${escapeHtml(label)}</div>`,
    };
  }
  return {
    ...item,
    exportText: sanitizeText(item?.plainText || item?.text || item?.title || item?.name || ""),
    exportHtml: String(item?.html || ""),
  };
}

function renderTableRowHtml(row) {
  const cells = Array.isArray(row?.cells) ? row.cells : [];
  return `<tr>${cells
    .map((cell) => {
      const tag = cell?.header ? "th" : "td";
      return `<${tag}>${escapeHtml(cell?.plainText || "")}</${tag}>`;
    })
    .join("")}</tr>`;
}

function countTypes(items) {
  return items.reduce((counts, item) => {
    const type = String(item?.type || "unknown");
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
