import { htmlToPlainText, sanitizeText } from "../utils.js";
import { serializeRichTextDocumentToPlainText } from "../textModel/richTextDocument.js";

export const CANVAS_SEARCH_FILTER_KEYS = Object.freeze({
  ALL: "all",
  TEXT: "text",
  NODE: "node",
  FILE: "fileCard",
  TABLE: "table",
  CODE: "codeBlock",
});

const SEARCHABLE_BASE_TYPES = new Set([
  "text",
  "flowNode",
  "mindNode",
  "mindSummary",
  "fileCard",
  "table",
  "codeBlock",
  "mathBlock",
  "mathInline",
]);

const RESULT_TYPE_LABELS = Object.freeze({
  text: "文本",
  flowNode: "流程节点",
  mindNode: "思维节点",
  mindSummary: "摘要节点",
  fileCard: "文件卡",
  table: "表格",
  codeBlock: "代码块",
  mathBlock: "公式",
  mathInline: "公式",
});

const FILTER_LABELS = Object.freeze({
  [CANVAS_SEARCH_FILTER_KEYS.ALL]: "画布",
  [CANVAS_SEARCH_FILTER_KEYS.TEXT]: "文本",
  [CANVAS_SEARCH_FILTER_KEYS.NODE]: "节点",
  [CANVAS_SEARCH_FILTER_KEYS.FILE]: "文件",
  [CANVAS_SEARCH_FILTER_KEYS.TABLE]: "表格",
  [CANVAS_SEARCH_FILTER_KEYS.CODE]: "代码",
});

const SKIPPED_RECURSIVE_KEYS = new Set([
  "id",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "createdat",
  "updatedat",
  "offsetx",
  "offsety",
  "scale",
]);

function normalizeSearchText(value) {
  return sanitizeText(String(value || "")).replace(/\s+/g, " ").trim();
}

function toLowerSearchText(value) {
  return normalizeSearchText(value).toLowerCase();
}

function safeText(value) {
  return normalizeSearchText(value);
}

function resolveItemTypeLabel(type = "") {
  return RESULT_TYPE_LABELS[String(type || "").trim()] || String(type || "").trim() || "内容";
}

function getFilterKeyForItem(item = {}) {
  const type = String(item?.type || "").trim();
  if (type === "flowNode" || type === "mindNode" || type === "mindSummary") {
    return CANVAS_SEARCH_FILTER_KEYS.NODE;
  }
  if (type === "fileCard") {
    return CANVAS_SEARCH_FILTER_KEYS.FILE;
  }
  if (type === "table") {
    return CANVAS_SEARCH_FILTER_KEYS.TABLE;
  }
  if (type === "codeBlock" || type === "mathBlock" || type === "mathInline") {
    return CANVAS_SEARCH_FILTER_KEYS.CODE;
  }
  return CANVAS_SEARCH_FILTER_KEYS.TEXT;
}

function collectStringBucket(value, bucket, seen = new Set()) {
  if (value == null) {
    return;
  }
  if (typeof value === "string") {
    const normalized = safeText(value);
    if (normalized) {
      bucket.push(normalized);
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStringBucket(entry, bucket, seen));
    return;
  }
  Object.entries(value).forEach(([key, entry]) => {
    if (SKIPPED_RECURSIVE_KEYS.has(String(key || "").trim().toLowerCase())) {
      return;
    }
    collectStringBucket(entry, bucket, seen);
  });
}

function extractInlineNodeText(nodes = []) {
  const bucket = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (typeof node.text === "string") {
      const text = safeText(node.text);
      if (text) {
        bucket.push(text);
      }
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
    if (Array.isArray(node.nodes)) {
      node.nodes.forEach(walk);
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(walk);
    }
  };
  (Array.isArray(nodes) ? nodes : []).forEach(walk);
  return safeText(bucket.join(" "));
}

