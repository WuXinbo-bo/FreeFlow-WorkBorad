import {
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../../protocols/inputDescriptor.js";
import { createCanonicalDocument, createCanonicalNode } from "../../canonical/canonicalDocument.js";
import { htmlToPlainText, sanitizeHtml } from "../../../utils.js";

export const HTML_PARSER_ID = "html-parser";

const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link"]);
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "blockquote",
  "ul",
  "ol",
  "li",
  "pre",
  "hr",
  "img",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

export function createHtmlParser(options = {}) {
  const id = options.id || HTML_PARSER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 25;

  return {
    id,
    version: "1.0.0",
    displayName: "Generic HTML Parser",
    priority,
    sourceKinds: [
      INPUT_SOURCE_KINDS.HTML,
      INPUT_SOURCE_KINDS.MIXED,
      INPUT_SOURCE_KINDS.UNKNOWN,
    ],
    channels: [
      INPUT_CHANNELS.PASTE_NATIVE,
      INPUT_CHANNELS.PASTE_CONTEXT_MENU,
      INPUT_CHANNELS.DRAG_DROP,
      INPUT_CHANNELS.PROGRAMMATIC,
      INPUT_CHANNELS.INTERNAL_COPY,
    ],
    tags: ["builtin", "html", "structural"],
    supports({ descriptor }) {
      const htmlEntries = collectHtmlEntries(descriptor);
      if (!htmlEntries.length) {
        return { matched: false, score: -1, reason: "no-html-entry" };
      }
      return {
        matched: true,
        score: htmlEntries.length > 1 ? 30 : 25,
        reason: htmlEntries.length > 1 ? "multiple-html-entries" : "html-entry-available",
      };
    },
    async parse({ descriptor }) {
      const htmlEntries = collectHtmlEntries(descriptor);
      if (!htmlEntries.length) {
        throw new Error("HTML parser requires at least one html entry.");
      }
      return parseHtmlEntriesToCanonical({
        descriptor,
        entries: htmlEntries,
        parserId: id,
        documentTags: ["html"],
      });
    },
  };
}

export function parseHtmlEntriesToCanonical({
  descriptor,
  entries,
  parserId = HTML_PARSER_ID,
  documentTags = ["html"],
  originPrefixBase = "entry",
}) {
  const htmlEntries = Array.isArray(entries) ? entries : [];
  const blocks = [];
  const stats = createHtmlParseStats(htmlEntries.length);

  htmlEntries.forEach((entry, index) => {
    const html = sanitizeHtml(String(entry?.raw?.html || ""));
    if (!html.trim()) {
      return;
    }
    const rawRoot = parseHtmlToTree(html);
    const nextBlocks = convertChildrenToBlocks(rawRoot.children, {
      descriptor,
      parserId,
      originPrefix: `${originPrefixBase}-${index}`,
      stats,
    });
    if (!nextBlocks.length) {
      const fallbackParagraph = buildFallbackParagraph(html, descriptor, parserId, `${originPrefixBase}-${index}-fallback`);
      if (fallbackParagraph) {
        nextBlocks.push(fallbackParagraph);
      }
    }
    blocks.push(...nextBlocks);
  });

  const document = createCanonicalDocument({
    meta: buildDocumentMeta(descriptor, parserId, documentTags),
    content: blocks,
  });

  stats.blockCount = document.content.length;

  return {
    document,
    stats,
  };
}

function createHtmlParseStats(sourceEntryCount) {
  return {
    sourceEntryCount,
    blockCount: 0,
    headingCount: 0,
    listCount: 0,
    codeBlockCount: 0,
    imageCount: 0,
    tableCount: 0,
  };
}

function collectHtmlEntries(descriptor) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  return entries.filter((entry) => {
    const kind = String(entry?.kind || "");
    return kind === INPUT_ENTRY_KINDS.HTML && typeof entry?.raw?.html === "string" && entry.raw.html.trim();
  });
}

function buildDocumentMeta(descriptor, parserId, tags = []) {
  return {
    source: {
      kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.HTML,
      channel: descriptor?.channel || "",
      parserId,
      descriptorId: descriptor?.descriptorId || "",
    },
    compat: {
      minReaderVersion: "1.0.0",
      featureFlags: [],
      legacyAliases: [],
    },
    tags,
    labels: [],
  };
}

