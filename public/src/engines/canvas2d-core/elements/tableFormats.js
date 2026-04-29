function normalizeTableClipboardCellText(value = "") {
  return String(value || "").replace(/\r?\n/g, " ").trim();
}

function measureTableClipboardTextWidth(value = "") {
  return Array.from(String(value || "")).reduce((sum, char) => sum + (/[\u0000-\u00ff]/.test(char) ? 1 : 2), 0);
}

function padTableClipboardCell(value = "", width = 0) {
  const text = String(value || "");
  const missing = Math.max(0, width - measureTableClipboardTextWidth(text));
  return `${text}${" ".repeat(missing)}`;
}

function escapeMarkdownTableCell(value = "") {
  return String(value || "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function escapeCsvCell(value = "") {
  const normalized = String(value || "").replace(/\r?\n/g, "\n");
  if (!/[",\n]/.test(normalized)) {
    return normalized;
  }
  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

export function mapTableMatrixToPlainTextRows(matrix = []) {
  return (Array.isArray(matrix) ? matrix : []).map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => normalizeTableClipboardCellText(cell?.plainText || ""))
  );
}

export function serializeTableMatrixToTsv(matrix = []) {
  return mapTableMatrixToPlainTextRows(matrix)
    .map((row) => row.join("\t"))
    .join("\n");
}

export function serializeTableMatrixToCsv(matrix = []) {
  return mapTableMatrixToPlainTextRows(matrix)
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\r\n");
}

export function serializeTableMatrixToPlainText(matrix = [], { hasHeader = true } = {}) {
  const safeMatrix = mapTableMatrixToPlainTextRows(matrix);
  if (!safeMatrix.length || !safeMatrix.some((row) => row.length)) {
    return "";
  }
  const columnCount = safeMatrix.reduce((max, row) => Math.max(max, row.length), 0);
  const widths = Array.from({ length: columnCount }, (_, index) =>
    safeMatrix.reduce((max, row) => Math.max(max, measureTableClipboardTextWidth(row[index] || "")), 0)
  );
  const horizontal = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
  const renderRow = (row = []) =>
    `| ${widths.map((width, index) => padTableClipboardCell(row[index] || "", width)).join(" | ")} |`;
  const lines = [horizontal];
  safeMatrix.forEach((row, rowIndex) => {
    lines.push(renderRow(row));
    if (rowIndex === 0 && hasHeader) {
      lines.push(horizontal);
    }
  });
  if (!hasHeader && safeMatrix.length === 1) {
    lines.push(horizontal);
    return lines.join("\n");
  }
  lines.push(horizontal);
  return lines.join("\n");
}

export function serializeTableMatrixToMarkdown(matrix = []) {
  const safeMatrix = mapTableMatrixToPlainTextRows(matrix).map((row) =>
    row.map((cell) => escapeMarkdownTableCell(cell))
  );
  if (!safeMatrix.length || !safeMatrix.some((row) => row.length)) {
    return "";
  }
  const columnCount = safeMatrix.reduce((max, row) => Math.max(max, row.length), 0);
  const normalizeRow = (row = []) => Array.from({ length: columnCount }, (_, index) => String(row[index] || ""));
  const header = normalizeRow(safeMatrix[0]);
  const separator = Array.from({ length: columnCount }, () => "---");
  const body = safeMatrix.slice(1).map((row) => normalizeRow(row));
  return [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}
