import {
  RICH_TEXT_BLOCK_TYPES,
  RICH_TEXT_INLINE_NODE_TYPES,
  RICH_TEXT_MARK_TYPES,
  normalizeRichTextDocument,
  serializeRichTextDocumentToPlainText,
} from "./richTextDocument.js";
import { sanitizeText } from "../utils.js";

function escapeMarkdownText(value = "") {
  return String(value || "").replace(/([\\`*_{}\[\]()#+\-!|>])/g, "\\$1");
}

function escapeMarkdownCode(value = "") {
  return String(value || "").replace(/`/g, "\\`");
}

function indentMarkdown(value = "", prefix = "  ") {
  return String(value || "")
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()))
    .join("\n");
}

function applyInlineMarks(markdown = "", marks = []) {
  let output = String(markdown || "");
  const safeMarks = Array.isArray(marks) ? marks : [];
  if (!output || !safeMarks.length) {
    return output;
  }
  const hasCode = safeMarks.some((mark) => mark?.type === RICH_TEXT_MARK_TYPES.CODE);
  if (hasCode) {
    output = `\`${escapeMarkdownCode(output)}\``;
  }
  if (safeMarks.some((mark) => mark?.type === RICH_TEXT_MARK_TYPES.BOLD)) {
    output = `**${output}**`;
  }
  if (safeMarks.some((mark) => mark?.type === RICH_TEXT_MARK_TYPES.ITALIC)) {
    output = `*${output}*`;
  }
  if (safeMarks.some((mark) => mark?.type === RICH_TEXT_MARK_TYPES.STRIKE)) {
    output = `~~${output}~~`;
  }
  if (safeMarks.some((mark) => mark?.type === RICH_TEXT_MARK_TYPES.UNDERLINE)) {
    output = `<u>${output}</u>`;
  }
  return output;
}

function serializeInlineNodeToMarkdown(node = null) {
  if (!node || typeof node !== "object") {
    return "";
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.TEXT) {
    return applyInlineMarks(escapeMarkdownText(String(node.text || "")), node.marks || []);
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.HARD_BREAK) {
    return "  \n";
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.INLINE_CODE) {
    return `\`${escapeMarkdownCode(String(node.text || ""))}\``;
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.MATH_INLINE) {
    return `$${String(node.text || "").trim()}$`;
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.LINK) {
    const label = serializeInlineNodesToMarkdown(node.content || []).trim() || escapeMarkdownText(String(node?.attrs?.href || ""));
    const href = String(node?.attrs?.href || "").trim();
    return href ? `[${label}](${href})` : label;
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.IMAGE) {
    const src = String(node?.attrs?.src || "").trim();
    const alt = escapeMarkdownText(String(node?.attrs?.alt || node?.attrs?.title || ""));
    return src ? `![${alt}](${src})` : alt;
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.FOOTNOTE_REF) {
    const refId = String(node?.attrs?.refId || "").trim() || "*";
    return `[^${escapeMarkdownText(refId)}]`;
  }
  return "";
}

function serializeInlineNodesToMarkdown(nodes = []) {
  return (Array.isArray(nodes) ? nodes : []).map((node) => serializeInlineNodeToMarkdown(node)).join("");
}

function serializeListItemBlockToMarkdown(block = {}, options = {}) {
  const index = Number(options.index || 0);
  const ordered = options.ordered === true;
  const task = options.task === true;
  const start = Number(options.start || 1) || 1;
  const marker = task
    ? `- [${block?.attrs?.checked === true ? "x" : " "}] `
    : ordered
      ? `${start + index}. `
      : "- ";
  const head = serializeInlineNodesToMarkdown(block.content || []).trim();
  const nested = (Array.isArray(block.blocks) ? block.blocks : [])
    .map((child) => serializeBlockToMarkdown(child))
    .filter(Boolean);
  if (!nested.length) {
    return `${marker}${head}`.trimEnd();
  }
  const lines = [`${marker}${head}`.trimEnd()];
  nested.forEach((child) => {
    lines.push(indentMarkdown(child, "  "));
  });
  return lines.join("\n");
}

