import {
  htmlToPlainText,
  normalizeRichHtml,
  normalizeRichHtmlInlineFontSizes,
  sanitizeText,
} from "../utils.js";

export const RICH_TEXT_DOCUMENT_VERSION = 2;
export const RICH_TEXT_DOCUMENT_KIND = "freeflow-rich-text";

export const RICH_TEXT_BLOCK_TYPES = Object.freeze({
  HTML: "html-block",
  PARAGRAPH: "paragraph",
  HEADING: "heading",
  BLOCKQUOTE: "blockquote",
  LIST: "list",
  LIST_ITEM: "list-item",
  CODE_BLOCK: "code-block",
  THEMATIC_BREAK: "thematic-break",
  TABLE: "table",
  TABLE_ROW: "table-row",
  TABLE_CELL: "table-cell",
  MATH_BLOCK: "math-block",
  FOOTNOTE_DEFINITION: "footnote-definition",
});

export const RICH_TEXT_INLINE_NODE_TYPES = Object.freeze({
  TEXT: "text",
  HARD_BREAK: "hardBreak",
  INLINE_CODE: "inlineCode",
  LINK: "link",
  IMAGE: "image",
  MATH_INLINE: "mathInline",
  FOOTNOTE_REF: "footnoteRef",
});

export const RICH_TEXT_MARK_TYPES = Object.freeze({
  BOLD: "bold",
  ITALIC: "italic",
  UNDERLINE: "underline",
  STRIKE: "strike",
  HIGHLIGHT: "highlight",
  TEXT_COLOR: "textColor",
  BACKGROUND_COLOR: "backgroundColor",
  CODE: "code",
  LINK: "link",
});

const DEFAULT_BLOCK_TYPE = RICH_TEXT_BLOCK_TYPES.PARAGRAPH;
const DEFAULT_INLINE_NODE_TYPE = RICH_TEXT_INLINE_NODE_TYPES.TEXT;

function stripLatexEditingDelimiters(value = "", displayMode = false) {
  const source = sanitizeText(String(value || "")).trim();
  if (!source) {
    return "";
  }
  if (displayMode) {
    const fenced = source.match(/^\$\$\s*[\r\n]?([\s\S]*?)[\r\n]?\s*\$\$$/);
    if (fenced) {
      return sanitizeText(String(fenced[1] || "")).trim();
    }
    return source.replace(/^\$\$+/, "").replace(/\$\$+$/, "").trim();
  }
  const inlineWrapped = source.match(/^\$(?!\$)([\s\S]*?)(?<!\$)\$$/);
  if (inlineWrapped) {
    return sanitizeText(String(inlineWrapped[1] || "")).trim();
  }
  return source.replace(/^\$/, "").replace(/\$$/, "").trim();
}

const BLOCK_TYPE_ALIASES = Object.freeze({
  "html-block": RICH_TEXT_BLOCK_TYPES.HTML,
  html: RICH_TEXT_BLOCK_TYPES.HTML,
  paragraph: RICH_TEXT_BLOCK_TYPES.PARAGRAPH,
  p: RICH_TEXT_BLOCK_TYPES.PARAGRAPH,
  heading: RICH_TEXT_BLOCK_TYPES.HEADING,
  header: RICH_TEXT_BLOCK_TYPES.HEADING,
  title: RICH_TEXT_BLOCK_TYPES.HEADING,
  blockquote: RICH_TEXT_BLOCK_TYPES.BLOCKQUOTE,
  quote: RICH_TEXT_BLOCK_TYPES.BLOCKQUOTE,
  list: RICH_TEXT_BLOCK_TYPES.LIST,
  "bullet-list": RICH_TEXT_BLOCK_TYPES.LIST,
  "ordered-list": RICH_TEXT_BLOCK_TYPES.LIST,
  "task-list": RICH_TEXT_BLOCK_TYPES.LIST,
  "list-item": RICH_TEXT_BLOCK_TYPES.LIST_ITEM,
  listitem: RICH_TEXT_BLOCK_TYPES.LIST_ITEM,
  "code-block": RICH_TEXT_BLOCK_TYPES.CODE_BLOCK,
  codeblock: RICH_TEXT_BLOCK_TYPES.CODE_BLOCK,
  hr: RICH_TEXT_BLOCK_TYPES.THEMATIC_BREAK,
  "thematic-break": RICH_TEXT_BLOCK_TYPES.THEMATIC_BREAK,
  table: RICH_TEXT_BLOCK_TYPES.TABLE,
  "table-row": RICH_TEXT_BLOCK_TYPES.TABLE_ROW,
  tablerow: RICH_TEXT_BLOCK_TYPES.TABLE_ROW,
  "table-cell": RICH_TEXT_BLOCK_TYPES.TABLE_CELL,
  tablecell: RICH_TEXT_BLOCK_TYPES.TABLE_CELL,
  "math-block": RICH_TEXT_BLOCK_TYPES.MATH_BLOCK,
  math: RICH_TEXT_BLOCK_TYPES.MATH_BLOCK,
  "footnote-definition": RICH_TEXT_BLOCK_TYPES.FOOTNOTE_DEFINITION,
});

const INLINE_NODE_TYPE_ALIASES = Object.freeze({
  text: RICH_TEXT_INLINE_NODE_TYPES.TEXT,
  hardbreak: RICH_TEXT_INLINE_NODE_TYPES.HARD_BREAK,
  "hard-break": RICH_TEXT_INLINE_NODE_TYPES.HARD_BREAK,
  inlinecode: RICH_TEXT_INLINE_NODE_TYPES.INLINE_CODE,
  "inline-code": RICH_TEXT_INLINE_NODE_TYPES.INLINE_CODE,
  link: RICH_TEXT_INLINE_NODE_TYPES.LINK,
  image: RICH_TEXT_INLINE_NODE_TYPES.IMAGE,
  mathinline: RICH_TEXT_INLINE_NODE_TYPES.MATH_INLINE,
  "math-inline": RICH_TEXT_INLINE_NODE_TYPES.MATH_INLINE,
  footnoteref: RICH_TEXT_INLINE_NODE_TYPES.FOOTNOTE_REF,
  "footnote-ref": RICH_TEXT_INLINE_NODE_TYPES.FOOTNOTE_REF,
});

const MARK_TYPE_ALIASES = Object.freeze({
  bold: RICH_TEXT_MARK_TYPES.BOLD,
  strong: RICH_TEXT_MARK_TYPES.BOLD,
  italic: RICH_TEXT_MARK_TYPES.ITALIC,
  emphasis: RICH_TEXT_MARK_TYPES.ITALIC,
  underline: RICH_TEXT_MARK_TYPES.UNDERLINE,
  strike: RICH_TEXT_MARK_TYPES.STRIKE,
  strikethrough: RICH_TEXT_MARK_TYPES.STRIKE,
  delete: RICH_TEXT_MARK_TYPES.STRIKE,
  highlight: RICH_TEXT_MARK_TYPES.HIGHLIGHT,
  code: RICH_TEXT_MARK_TYPES.CODE,
  link: RICH_TEXT_MARK_TYPES.LINK,
  textcolor: RICH_TEXT_MARK_TYPES.TEXT_COLOR,
  "text-color": RICH_TEXT_MARK_TYPES.TEXT_COLOR,
  backgroundcolor: RICH_TEXT_MARK_TYPES.BACKGROUND_COLOR,
  "background-color": RICH_TEXT_MARK_TYPES.BACKGROUND_COLOR,
});