function extractRichTextBlockPlainText(block = null) {
  if (!block || typeof block !== "object") {
    return "";
  }
  const type = String(block.type || "").trim().toLowerCase();
  if (type === "paragraph" || type === "heading" || type === "table-cell") {
    return extractInlineNodeText(block.content || []);
  }
  if (type === "code-block" || type === "math-block") {
    return safeText(block.plainText || block.text || "");
  }
  if (type === "html") {
    return safeText(block.plainText || htmlToPlainText(block.html || ""));
  }
  if (type === "table" || type === "table-row" || type === "blockquote" || type === "footnote-definition") {
    return safeText((Array.isArray(block.blocks) ? block.blocks : []).map((entry) => extractRichTextBlockPlainText(entry)).join("\n"));
  }
  if (type === "list") {
    return safeText((Array.isArray(block.blocks) ? block.blocks : []).map((entry) => extractRichTextBlockPlainText(entry)).join("\n"));
  }
  if (type === "list-item") {
    return safeText([
      extractInlineNodeText(block.content || []),
      (Array.isArray(block.blocks) ? block.blocks : []).map((entry) => extractRichTextBlockPlainText(entry)).join("\n"),
    ].join("\n"));
  }
  return safeText(block.plainText || extractInlineNodeText(block.content || []));
}

function extractRichTextDocumentMetaText(documentValue = null) {
  if (!documentValue || typeof documentValue !== "object") {
    return "";
  }
  const bucket = [];
  collectStringBucket(documentValue.meta || {}, bucket);
  return safeText(bucket.join("\n"));
}

function extractRichTextDocumentPlainText(documentValue = null, fallback = "") {
  if (!documentValue || typeof documentValue !== "object") {
    return safeText(fallback);
  }
  const plainText = safeText(serializeRichTextDocumentToPlainText(documentValue, fallback));
  if (plainText) {
    return plainText;
  }
  return safeText(fallback);
}

function extractTableStructureText(tableValue = null) {
  if (!tableValue || typeof tableValue !== "object") {
    return "";
  }
  const bucket = [];
  const rows = Array.isArray(tableValue.rows) ? tableValue.rows : [];
  rows.forEach((row) => {
    const cells = Array.isArray(row?.cells) ? row.cells : Array.isArray(row?.blocks) ? row.blocks : [];
    cells.forEach((cell) => {
      const richText = extractRichTextDocumentPlainText(cell?.richTextDocument, cell?.plainText || cell?.text || cell?.html ? htmlToPlainText(cell.html || "") : "");
      if (richText) {
        bucket.push(richText);
      } else {
        const plain = safeText(cell?.plainText || cell?.text || cell?.html ? htmlToPlainText(cell.html || "") : "");
        if (plain) {
          bucket.push(plain);
        }
      }
    });
  });
  return safeText([
    safeText(tableValue.title || ""),
    bucket.join("\n"),
  ].join("\n"));
}

function extractLinkMetaText(item = {}) {
  const sourceTokens = [
    ...(Array.isArray(item?.structuredImport?.linkTokens) ? item.structuredImport.linkTokens : []),
    ...(Array.isArray(item?.linkTokens) ? item.linkTokens : []),
  ];
  const tokenValues = sourceTokens
    .flatMap((token) => [token?.url, token?.href, token?.value, token?.domain, token?.title, token?.text])
    .filter(Boolean)
    .map((entry) => safeText(entry))
    .filter(Boolean);
  const bucket = [...tokenValues];
  const metaCache = item?.structuredImport?.urlMetaCache || item?.urlMetaCache || item?.richTextDocument?.meta?.urlMetaCache || {};
  collectStringBucket(metaCache, bucket);
  return safeText(bucket.join("\n"));
}

function extractItemTitle(item = {}) {
  return (
    safeText(item?.title || "") ||
    safeText(item?.name || "") ||
    safeText(item?.fileName || "") ||
    resolveItemTypeLabel(item?.type)
  );
}

