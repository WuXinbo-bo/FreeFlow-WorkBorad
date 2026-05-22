import { createId, htmlToPlainText, normalizeRichHtml, normalizeRichHtmlInlineFontSizes, sanitizeText } from "../utils.js";
import { FLOW_NODE_TEXT_LAYOUT } from "../rendererText.js";
import { normalizeTextFontSize } from "./text.js";
import { normalizeTextContentModel } from "../textModel/textContentModel.js";
import {
  LEGACY_TEXT_RESIZE_MODE_WRAP,
  TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
  normalizeTextBoxLayoutModel,
} from "../textModel/textBoxLayoutModel.js";
import { measureTextElementLayout } from "../textLayout/measureTextElementLayout.js";

export const FLOW_NODE_MIN_WIDTH = 160;
export const FLOW_NODE_MIN_HEIGHT = 72;
export const FLOW_NODE_WRAP_MODE = "flow";

export function normalizeFlowNodeWrapMode(value = "") {
  return String(value || "").trim().toLowerCase() === FLOW_NODE_WRAP_MODE ? FLOW_NODE_WRAP_MODE : FLOW_NODE_WRAP_MODE;
}

export function getFlowNodeMinSize(element = {}, options = {}) {
  const content = normalizeTextContentModel(element, {
    html: element.html || "",
    plainText: element.plainText || element.text || "",
    fontSize: element.fontSize || 18,
  });
  const html = normalizeRichHtml(content.html || "");
  const plainText = sanitizeText(content.plainText || htmlToPlainText(html));
  const fontSize = normalizeTextFontSize(element.fontSize || 18, 18);
  const paddingX = FLOW_NODE_TEXT_LAYOUT.paddingX;
  const paddingY = FLOW_NODE_TEXT_LAYOUT.paddingY;
  const widthHint = Math.max(FLOW_NODE_MIN_WIDTH, Number(options.widthHint ?? element.width ?? FLOW_NODE_MIN_WIDTH) || FLOW_NODE_MIN_WIDTH);

  if (!plainText.trim()) {
    return {
      width: FLOW_NODE_MIN_WIDTH,
      height: FLOW_NODE_MIN_HEIGHT,
    };
  }

  const innerWidth = Math.max(1, widthHint - paddingX * 2);
  const layout = normalizeTextBoxLayoutModel({
    textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
    textResizeMode: LEGACY_TEXT_RESIZE_MODE_WRAP,
    widthHint: innerWidth,
    minWidth: 1,
    minHeight: 1,
    maxWidth: innerWidth,
  });
  const measured = measureTextElementLayout({
    ...content,
    textBoxLayoutMode: layout.layoutMode,
    textResizeMode: layout.legacyResizeMode,
    widthHint: layout.widthHint,
    minWidth: layout.minWidth,
    minHeight: layout.minHeight,
    maxWidth: layout.maxWidth,
    fontSize,
    lineHeightRatio: FLOW_NODE_TEXT_LAYOUT.lineHeightRatio,
    fontWeight: FLOW_NODE_TEXT_LAYOUT.fontWeight,
    boldWeight: FLOW_NODE_TEXT_LAYOUT.boldWeight,
  });

  const estimatedWidth = Math.ceil(layout.widthHint + paddingX * 2);
  const estimatedHeight = Math.ceil(Number(measured?.frameHeight || measured?.contentHeight || 0) + paddingY * 2);

  return {
    width: Math.max(FLOW_NODE_MIN_WIDTH, estimatedWidth || 0),
    height: Math.max(FLOW_NODE_MIN_HEIGHT, estimatedHeight || 0),
  };
}