function buildNodeMeta(descriptor, parserId, originId, legacyType = "") {
  return {
    source: {
      kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.HTML,
      channel: descriptor?.channel || "",
      parserId,
      descriptorId: descriptor?.descriptorId || "",
    },
    compat: {
      minReaderVersion: "1.0.0",
      featureFlags: [],
      legacyAliases: [],
    },
    originId,
    legacyType,
  };
}

function buildFallbackParagraph(html, descriptor, parserId, originId) {
  const plainText = htmlToPlainText(html);
  if (!plainText.trim()) {
    return null;
  }
  return createCanonicalNode({
    type: "paragraph",
    meta: buildNodeMeta(descriptor, parserId, originId, "html-fallback"),
    content: buildTextAndBreakNodes(plainText),
  });
}

export function parseHtmlToTree(html) {
  const root = createRawElement("root", {});
  const stack = [root];
  const tokens = tokenizeHtml(html);

  tokens.forEach((token) => {
    if (!token) {
      return;
    }
    if (token.type === "text") {
      stack[stack.length - 1].children.push({
        type: "text",
        text: decodeHtmlEntities(token.value),
      });
      return;
    }
    if (token.type === "close") {
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tagName === token.tagName) {
          stack.length = index;
          break;
        }
      }
      return;
    }

    const element = createRawElement(token.tagName, token.attrs);
    stack[stack.length - 1].children.push(element);
    if (!token.selfClosing && !VOID_TAGS.has(token.tagName)) {
      stack.push(element);
    }
  });

  return root;
}

function tokenizeHtml(html) {
  const tokens = [];
  const source = String(html || "");
  const regex = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|[^<]+/g;
  let match = null;
  while ((match = regex.exec(source))) {
    const token = match[0];
    if (!token || token.startsWith("<!--")) {
      continue;
    }
    if (token.startsWith("</")) {
      const closeMatch = token.match(/^<\s*\/\s*([A-Za-z0-9:-]+)/);
      if (closeMatch) {
        tokens.push({
          type: "close",
          tagName: closeMatch[1].toLowerCase(),
        });
      }
      continue;
    }
    if (token.startsWith("<")) {
      const openMatch = token.match(/^<\s*([A-Za-z0-9:-]+)([\s\S]*?)\/?\s*>$/);
      if (!openMatch) {
        continue;
      }
      const tagName = openMatch[1].toLowerCase();
      const rawAttrs = openMatch[2] || "";
      const selfClosing = /\/\s*>$/.test(token) || VOID_TAGS.has(tagName);
      tokens.push({
        type: "open",
        tagName,
        attrs: parseAttributes(rawAttrs),
        selfClosing,
      });
      continue;
    }
    tokens.push({
      type: "text",
      value: token,
    });
  }
  return tokens;
}

function parseAttributes(source) {
  const attrs = {};
  const attrRegex = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match = null;
  while ((match = attrRegex.exec(source))) {
    const name = String(match[1] || "").toLowerCase();
    if (!name) {
      continue;
    }
    const value = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
    attrs[name] = value;
  }
  return attrs;
}

function createRawElement(tagName, attrs) {
  return {
    type: "element",
    tagName,
    attrs: attrs || {},
    children: [],
  };
}

export function serializeRawNode(node) {
  if (!node) {
    return "";
  }
  if (node.type === "text") {
    return escapeHtml(String(node.text || ""));
  }
  if (node.type !== "element") {
    return "";
  }
  if (node.tagName === "root") {
    return (Array.isArray(node.children) ? node.children : []).map(serializeRawNode).join("");
  }
  const attrText = Object.entries(node.attrs || {})
    .filter(([key]) => key)
    .map(([key, value]) => ` ${key}="${escapeHtmlAttribute(String(value || ""))}"`)
    .join("");
  if (VOID_TAGS.has(node.tagName)) {
    return `<${node.tagName}${attrText}>`;
  }
  const childHtml = (Array.isArray(node.children) ? node.children : []).map(serializeRawNode).join("");
  return `<${node.tagName}${attrText}>${childHtml}</${node.tagName}>`;
}