export const TEXT_LINK_KIND_HINTS = Object.freeze([
  "plain-link",
  "preview-candidate",
  "embed-candidate",
  "canvas-link",
]);
export const TEXT_LINK_FETCH_STATES = Object.freeze(["idle", "pending", "ready", "error", "stale"]);
const LINK_KIND_HINT_SET = new Set(TEXT_LINK_KIND_HINTS);
const LINK_FETCH_STATE_SET = new Set(TEXT_LINK_FETCH_STATES);

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cloneObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? cloneValue(value) : {};
}

function firstString(...values) {
  for (let index = 0; index < values.length; index += 1) {
    if (typeof values[index] === "string") {
      return values[index];
    }
  }
  return "";
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? cloneValue(value) : {};
}

function normalizeUrlString(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 4096) {
    return "";
  }
  if (/^freeflow:\/\/canvas\/item\//i.test(raw)) {
    return raw;
  }
  if (/^file:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch {
      return "";
    }
  }
  if (/^[a-zA-Z]:[\\/]/.test(raw)) {
    return encodeURI(`file:///${raw.replace(/\\/g, "/")}`);
  }
  if (/^\\\\[^\\]+\\[^\\]+/.test(raw)) {
    return encodeURI(`file:${raw.replace(/\\/g, "/")}`);
  }
  if (/^\/[^/]/.test(raw)) {
    return encodeURI(`file://${raw}`);
  }
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:", "freeflow:", "mailto:", "tel:", "file:"].includes(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch (_error) {
    if (/^www\./i.test(raw)) {
      try {
        const parsed = new URL(`https://${raw}`);
        return parsed.toString();
      } catch (_fallbackError) {
        return "";
      }
    }
    return "";
  }
}

function resolveDomainFromUrl(url = "") {
  const normalizedUrl = normalizeUrlString(url);
  if (!normalizedUrl) {
    return "";
  }
  try {
    return String(new URL(normalizedUrl).hostname || "").trim().toLowerCase();
  } catch (_error) {
    return "";
  }
}

function normalizeRangeIndex(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Number(fallback) || 0);
  }
  return Math.max(0, Math.round(numeric));
}

export function normalizeTextLinkToken(token = null) {
  if (!token || typeof token !== "object") {
    return null;
  }
  const url = normalizeUrlString(token.url || token.href || token.link || "");
  if (!url) {
    return null;
  }
  const start = normalizeRangeIndex(
    token.rangeStart ?? token.start ?? token.offsetStart ?? token.offset ?? 0,
    0
  );
  const endCandidate = normalizeRangeIndex(
    token.rangeEnd ?? token.end ?? token.offsetEnd ?? start,
    start
  );
  const end = Math.max(start, endCandidate);
  const kindHint = normalizeTextLinkKindHint(token.kindHint || token.kind || "");
  const fetchState = normalizeTextLinkFetchState(token.fetchState || token.state || "");
  const normalized = {
    url,
    rangeStart: start,
    rangeEnd: end,
    domain: String(token.domain || resolveDomainFromUrl(url)).trim().toLowerCase(),
    kindHint,
    fetchState,
  };
  if (typeof token.id === "string" && token.id.trim()) {
    normalized.id = token.id.trim();
  }
  if (typeof token.label === "string" && token.label.trim()) {
    normalized.label = sanitizeText(token.label);
  }
  return normalized;
}

export function normalizeTextLinkTokens(tokens = []) {
  if (!Array.isArray(tokens)) {
    return [];
  }
  const dedupe = new Map();
  tokens.forEach((token, index) => {
    const normalized = normalizeTextLinkToken(token);
    if (!normalized) {
      return;
    }
    const key = `${normalized.rangeStart}:${normalized.rangeEnd}:${normalized.url.toLowerCase()}`;
    if (!dedupe.has(key)) {
      dedupe.set(key, normalized);
      return;
    }
    const existing = dedupe.get(key);
    dedupe.set(key, {
      ...existing,
      ...normalized,
      id: existing.id || normalized.id,
      label: existing.label || normalized.label,
      kindHint: existing.kindHint || normalized.kindHint,
      fetchState: normalized.fetchState || existing.fetchState,
      _index: index,
    });
  });
  return Array.from(dedupe.values())
    .map((token) => {
      if (Object.prototype.hasOwnProperty.call(token, "_index")) {
        const { _index, ...rest } = token;
        return rest;
      }
      return token;
    })
    .sort((left, right) => {
      if (left.rangeStart !== right.rangeStart) {
        return left.rangeStart - right.rangeStart;
      }
      if (left.rangeEnd !== right.rangeEnd) {
        return left.rangeEnd - right.rangeEnd;
      }
      return String(left.url || "").localeCompare(String(right.url || ""));
    });
}

export function normalizeTextUrlMetaEntry(meta = null, urlKey = "") {
  if (!meta || typeof meta !== "object") {
    return null;
  }
  const url = normalizeUrlString(meta.url || urlKey || "");
  if (!url) {
    return null;
  }
  const fetchState = normalizeTextLinkFetchState(meta.fetchState || meta.state || "");
  const updatedAtValue = Number(meta.updatedAt ?? meta.fetchedAt ?? 0);
  const normalized = {
    url,
    domain: String(meta.domain || resolveDomainFromUrl(url)).trim().toLowerCase(),
    title: sanitizeText(String(meta.title || "")),
    description: sanitizeText(String(meta.description || meta.summary || "")),
    image: String(meta.image || meta.imageUrl || meta.cover || "").trim(),
    siteName: sanitizeText(String(meta.siteName || meta.site || "")),
    status: sanitizeText(String(meta.status || "")),
    fetchState,
    updatedAt: Number.isFinite(updatedAtValue) && updatedAtValue > 0 ? Math.round(updatedAtValue) : 0,
  };
  if (typeof meta.embeddable === "boolean") {
    normalized.embeddable = meta.embeddable;
  }
  return normalized;
}

export function normalizeTextUrlMetaCache(cache = {}) {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
    return {};
  }
  const normalized = {};
  Object.entries(cache).forEach(([key, value]) => {
    const entry = normalizeTextUrlMetaEntry(value, key);
    if (!entry) {
      return;
    }
    normalized[entry.url] = entry;
  });
  return normalized;
}

export function normalizeTextLinkKindHint(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return LINK_KIND_HINT_SET.has(normalized) ? normalized : "";
}

export function normalizeTextLinkFetchState(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return LINK_FETCH_STATE_SET.has(normalized) ? normalized : "";
}