export function createFlowNodeElement(point, html = "", plainText = "") {
  const content = normalizeTextContentModel(
    {
      html: normalizeRichHtmlInlineFontSizes(html || ""),
      plainText: plainText || "",
      fontSize: 18,
    },
    { fontSize: 18 }
  );
  const cleanHtml = content.html;
  const cleanText = content.plainText;
  const base = {
    id: createId("flow"),
    type: "flowNode",
    html: cleanHtml,
    plainText: cleanText,
    richTextDocument: content.richTextDocument,
    wrapMode: FLOW_NODE_WRAP_MODE,
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    width: 260,
    height: 120,
    fontSize: 18,
    color: "#0f172a",
    createdAt: Date.now(),
  };
  const minSize = getFlowNodeMinSize(base);
  return {
    ...base,
    width: Math.max(base.width, minSize.width),
    height: Math.max(base.height, minSize.height),
  };
}

export function normalizeFlowNodeElement(element = {}) {
  const base = createFlowNodeElement(
    { x: Number(element.x) || 0, y: Number(element.y) || 0 },
    element.html || "",
    element.plainText || element.text || ""
  );
  const content = normalizeTextContentModel(
    {
      ...element,
      html: normalizeRichHtmlInlineFontSizes(element.html ?? base.html ?? ""),
      plainText: element.plainText ?? element.text ?? "",
    },
    {
      html: base.html ?? "",
      plainText: base.plainText ?? "",
      fontSize: element.fontSize ?? base.fontSize,
    }
  );
  const nextHtml = content.html;
  const nextPlainText = sanitizeText(content.plainText ?? htmlToPlainText(nextHtml) ?? base.plainText ?? "");
  const next = {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "flowNode",
    html: nextHtml,
    plainText: nextPlainText,
    richTextDocument: content.richTextDocument,
    wrapMode: normalizeFlowNodeWrapMode(element.wrapMode ?? base.wrapMode),
    x: Number(element.x ?? base.x) || 0,
    y: Number(element.y ?? base.y) || 0,
    width: Math.max(FLOW_NODE_MIN_WIDTH, Number(element.width ?? base.width) || base.width),
    height: Math.max(FLOW_NODE_MIN_HEIGHT, Number(element.height ?? base.height) || base.height),
    fontSize: normalizeTextFontSize(element.fontSize ?? base.fontSize, base.fontSize),
    color: String(element.color || base.color),
    createdAt: Number(element.createdAt) || base.createdAt,
  };
  const minSize = getFlowNodeMinSize(next);
  next.width = Math.max(next.width, minSize.width);
  next.height = Math.max(next.height, minSize.height);
  return next;
}

export function createFlowEdgeElement(from, to, style = "solid") {
  return {
    id: createId("edge"),
    type: "flowEdge",
    fromId: String(from?.id || ""),
    fromSide: String(from?.side || "right"),
    toId: String(to?.id || ""),
    toSide: String(to?.side || "left"),
    style: style || "solid",
    arrowDirection: "forward",
    createdAt: Date.now(),
  };
}

export function normalizeFlowEdgeElement(element = {}) {
  const rawStyle = String(element.style || "solid").toLowerCase();
  const style = rawStyle === "dashed" || rawStyle === "arrow" || rawStyle === "solid" ? rawStyle : "solid";
  const rawDirection = String(element.arrowDirection || "forward").toLowerCase();
  const arrowDirection = rawDirection === "backward" ? "backward" : "forward";
  return {
    id: String(element.id || createId("edge")),
    type: "flowEdge",
    fromId: String(element.fromId || ""),
    fromSide: String(element.fromSide || "right"),
    toId: String(element.toId || ""),
    toSide: String(element.toSide || "left"),
    style,
    arrowDirection,
    createdAt: Number(element.createdAt) || Date.now(),
  };
}

export function getFlowNodeConnectors(node) {
  const width = Math.max(1, Number(node?.width || 1));
  const height = Math.max(1, Number(node?.height || 1));
  const x = Number(node?.x || 0);
  const y = Number(node?.y || 0);
  return {
    top: { x: x + width / 2, y },
    right: { x: x + width, y: y + height / 2 },
    bottom: { x: x + width / 2, y: y + height },
    left: { x, y: y + height / 2 },
  };
}
