import { sanitizeText } from "../../utils.js";

export const COPY_DOWNGRADE_RULES_VERSION = "1.0.0";

export function buildDowngradedCopyPayloadFromItems(items = [], options = {}) {
  const cleanItems = Array.isArray(items) ? items : [];
  const entries = cleanItems.map((item, index) => downgradeItemForCopy(item, index));
  return {
    kind: "structured-copy-downgrade",
    version: COPY_DOWNGRADE_RULES_VERSION,
    source: String(options.source || "canvas"),
    createdAt: Number(options.createdAt) || Date.now(),
    entries,
    text: entries.map((entry) => entry.text).filter(Boolean).join("\n\n").trim(),
    html: entries.map((entry) => entry.html).filter(Boolean).join(""),
    stats: {
      itemCount: cleanItems.length,
      entryCount: entries.length,
      downgradedTypes: countDowngradedTypes(entries),
    },
  };
}

export function downgradeItemForCopy(item = {}, index = 0) {
  const type = String(item?.type || "unknown");
  switch (type) {
    case "text":
      return downgradeTextItem(item, index);
    case "codeBlock":
      return downgradeCodeBlockItem(item, index);
    case "table":
      return downgradeTableItem(item, index);
    case "mathBlock":
    case "mathInline":
      return downgradeMathItem(item, index);
    case "image":
      return downgradeImageItem(item, index);
    case "fileCard":
      return downgradeFileCardItem(item, index);
    case "flowNode":
    case "flowEdge":
    case "mindNode":
    case "shape":
      return downgradeLegacyNativeItem(item, index);
    default:
      return downgradeUnknownItem(item, index);
  }
}

function downgradeTextItem(item, index) {
  return {
    itemId: String(item?.id || `text-${index}`),
    itemType: "text",
    downgradedFrom: "text",
    text: sanitizeText(item?.plainText || item?.text || ""),
    html: String(item?.html || wrapParagraph(item?.plainText || item?.text || "")),
  };
}

function downgradeCodeBlockItem(item, index) {
  const code = sanitizeText(item?.plainText || item?.text || "");
  const language = String(item?.language || "").trim().toLowerCase();
  return {
    itemId: String(item?.id || `code-${index}`),
    itemType: "codeBlock",
    downgradedFrom: "codeBlock",
    text: buildCodeText(code, language),
    html: `<pre data-copy-role="code-block"${language ? ` data-language="${escapeAttribute(language)}"` : ""}><code>${escapeHtml(code)}</code></pre>`,
  };
}

function downgradeTableItem(item, index) {
  const table = item?.table && typeof item.table === "object" ? item.table : {};
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const text = rows
    .map((row) =>
      (Array.isArray(row.cells) ? row.cells : [])
        .map((cell) => sanitizeText(cell?.plainText || ""))
        .join("\t")
    )
    .join("\n")
    .trim();

  const html = `<table data-copy-role="table">${rows
    .map((row) => {
      const cells = Array.isArray(row.cells) ? row.cells : [];
      return `<tr>${cells
        .map((cell) => {
          const tag = cell?.header ? "th" : "td";
          const attrs = [];
          if (cell?.colSpan > 1) attrs.push(` colspan="${Number(cell.colSpan)}"`);
          if (cell?.rowSpan > 1) attrs.push(` rowspan="${Number(cell.rowSpan)}"`);
          if (cell?.align) attrs.push(` align="${escapeAttribute(cell.align)}"`);
          return `<${tag}${attrs.join("")}>${cell?.html || escapeHtml(cell?.plainText || "")}</${tag}>`;
        })
        .join("")}</tr>`;
    })
    .join("")}</table>`;

  return {
    itemId: String(item?.id || `table-${index}`),
    itemType: "table",
    downgradedFrom: "table",
    text,
    html,
  };
}

function downgradeMathItem(item, index) {
  const formula = sanitizeText(item?.formula || item?.text || "");
  const displayMode = Boolean(item?.displayMode ?? item?.type === "mathBlock");
  const fallbackText = String(item?.fallbackText || (displayMode ? `$$${formula}$$` : `$${formula}$`));
  return {
    itemId: String(item?.id || `math-${index}`),
    itemType: String(item?.type || "mathBlock"),
    downgradedFrom: "math",
    text: fallbackText,
    html: `<span data-copy-role="${displayMode ? "math-block" : "math-inline"}">${escapeHtml(fallbackText)}</span>`,
  };
}

function downgradeImageItem(item, index) {
  const label = sanitizeText(item?.name || item?.structuredImport?.canonicalFragment?.attrs?.title || "图片");
  const src =
    item?.structuredImport?.canonicalFragment?.attrs?.src ||
    item?.sourcePath ||
    item?.dataUrl ||
    "";
  return {
    itemId: String(item?.id || `image-${index}`),
    itemType: "image",
    downgradedFrom: "image",
    text: `[图片] ${label}`.trim(),
    html: src
      ? `<img data-copy-role="image" src="${escapeAttribute(String(src))}" alt="${escapeAttribute(label)}">`
      : `<span data-copy-role="image">${escapeHtml(`[图片] ${label}`)}</span>`,
  };
}

function downgradeFileCardItem(item, index) {
  const fileName = sanitizeText(item?.fileName || item?.name || "未命名文件");
  const sourcePath = sanitizeText(
    item?.structuredImport?.compatibilityFragment?.sourcePath || item?.sourcePath || ""
  );
  const text = sourcePath ? `[文件] ${fileName}\n${sourcePath}` : `[文件] ${fileName}`;
  const html = `<div data-copy-role="file-card"><strong>[文件]</strong> ${escapeHtml(fileName)}${
    sourcePath ? `<br><span>${escapeHtml(sourcePath)}</span>` : ""
  }</div>`;
  return {
    itemId: String(item?.id || `file-${index}`),
    itemType: "fileCard",
    downgradedFrom: "fileCard",
    text,
    html,
  };
}

function downgradeLegacyNativeItem(item, index) {
  const type = String(item?.type || "unknown");
  return {
    itemId: String(item?.id || `${type}-${index}`),
    itemType: type,
    downgradedFrom: "legacy-native",
    text: buildLegacyNativeText(item),
    html: wrapParagraph(buildLegacyNativeText(item)),
  };
}

function downgradeUnknownItem(item, index) {
  const type = String(item?.type || "unknown");
  const text = `[${type}]`;
  return {
    itemId: String(item?.id || `${type}-${index}`),
    itemType: type,
    downgradedFrom: "unknown",
    text,
    html: wrapParagraph(text),
  };
}

function buildCodeText(code, language) {
  if (!language) {
    return code;
  }
  return `${language}\n${code}`.trim();
}

function buildLegacyNativeText(item = {}) {
  const type = String(item?.type || "元素");
  if (type === "flowNode") {
    return sanitizeText(item?.plainText || item?.text || "[节点]");
  }
  if (type === "mindNode") {
    return sanitizeText(item?.title || "[脑图节点]");
  }
  if (type === "flowEdge") {
    return `[连线] ${String(item?.fromId || "")} -> ${String(item?.toId || "")}`.trim();
  }
  if (type === "shape") {
    return `[图形] ${String(item?.shapeType || "shape")}`;
  }
  return `[${type}]`;
}

function wrapParagraph(text = "") {
  return `<p>${escapeHtml(sanitizeText(text || ""))}</p>`;
}

function countDowngradedTypes(entries = []) {
  return (Array.isArray(entries) ? entries : []).reduce((counts, entry) => {
    const type = String(entry?.itemType || "unknown");
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

function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