function buildLinkData(value = {}) {
  if (!value || typeof value !== "object") {
    return { linkTokens: [], urlMetaCache: {} };
  }
  return {
    linkTokens: normalizeTextLinkTokens(value.linkTokens),
    urlMetaCache: normalizeTextUrlMetaCache(value.urlMetaCache),
  };
}

export function mergeTextLinkData(base = {}, incoming = {}) {
  const left = buildLinkData(base);
  const right = buildLinkData(incoming);
  const linkTokens = normalizeTextLinkTokens([...(left.linkTokens || []), ...(right.linkTokens || [])]);
  const urlMetaCache = {
    ...left.urlMetaCache,
    ...right.urlMetaCache,
  };
  return {
    linkTokens,
    urlMetaCache: normalizeTextUrlMetaCache(urlMetaCache),
  };
}

export function extractTextLinkData(source = {}, fallback = {}) {
  const sourceMeta =
    source?.richTextDocument?.meta && typeof source.richTextDocument.meta === "object"
      ? source.richTextDocument.meta
      : {};
  const fallbackMeta =
    fallback?.richTextDocument?.meta && typeof fallback.richTextDocument.meta === "object"
      ? fallback.richTextDocument.meta
      : {};
  const fromFallback = buildLinkData({
    linkTokens: fallback.linkTokens ?? fallbackMeta.linkTokens,
    urlMetaCache: fallback.urlMetaCache ?? fallbackMeta.urlMetaCache,
  });
  const fromSource = buildLinkData({
    linkTokens: source.linkTokens ?? sourceMeta.linkTokens,
    urlMetaCache: source.urlMetaCache ?? sourceMeta.urlMetaCache,
  });
  return mergeTextLinkData(fromFallback, fromSource);
}

function wrapBlocksHtml(html) {
  const normalizedHtml = normalizeRichHtml(html || "");
  return normalizedHtml.trim() ? normalizedHtml : "";
}

export function normalizeRichTextBlockType(type = DEFAULT_BLOCK_TYPE) {
  const normalizedType = String(type || "").trim().toLowerCase();
  return BLOCK_TYPE_ALIASES[normalizedType] || DEFAULT_BLOCK_TYPE;
}

export function normalizeRichTextInlineNodeType(type = DEFAULT_INLINE_NODE_TYPE) {
  const normalizedType = String(type || "").trim().toLowerCase();
  return INLINE_NODE_TYPE_ALIASES[normalizedType] || DEFAULT_INLINE_NODE_TYPE;
}

export function normalizeRichTextMark(mark = null) {
  if (!mark || typeof mark !== "object") {
    return null;
  }
  const type = MARK_TYPE_ALIASES[String(mark.type || "").trim().toLowerCase()];
  if (!type) {
    return null;
  }
  return {
    type,
    attrs: normalizeObject(mark.attrs),
    meta: normalizeObject(mark.meta),
  };
}

export function createRichTextTextNode(text = "", marks = [], meta = {}) {
  return normalizeRichTextInlineNode({
    type: RICH_TEXT_INLINE_NODE_TYPES.TEXT,
    text,
    marks,
    meta,
  });
}

export function normalizeRichTextInlineNode(node = null) {
  if (typeof node === "string") {
    return createRichTextTextNode(node);
  }
  if (!node || typeof node !== "object") {
    return null;
  }
  const type = normalizeRichTextInlineNodeType(node.type);
  const text = sanitizeText(
    firstString(node.text, node.value, type === RICH_TEXT_INLINE_NODE_TYPES.HARD_BREAK ? "\n" : "")
  );
  const marks = Array.isArray(node.marks)
    ? node.marks.map((mark) => normalizeRichTextMark(mark)).filter(Boolean)
    : [];
  const attrs = normalizeObject(node.attrs);
  const meta = normalizeObject(node.meta);
  const content = Array.isArray(node.content)
    ? node.content.map((child) => normalizeRichTextInlineNode(child)).filter(Boolean)
    : [];
  if (type === RICH_TEXT_INLINE_NODE_TYPES.TEXT) {
    return {
      type,
      text,
      marks,
      attrs,
      meta,
    };
  }
  if (type === RICH_TEXT_INLINE_NODE_TYPES.LINK) {
    return {
      type,
      content,
      marks,
      attrs,
      meta,
    };
  }
  if (type === RICH_TEXT_INLINE_NODE_TYPES.IMAGE) {
    return {
      type,
      attrs,
      meta,
    };
  }
  return {
    type,
    text,
    marks,
    attrs,
    meta,
  };
}

export function createRichTextBlock(block = {}) {
  return normalizeRichTextBlock(block);
}

export function normalizeRichTextBlock(block = {}, index = 0) {
  const safeBlock = block && typeof block === "object" ? block : {};
  const type = normalizeRichTextBlockType(safeBlock.type);
  const content = Array.isArray(safeBlock.content)
    ? safeBlock.content.map((node) => normalizeRichTextInlineNode(node)).filter(Boolean)
    : [];
  const blocks = Array.isArray(safeBlock.blocks || safeBlock.children)
    ? (safeBlock.blocks || safeBlock.children)
        .map((child, childIndex) => normalizeRichTextBlock(child, childIndex))
        .filter(Boolean)
    : [];
  const html = normalizeRichHtml(firstString(safeBlock.html));
  const plainText = sanitizeText(
    firstString(safeBlock.plainText, safeBlock.text, html ? htmlToPlainText(html) : "")
  );
  return {
    id: String(safeBlock.id || `block-${index + 1}`),
    type,
    html,
    plainText,
    content,
    blocks,
    attrs: normalizeObject(safeBlock.attrs),
    meta: normalizeObject(safeBlock.meta),
  };
}

export function isSemanticRichTextBlock(block = null) {
  const type = normalizeRichTextBlockType(block?.type);
  return type !== RICH_TEXT_BLOCK_TYPES.HTML;
}

export function serializeRichTextInlineNodesToHtml(nodes = []) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  return safeNodes.map((node) => serializeRichTextInlineNodeToHtml(node)).join("");
}

export function serializeRichTextInlineNodesToPlainText(nodes = []) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const parts = [];
  safeNodes.forEach((node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === RICH_TEXT_INLINE_NODE_TYPES.TEXT) {
      parts.push(String(node.text || ""));
      return;
    }
    if (node.type === RICH_TEXT_INLINE_NODE_TYPES.HARD_BREAK) {
      parts.push("\n");
      return;
    }
    if (node.type === RICH_TEXT_INLINE_NODE_TYPES.INLINE_CODE || node.type === RICH_TEXT_INLINE_NODE_TYPES.MATH_INLINE) {
      parts.push(String(node.text || ""));
      return;
    }
    if (node.type === RICH_TEXT_INLINE_NODE_TYPES.LINK) {
      parts.push(serializeRichTextInlineNodesToPlainText(node.content || []));
      return;
    }
    if (node.type === RICH_TEXT_INLINE_NODE_TYPES.IMAGE) {
      parts.push(String(node?.attrs?.alt || node?.attrs?.title || ""));
      return;
    }
    if (node.type === RICH_TEXT_INLINE_NODE_TYPES.FOOTNOTE_REF) {
      const refId = String(node?.attrs?.refId || "").trim();
      parts.push(refId ? `[${refId}]` : "[*]");
    }
  });
  return sanitizeText(parts.join(""));
}