function convertChildrenToBlocks(children, context) {
  const blocks = [];
  let inlineBuffer = [];

  const flushInlineBuffer = () => {
    const inlineContent = convertNodesToInline(inlineBuffer, {
      ...context,
      preserveWhitespace: false,
    });
    inlineBuffer = [];
    if (!hasMeaningfulInlineContent(inlineContent)) {
      return;
    }
    blocks.push(
      createCanonicalNode({
        type: "paragraph",
        meta: buildNodeMeta(
          context.descriptor,
          context.parserId,
          `${context.originPrefix}-paragraph-${blocks.length}`,
          "html"
        ),
        content: inlineContent,
      })
    );
  };

  (Array.isArray(children) ? children : []).forEach((child, index) => {
    if (isBlockNode(child)) {
      flushInlineBuffer();
      const nextBlocks = convertBlockNode(child, {
        ...context,
        originPrefix: `${context.originPrefix}-${child.tagName}-${index}`,
      });
      blocks.push(...nextBlocks);
      return;
    }
    if (isInlineImageNode(child)) {
      flushInlineBuffer();
      const imageBlock = convertImageElement(child, {
        ...context,
        originId: `${context.originPrefix}-image-${index}`,
      });
      if (imageBlock) {
        context.stats.imageCount += 1;
        blocks.push(imageBlock);
      }
      return;
    }
    inlineBuffer.push(child);
  });

  flushInlineBuffer();
  return blocks;
}

function convertBlockNode(node, context) {
  if (!node || node.type !== "element") {
    return [];
  }
  const tag = node.tagName;
  if (tag === "p" || tag === "div" || tag === "section" || tag === "article") {
    return [convertParagraphBlock(node, context, "html")];
  }
  if (/^h[1-6]$/.test(tag)) {
    context.stats.headingCount += 1;
    return [convertHeadingBlock(node, context)];
  }
  if (tag === "blockquote") {
    return [convertBlockquote(node, context)];
  }
  if (tag === "ul" || tag === "ol") {
    context.stats.listCount += 1;
    return [convertList(node, context)];
  }
  if (tag === "pre") {
    context.stats.codeBlockCount += 1;
    return [convertCodeBlock(node, context)];
  }
  if (tag === "hr") {
    return [
      createCanonicalNode({
        type: "horizontalRule",
        meta: buildNodeMeta(context.descriptor, context.parserId, context.originPrefix, "hr"),
      }),
    ];
  }
  if (tag === "img") {
    const imageBlock = convertImageElement(node, {
      ...context,
      originId: context.originPrefix,
    });
    if (imageBlock) {
      context.stats.imageCount += 1;
      return [imageBlock];
    }
    return [];
  }
  if (tag === "table") {
    context.stats.tableCount += 1;
    return [convertTable(node, context)];
  }
  if (tag === "li") {
    return [
      createCanonicalNode({
        type: "paragraph",
        meta: buildNodeMeta(context.descriptor, context.parserId, context.originPrefix, "li-fallback"),
        content: convertNodesToInline(node.children, context),
      }),
    ];
  }
  return convertChildrenToBlocks(node.children, context);
}

function convertParagraphBlock(node, context, legacyType) {
  return createCanonicalNode({
    type: "paragraph",
    meta: buildNodeMeta(context.descriptor, context.parserId, context.originPrefix, legacyType),
    content: convertNodesToInline(node.children, context),
  });
}

function convertHeadingBlock(node, context) {
  const level = Number(String(node.tagName || "").slice(1)) || 1;
  return createCanonicalNode({
    type: "heading",
    attrs: { level },
    meta: buildNodeMeta(context.descriptor, context.parserId, context.originPrefix, node.tagName),
    content: convertNodesToInline(node.children, context),
  });
}

function convertBlockquote(node, context) {
  const content = convertChildrenToBlocks(node.children, context);
  return createCanonicalNode({
    type: "blockquote",
    meta: buildNodeMeta(context.descriptor, context.parserId, context.originPrefix, "blockquote"),
    content: content.length
      ? content
      : [
          createCanonicalNode({
            type: "paragraph",
          }),
        ],
  });
}

function convertList(node, context) {
  const listItems = [];
  let hasTaskItem = false;
  const children = Array.isArray(node.children) ? node.children : [];

  children.forEach((child, index) => {
    if (child?.type !== "element" || child.tagName !== "li") {
      return;
    }
    const taskInfo = extractTaskItemState(child);
    hasTaskItem = hasTaskItem || taskInfo.checked !== null;
    const itemContent = convertListItemContent(taskInfo.children, {
      ...context,
      originPrefix: `${context.originPrefix}-item-${index}`,
    });
    listItems.push(
      createCanonicalNode({
        type: taskInfo.checked !== null ? "taskItem" : "listItem",
        attrs: taskInfo.checked !== null ? { checked: taskInfo.checked } : {},
        meta: buildNodeMeta(
          context.descriptor,
          context.parserId,
          `${context.originPrefix}-item-${index}`,
          taskInfo.checked !== null ? "task-li" : "li"
        ),
        content: itemContent,
      })
    );
  });

  return createCanonicalNode({
    type: hasTaskItem ? "taskList" : node.tagName === "ol" ? "orderedList" : "bulletList",
    attrs:
      !hasTaskItem && node.tagName === "ol" && Number.isFinite(Number(node.attrs?.start))
        ? { start: Math.max(1, Number(node.attrs.start)) }
        : {},
    meta: buildNodeMeta(
      context.descriptor,
      context.parserId,
      context.originPrefix,
      hasTaskItem ? "task-list" : node.tagName
    ),
    content: listItems,
  });
}

