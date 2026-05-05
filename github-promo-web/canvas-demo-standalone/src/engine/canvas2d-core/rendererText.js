import {
  getBlockSpacingEmForTag,
  getHeadingFontSize,
  getLineHeightRatioForTag,
  normalizeTagName,
  TEXT_BODY_LINE_HEIGHT_RATIO,
} from "./textLayout/typographyTokens.js";
import { renderLatexToStaticHtml } from "./import/renderers/markdown/markdownStaticRenderer.js";

export const TEXT_LINE_HEIGHT_RATIO = TEXT_BODY_LINE_HEIGHT_RATIO;
export const TEXT_FONT_FAMILY = '"Segoe UI", "PingFang SC", sans-serif';
export const TEXT_FONT_WEIGHT = "500";
export const TEXT_BOLD_WEIGHT = "700";
const DEFAULT_HIGHLIGHT = "#fff4a3";
const RICH_RUN_CACHE_LIMIT = 256;
const RICH_LAYOUT_CACHE_LIMIT = 320;
const richRunCache = new Map();
const richLayoutCache = new Map();
let measureCanvasContext = null;
const LINK_TOKEN_DEFAULT_COLOR = "#2563eb";
const LINK_TOKEN_ACTIVE_COLOR = "#1d4ed8";
const INLINE_CODE_BACKGROUND = "rgba(148, 163, 184, 0.18)";
const INLINE_CODE_COLOR = "#111827";
export const FLOW_NODE_TEXT_LAYOUT = Object.freeze({
  lineHeightRatio: TEXT_BODY_LINE_HEIGHT_RATIO,
  fontWeight: "400",
  boldWeight: "600",
  paddingX: 14,
  paddingY: 12,
});

function putLruCache(map, key, value, limit) {
  if (!map || !key) return;
  if (map.has(key)) {
    map.delete(key);
  }
  map.set(key, value);
  while (map.size > limit) {
    const oldestKey = map.keys().next().value;
    if (typeof oldestKey === "undefined") {
      break;
    }
    map.delete(oldestKey);
  }
}

function getScaleBucket(scale = 1) {
  const next = Math.max(0.1, Number(scale) || 1);
  return Math.round(next * 100) / 100;
}

function getMeasureCanvasContext() {
  if (measureCanvasContext) {
    return measureCanvasContext;
  }
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  measureCanvasContext = canvas.getContext("2d");
  return measureCanvasContext;
}

export function getFlowNodeTextPadding(scaleOrView = 1, bounds = null) {
  const scaleValue =
    typeof scaleOrView === "object" && scaleOrView
      ? Math.max(0.1, Number(scaleOrView?.scale) || 1)
      : Math.max(0.1, Number(scaleOrView) || 1);
  const rawX = FLOW_NODE_TEXT_LAYOUT.paddingX * scaleValue;
  const rawY = FLOW_NODE_TEXT_LAYOUT.paddingY * scaleValue;
  const width = Math.max(0, Number(bounds?.width || 0) * (typeof scaleOrView === "object" ? scaleValue : 1) || 0);
  const height = Math.max(0, Number(bounds?.height || 0) * (typeof scaleOrView === "object" ? scaleValue : 1) || 0);
  const limitX = width > 0 ? Math.max(0, width * 0.18) : Number.POSITIVE_INFINITY;
  const limitY = height > 0 ? Math.max(0, height * 0.18) : Number.POSITIVE_INFINITY;
  return {
    x: Math.max(1, Math.min(rawX, limitX)),
    y: Math.max(1, Math.min(rawY, limitY)),
  };
}

function parseFontSize(value) {
  if (!value) return 0;
  const match = String(value).match(/(\d+(?:\.\d+)?)px/);
  if (match) return Number(match[1]) || 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseLineHeightValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "normal") return 0;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }
  if (raw.endsWith("%")) {
    const numeric = Number.parseFloat(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric / 100 : 0;
  }
  return 0;
}

function sanitizeCanvasFontFamily(value = "") {
  const raw = String(value || "").trim();
  if (!raw) {
    return TEXT_FONT_FAMILY;
  }
  const families = raw
    .split(",")
    .map((part) => part.trim().replace(/[;\n\r]/g, ""))
    .filter(Boolean)
    .slice(0, 4);
  return families.length ? families.join(", ") : TEXT_FONT_FAMILY;
}

function escapeHtmlText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value) {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}