export function serializeRichTextInlineNodeToHtml(node = null) {
  if (!node || typeof node !== "object") {
    return "";
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.TEXT) {
    return applyMarksToHtml(escapeHtml(String(node.text || "")), node.marks || []);
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.HARD_BREAK) {
    return "<br>";
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.INLINE_CODE) {
    return `<code>${escapeHtml(String(node.text || ""))}</code>`;
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.MATH_INLINE) {
    const math = escapeHtml(String(node.text || ""));
    return `<span data-role="math-inline">${math}</span>`;
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.LINK) {
    const inner = serializeRichTextInlineNodesToHtml(node.content || []);
    const href = escapeAttribute(String(node?.attrs?.href || ""));
    const title = String(node?.attrs?.title || "").trim();
    const titleAttr = title ? ` title="${escapeAttribute(title)}"` : "";
    return `<a href="${href}"${titleAttr}>${inner}</a>`;
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.IMAGE) {
    const src = escapeAttribute(String(node?.attrs?.src || ""));
    if (!src) {
      return "";
    }
    const alt = escapeAttribute(String(node?.attrs?.alt || ""));
    const title = String(node?.attrs?.title || "").trim();
    const titleAttr = title ? ` title="${escapeAttribute(title)}"` : "";
    return `<img src="${src}" alt="${alt}"${titleAttr}>`;
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.FOOTNOTE_REF) {
    const refId = String(node?.attrs?.refId || "").trim();
    return `<sup data-footnote-ref="${escapeAttribute(refId || "*")}">${escapeHtml(refId || "*")}</sup>`;
  }
  return "";
}

export function serializeRichTextBlockToHtml(block = null) {
  if (!block || typeof block !== "object") {
    return "";
  }
  const type = normalizeRichTextBlockType(block.type);
  const attrs = block.attrs && typeof block.attrs === "object" ? block.attrs : {};
  if (type === RICH_TEXT_BLOCK_TYPES.HTML) {
    return wrapBlocksHtml(block.html || "");
  }
  if (type === RICH_TEXT_BLOCK_TYPES.PARAGRAPH) {
    return `<p>${serializeRichTextInlineNodesToHtml(block.content || [])}</p>`;
  }
  if (type === RICH_TEXT_BLOCK_TYPES.HEADING) {
    const level = clampHeadingLevel(attrs.level);
    return `<h${level}>${serializeRichTextInlineNodesToHtml(block.content || [])}</h${level}>`;
  }
  if (type === RICH_TEXT_BLOCK_TYPES.BLOCKQUOTE) {
    return `<blockquote>${serializeRichTextBlocksToHtml(block.blocks || [])}</blockquote>`;
  }
  if (type === RICH_TEXT_BLOCK_TYPES.LIST) {
    const ordered = attrs.ordered === true;
    const tag = ordered ? "ol" : "ul";
    const start = ordered && Number.isFinite(Number(attrs.start)) ? ` start="${Number(attrs.start)}"` : "";
    const taskAttr = attrs.task === true ? ' data-ff-task-list="true"' : "";
    return `<${tag}${start}${taskAttr}>${serializeRichTextBlocksToHtml(block.blocks || [])}</${tag}>`;
  }
  if (type === RICH_TEXT_BLOCK_TYPES.LIST_ITEM) {
    const taskAttrs = typeof attrs.checked === "boolean"
      ? ` data-ff-task-item="true" data-ff-task-state="${attrs.checked ? "done" : "todo"}"`
      : "";
    const contentHtml = serializeRichTextInlineNodesToHtml(block.content || []);
    const childHtml = serializeRichTextBlocksToHtml(block.blocks || []);
    return `<li${taskAttrs}>${contentHtml}${childHtml}</li>`;
  }
  if (type === RICH_TEXT_BLOCK_TYPES.CODE_BLOCK) {
    const language = String(attrs.language || "").trim();
    const className = language ? ` class="language-${escapeAttribute(language)}"` : "";
    const codeText = escapeHtml(String(block.plainText || ""));
    return `<pre><code${className}>${codeText}</code></pre>`;
  }
  if (type === RICH_TEXT_BLOCK_TYPES.THEMATIC_BREAK) {
    return "<hr>";
  }
  if (type === RICH_TEXT_BLOCK_TYPES.TABLE) {
    return serializeTableBlockToHtml(block);
  }
  if (type === RICH_TEXT_BLOCK_TYPES.TABLE_ROW) {
    return `<tr>${serializeRichTextBlocksToHtml(block.blocks || [])}</tr>`;
  }
  if (type === RICH_TEXT_BLOCK_TYPES.TABLE_CELL) {
    const tag = attrs.header === true ? "th" : "td";
    const align = String(attrs.align || "").trim();
    const alignAttr = align ? ` align="${escapeAttribute(align)}"` : "";
    return `<${tag}${alignAttr}>${serializeRichTextInlineNodesToHtml(block.content || [])}</${tag}>`;
  }
  if (type === RICH_TEXT_BLOCK_TYPES.MATH_BLOCK) {
    return `<div data-role="math-block">${escapeHtml(String(block.plainText || ""))}</div>`;
  }
  if (type === RICH_TEXT_BLOCK_TYPES.FOOTNOTE_DEFINITION) {
    const footnoteId = escapeAttribute(String(attrs.id || attrs.identifier || ""));
    return `<div data-footnote-definition="${footnoteId}">${serializeRichTextBlocksToHtml(block.blocks || [])}</div>`;
  }
  return wrapBlocksHtml(block.html || "");
}