function extractTaskItemState(node) {
  const children = Array.isArray(node.children) ? [...node.children] : [];
  let checked = null;

  if (/\btask-list-item\b/i.test(String(node.attrs?.class || ""))) {
    checked = false;
  }

  if (children.length) {
    const first = children[0];
    if (first?.type === "element" && first.tagName === "input" && String(first.attrs?.type || "").toLowerCase() === "checkbox") {
      checked = Object.prototype.hasOwnProperty.call(first.attrs || {}, "checked");
      children.shift();
    }
  }

  return { checked, children };
}

function convertListItemContent(children, context) {
  const blocks = convertChildrenToBlocks(children, context);
  if (blocks.length) {
    return blocks;
  }
  return [
    createCanonicalNode({
      type: "paragraph",
      meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-paragraph`, "li"),
      content: convertNodesToInline(children, context),
    }),
  ];
}

function convertCodeBlock(node, context) {
  const codeNode = findFirstDescendant(node, "code");
  const language = readCodeLanguage(codeNode || node);
  const text = extractTextContent(codeNode || node, { preserveWhitespace: true });
  return createCanonicalNode({
    type: "codeBlock",
    attrs: language ? { language } : {},
    text,
    meta: buildNodeMeta(context.descriptor, context.parserId, context.originPrefix, "pre"),
  });
}

function convertImageElement(node, context) {
  const src = String(node?.attrs?.src || "").trim();
  if (!src) {
    return null;
  }
  const attrs = {
    src,
  };
  if (node.attrs?.alt) {
    attrs.alt = String(node.attrs.alt);
  }
  if (node.attrs?.title) {
    attrs.title = String(node.attrs.title);
  }
  const width = Number(node.attrs?.width);
  const height = Number(node.attrs?.height);
  if (Number.isFinite(width) && width > 0) {
    attrs.width = width;
  }
  if (Number.isFinite(height) && height > 0) {
    attrs.height = height;
  }

  return createCanonicalNode({
    type: "image",
    attrs,
    meta: buildNodeMeta(context.descriptor, context.parserId, context.originId || context.originPrefix, "img"),
  });
}

function convertTable(node, context) {
  const rawRows = findTableRows(node);
  const rowNodes = rawRows.map((row, rowIndex) => convertTableRow(row, context, rowIndex));
  const columns = rowNodes.reduce((max, row) => Math.max(max, Array.isArray(row.content) ? row.content.length : 0), 0);
  return createCanonicalNode({
    type: "table",
    attrs: { columns },
    meta: buildNodeMeta(context.descriptor, context.parserId, context.originPrefix, "table"),
    content: rowNodes,
  });
}

function convertTableRow(row, context, rowIndex) {
  const cells = (Array.isArray(row.children) ? row.children : [])
    .filter((child) => child?.type === "element" && (child.tagName === "td" || child.tagName === "th"))
    .map((cell, cellIndex) => convertTableCell(cell, context, rowIndex, cellIndex));

  return createCanonicalNode({
    type: "tableRow",
    meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-row-${rowIndex}`, "tr"),
    content: cells,
  });
}

function convertTableCell(cell, context, rowIndex, cellIndex) {
  const attrs = {
    colSpan: normalizePositiveInt(cell.attrs?.colspan, 1),
    rowSpan: normalizePositiveInt(cell.attrs?.rowspan, 1),
    header: cell.tagName === "th",
  };
  const align = normalizeAlign(cell.attrs?.align || readStyleMap(cell.attrs?.style).textAlign);
  if (align) {
    attrs.align = align;
  }
  const blocks = convertChildrenToBlocks(cell.children, {
    ...context,
    originPrefix: `${context.originPrefix}-row-${rowIndex}-cell-${cellIndex}`,
  });
  return createCanonicalNode({
    type: "tableCell",
    attrs,
    meta: buildNodeMeta(
      context.descriptor,
      context.parserId,
      `${context.originPrefix}-row-${rowIndex}-cell-${cellIndex}`,
      cell.tagName
    ),
    content: blocks.length ? blocks : [createCanonicalNode({ type: "paragraph" })],
  });
}