function serializeTableToMarkdown(block = {}) {
  const rows = Array.isArray(block.blocks) ? block.blocks : [];
  if (!rows.length) {
    return "";
  }
  const tableRows = rows.map((row) =>
    (Array.isArray(row?.blocks) ? row.blocks : []).map((cell) =>
      serializeInlineNodesToMarkdown(cell?.content || []).replace(/\n+/g, " ").trim()
    )
  );
  const columnCount = Math.max(1, ...tableRows.map((cells) => cells.length));
  const normalizedRows = tableRows.map((cells) => {
    const next = cells.slice();
    while (next.length < columnCount) {
      next.push("");
    }
    return next;
  });
  const headerRow = normalizedRows[0];
  const divider = new Array(columnCount).fill("---");
  const bodyRows = normalizedRows.slice(1);
  return [
    `| ${headerRow.join(" | ")} |`,
    `| ${divider.join(" | ")} |`,
    ...bodyRows.map((cells) => `| ${cells.join(" | ")} |`),
  ].join("\n");
}

function serializeBlockToMarkdown(block = null) {
  if (!block || typeof block !== "object") {
    return "";
  }
  const type = String(block.type || "").trim();
  if (type === RICH_TEXT_BLOCK_TYPES.HTML) {
    return serializeRichTextDocumentToPlainText({ blocks: [block] }, "");
  }
  if (type === RICH_TEXT_BLOCK_TYPES.PARAGRAPH) {
    return serializeInlineNodesToMarkdown(block.content || []).trimEnd();
  }
  if (type === RICH_TEXT_BLOCK_TYPES.HEADING) {
    const level = Math.min(6, Math.max(1, Number(block?.attrs?.level || 1) || 1));
    return `${"#".repeat(level)} ${serializeInlineNodesToMarkdown(block.content || []).trim()}`.trimEnd();
  }
  if (type === RICH_TEXT_BLOCK_TYPES.BLOCKQUOTE) {
    return (Array.isArray(block.blocks) ? block.blocks : [])
      .map((child) =>
        serializeBlockToMarkdown(child)
          .split("\n")
          .map((line) => `> ${line}`.trimEnd())
          .join("\n")
      )
      .filter(Boolean)
      .join("\n");
  }
  if (type === RICH_TEXT_BLOCK_TYPES.LIST) {
    return (Array.isArray(block.blocks) ? block.blocks : [])
      .map((item, index) =>
        serializeListItemBlockToMarkdown(item, {
          index,
          ordered: block?.attrs?.ordered === true,
          task: block?.attrs?.task === true,
          start: Number(block?.attrs?.start || 1) || 1,
        })
      )
      .filter(Boolean)
      .join("\n");
  }
  if (type === RICH_TEXT_BLOCK_TYPES.LIST_ITEM) {
    return serializeListItemBlockToMarkdown(block, {});
  }
  if (type === RICH_TEXT_BLOCK_TYPES.CODE_BLOCK) {
    const language = String(block?.attrs?.language || "").trim();
    const plainText = sanitizeText(String(block?.plainText || ""));
    return ["```" + language, plainText, "```"].join("\n");
  }
  if (type === RICH_TEXT_BLOCK_TYPES.THEMATIC_BREAK) {
    return "---";
  }
  if (type === RICH_TEXT_BLOCK_TYPES.TABLE) {
    return serializeTableToMarkdown(block);
  }
  if (type === RICH_TEXT_BLOCK_TYPES.TABLE_ROW || type === RICH_TEXT_BLOCK_TYPES.TABLE_CELL) {
    return "";
  }
  if (type === RICH_TEXT_BLOCK_TYPES.MATH_BLOCK) {
    const formula = sanitizeText(String(block?.plainText || "")).trim();
    return ["$$", formula, "$$"].join("\n");
  }
  if (type === RICH_TEXT_BLOCK_TYPES.FOOTNOTE_DEFINITION) {
    const refId = String(block?.attrs?.id || block?.attrs?.identifier || "*").trim();
    const body = (Array.isArray(block.blocks) ? block.blocks : []).map((child) => serializeBlockToMarkdown(child)).filter(Boolean).join("\n");
    return `[^${escapeMarkdownText(refId)}]: ${body}`.trimEnd();
  }
  return serializeRichTextDocumentToPlainText({ blocks: [block] }, "");
}

export function serializeRichTextDocumentToMarkdown(documentValue, fallback = {}) {
  const normalized = normalizeRichTextDocument(documentValue, fallback);
  const blocks = Array.isArray(normalized?.blocks) ? normalized.blocks : [];
  const markdown = blocks.map((block) => serializeBlockToMarkdown(block)).filter(Boolean).join("\n\n");
  if (markdown.trim()) {
    return sanitizeText(markdown).trim();
  }
  return sanitizeText(
    fallback.plainText ||
      fallback.text ||
      serializeRichTextDocumentToPlainText(normalized, "")
  ).trim();
}