export function serializeRichTextBlockToPlainText(block = null) {
  if (!block || typeof block !== "object") {
    return "";
  }
  const type = normalizeRichTextBlockType(block.type);
  if (type === RICH_TEXT_BLOCK_TYPES.HTML) {
    return sanitizeText(block.plainText || htmlToPlainText(block.html || ""));
  }
  if (type === RICH_TEXT_BLOCK_TYPES.PARAGRAPH || type === RICH_TEXT_BLOCK_TYPES.HEADING || type === RICH_TEXT_BLOCK_TYPES.TABLE_CELL) {
    return serializeRichTextInlineNodesToPlainText(block.content || []);
  }
  if (type === RICH_TEXT_BLOCK_TYPES.BLOCKQUOTE || type === RICH_TEXT_BLOCK_TYPES.FOOTNOTE_DEFINITION) {
    return serializeRichTextBlocksToPlainText(block.blocks || []);
  }
  if (type === RICH_TEXT_BLOCK_TYPES.LIST) {
    return sanitizeText(
      (block.blocks || [])
        .map((item, index) => {
          const marker = block?.attrs?.task === true
            ? `- [${item?.attrs?.checked === true ? "x" : " "}] `
            : block?.attrs?.ordered === true
            ? `${Number(block?.attrs?.start || 1) + index}. `
            : "- ";
          return `${marker}${serializeRichTextBlockToPlainText(item)}`;
        })
        .join("\n")
    );
  }
  if (type === RICH_TEXT_BLOCK_TYPES.LIST_ITEM) {
    const bodyParts = [];
    const contentText = serializeRichTextInlineNodesToPlainText(block.content || []);
    if (contentText) {
      bodyParts.push(contentText);
    }
    const childText = serializeRichTextBlocksToPlainText(block.blocks || []);
    if (childText) {
      bodyParts.push(childText);
    }
    return sanitizeText(bodyParts.join("\n"));
  }
  if (type === RICH_TEXT_BLOCK_TYPES.CODE_BLOCK || type === RICH_TEXT_BLOCK_TYPES.MATH_BLOCK) {
    return sanitizeText(block.plainText || "");
  }
  if (type === RICH_TEXT_BLOCK_TYPES.THEMATIC_BREAK) {
    return "---";
  }
  if (type === RICH_TEXT_BLOCK_TYPES.TABLE) {
    return sanitizeText(
      (block.blocks || [])
        .map((row) =>
          (row.blocks || [])
            .map((cell) => serializeRichTextBlockToPlainText(cell))
            .join("\t")
        )
        .join("\n")
    );
  }
  if (type === RICH_TEXT_BLOCK_TYPES.TABLE_ROW) {
    return sanitizeText((block.blocks || []).map((cell) => serializeRichTextBlockToPlainText(cell)).join("\t"));
  }
  return sanitizeText(block.plainText || "");
}

export function serializeRichTextBlocksToHtml(blocks = []) {
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  return safeBlocks.map((block) => serializeRichTextBlockToHtml(block)).join("");
}

export function serializeRichTextBlocksToPlainText(blocks = []) {
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  return sanitizeText(
    safeBlocks
      .map((block) => serializeRichTextBlockToPlainText(block))
      .filter((value) => String(value || "").length > 0)
      .join("\n")
  );
}

export function serializeRichTextDocumentToHtml(documentValue, fallbackHtml = "") {
  if (!documentValue || typeof documentValue !== "object") {
    return normalizeRichHtml(fallbackHtml || "");
  }
  const html = normalizeRichHtml(documentValue.html || "");
  if (html.trim()) {
    return html;
  }
  const blocks = Array.isArray(documentValue.blocks) ? documentValue.blocks : [];
  const blockHtml = serializeRichTextBlocksToHtml(blocks);
  if (blockHtml.trim()) {
    return normalizeRichHtml(blockHtml);
  }
  return normalizeRichHtml(fallbackHtml || "");
}

export function serializeRichTextDocumentToPlainText(documentValue, fallbackText = "") {
  if (!documentValue || typeof documentValue !== "object") {
    return sanitizeText(fallbackText || "");
  }
  const plainText = sanitizeText(documentValue.plainText || "");
  if (plainText.trim()) {
    return plainText;
  }
  const blocks = Array.isArray(documentValue.blocks) ? documentValue.blocks : [];
  const blockText = serializeRichTextBlocksToPlainText(blocks);
  if (blockText.trim()) {
    return blockText;
  }
  const html = serializeRichTextDocumentToHtml(documentValue, "");
  if (html.trim()) {
    return sanitizeText(htmlToPlainText(html));
  }
  return sanitizeText(fallbackText || "");
}

export function normalizeRichTextDocument(documentValue, fallback = {}) {
  const fallbackHtml = normalizeRichHtmlInlineFontSizes(
    fallback.html || fallback.htmlText || "",
    Number(fallback.baseFontSize || fallback.fontSize || 20) || 20
  );
  const fallbackPlainText = sanitizeText(
    fallback.plainText || fallback.text || htmlToPlainText(fallbackHtml)
  );
  if (!documentValue || typeof documentValue !== "object") {
    return createRichTextDocumentFromHtml(fallbackHtml, fallbackPlainText, fallback);
  }
  const blocks = Array.isArray(documentValue.blocks) && documentValue.blocks.length
    ? documentValue.blocks.map((block, index) => normalizeRichTextBlock(block, index))
    : [
        normalizeRichTextBlock(
          {
            id: "block-1",
            type: RICH_TEXT_BLOCK_TYPES.HTML,
            html: documentValue.html || fallbackHtml,
            plainText: documentValue.plainText || fallbackPlainText,
            meta: {},
          },
          0
        ),
      ];
  const html = normalizeRichHtml(
    normalizeRichHtmlInlineFontSizes(
      serializeRichTextDocumentToHtml({ ...documentValue, blocks }, fallbackHtml),
      Number(fallback.baseFontSize || fallback.fontSize || documentValue?.meta?.baseFontSize || 20) || 20
    )
  );
  const plainText = sanitizeText(
    serializeRichTextDocumentToPlainText({ ...documentValue, blocks, html }, fallbackPlainText)
  );
  return {
    version: Number(documentValue.version) || RICH_TEXT_DOCUMENT_VERSION,
    kind: String(documentValue.kind || RICH_TEXT_DOCUMENT_KIND),
    html,
    plainText,
    blocks,
    meta: documentValue.meta && typeof documentValue.meta === "object"
      ? cloneValue(documentValue.meta)
      : {},
  };
}

export function createRichTextDocument({
  html = "",
  plainText = "",
  blocks = [],
  meta = {},
  version = RICH_TEXT_DOCUMENT_VERSION,
  kind = RICH_TEXT_DOCUMENT_KIND,
} = {}) {
  return normalizeRichTextDocument(
    {
      version,
      kind,
      html,
      plainText,
      blocks,
      meta: cloneObject(meta),
    },
    {
      html,
      plainText,
      baseFontSize: meta?.baseFontSize || meta?.fontSize || 20,
    }
  );
}

export function createRichTextDocumentFromHtml(html = "", plainText = "", meta = {}) {
  const normalizedHtml = normalizeRichHtmlInlineFontSizes(
    html || "",
    Number(meta.baseFontSize || meta.fontSize || 20) || 20
  );
  const semanticBlocks = parseRichTextBlocksFromHtml(normalizedHtml);
  const normalizedPlainText = semanticBlocks.length
    ? sanitizeText(serializeRichTextBlocksToPlainText(semanticBlocks))
    : sanitizeText(plainText || htmlToPlainText(normalizedHtml));
  return createRichTextDocument({
    html: normalizedHtml,
    plainText: normalizedPlainText,
    blocks: semanticBlocks.length
      ? semanticBlocks
      : [
          {
            id: "block-1",
            type: RICH_TEXT_BLOCK_TYPES.HTML,
            html: normalizedHtml,
            plainText: normalizedPlainText,
            meta: {},
          },
        ],
    meta: meta && typeof meta === "object" ? cloneValue(meta) : {},
  });
}