function decodeHtmlText(value = "") {
  return String(value || "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/&amp;/gi, "&");
}

function stripHtmlTags(value = "") {
  return String(value || "").replace(/<[^>]*>/g, "");
}

function renderRichTextMathMarkup(html = "") {
  const source = String(html || "").trim();
  if (!source) {
    return "";
  }

  let next = source.replace(
    /<span\b([^>]*\bdata-role=(?:"|')math-inline(?:"|')[^>]*)>([\s\S]*?)<\/span>/gi,
    (match, _attrs, body) => {
      const formula = decodeHtmlText(stripHtmlTags(body)).trim();
      if (!formula) {
        return match;
      }
      const rendered = renderLatexToStaticHtml(formula, { displayMode: false });
      if (!rendered) {
        return match;
      }
      return `<span data-ff-rich-math="inline" data-ff-rich-math-source="${escapeHtmlAttribute(formula)}">${rendered}</span>`;
    }
  );

  next = next.replace(
    /<(div|section|article)\b([^>]*\bdata-role=(?:"|')math-block(?:"|')[^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, _tag, _attrs, body) => {
      const formula = decodeHtmlText(stripHtmlTags(body)).trim();
      if (!formula) {
        return match;
      }
      const rendered = renderLatexToStaticHtml(formula, { displayMode: true });
      if (!rendered) {
        return match;
      }
      return `<div data-ff-rich-math="block" data-ff-rich-math-source="${escapeHtmlAttribute(formula)}">${rendered}</div>`;
    }
  );

  return next;
}

function hasAnchorMarkup(html = "") {
  return /<a[\s>]/i.test(String(html || ""));
}

const RICH_TEXT_BLOCK_TAG_SET = new Set([
  "div",
  "section",
  "article",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
]);

function createLinkAnchorMarkup(token = {}, text = "") {
  const attrs = [
    `href="${escapeHtmlAttribute(token.url)}"`,
    `data-link-token="1"`,
    `data-link-url="${escapeHtmlAttribute(token.url)}"`,
    `data-link-range-start="${token.start}"`,
    `data-link-range-end="${token.end}"`,
    `data-link-kind="${escapeHtmlAttribute(token.kindHint || "link")}"`,
    `data-link-state="${escapeHtmlAttribute(token.fetchState || "unknown")}"`,
    `target="_blank"`,
    `rel="noopener noreferrer"`,
    `title="${escapeHtmlAttribute(token.url)}"`,
  ];
  return `<a ${attrs.join(" ")}>${escapeHtmlText(text)}</a>`;
}

function applyLinkAttributesToAnchor(anchor, token = {}) {
  if (!(anchor instanceof HTMLAnchorElement)) {
    return anchor;
  }
  anchor.setAttribute("href", token.url || "");
  anchor.setAttribute("data-link-token", "1");
  anchor.setAttribute("data-link-url", token.url || "");
  anchor.setAttribute("data-link-range-start", String(token.start ?? 0));
  anchor.setAttribute("data-link-range-end", String(token.end ?? 0));
  anchor.setAttribute("data-link-kind", token.kindHint || "link");
  anchor.setAttribute("data-link-state", token.fetchState || "unknown");
  anchor.setAttribute("target", "_blank");
  anchor.setAttribute("rel", "noopener noreferrer");
  anchor.setAttribute("title", token.url || "");
  return anchor;
}

function normalizeLinkTokens(linkTokens = [], text = "") {
  const source = String(text || "");
  if (!Array.isArray(linkTokens) || !linkTokens.length || !source) {
    return [];
  }
  const maxLength = source.length;
  return linkTokens
    .map((token) => {
      const start = Number(
        token?.rangeStart ?? token?.start ?? token?.offsetStart ?? token?.from ?? token?.startIndex
      );
      const end = Number(token?.rangeEnd ?? token?.end ?? token?.offsetEnd ?? token?.to ?? token?.endIndex);
      const url = String(token?.url || token?.href || token?.value || "").trim();
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return null;
      }
      if (start < 0 || end <= start || start >= maxLength) {
        return null;
      }
      const boundedStart = Math.max(0, Math.min(maxLength, Math.floor(start)));
      const boundedEnd = Math.max(boundedStart, Math.min(maxLength, Math.floor(end)));
      if (!url || boundedEnd <= boundedStart) {
        return null;
      }
      return {
        start: boundedStart,
        end: boundedEnd,
        url,
        kindHint: String(token?.kindHint || "").trim(),
        fetchState: String(token?.fetchState || token?.state || "").trim(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => (left.start - right.start) || (right.end - left.end))
    .reduce((acc, token) => {
      const previous = acc[acc.length - 1];
      if (!previous || token.start >= previous.end) {
        acc.push(token);
      }
      return acc;
    }, []);
}

export function buildLinkStyledHtmlFromTokens(text = "", linkTokens = []) {
  const source = String(text || "");
  if (!source) {
    return "";
  }
  const normalized = normalizeLinkTokens(linkTokens, source);
  if (!normalized.length) {
    return "";
  }
  let cursor = 0;
  const parts = [];
  normalized.forEach((token) => {
    if (token.start > cursor) {
      parts.push(escapeHtmlText(source.slice(cursor, token.start)));
    }
    const tokenText = source.slice(token.start, token.end);
    parts.push(createLinkAnchorMarkup(token, tokenText));
    cursor = token.end;
  });
  if (cursor < source.length) {
    parts.push(escapeHtmlText(source.slice(cursor)));
  }
  return `<p>${parts.join("")}</p>`;
}

function collectEligibleTextNodes(root, nodes = []) {
  if (!root?.childNodes?.length) {
    return nodes;
  }
  root.childNodes.forEach((node) => {
    if (!node) {
      return;
    }
    if (typeof Node !== "undefined" && node.nodeType === Node.TEXT_NODE) {
      if (String(node.nodeValue || "")) {
        nodes.push(node);
      }
      return;
    }
    if (typeof Node !== "undefined" && node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const element = node;
    const tag = normalizeTagName(element.tagName);
    if (tag === "a" || tag === "script" || tag === "style") {
      return;
    }
    collectEligibleTextNodes(element, nodes);
  });
  return nodes;
}

function pushMappedTextLineBreak(entries) {
  if (!entries.length) {
    return;
  }
  if (entries[entries.length - 1]?.char === "\n") {
    return;
  }
  entries.push({ char: "\n", synthetic: true });
}

function pushMappedChars(entries, text = "", node = null, startOffset = 0) {
  const value = String(text || "");
  if (!value) {
    return;
  }
  for (let index = 0; index < value.length; index += 1) {
    entries.push({
      char: value[index],
      node,
      offset: node ? startOffset + index : -1,
      synthetic: !node,
    });
  }
}

function collectHtmlPlainTextMapping(node, entries) {
  if (!node || !entries) {
    return;
  }
  if (typeof Node !== "undefined" && node.nodeType === Node.TEXT_NODE) {
    pushMappedChars(entries, String(node.nodeValue || ""), node, 0);
    return;
  }
  if (typeof Node === "undefined" || node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }
  const element = node;
  const tag = normalizeTagName(element.tagName);
  if (tag === "br") {
    pushMappedTextLineBreak(entries);
    return;
  }
  if (tag === "hr") {
    pushMappedTextLineBreak(entries);
    pushMappedChars(entries, "---");
    pushMappedTextLineBreak(entries);
    return;
  }
  if (tag === "li") {
    const parentTag = normalizeTagName(element.parentElement?.tagName);
    if (parentTag === "ol") {
      pushMappedChars(entries, "1. ");
    } else if (parentTag === "ul" && element.parentElement?.getAttribute("data-ff-task-list") === "true") {
      const state = String(element.getAttribute("data-ff-task-state") || "").trim().toLowerCase();
      pushMappedChars(entries, `- [${state === "done" ? "x" : " "}] `);
    } else if (parentTag === "ul") {
      pushMappedChars(entries, "- ");
    }
  }
  element.childNodes.forEach((child) => collectHtmlPlainTextMapping(child, entries));
  if (tag === "td" || tag === "th") {
    pushMappedChars(entries, "\t");
    return;
  }
  if (RICH_TEXT_BLOCK_TAG_SET.has(tag)) {
    pushMappedTextLineBreak(entries);
  }
}

function normalizeMappedPlainTextEntries(entries = []) {
  let next = Array.isArray(entries) ? entries.slice() : [];
  next = next.filter((entry, index, list) => {
    if (entry?.char !== "\n") {
      return true;
    }
    let probe = index - 1;
    while (probe >= 0 && /[ \t\f\v]/.test(String(list[probe]?.char || ""))) {
      probe -= 1;
    }
    for (let cursor = probe + 1; cursor < index; cursor += 1) {
      list[cursor] = null;
    }
    return true;
  }).filter(Boolean);

  next = next.filter((entry, index, list) => {
    if (entry?.char !== "\n") {
      return true;
    }
    let probe = index + 1;
    while (probe < list.length && /[ \t\f\v]/.test(String(list[probe]?.char || ""))) {
      list[probe] = null;
      probe += 1;
    }
    return true;
  }).filter(Boolean);

  const collapsed = [];
  let newlineRun = 0;
  next.forEach((entry) => {
    if (entry?.char === "\n") {
      newlineRun += 1;
      if (newlineRun <= 2) {
        collapsed.push(entry);
      }
      return;
    }
    newlineRun = 0;
    collapsed.push(entry);
  });

  let start = 0;
  while (start < collapsed.length && /\s/.test(String(collapsed[start]?.char || ""))) {
    start += 1;
  }
  let end = collapsed.length - 1;
  while (end >= start && /\s/.test(String(collapsed[end]?.char || ""))) {
    end -= 1;
  }
  return collapsed.slice(start, end + 1);
}

function buildHtmlPlainTextMapping(root) {
  const rawEntries = [];
  collectHtmlPlainTextMapping(root, rawEntries);
  const normalizedEntries = normalizeMappedPlainTextEntries(rawEntries);
  return {
    text: normalizedEntries.map((entry) => String(entry?.char || "")).join(""),
    entries: normalizedEntries,
  };
}

function collectTokenNodeFragments(entries = [], token = null) {
  if (!token || !Array.isArray(entries) || !entries.length) {
    return [];
  }
  const slice = entries.slice(token.start, token.end);
  if (!slice.length || slice.some((entry) => !entry?.node || !Number.isFinite(entry?.offset))) {
    return [];
  }
  const fragments = [];
  slice.forEach((entry) => {
    const previous = fragments[fragments.length - 1];
    if (
      previous &&
      previous.node === entry.node &&
      previous.endOffset === entry.offset
    ) {
      previous.endOffset = entry.offset + 1;
      return;
    }
    fragments.push({
      node: entry.node,
      startOffset: entry.offset,
      endOffset: entry.offset + 1,
    });
  });
  return fragments;
}

function materializeLinkTokensIntoHtml(text = "", html = "", linkTokens = []) {
  const source = String(text || "");
  const rawHtml = String(html || "").trim();
  const normalized = normalizeLinkTokens(linkTokens, source);
  if (!rawHtml || !source || !normalized.length) {
    return rawHtml;
  }
  if (typeof document === "undefined" || typeof Node === "undefined") {
    return rawHtml;
  }
  const template = document.createElement("template");
  template.innerHTML = rawHtml;
  const mapping = buildHtmlPlainTextMapping(template.content);
  if (!mapping.entries.length) {
    return rawHtml;
  }
  if (mapping.text !== source) {
    return rawHtml;
  }

  try {
    normalized
      .slice()
      .reverse()
      .forEach((token) => {
        const fragments = collectTokenNodeFragments(mapping.entries, token);
        if (!fragments.length) {
          return;
        }
        if (fragments.length === 1) {
          const fragment = fragments[0];
          const workingNode = fragment.node;
          if (!(workingNode?.parentNode)) {
            return;
          }
          if (fragment.endOffset < workingNode.length) {
            workingNode.splitText(fragment.endOffset);
          }
          const targetNode =
            fragment.startOffset > 0 ? workingNode.splitText(fragment.startOffset) : workingNode;
          const linkText = String(targetNode.nodeValue || "");
          if (!linkText) {
            return;
          }
          const anchor = applyLinkAttributesToAnchor(document.createElement("a"), token);
          targetNode.parentNode.replaceChild(anchor, targetNode);
          anchor.appendChild(targetNode);
          return;
        }

        const first = fragments[0];
        const last = fragments[fragments.length - 1];
        if (!(first?.node?.parentNode) || !(last?.node?.parentNode)) {
          return;
        }
        if (first.node.parentNode !== last.node.parentNode) {
          return;
        }
        const range = document.createRange();
        range.setStart(first.node, first.startOffset);
        range.setEnd(last.node, last.endOffset);
        const wrapper = applyLinkAttributesToAnchor(document.createElement("a"), token);
        try {
          range.surroundContents(wrapper);
        } catch {
          // Cross-element url fragments are left unwrapped rather than breaking the rich HTML tree.
        }
      });
    return template.innerHTML;
  } catch {
    return rawHtml;
  }
}

export function resolveRichTextDisplayHtml({ text = "", html = "", linkTokens = [] } = {}) {
  const rawHtml = String(html || "").trim();
  const linkStyledHtml = buildLinkStyledHtmlFromTokens(text, linkTokens);
  if (!rawHtml) {
    return linkStyledHtml;
  }
  const mathRenderedHtml = renderRichTextMathMarkup(rawHtml);
  if (!Array.isArray(linkTokens) || !linkTokens.length) {
    return mathRenderedHtml;
  }
  if (hasAnchorMarkup(mathRenderedHtml)) {
    return mathRenderedHtml;
  }
  const mergedHtml = materializeLinkTokensIntoHtml(text, mathRenderedHtml, linkTokens);
  return String(mergedHtml || mathRenderedHtml).trim() || linkStyledHtml || mathRenderedHtml;
}

function applyElementStyle(style, element) {
  if (!element || !style) return style;
  const next = { ...style };
  const tag = normalizeTagName(element.tagName);
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
  if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
    next.bold = true;
    next.lineHeightRatio = getLineHeightRatioForTag(tag);
    next.fontSize = getHeadingFontSize(tag, next.fontSize || style.fontSize || 20);
  }
  if (tag === "code") {
    next.code = true;
    next.fontFamily = '"Cascadia Code", Consolas, "SFMono-Regular", monospace';
    if (!next.color) next.color = INLINE_CODE_COLOR;
    if (!next.highlightColor) next.highlightColor = INLINE_CODE_BACKGROUND;
  }
  if (tag === "mark") {
    next.highlight = true;
    if (!next.highlightColor) next.highlightColor = DEFAULT_HIGHLIGHT;
  }
  if (tag === "a") {
    next.underline = true;
    if (!next.color) {
      next.color = LINK_TOKEN_DEFAULT_COLOR;
    }
  }
  if (element.getAttribute?.("data-link-token") === "1") {
    next.underline = true;
    if (!next.color) {
      const linkState = String(element.getAttribute?.("data-link-state") || "").trim();
      next.color = linkState === "error" ? LINK_TOKEN_ACTIVE_COLOR : LINK_TOKEN_DEFAULT_COLOR;
    }
  }
  if (element.getAttribute?.("data-mark") === "highlight") {
    next.highlight = true;
    if (!next.highlightColor) next.highlightColor = DEFAULT_HIGHLIGHT;
  }
  if (element instanceof HTMLElement) {
    const inline = element.style;
    if (inline.color) next.color = inline.color;
    if (inline.backgroundColor) {
      next.highlight = true;
      next.highlightColor = inline.backgroundColor;
    }
    const weight = inline.fontWeight;
    if (weight && (weight === "bold" || Number(weight) >= 600)) {
      next.bold = true;
    }
    if (inline.fontStyle === "italic") {
      next.italic = true;
    }
    const decoration = inline.textDecorationLine || inline.textDecoration || "";
    if (decoration.includes("underline")) next.underline = true;
    if (decoration.includes("line-through")) next.strike = true;
    const logicalInlineSize = parseFontSize(element.getAttribute?.("data-ff-font-size") || "");
    const size = logicalInlineSize || parseFontSize(inline.fontSize);
    if (size) next.fontSize = size;
    if (inline.fontFamily) {
      next.fontFamily = inline.fontFamily;
    }
    const lineHeight = parseLineHeightValue(inline.lineHeight);
    if (lineHeight) {
      next.lineHeightRatio = lineHeight;
    }
  }
  return next;
}

function isBlockTag(tagName = "") {
  return ["div", "p", "section", "article", "li", "ul", "ol", "blockquote", "pre", "table", "h1", "h2", "h3", "h4", "h5", "h6"].includes(
    normalizeTagName(tagName)
  );
}

function parseRichTextRuns(html = "") {
  if (!html || typeof document === "undefined" || typeof Node === "undefined") {
    return null;
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  const runs = [];
  const pushLineBreak = (style = {}) => {
    if (!runs.length) {
      return;
    }
    const last = runs[runs.length - 1];
    if (last?.text === "\n") {
      if (style && Object.keys(style).length) {
        last.style = {
          ...(last.style || {}),
          ...style,
        };
      }
      return;
    }
    runs.push({ text: "\n", style: { ...style } });
  };
  const walk = (node, style) => {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const value = String(node.nodeValue || "");
      if (value) {
        runs.push({ text: value, style: { ...style } });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const element = node;
    const tag = normalizeTagName(element.tagName);
    if (tag === "br") {
      pushLineBreak();
      return;
    }
    const nextStyle = applyElementStyle(style, element);
    if (tag === "li") {
      const marker = resolveListItemMarker(element);
      if (marker) {
        const markerStyle = {
          ...nextStyle,
          fontSize: nextStyle.fontSize || style.fontSize,
          bold: false,
        };
        runs.push({ text: `${marker} `, style: markerStyle });
      }
    }
    const block = isBlockTag(tag);
    element.childNodes.forEach((child) => walk(child, nextStyle));
    if (block) {
      const spacingAfterEm = getBlockSpacingEmForTag(tag);
      pushLineBreak(
        spacingAfterEm > 0
          ? {
              spacingAfterEm,
            }
          : {}
      );
    }
  };
  template.content.childNodes.forEach((node) => walk(node, {}));
  while (runs.length && runs[0]?.text === "\n") {
    runs.shift();
  }
  while (runs.length && runs[runs.length - 1]?.text === "\n") {
    runs.pop();
  }
  return runs;
}

function resolveListItemMarker(element) {
  if (!(element instanceof HTMLElement)) {
    return "";
  }
  const parent = element.parentElement;
  const parentTag = normalizeTagName(parent?.tagName || "");
  if (parentTag === "ol") {
    const siblings = Array.from(parent.children || []).filter((child) => normalizeTagName(child?.tagName || "") === "li");
    const start = Number(parent.getAttribute?.("start") || 1) || 1;
    const index = Math.max(0, siblings.indexOf(element));
    return `${start + index}.`;
  }
  if (parentTag === "ul") {
    return "•";
  }
  return "";
}

function getCachedRichTextRuns(html = "") {
  const key = String(html || "");
  if (!key) {
    return null;
  }
  const cached = richRunCache.get(key);
  if (cached) {
    putLruCache(richRunCache, key, cached, RICH_RUN_CACHE_LIMIT);
    return cached;
  }
  const runs = parseRichTextRuns(key);
  if (!runs || !runs.length) {
    return runs;
  }
  putLruCache(richRunCache, key, runs, RICH_RUN_CACHE_LIMIT);
  return runs;
}

function fontForRun(runStyle, baseFontSize, scale = 1, options = {}) {
  const fontScale = Math.max(0.1, Number(runStyle.fontScale || 1));
  const rawFont = Number(runStyle.fontSize || baseFontSize * fontScale);
  const fontSize = Math.max(10, rawFont) * Math.max(0.1, Number(scale) || 1);
  const weight = runStyle.bold
    ? String(options.boldWeight || TEXT_BOLD_WEIGHT)
    : String(options.fontWeight || TEXT_FONT_WEIGHT);
  const fontStyle = runStyle.italic ? "italic" : "normal";
  const fontFamily = sanitizeCanvasFontFamily(runStyle.fontFamily || options.fontFamily || TEXT_FONT_FAMILY);
  return `${fontStyle} ${weight} ${Math.max(1, fontSize)}px ${fontFamily}`;
}

function createLine(baseFontSize, scaleValue, lineHeightRatio) {
  return {
    segments: [],
    width: 0,
    height: Math.max(22, baseFontSize * lineHeightRatio) * scaleValue,
    spacingAfter: 0,
  };
}

function appendSegment(line, text, style, width, baseFontSize, scaleValue, lineHeightRatio) {
  if (!text) return;
  const fontSize = Math.max(10, Number(style.fontSize || baseFontSize)) * scaleValue;
  const segmentLineHeightRatio = Math.max(1, Number(style.lineHeightRatio || lineHeightRatio));
  const lineHeight = Math.max(22, fontSize * segmentLineHeightRatio);
  line.height = Math.max(line.height, lineHeight);
  const previous = line.segments[line.segments.length - 1];
  if (previous && previous.style === style) {
    previous.text += text;
    previous.width += width;
  } else {
    line.segments.push({ text, style, width });
  }
  line.width += width;
}

function isWhitespaceToken(token = "") {
  return /^\s+$/.test(token);
}

function tokenizeWrapText(text = "") {
  const tokens = [];
  let index = 0;
  const value = String(text || "");
  while (index < value.length) {
    const rest = value.slice(index);
    const whitespaceMatch = rest.match(/^[^\S\r\n]+/);
    if (whitespaceMatch) {
      tokens.push(whitespaceMatch[0]);
      index += whitespaceMatch[0].length;
      continue;
    }
    const latinMatch = rest.match(/^[A-Za-z0-9_./:\\\-]+/);
    if (latinMatch) {
      tokens.push(latinMatch[0]);
      index += latinMatch[0].length;
      continue;
    }
    tokens.push(value[index]);
    index += 1;
  }
  return tokens;
}

function splitOversizedToken(token, ctx, maxWidth) {
  const chars = Array.from(String(token || ""));
  const segments = [];
  let buffer = "";
  chars.forEach((char) => {
    const next = buffer + char;
    const nextWidth = ctx.measureText(next).width;
    if (buffer && nextWidth > maxWidth) {
      segments.push(buffer);
      buffer = char;
      return;
    }
    buffer = next;
  });
  if (buffer) {
    segments.push(buffer);
  }
  return segments.length ? segments : chars;
}

function layoutRichRuns(runs, ctx, maxWidth, baseFontSize, scale = 1, options = {}) {
  const lines = [];
  const scaleValue = Math.max(0.1, Number(scale) || 1);
  const lineHeightRatio = Math.max(1, Number(options.lineHeightRatio || TEXT_LINE_HEIGHT_RATIO));
  let current = createLine(baseFontSize, scaleValue, lineHeightRatio);

  const pushLine = () => {
    lines.push(current);
    current = createLine(baseFontSize, scaleValue, lineHeightRatio);
  };

  const pushSegment = (text, style) => {
    if (!text) return;
    const width = ctx.measureText(text).width;
    appendSegment(current, text, style, width, baseFontSize, scaleValue, lineHeightRatio);
  };

  runs.forEach((run) => {
    const text = String(run.text || "");
    const style = run.style || {};
    if (!text) return;
    if (text === "\n") {
      const spacingAfterEm = Math.max(0, Number(style.spacingAfterEm || 0));
      if (spacingAfterEm > 0) {
        current.spacingAfter = Math.max(current.spacingAfter, spacingAfterEm * baseFontSize * scaleValue);
      }
      pushLine();
      return;
    }
    ctx.font = fontForRun(style, baseFontSize, scaleValue, options);
    tokenizeWrapText(text).forEach((token) => {
      if (!token) {
        return;
      }
      const whitespace = isWhitespaceToken(token);
      if (whitespace && current.width <= 0) {
        return;
      }
      const tokenWidth = ctx.measureText(token).width;
      if (tokenWidth <= maxWidth && (current.width + tokenWidth <= maxWidth || current.width <= 0)) {
        if (!whitespace || current.width > 0) {
          pushSegment(token, style);
        }
        return;
      }
      if (whitespace) {
        pushLine();
        return;
      }
      pushLine();
      ctx.font = fontForRun(style, baseFontSize, scaleValue, options);
      if (ctx.measureText(token).width <= maxWidth) {
        pushSegment(token, style);
        return;
      }
      splitOversizedToken(token, ctx, maxWidth).forEach((part, partIndex) => {
        if (partIndex > 0) {
          pushLine();
          ctx.font = fontForRun(style, baseFontSize, scaleValue, options);
        }
        pushSegment(part, style);
      });
    });
  });

  if (current.segments.length) {
    lines.push(current);
  }
  return lines;
}

function getRichLayoutCacheKey({
  html = "",
  maxWidth = 1,
  baseFontSize = 18,
  scale = 1,
  lineHeightRatio = TEXT_LINE_HEIGHT_RATIO,
  fontWeight = TEXT_FONT_WEIGHT,
  boldWeight = TEXT_BOLD_WEIGHT,
  fontFamily = TEXT_FONT_FAMILY,
} = {}) {
  return [
    String(html || ""),
    `w:${Math.round(Math.max(1, Number(maxWidth) || 1) * 100) / 100}`,
    `f:${Math.round(Math.max(10, Number(baseFontSize) || 18) * 100) / 100}`,
    `s:${getScaleBucket(scale)}`,
    `lh:${Math.round(Math.max(1, Number(lineHeightRatio) || TEXT_LINE_HEIGHT_RATIO) * 1000) / 1000}`,
    `fw:${String(fontWeight || TEXT_FONT_WEIGHT)}`,
    `bw:${String(boldWeight || TEXT_BOLD_WEIGHT)}`,
    `ff:${sanitizeCanvasFontFamily(fontFamily)}`,
  ].join("|");
}

function buildRichLayoutCacheEntry(lines = []) {
  const width = lines.reduce((max, line) => Math.max(max, Number(line?.width || 0) || 0), 0);
  const height = lines.reduce(
    (sum, line) => sum + (Number(line?.height || 0) || 0) + Math.max(0, Number(line?.spacingAfter || 0) || 0),
    0
  );
  return {
    lines,
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function getCachedRichLayout({
  html = "",
  runs = null,
  ctx = null,
  maxWidth = 1,
  baseFontSize = 18,
  scale = 1,
  lineHeightRatio = TEXT_LINE_HEIGHT_RATIO,
  fontWeight = TEXT_FONT_WEIGHT,
  boldWeight = TEXT_BOLD_WEIGHT,
  fontFamily = TEXT_FONT_FAMILY,
} = {}) {
  if (!runs || !runs.length || !ctx) {
    return null;
  }
  const cacheKey = getRichLayoutCacheKey({
    html,
    maxWidth,
    baseFontSize,
    scale,
    lineHeightRatio,
    fontWeight,
    boldWeight,
    fontFamily,
  });
  const cached = richLayoutCache.get(cacheKey);
  if (cached) {
    putLruCache(richLayoutCache, cacheKey, cached, RICH_LAYOUT_CACHE_LIMIT);
    return cached;
  }
  const lines = layoutRichRuns(runs, ctx, maxWidth, baseFontSize, scale, {
    lineHeightRatio,
    fontWeight,
    boldWeight,
    fontFamily,
  });
  const entry = buildRichLayoutCacheEntry(lines);
  putLruCache(richLayoutCache, cacheKey, entry, RICH_LAYOUT_CACHE_LIMIT);
  return entry;
}

export function drawRichTextInBox(ctx, {
  x,
  y,
  width,
  height,
  html,
  text,
  color,
  fontSize,
  scale = 1,
  lineHeightRatio = TEXT_LINE_HEIGHT_RATIO,
  fontWeight = TEXT_FONT_WEIGHT,
  boldWeight = TEXT_BOLD_WEIGHT,
  fontFamily = TEXT_FONT_FAMILY,
} = {}) {
  const baseFontSize = Math.max(10, Number(fontSize || 18));
  const scaleValue = Math.max(0.1, Number(scale) || 1);
  const plain = String(text || "");
  const runs = getCachedRichTextRuns(html);
  if (!runs || !runs.length) {
    return false;
  }
  const maxWidth = Math.max(1, width);
  const layout = getCachedRichLayout({
    html,
    runs,
    ctx,
    maxWidth,
    baseFontSize,
    scale: scaleValue,
    lineHeightRatio,
    fontWeight,
    boldWeight,
    fontFamily,
  });
  const lines = layout?.lines || [];
  let cursorY = y;
  for (const line of lines) {
    if (cursorY + line.height > y + height) {
      break;
    }
    let cursorX = x;
    for (const seg of line.segments) {
      const style = seg.style || {};
      ctx.font = fontForRun(style, baseFontSize, scaleValue, { fontWeight, boldWeight, fontFamily });
      const segmentText = seg.text;
      const segmentWidth = seg.width;
      const highlight = style.highlight || style.code;
      const highlightColor = style.highlightColor || DEFAULT_HIGHLIGHT;
      if (highlight) {
        ctx.save();
        ctx.fillStyle = highlightColor;
        const boxHeight = Math.max(4, line.height - 4);
        const horizontalPadding = style.code ? Math.max(2, baseFontSize * scaleValue * 0.18) : 0;
        ctx.fillRect(cursorX - horizontalPadding, cursorY + 2, segmentWidth + horizontalPadding * 2, boxHeight);
        ctx.restore();
      }
      ctx.fillStyle = style.color || color || "#0f172a";
      ctx.textBaseline = "top";
      ctx.fillText(segmentText, cursorX, cursorY);
      if (style.underline || style.strike) {
        ctx.save();
        ctx.strokeStyle = style.color || color || "#0f172a";
        ctx.lineWidth = Math.max(1, baseFontSize * scaleValue * 0.08);
        const underlineY = cursorY + line.height - 4;
        if (style.underline) {
          ctx.beginPath();
          ctx.moveTo(cursorX, underlineY);
          ctx.lineTo(cursorX + segmentWidth, underlineY);
          ctx.stroke();
        }
        if (style.strike) {
          const strikeY = cursorY + line.height * 0.55;
          ctx.beginPath();
          ctx.moveTo(cursorX, strikeY);
          ctx.lineTo(cursorX + segmentWidth, strikeY);
          ctx.stroke();
        }
        ctx.restore();
      }
      cursorX += segmentWidth;
    }
    cursorY += line.height + Math.max(0, Number(line.spacingAfter || 0));
  }
  return Boolean(plain || html);
}

export function measureRichTextBox({
  html = "",
  text = "",
  width = 0,
  fontSize = 18,
  scale = 1,
  lineHeightRatio = TEXT_LINE_HEIGHT_RATIO,
  fontWeight = TEXT_FONT_WEIGHT,
  boldWeight = TEXT_BOLD_WEIGHT,
  fontFamily = TEXT_FONT_FAMILY,
} = {}) {
  const runs = getCachedRichTextRuns(html);
  if (!runs || !runs.length) {
    return null;
  }
  const ctx = getMeasureCanvasContext();
  if (!ctx) {
    return null;
  }
  const baseFontSize = Math.max(10, Number(fontSize || 18));
  const maxWidth = Math.max(1, Number(width || 1));
  const layout = getCachedRichLayout({
    html,
    runs,
    ctx,
    maxWidth,
    baseFontSize,
    scale,
    lineHeightRatio,
    fontWeight,
    boldWeight,
    fontFamily,
  });
  if (!layout?.lines?.length) {
    return null;
  }
  return {
    width: Math.max(1, Number(layout.width || 1)),
    height: Math.max(1, Number(layout.height || 1)),
  };
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 999) {
  const lines = [];
  const pushLine = (value = "") => {
    lines.push(String(value || ""));
  };
  const commitLine = (buffer) => {
    if (lines.length >= maxLines) {
      return;
    }
    pushLine(buffer);
  };

  String(text || "").split("\n").forEach((part) => {
    if (lines.length >= maxLines) {
      return;
    }
    const tokens = tokenizeWrapText(part);
    if (!tokens.length) {
      pushLine("");
      return;
    }
    let line = "";
    tokens.forEach((token) => {
      if (lines.length >= maxLines) {
        return;
      }
      if (!token) {
        return;
      }
      const isWhitespace = /^\s+$/.test(token);
      if (isWhitespace && !line) {
        return;
      }
      const nextLine = line + token;
      const nextWidth = ctx.measureText(nextLine).width;
      if (nextWidth <= maxWidth || !line) {
        if (!isWhitespace || line) {
          line = nextLine;
        }
        if (ctx.measureText(line).width <= maxWidth) {
          return;
        }
      }

      if (isWhitespace) {
        commitLine(line);
        line = "";
        return;
      }

      if (line) {
        commitLine(line);
        line = "";
      }

      if (ctx.measureText(token).width <= maxWidth) {
        line = token;
        return;
      }

      splitOversizedToken(token, ctx, maxWidth).forEach((partToken, index) => {
        if (lines.length >= maxLines) {
          return;
        }
        if (index === 0) {
          line = partToken;
          return;
        }
        commitLine(line);
        line = partToken;
      });
    });

    if (lines.length < maxLines) {
      commitLine(line);
    }
  });

  lines.slice(0, maxLines).forEach((line, row) => {
    ctx.fillText(line, x, y + row * lineHeight);
  });
}

function drawTextBody(ctx, element, view, selected, hover, editing, drawSelectionFrame, drawHandles, options = {}) {
  const scale = Math.max(0.1, Number(view?.scale) || 1);
  const x = Number(element.x || 0) * scale + Number(view?.offsetX || 0);
  const y = Number(element.y || 0) * scale + Number(view?.offsetY || 0);
  const width = Math.max(1, Number(element.width) || 1) * scale;
  const height = Math.max(1, Number(element.height) || 1) * scale;
  const padding = 0;
  const text = String(options.text ?? element.text ?? element.plainText ?? "");
  const placeholder = String(options.placeholder ?? "双击输入文本");
  const logicalFontSize = Math.max(12, Number(element.fontSize || 18));
  const fontSize = logicalFontSize * scale;
  const lineHeight = Math.max(22 * scale, logicalFontSize * TEXT_BODY_LINE_HEIGHT_RATIO * scale);

  ctx.save();
  ctx.fillStyle = element.color || "#0f172a";
  ctx.font = `${TEXT_FONT_WEIGHT} ${Math.max(1, fontSize)}px ${TEXT_FONT_FAMILY}`;
  ctx.textBaseline = "top";
  const hideWhenEditing = Boolean(options.hideWhenEditing);
  const hideText = Boolean(options.hideText);
  if (!hideText && (!editing || !hideWhenEditing)) {
    const linkTokens = options.linkTokens ?? element?.structuredImport?.linkTokens ?? element?.linkTokens ?? [];
    const rawHtml = options.html ?? element.html;
    const html = resolveRichTextDisplayHtml({
      text,
      html: rawHtml,
      linkTokens,
    });
    const rendered = html.trim()
      ? drawRichTextInBox(ctx, {
          x: x + padding,
          y: y + padding,
          width: Math.max(1, width - padding * 2),
          height: Math.max(1, height - padding * 2),
          html,
          text: text || placeholder,
          color: element.color || "#0f172a",
          fontSize: logicalFontSize,
          scale,
        })
      : false;
    if (!rendered) {
      wrapText(
        ctx,
        text || placeholder,
        x + padding,
        y + padding,
        Math.max(1, width - padding * 2),
        lineHeight
      );
    }
  }
  drawSelectionFrame(ctx, x, y, width, height, selected, hover);
  if (selected) {
    drawHandles(ctx, element, view);
  }
  ctx.restore();
}

export function drawTextElement(ctx, element, view, selected, hover, editing, drawSelectionFrame, drawHandles, options = {}) {
  const renderText = Boolean(options.renderText);
  drawTextBody(ctx, element, view, selected, hover, editing, drawSelectionFrame, drawHandles, {
    text: options.text ?? element.text ?? "",
    placeholder: "双击输入文本",
    hideText: !renderText,
    hideWhenEditing: true,
    html: element.html || "",
    linkTokens: element?.structuredImport?.linkTokens || element?.linkTokens || [],
  });
}