function findTableRows(node) {
  const rows = [];
  walkRawTree(node, (child) => {
    if (child?.type === "element" && child.tagName === "tr") {
      rows.push(child);
    }
  });
  return rows;
}

function convertNodesToInline(nodes, context, inheritedMarks = []) {
  const result = [];
  (Array.isArray(nodes) ? nodes : []).forEach((node) => {
    if (!node) {
      return;
    }
    if (node.type === "text") {
      const normalized = normalizeInlineText(node.text, context?.preserveWhitespace);
      if (!normalized) {
        return;
      }
      pushInlineNode(
        result,
        createCanonicalNode({
          type: "text",
          text: normalized,
          marks: inheritedMarks,
        })
      );
      return;
    }

    if (node.type !== "element") {
      return;
    }

    const tag = node.tagName;
    if (tag === "br") {
      result.push(createCanonicalNode({ type: "hardBreak" }));
      return;
    }
    if (tag === "a") {
      const linkContent = convertNodesToInline(node.children, context, inheritedMarks);
      if (hasMeaningfulInlineContent(linkContent)) {
        result.push(
          createCanonicalNode({
            type: "link",
            attrs: buildLinkAttrs(node.attrs),
            content: linkContent,
          })
        );
      }
      return;
    }
    if (tag === "code") {
      const codeText = extractTextContent(node, { preserveWhitespace: true });
      if (codeText) {
        result.push(
          createCanonicalNode({
            type: "inlineCode",
            text: codeText,
          })
        );
      }
      return;
    }
    if (tag === "img") {
      const fallbackText = String(node.attrs?.alt || node.attrs?.title || "").trim();
      if (fallbackText) {
        pushInlineNode(
          result,
          createCanonicalNode({
            type: "text",
            text: fallbackText,
            marks: inheritedMarks,
          })
        );
      }
      return;
    }

    const nextMarks = mergeMarks(inheritedMarks, deriveMarksFromElement(node));
    const nested = convertNodesToInline(node.children, context, nextMarks);
    nested.forEach((child) => result.push(child));
  });
  return trimInlineWhitespace(result);
}

function buildLinkAttrs(attrs) {
  const normalized = {};
  if (attrs?.href) {
    normalized.href = String(attrs.href);
  }
  if (attrs?.title) {
    normalized.title = String(attrs.title);
  }
  if (attrs?.target) {
    normalized.target = String(attrs.target);
  }
  return normalized;
}

function deriveMarksFromElement(node) {
  const marks = [];
  const tag = String(node?.tagName || "").toLowerCase();
  const styleMap = readStyleMap(node?.attrs?.style);

  if (tag === "strong" || tag === "b" || isBoldStyle(styleMap)) {
    marks.push({ type: "bold" });
  }
  if (tag === "em" || tag === "i" || styleMap.fontStyle === "italic") {
    marks.push({ type: "italic" });
  }
  if (tag === "u" || hasTextDecoration(styleMap.textDecoration, "underline")) {
    marks.push({ type: "underline" });
  }
  if (tag === "s" || tag === "strike" || tag === "del" || hasTextDecoration(styleMap.textDecoration, "line-through")) {
    marks.push({ type: "strike" });
  }
  if (tag === "mark") {
    marks.push({ type: "highlight", attrs: { color: styleMap.backgroundColor || "#fff3a3" } });
  }
  if (styleMap.color) {
    marks.push({ type: "textColor", attrs: { color: styleMap.color } });
  }
  if (styleMap.backgroundColor && tag !== "mark") {
    marks.push({ type: "backgroundColor", attrs: { color: styleMap.backgroundColor } });
  }
  return marks;
}

function readStyleMap(styleValue) {
  const result = {};
  String(styleValue || "")
    .split(";")
    .forEach((declaration) => {
      const [rawKey, rawValue] = declaration.split(":");
      const key = toCamelCase(String(rawKey || "").trim());
      const value = String(rawValue || "").trim();
      if (key && value) {
        result[key] = value;
      }
    });
  return result;
}

function mergeMarks(baseMarks, nextMarks) {
  const merged = [];
  [...(Array.isArray(baseMarks) ? baseMarks : []), ...(Array.isArray(nextMarks) ? nextMarks : [])].forEach((mark) => {
    const key = JSON.stringify(mark || {});
    if (!merged.some((item) => JSON.stringify(item) === key)) {
      merged.push(mark);
    }
  });
  return merged;
}