export function createRichTextFragmentFromHtml(html = "", plainText = "", meta = {}) {
  const documentValue = createRichTextDocumentFromHtml(html, plainText, meta);
  return {
    version: documentValue.version,
    kind: "freeflow-rich-text-fragment",
    html: documentValue.html,
    plainText: documentValue.plainText,
    blocks: documentValue.blocks,
    meta: documentValue.meta,
  };
}

export function ensureRichTextDocumentFields(source = {}, fallback = {}) {
  const baseFontSize =
    Number(source.fontSize || fallback.fontSize || fallback.baseFontSize || 20) || 20;
  const hasRichTextDocument = source.richTextDocument && typeof source.richTextDocument === "object";
  const hasExplicitHtml = Object.prototype.hasOwnProperty.call(source, "html");
  const hasExplicitPlainText =
    Object.prototype.hasOwnProperty.call(source, "plainText") || Object.prototype.hasOwnProperty.call(source, "text");
  const fallbackHtml = source.html || fallback.html || "";
  const fallbackPlainText = source.plainText || source.text || fallback.plainText || fallback.text || "";
  const explicitHtml = normalizeRichHtmlInlineFontSizes(fallbackHtml, baseFontSize);
  const explicitPlainText = sanitizeText(fallbackPlainText || htmlToPlainText(explicitHtml));
  const shouldUseExplicitContent = hasExplicitHtml || hasExplicitPlainText;
  const documentMeta =
    source.richTextDocument?.meta && typeof source.richTextDocument.meta === "object"
      ? cloneValue(source.richTextDocument.meta)
      : {};
  const documentValue = shouldUseExplicitContent
    ? createRichTextDocumentFromHtml(explicitHtml, explicitPlainText, {
        ...documentMeta,
        baseFontSize,
      })
    : hasRichTextDocument
      ? normalizeRichTextDocument(source.richTextDocument, {
          html: explicitHtml,
          plainText: explicitPlainText,
          baseFontSize,
        })
      : normalizeRichTextDocument(source.richTextDocument, {
          html: explicitHtml,
          plainText: explicitPlainText,
          baseFontSize,
        });
  const extractedLinkData = extractTextLinkData(source, fallback);
  const documentLinkData = buildLinkData({
    linkTokens: documentValue?.meta?.linkTokens,
    urlMetaCache: documentValue?.meta?.urlMetaCache,
  });
  const mergedLinkData = mergeTextLinkData(documentLinkData, extractedLinkData);
  const normalizedDocumentMeta = {
    ...(documentValue?.meta && typeof documentValue.meta === "object" ? cloneValue(documentValue.meta) : {}),
    linkTokens: mergedLinkData.linkTokens,
    urlMetaCache: mergedLinkData.urlMetaCache,
  };
  const normalizedDocumentValue = {
    ...documentValue,
    meta: normalizedDocumentMeta,
  };
  const html = serializeRichTextDocumentToHtml(normalizedDocumentValue, source.html || fallback.html || "");
  const plainText = serializeRichTextDocumentToPlainText(
    normalizedDocumentValue,
    source.plainText || source.text || fallback.plainText || fallback.text || ""
  );
  return {
    richTextDocument: normalizedDocumentValue,
    html,
    plainText,
    text: plainText,
    linkTokens: mergedLinkData.linkTokens,
    urlMetaCache: mergedLinkData.urlMetaCache,
  };
}

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function applyMarksToHtml(html, marks = []) {
  let output = html;
  const safeMarks = Array.isArray(marks) ? marks : [];
  safeMarks.forEach((mark) => {
    const type = String(mark?.type || "");
    if (type === RICH_TEXT_MARK_TYPES.BOLD) {
      output = `<strong>${output}</strong>`;
    } else if (type === RICH_TEXT_MARK_TYPES.ITALIC) {
      output = `<em>${output}</em>`;
    } else if (type === RICH_TEXT_MARK_TYPES.UNDERLINE) {
      output = `<u>${output}</u>`;
    } else if (type === RICH_TEXT_MARK_TYPES.STRIKE) {
      output = `<s>${output}</s>`;
    } else if (type === RICH_TEXT_MARK_TYPES.HIGHLIGHT) {
      output = `<mark>${output}</mark>`;
    } else if (type === RICH_TEXT_MARK_TYPES.TEXT_COLOR) {
      const color = escapeAttribute(String(mark?.attrs?.color || ""));
      output = `<span style="color:${color};">${output}</span>`;
    } else if (type === RICH_TEXT_MARK_TYPES.BACKGROUND_COLOR) {
      const color = escapeAttribute(String(mark?.attrs?.color || ""));
      output = `<span style="background-color:${color};">${output}</span>`;
    } else if (type === RICH_TEXT_MARK_TYPES.CODE) {
      output = `<code>${output}</code>`;
    } else if (type === RICH_TEXT_MARK_TYPES.LINK) {
      const href = escapeAttribute(String(mark?.attrs?.href || ""));
      const title = String(mark?.attrs?.title || "").trim();
      const titleAttr = title ? ` title="${escapeAttribute(title)}"` : "";
      output = `<a href="${href}"${titleAttr}>${output}</a>`;
    }
  });
  return output;
}

function clampHeadingLevel(level) {
  const numericLevel = Number(level);
  if (!Number.isFinite(numericLevel)) {
    return 1;
  }
  return Math.min(6, Math.max(1, Math.round(numericLevel)));
}

function serializeTableBlockToHtml(block) {
  const rows = Array.isArray(block.blocks) ? block.blocks : [];
  if (!rows.length) {
    return "<table></table>";
  }
  const headerRows = rows.filter((row) => row?.attrs?.headerRow === true);
  const bodyRows = rows.filter((row) => row?.attrs?.headerRow !== true);
  const thead = headerRows.length ? `<thead>${serializeRichTextBlocksToHtml(headerRows)}</thead>` : "";
  const tbody = bodyRows.length ? `<tbody>${serializeRichTextBlocksToHtml(bodyRows)}</tbody>` : "";
  return `<table>${thead}${tbody || (!thead ? "<tbody></tbody>" : "")}</table>`;
}

function parseRichTextBlocksFromHtml(html = "") {
  const normalizedHtml = normalizeRichHtml(html || "");
  if (!normalizedHtml.trim() || typeof document === "undefined") {
    return [];
  }
  const template = document.createElement("template");
  template.innerHTML = normalizedHtml;
  const blocks = parseBlockNodes(Array.from(template.content.childNodes));
  return blocks.map((block, index) => ensureBlockId(block, index));
}