function extractBaseItemText(item = {}) {
  const htmlText = item?.html ? safeText(htmlToPlainText(item.html)) : "";
  const plainFallback = safeText(item?.plainText || item?.text || htmlText || "");
  const richText = extractRichTextDocumentPlainText(item?.richTextDocument, plainFallback);
  const tableText = item?.type === "table" ? extractTableStructureText(item?.table) : "";
  const codeText =
    item?.type === "codeBlock" || item?.type === "mathBlock" || item?.type === "mathInline"
      ? safeText(item?.code || item?.formula || item?.plainText || item?.text || "")
      : "";
  const structuredText = safeText(
    [
      item?.structuredImport?.canonicalFragment ? JSON.stringify(item.structuredImport.canonicalFragment) : "",
      item?.structuredImport?.compatibilityFragment ? JSON.stringify(item.structuredImport.compatibilityFragment) : "",
    ].join("\n")
  );
  const recursiveBucket = [];
  collectStringBucket(
    {
      title: item?.title,
      name: item?.name,
      fileName: item?.fileName,
      plainText: item?.plainText,
      text: item?.text,
      code: item?.code,
      formula: item?.formula,
      html: htmlText,
      memo: item?.memo,
      note: item?.note,
      language: item?.language,
      sourcePath: item?.sourcePath,
      table: item?.table,
      richTextDocument: item?.richTextDocument,
      structuredImport: item?.structuredImport,
    },
    recursiveBucket
  );
  return safeText(
    [
      extractItemTitle(item),
      richText,
      tableText,
      codeText,
      safeText(item?.memo || ""),
      safeText(item?.note || ""),
      extractLinkMetaText(item),
      extractRichTextDocumentMetaText(item?.richTextDocument),
      structuredText,
      recursiveBucket.join("\n"),
    ].join("\n")
  );
}

function createIndexEntry({
  item = {},
  entryKey = "",
  filterKey = CANVAS_SEARCH_FILTER_KEYS.TEXT,
  type = "",
  typeLabel = "",
  title = "",
  fields = [],
  aggregateText = "",
}) {
  const itemId = String(item?.id || "").trim();
  const normalizedFields = (Array.isArray(fields) ? fields : [])
    .map((field) => ({
      key: String(field?.key || "").trim(),
      label: String(field?.label || "").trim(),
      value: safeText(field?.value || ""),
    }))
    .filter((field) => field.key && field.label && field.value);
  const normalizedAggregate = safeText(aggregateText);
  if (!itemId || !normalizedFields.length) {
    return null;
  }
  return {
    entryKey: String(entryKey || itemId).trim() || itemId,
    id: itemId,
    itemType: String(type || item?.type || "").trim(),
    filterKey,
    typeLabel: String(typeLabel || resolveItemTypeLabel(type || item?.type)).trim(),
    title: safeText(title || extractItemTitle(item)),
    fields: normalizedFields,
    aggregateText: normalizedAggregate,
  };
}

function buildBaseItemEntry(item = {}) {
  const itemType = String(item?.type || "").trim();
  const title = extractItemTitle(item);
  const baseText = extractBaseItemText(item);
  const fields = [
    { key: "title", label: "标题", value: title },
    { key: "text", label: "正文", value: extractRichTextDocumentPlainText(item?.richTextDocument, item?.plainText || item?.text || item?.html ? htmlToPlainText(item.html || "") : "") },
    { key: "table", label: "表格内容", value: itemType === "table" ? extractTableStructureText(item?.table) : "" },
    {
      key: "code",
      label: "代码内容",
      value:
        itemType === "codeBlock" || itemType === "mathBlock" || itemType === "mathInline"
          ? safeText(item?.code || item?.formula || item?.plainText || item?.text || "")
          : "",
    },
    { key: "memo", label: "备忘录", value: safeText(item?.memo || "") },
    { key: "note", label: "标签", value: safeText(item?.note || "") },
    { key: "path", label: "路径", value: safeText(item?.sourcePath || "") },
    { key: "link", label: "链接", value: extractLinkMetaText(item) },
    { key: "content", label: "内容", value: baseText },
  ];
  return createIndexEntry({
    item,
    entryKey: String(item?.id || ""),
    filterKey: getFilterKeyForItem(item),
    type: itemType,
    typeLabel: resolveItemTypeLabel(itemType),
    title,
    fields,
    aggregateText: baseText,
  });
}