function normalizeInlineText(text, preserveWhitespace = false) {
  const value = decodeHtmlEntities(String(text || ""));
  if (!value) {
    return "";
  }
  if (preserveWhitespace) {
    return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }
  return value.replace(/\s+/g, " ");
}

function buildTextAndBreakNodes(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const content = [];
  lines.forEach((line, index) => {
    if (line) {
      content.push(
        createCanonicalNode({
          type: "text",
          text: line,
        })
      );
    }
    if (index < lines.length - 1) {
      content.push(createCanonicalNode({ type: "hardBreak" }));
    }
  });
  return content;
}

function pushInlineNode(target, node) {
  if (!node) {
    return;
  }
  const last = target[target.length - 1];
  if (
    last?.type === "text" &&
    node.type === "text" &&
    JSON.stringify(last.marks || []) === JSON.stringify(node.marks || [])
  ) {
    last.text += node.text;
    return;
  }
  target.push(node);
}

function trimInlineWhitespace(content) {
  const result = Array.isArray(content) ? [...content] : [];
  while (result[0]?.type === "text" && !result[0].text.trim()) {
    result.shift();
  }
  while (result[result.length - 1]?.type === "text" && !result[result.length - 1].text.trim()) {
    result.pop();
  }
  if (result[0]?.type === "text") {
    result[0].text = result[0].text.replace(/^\s+/, "");
  }
  if (result[result.length - 1]?.type === "text") {
    result[result.length - 1].text = result[result.length - 1].text.replace(/\s+$/, "");
  }
  return result.filter((node) => node.type !== "text" || node.text);
}

function hasMeaningfulInlineContent(content) {
  return (Array.isArray(content) ? content : []).some((node) => {
    if (node?.type === "text") {
      return Boolean(String(node.text || "").trim());
    }
    return Boolean(node);
  });
}

function isBlockNode(node) {
  return node?.type === "element" && BLOCK_TAGS.has(String(node.tagName || "").toLowerCase()) && node.tagName !== "img";
}

function isInlineImageNode(node) {
  return node?.type === "element" && node.tagName === "img";
}

function findFirstDescendant(node, tagName) {
  let found = null;
  walkRawTree(node, (child) => {
    if (!found && child?.type === "element" && child.tagName === tagName) {
      found = child;
    }
  });
  return found;
}

export function walkRawTree(node, visitor) {
  if (!node) {
    return;
  }
  visitor(node);
  (Array.isArray(node.children) ? node.children : []).forEach((child) => walkRawTree(child, visitor));
}

export function extractTextContent(node, options = {}) {
  if (!node) {
    return "";
  }
  if (node.type === "text") {
    return options.preserveWhitespace ? String(node.text || "") : normalizeInlineText(node.text, false);
  }
  if (node.type !== "element") {
    return "";
  }
  if (node.tagName === "br") {
    return "\n";
  }
  const parts = [];
  (Array.isArray(node.children) ? node.children : []).forEach((child) => {
    const value = extractTextContent(child, options);
    if (value) {
      parts.push(value);
    }
  });
  const joined = options.preserveWhitespace ? parts.join("") : parts.join(" ");
  return options.preserveWhitespace ? joined.replace(/\r\n/g, "\n").replace(/\r/g, "\n") : joined.replace(/\s+/g, " ").trim();
}

function readCodeLanguage(node) {
  const className = String(node?.attrs?.class || "");
  const classMatch = className.match(/(?:lang|language)-([A-Za-z0-9_+-]+)/i);
  if (classMatch) {
    return classMatch[1].toLowerCase();
  }
  const dataLanguage = String(node?.attrs?.["data-language"] || "").trim();
  if (dataLanguage) {
    return dataLanguage.toLowerCase();
  }
  return "";
}

function hasTextDecoration(value, keyword) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .includes(keyword);
}

function isBoldStyle(styleMap) {
  const weight = String(styleMap.fontWeight || "").toLowerCase();
  if (!weight) {
    return false;
  }
  if (weight === "bold" || weight === "bolder") {
    return true;
  }
  const numeric = Number(weight);
  return Number.isFinite(numeric) && numeric >= 600;
}

function normalizeAlign(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["left", "center", "right", "justify"].includes(normalized)) {
    return normalized;
  }
  return "";
}

function normalizePositiveInt(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return fallback;
  }
  return Math.floor(numeric);
}

function toCamelCase(value) {
  return String(value || "")
    .replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code) || 0))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16) || 0))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