function parseBlockNodes(nodes = []) {
  const blocks = [];
  let looseInlineNodes = [];

  const flushLooseInlineNodes = () => {
    const normalized = normalizeInlineNodes(looseInlineNodes);
    if (!normalized.length) {
      looseInlineNodes = [];
      return;
    }
    blocks.push({
      type: RICH_TEXT_BLOCK_TYPES.PARAGRAPH,
      content: normalized,
      attrs: {},
      meta: {},
    });
    looseInlineNodes = [];
  };

  nodes.forEach((node) => {
    if (node?.nodeType === Node.TEXT_NODE) {
      const inlineNodes = parseInlineNodes([node]);
      if (inlineNodes.length) {
        looseInlineNodes.push(...inlineNodes);
      }
      return;
    }
    if (node?.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const block = parseElementToBlock(node);
    if (block) {
      flushLooseInlineNodes();
      blocks.push(block);
      return;
    }
    const inlineNodes = parseInlineNodes([node]);
    if (inlineNodes.length) {
      looseInlineNodes.push(...inlineNodes);
    }
  });

  flushLooseInlineNodes();
  return blocks;
}

function parseElementToBlock(element) {
  if (!(element instanceof HTMLElement)) {
    return null;
  }
  const tag = element.tagName.toLowerCase();
  if (element.getAttribute("data-role") === "math-block") {
    return {
      type: RICH_TEXT_BLOCK_TYPES.MATH_BLOCK,
      plainText: stripLatexEditingDelimiters(String(element.textContent || ""), true),
      attrs: {
        sourceFormat: "latex",
        displayMode: true,
        ...(readBlockAlign(element) ? { align: readBlockAlign(element) } : {}),
      },
      meta: {},
    };
  }
  if (tag === "p" || tag === "div" || tag === "section" || tag === "article") {
    return createParagraphBlockFromElement(element);
  }
  if (/^h[1-6]$/.test(tag)) {
    return {
      type: RICH_TEXT_BLOCK_TYPES.HEADING,
      content: normalizeInlineNodes(parseInlineNodes(Array.from(element.childNodes))),
      attrs: {
        level: Number(tag.slice(1)) || 1,
        ...(readBlockAlign(element) ? { align: readBlockAlign(element) } : {}),
      },
      meta: {},
    };
  }
  if (tag === "blockquote") {
    const childBlocks = parseBlockNodes(Array.from(element.childNodes));
    return {
      type: RICH_TEXT_BLOCK_TYPES.BLOCKQUOTE,
      blocks: childBlocks.length ? childBlocks : [createParagraphBlockFromElement(element)],
      attrs: {},
      meta: {},
    };
  }
  if (tag === "ul" || tag === "ol") {
    return parseListBlock(element, tag === "ol");
  }
  if (tag === "pre") {
    const code = element.querySelector("code");
    const languageClass = Array.from(code?.classList || []).find((value) => String(value || "").startsWith("language-")) || "";
    const codePlainText = sanitizeText(htmlToPlainText(element.outerHTML || element.innerHTML || ""));
    return {
      type: RICH_TEXT_BLOCK_TYPES.CODE_BLOCK,
      plainText: codePlainText,
      attrs: {
        ...(languageClass ? { language: languageClass.slice("language-".length) } : {}),
      },
      meta: {},
    };
  }
  if (tag === "hr") {
    return {
      type: RICH_TEXT_BLOCK_TYPES.THEMATIC_BREAK,
      attrs: {},
      meta: {},
    };
  }
  if (tag === "table") {
    return parseTableBlock(element);
  }
  return null;
}

function createParagraphBlockFromElement(element) {
  return {
    type: RICH_TEXT_BLOCK_TYPES.PARAGRAPH,
    content: normalizeInlineNodes(parseInlineNodes(Array.from(element.childNodes))),
    attrs: {
      ...(readBlockAlign(element) ? { align: readBlockAlign(element) } : {}),
    },
    meta: {},
  };
}

function parseListBlock(element, ordered = false) {
  const isTaskList =
    element.getAttribute("data-ff-task-list") === "true" ||
    element.querySelector(":scope > li[data-ff-task-item='true']") instanceof HTMLElement;
  const listItems = Array.from(element.children)
    .filter((child) => child instanceof HTMLElement && child.tagName.toLowerCase() === "li")
    .map((child, index) => parseListItemBlock(child, index))
    .filter(Boolean);
  return {
    type: RICH_TEXT_BLOCK_TYPES.LIST,
    blocks: listItems,
    attrs: {
      ordered,
      ...(ordered && Number.isFinite(Number(element.getAttribute("start"))) ? { start: Number(element.getAttribute("start")) } : {}),
      ...(isTaskList ? { task: true } : {}),
    },
    meta: {},
  };
}

function parseListItemBlock(element, index = 0) {
  const childNodes = Array.from(element.childNodes);
  const nestedBlocks = [];
  const inlineNodes = [];
  childNodes.forEach((node) => {
    if (node?.nodeType === Node.ELEMENT_NODE) {
      const childTag = node.tagName.toLowerCase();
      if (childTag === "ul" || childTag === "ol" || childTag === "pre" || childTag === "blockquote" || childTag === "table") {
        const nested = parseElementToBlock(node);
        if (nested) {
          nestedBlocks.push(nested);
        }
        return;
      }
      if (childTag === "p" || childTag === "div" || childTag === "section" || childTag === "article") {
        const paragraph = createParagraphBlockFromElement(node);
        if (inlineNodes.length) {
          nestedBlocks.push(paragraph);
        } else {
          inlineNodes.push(...paragraph.content);
        }
        return;
      }
    }
    inlineNodes.push(...parseInlineNodes([node]));
  });

  const checkedState = readTaskListItemState(element);
  return {
    id: `list-item-${index + 1}`,
    type: RICH_TEXT_BLOCK_TYPES.LIST_ITEM,
    content: normalizeInlineNodes(inlineNodes),
    blocks: nestedBlocks.map((block, childIndex) => ensureBlockId(block, childIndex)),
    attrs: checkedState == null ? {} : { checked: checkedState },
    meta: {},
  };
}

function parseTableBlock(element) {
  const rows = Array.from(element.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr"))
    .filter((row) => row instanceof HTMLElement)
    .map((row, rowIndex) => {
      const inHead = row.parentElement?.tagName?.toLowerCase() === "thead";
      const cells = Array.from(row.children)
        .filter((cell) => cell instanceof HTMLElement && ["td", "th"].includes(cell.tagName.toLowerCase()))
        .map((cell, cellIndex) => ({
          id: `table-cell-${rowIndex + 1}-${cellIndex + 1}`,
          type: RICH_TEXT_BLOCK_TYPES.TABLE_CELL,
          content: normalizeInlineNodes(parseInlineNodes(Array.from(cell.childNodes))),
          attrs: {
            header: inHead || cell.tagName.toLowerCase() === "th",
            colSpan: Math.max(1, Number(cell.getAttribute("colspan")) || 1),
            rowSpan: Math.max(1, Number(cell.getAttribute("rowspan")) || 1),
            ...(readTableCellAlign(cell) ? { align: readTableCellAlign(cell) } : {}),
          },
          meta: {},
        }));
      return {
        id: `table-row-${rowIndex + 1}`,
        type: RICH_TEXT_BLOCK_TYPES.TABLE_ROW,
        blocks: cells,
        attrs: {
          ...(inHead ? { headerRow: true } : {}),
        },
        meta: {},
      };
    });
  return {
    type: RICH_TEXT_BLOCK_TYPES.TABLE,
    blocks: rows,
    attrs: {},
    meta: {},
  };
}

function parseInlineNodes(nodes = [], activeMarks = []) {
  const result = [];
  nodes.forEach((node) => {
    if (node?.nodeType === Node.TEXT_NODE) {
      const text = sanitizeText(String(node.nodeValue || ""));
      if (text) {
        result.push(createInlineNodeWithMarks({
          type: RICH_TEXT_INLINE_NODE_TYPES.TEXT,
          text,
        }, activeMarks));
      }
      return;
    }
    if (node?.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const element = node;
    const tag = element.tagName.toLowerCase();
    if (tag === "br") {
      result.push({
        type: RICH_TEXT_INLINE_NODE_TYPES.HARD_BREAK,
        attrs: {},
        meta: {},
      });
      return;
    }
    if (tag === "img") {
      const imageNode = {
        type: RICH_TEXT_INLINE_NODE_TYPES.IMAGE,
        attrs: {
          src: String(element.getAttribute("src") || ""),
          alt: String(element.getAttribute("alt") || ""),
          title: String(element.getAttribute("title") || ""),
        },
        meta: {},
      };
      result.push(createInlineNodeWithMarks(imageNode, activeMarks));
      return;
    }
    if (tag === "code" && element.parentElement?.tagName?.toLowerCase() !== "pre") {
      const inlineCodeNode = {
        type: RICH_TEXT_INLINE_NODE_TYPES.INLINE_CODE,
        text: sanitizeText(String(element.textContent || "")),
        attrs: {},
        meta: {},
      };
      result.push(createInlineNodeWithMarks(inlineCodeNode, activeMarks));
      return;
    }
    if (tag === "a") {
      result.push({
        type: RICH_TEXT_INLINE_NODE_TYPES.LINK,
        content: normalizeInlineNodes(parseInlineNodes(Array.from(element.childNodes), activeMarks)),
        attrs: {
          href: String(element.getAttribute("href") || ""),
          title: String(element.getAttribute("title") || ""),
        },
        meta: {},
      });
      return;
    }
    if (element.getAttribute("data-role") === "math-inline") {
      result.push(createInlineNodeWithMarks({
        type: RICH_TEXT_INLINE_NODE_TYPES.MATH_INLINE,
        text: stripLatexEditingDelimiters(String(element.textContent || ""), false),
        attrs: {
          sourceFormat: "latex",
          displayMode: false,
        },
        meta: {},
      }, activeMarks));
      return;
    }
    if (tag === "sup" && element.hasAttribute("data-footnote-ref")) {
      result.push(createInlineNodeWithMarks({
        type: RICH_TEXT_INLINE_NODE_TYPES.FOOTNOTE_REF,
        attrs: {
          refId: String(element.getAttribute("data-footnote-ref") || ""),
        },
        meta: {},
      }, activeMarks));
      return;
    }
    const nextMarks = activeMarks.concat(extractMarksFromElement(element));
    result.push(...parseInlineNodes(Array.from(element.childNodes), nextMarks));
  });
  return normalizeInlineNodes(result);
}

function normalizeInlineNodes(nodes = []) {
  const merged = [];
  nodes.forEach((node) => {
    const normalized = normalizeRichTextInlineNode(node);
    if (!normalized) {
      return;
    }
    const previous = merged[merged.length - 1];
    if (
      previous &&
      normalized.type === RICH_TEXT_INLINE_NODE_TYPES.TEXT &&
      previous.type === RICH_TEXT_INLINE_NODE_TYPES.TEXT &&
      sameMarks(previous.marks, normalized.marks)
    ) {
      previous.text = `${previous.text || ""}${normalized.text || ""}`;
      return;
    }
    merged.push(normalized);
  });
  return merged;
}

function createInlineNodeWithMarks(node, marks = []) {
  if (!node || typeof node !== "object") {
    return null;
  }
  return {
    ...node,
    marks: Array.isArray(marks) ? marks.map((mark) => cloneValue(mark)).filter(Boolean) : [],
  };
}

function extractMarksFromElement(element) {
  if (!(element instanceof HTMLElement)) {
    return [];
  }
  const marks = [];
  const tag = element.tagName.toLowerCase();
  if (tag === "strong" || tag === "b") {
    marks.push({ type: RICH_TEXT_MARK_TYPES.BOLD, attrs: {}, meta: {} });
  }
  if (tag === "em" || tag === "i") {
    marks.push({ type: RICH_TEXT_MARK_TYPES.ITALIC, attrs: {}, meta: {} });
  }
  if (tag === "u") {
    marks.push({ type: RICH_TEXT_MARK_TYPES.UNDERLINE, attrs: {}, meta: {} });
  }
  if (tag === "s" || tag === "strike" || tag === "del") {
    marks.push({ type: RICH_TEXT_MARK_TYPES.STRIKE, attrs: {}, meta: {} });
  }
  const backgroundColor = readElementBackgroundColor(element);
  if (tag === "mark" || element.getAttribute("data-ff-highlight") === "true") {
    marks.push({
      type: RICH_TEXT_MARK_TYPES.HIGHLIGHT,
      attrs: backgroundColor ? { color: backgroundColor } : {},
      meta: {},
    });
  } else if (backgroundColor) {
    marks.push({
      type: RICH_TEXT_MARK_TYPES.BACKGROUND_COLOR,
      attrs: { color: backgroundColor },
      meta: {},
    });
  }
  const textColor = readElementTextColor(element);
  if (textColor) {
    marks.push({
      type: RICH_TEXT_MARK_TYPES.TEXT_COLOR,
      attrs: { color: textColor },
      meta: {},
    });
  }
  return dedupeMarks(marks);
}

function sameMarks(left = [], right = []) {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}

function dedupeMarks(marks = []) {
  const seen = new Set();
  return (Array.isArray(marks) ? marks : []).filter((mark) => {
    const normalized = normalizeRichTextMark(mark);
    if (!normalized) {
      return false;
    }
    const key = JSON.stringify(normalized);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function readElementTextColor(element) {
  const style = String(element.style?.color || "").trim();
  return style || "";
}

function readElementBackgroundColor(element) {
  const style = String(element.style?.backgroundColor || "").trim();
  return style || "";
}

function readTaskListItemState(element) {
  if (!(element instanceof HTMLElement)) {
    return null;
  }
  if (!element.hasAttribute("data-ff-task-item")) {
    return null;
  }
  return String(element.getAttribute("data-ff-task-state") || "").trim().toLowerCase() === "done";
}

function readBlockAlign(element) {
  const align = String(element.style?.textAlign || element.getAttribute("align") || "").trim().toLowerCase();
  return ["left", "center", "right", "justify"].includes(align) ? align : "";
}

function readTableCellAlign(element) {
  const align = String(element.style?.textAlign || element.getAttribute("align") || "").trim().toLowerCase();
  return ["left", "center", "right"].includes(align) ? align : "";
}

function ensureBlockId(block, index = 0) {
  if (!block || typeof block !== "object") {
    return block;
  }
  return normalizeRichTextBlock(
    {
      ...block,
      id: String(block.id || `block-${index + 1}`),
    },
    index
  );
}
