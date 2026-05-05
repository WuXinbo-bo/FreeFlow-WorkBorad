import { buildTextTitle, clamp, createId, sanitizeText } from "../utils.js";
import {
  getTextMinSize,
  TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
  TEXT_RESIZE_MODE_WRAP,
} from "./text.js";
import { normalizeTextContentModel } from "../textModel/textContentModel.js";
import {
  MIND_BRANCH_AUTO,
  MIND_LAYOUT_MODE_HORIZONTAL,
  normalizeMindBranchSide,
  normalizeMindChildrenIds,
  normalizeMindLayoutMode,
  syncMindNodeTextMetrics,
  MIND_BRANCH_RIGHT,
  MIND_SUMMARY_TYPE,
} from "./mindMap.js";

function resolveMindNodeLevelFontSize(depth = 0) {
  const safeDepth = Math.max(0, Number(depth) || 0);
  if (safeDepth <= 0) {
    return 18;
  }
  if (safeDepth === 1) {
    return 16;
  }
  return 14;
}

function normalizeMindNodeLinks(links = []) {
  if (!Array.isArray(links)) {
    return [];
  }
  return links
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const targetId = String(entry.targetId || entry.id || "").trim();
      if (!targetId) {
        return null;
      }
      return {
        id: String(entry.id || `mind-link-${targetId}`),
        targetId,
        targetType: String(entry.targetType || entry.type || "").trim(),
        title: sanitizeText(String(entry.title || entry.label || "").trim()),
        createdAt: Number(entry.createdAt) || Date.now(),
      };
    })
    .filter(Boolean);
}

export function createMindNodeElement(point, title = "") {
  const cleanTitle = sanitizeText(title);
  const fontSize = resolveMindNodeLevelFontSize(0);
  const content = normalizeTextContentModel(
    {
      html: "",
      plainText: cleanTitle,
      text: cleanTitle,
      fontSize,
    },
    { fontSize }
  );
  const metrics = getTextMinSize(
    {
      html: content.html,
      plainText: content.plainText,
      text: content.plainText,
      richTextDocument: content.richTextDocument,
      fontSize,
      textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
      textResizeMode: TEXT_RESIZE_MODE_WRAP,
    },
    {
      widthHint: 220,
      fontSize,
    }
  );
  return syncMindNodeTextMetrics({
    id: createId("mind"),
    type: "mindNode",
    title: cleanTitle,
    text: content.plainText,
    plainText: content.plainText,
    html: content.html,
    richTextDocument: content.richTextDocument,
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    width: metrics.width,
    height: Math.max(96, metrics.height),
    fontSize,
    color: "#0f172a",
    layoutMode: MIND_LAYOUT_MODE_HORIZONTAL,
    branchSide: MIND_BRANCH_AUTO,
    parentId: "",
    rootId: "",
    depth: 0,
    order: 0,
    collapsed: false,
    childrenIds: [],
    links: [],
    createdAt: Date.now(),
  });
}

export function normalizeMindNodeElement(element = {}) {
  const base = createMindNodeElement({ x: Number(element.x) || 0, y: Number(element.y) || 0 }, element.title || "");
  const normalized = {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "mindNode",
    title: buildTextTitle(element.title || base.title || ""),
    text: sanitizeText(element.text || element.plainText || element.title || base.text || base.title || ""),
    plainText: sanitizeText(element.plainText || element.text || element.title || base.plainText || base.title || ""),
    html: String(element.html || base.html || ""),
    richTextDocument:
      element.richTextDocument && typeof element.richTextDocument === "object"
        ? element.richTextDocument
        : base.richTextDocument || null,
    x: Number(element.x ?? base.x) || 0,
    y: Number(element.y ?? base.y) || 0,
    width: Math.max(160, Number(element.width ?? base.width) || base.width),
    height: Math.max(72, Number(element.height ?? base.height) || base.height),
    fontSize: resolveMindNodeLevelFontSize(Number(element.depth ?? base.depth) || 0),
    color: String(element.color || base.color),
    layoutMode: normalizeMindLayoutMode(element.layoutMode, base.layoutMode),
    branchSide: normalizeMindBranchSide(element.branchSide, base.branchSide),
    parentId: String(element.parentId || ""),
    rootId: String(element.rootId || ""),
    depth: Math.max(0, Number(element.depth ?? base.depth) || 0),
    order: Math.max(0, Number(element.order ?? base.order) || 0),
    collapsed: Boolean(element.collapsed),
    childrenIds: normalizeMindChildrenIds(element.childrenIds || base.childrenIds),
    links: normalizeMindNodeLinks(element.links || base.links),
    createdAt: Number(element.createdAt) || base.createdAt,
  };
  normalized.title = buildTextTitle(normalized.plainText || normalized.title || "");
  return syncMindNodeTextMetrics(normalized);
}

export function createMindSummaryElement(sourceNode = {}, options = {}) {
  const siblingIds = normalizeMindChildrenIds(options.siblingIds || []);
  const label = sanitizeText(String(options.label || "摘要").trim() || "摘要");
  const point = {
    x: Number(sourceNode.x || 0) + Number(sourceNode.width || 220) + 72,
    y: Number(sourceNode.y || 0),
  };
  const base = createMindNodeElement(point, label);
  return {
    ...base,
    id: createId("mind-summary"),
    type: MIND_SUMMARY_TYPE,
    summaryOwnerId: String(options.summaryOwnerId || sourceNode.parentId || sourceNode.id || ""),
    siblingIds,
    branchSide: normalizeMindBranchSide(options.branchSide || sourceNode.branchSide, MIND_BRANCH_RIGHT),
    parentId: "",
    rootId: String(options.rootId || sourceNode.rootId || sourceNode.id || ""),
    depth: Math.max(0, Number(options.depth ?? sourceNode.depth) || 0),
    order: Math.max(0, Number(options.order ?? sourceNode.order) || 0),
    childrenIds: [],
  };
}

export function normalizeMindSummaryElement(element = {}) {
  const base = createMindSummaryElement(element, {
    label: element.title || element.plainText || "摘要",
    siblingIds: element.siblingIds || [],
    summaryOwnerId: element.summaryOwnerId || "",
    branchSide: element.branchSide,
    rootId: element.rootId,
    depth: element.depth,
    order: element.order,
  });
  return {
    ...base,
    ...normalizeMindNodeElement({
      ...base,
      ...element,
      type: MIND_SUMMARY_TYPE,
      parentId: "",
      childrenIds: [],
    }),
    type: MIND_SUMMARY_TYPE,
    summaryOwnerId: String(element.summaryOwnerId || base.summaryOwnerId || ""),
    siblingIds: normalizeMindChildrenIds(element.siblingIds || base.siblingIds || []),
  };
}