function collectRichTextSemanticEntries(item = {}) {
  const itemId = String(item?.id || "").trim();
  const documentValue = item?.richTextDocument;
  if (!itemId || !documentValue || typeof documentValue !== "object" || !Array.isArray(documentValue.blocks)) {
    return [];
  }
  const entries = [];
  const baseTitle = extractItemTitle(item);
  const walkBlocks = (blocks, parentPath = "rt") => {
    (Array.isArray(blocks) ? blocks : []).forEach((block, index) => {
      if (!block || typeof block !== "object") {
        return;
      }
      const type = String(block.type || "").trim().toLowerCase();
      const entryPath = `${parentPath}-${index}`;
      if (type === "table") {
        const plainText = extractRichTextBlockPlainText(block);
        const entry = createIndexEntry({
          item,
          entryKey: `${itemId}::${entryPath}::table`,
          filterKey: CANVAS_SEARCH_FILTER_KEYS.TABLE,
          type: "table",
          typeLabel: RESULT_TYPE_LABELS.table,
          title: `${baseTitle} / 表格`,
          fields: [
            { key: "title", label: "标题", value: `${baseTitle} 表格` },
            { key: "table", label: "表格内容", value: plainText },
            { key: "content", label: "内容", value: plainText },
          ],
          aggregateText: plainText,
        });
        if (entry) {
          entries.push(entry);
        }
      } else if (type === "code-block" || type === "math-block") {
        const plainText = extractRichTextBlockPlainText(block);
        const label = type === "math-block" ? "公式内容" : "代码内容";
        const entry = createIndexEntry({
          item,
          entryKey: `${itemId}::${entryPath}::code`,
          filterKey: CANVAS_SEARCH_FILTER_KEYS.CODE,
          type: type === "math-block" ? "mathBlock" : "codeBlock",
          typeLabel: type === "math-block" ? RESULT_TYPE_LABELS.mathBlock : RESULT_TYPE_LABELS.codeBlock,
          title: `${baseTitle} / ${type === "math-block" ? "公式" : "代码块"}`,
          fields: [
            { key: "title", label: "标题", value: `${baseTitle} ${type === "math-block" ? "公式" : "代码块"}` },
            { key: "code", label, value: plainText },
            { key: "content", label: "内容", value: plainText },
          ],
          aggregateText: plainText,
        });
        if (entry) {
          entries.push(entry);
        }
      }
      if (Array.isArray(block.blocks) && block.blocks.length) {
        walkBlocks(block.blocks, entryPath);
      }
    });
  };
  walkBlocks(documentValue.blocks);
  return entries;
}

export function buildCanvasSearchIndex(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }
  const entries = [];
  items.forEach((item) => {
    if (!item || !SEARCHABLE_BASE_TYPES.has(String(item.type || "").trim())) {
      return;
    }
    const baseEntry = buildBaseItemEntry(item);
    if (baseEntry) {
      entries.push(baseEntry);
    }
    const semanticEntries = collectRichTextSemanticEntries(item);
    if (semanticEntries.length) {
      entries.push(...semanticEntries);
    }
  });
  return entries;
}

export function collectCanvasSearchStats(items = []) {
  const index = buildCanvasSearchIndex(items);
  return {
    total: Array.isArray(items) ? items.length : 0,
    indexTotal: index.length,
    text: index.filter((entry) => entry.filterKey === CANVAS_SEARCH_FILTER_KEYS.TEXT).length,
    node: index.filter((entry) => entry.filterKey === CANVAS_SEARCH_FILTER_KEYS.NODE).length,
    fileCard: index.filter((entry) => entry.filterKey === CANVAS_SEARCH_FILTER_KEYS.FILE).length,
    table: index.filter((entry) => entry.filterKey === CANVAS_SEARCH_FILTER_KEYS.TABLE).length,
    codeBlock: index.filter((entry) => entry.filterKey === CANVAS_SEARCH_FILTER_KEYS.CODE).length,
  };
}

export function getCanvasSearchScopeItems(stats = {}) {
  return [
    {
      key: CANVAS_SEARCH_FILTER_KEYS.ALL,
      label: FILTER_LABELS[CANVAS_SEARCH_FILTER_KEYS.ALL],
      count: Number(stats.indexTotal || stats.total || 0) || 0,
      accent: "is-board",
    },
    {
      key: CANVAS_SEARCH_FILTER_KEYS.TEXT,
      label: FILTER_LABELS[CANVAS_SEARCH_FILTER_KEYS.TEXT],
      count: Number(stats.text || 0) || 0,
      accent: "is-text",
    },
    {
      key: CANVAS_SEARCH_FILTER_KEYS.NODE,
      label: FILTER_LABELS[CANVAS_SEARCH_FILTER_KEYS.NODE],
      count: Number(stats.node || 0) || 0,
      accent: "is-node",
    },
    {
      key: CANVAS_SEARCH_FILTER_KEYS.FILE,
      label: FILTER_LABELS[CANVAS_SEARCH_FILTER_KEYS.FILE],
      count: Number(stats.fileCard || 0) || 0,
      accent: "is-file",
    },
    {
      key: CANVAS_SEARCH_FILTER_KEYS.TABLE,
      label: FILTER_LABELS[CANVAS_SEARCH_FILTER_KEYS.TABLE],
      count: Number(stats.table || 0) || 0,
      accent: "is-board",
    },
    {
      key: CANVAS_SEARCH_FILTER_KEYS.CODE,
      label: FILTER_LABELS[CANVAS_SEARCH_FILTER_KEYS.CODE],
      count: Number(stats.codeBlock || 0) || 0,
      accent: "is-node",
    },
  ];
}

export function buildCanvasSearchResults(indexEntries = [], query = "", options = {}) {
  const normalizedQuery = toLowerSearchText(query);
  const filterKey = String(options?.filterKey || CANVAS_SEARCH_FILTER_KEYS.ALL).trim() || CANVAS_SEARCH_FILTER_KEYS.ALL;
  const limit = Math.max(1, Number(options?.limit || 10) || 10);
  if (!normalizedQuery) {
    return [];
  }
  const sourceEntries = Array.isArray(indexEntries) ? indexEntries : [];
  return sourceEntries
    .filter((entry) => filterKey === CANVAS_SEARCH_FILTER_KEYS.ALL || entry.filterKey === filterKey)
    .map((entry) => {
      const matchedField = entry.fields.find((field) => toLowerSearchText(field.value).includes(normalizedQuery));
      if (!matchedField) {
        return null;
      }
      const lowerValue = toLowerSearchText(matchedField.value);
      const score =
        lowerValue.startsWith(normalizedQuery)
          ? 0
          : matchedField.key === "title"
            ? 1
            : matchedField.key === "code" || matchedField.key === "table"
              ? 2
              : matchedField.key === "content"
                ? 4
                : 3;
      return {
        entryKey: entry.entryKey,
        id: entry.id,
        type: entry.itemType,
        filterKey: entry.filterKey,
        typeLabel: entry.typeLabel,
        title: entry.title,
        summary: matchedField.value,
        matchLabel: matchedField.label,
        score,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title, "zh-CN"))
    .slice(0, limit);
}
