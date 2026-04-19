import { buildTextTitle, createId, sanitizeText } from "../../../utils.js";
import { RENDER_PAYLOAD_KINDS } from "../rendererPipeline.js";
import { inlineNodesToPlainText } from "../text/sharedTextRenderUtils.js";

export const MATH_RENDERER_ID = "math-renderer";

export function createMathRenderer(options = {}) {
  const id = options.id || MATH_RENDERER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 78;

  return {
    id,
    version: "1.0.0",
    displayName: "Math Renderer",
    priority,
    payloadKinds: [RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT],
    tags: ["builtin", "math", "canonical-renderer"],
    supports({ renderInput }) {
      const payload = collectMathPayload(renderInput?.payload?.content || []);
      if (!payload.blocks.length && !payload.inlines.length) {
        return { matched: false, score: -1, reason: "no-math-nodes" };
      }
      return {
        matched: true,
        score: payload.blocks.length + payload.inlines.length > 1 ? 20 : 14,
        reason:
          payload.blocks.length && payload.inlines.length
            ? "math-block-and-inline-available"
            : payload.blocks.length
              ? "math-block-available"
              : "math-inline-available",
      };
    },
    async render({ renderInput }) {
      const payload = collectMathPayload(renderInput?.payload?.content || []);
      const operations = [
        ...payload.blocks.map((block, index) => buildMathBlockOperation(block, index, renderInput)),
        ...payload.inlines.map((inline, index) =>
          buildMathInlineOperation(inline, payload.blocks.length + index, renderInput)
        ),
      ];

      return {
        planId: `${id}:${renderInput?.descriptorId || "math-render-plan"}`,
        kind: "element-render-plan",
        payloadKind: renderInput?.kind || RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT,
        operations,
        stats: {
          mathBlockCount: payload.blocks.length,
          mathInlineCount: payload.inlines.length,
          sourceFormats: Array.from(
            new Set(
              operations
                .map((operation) => operation.structure.sourceFormat)
                .filter(Boolean)
            )
          ),
        },
        meta: {
          rendererId: id,
        },
      };
    },
  };
}

function collectMathPayload(nodes = [], context = { quoteDepth: 0, parentType: "doc" }) {
  const blocks = [];
  const inlines = [];
  const safeNodes = Array.isArray(nodes) ? nodes : [];

  safeNodes.forEach((node, index) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "mathBlock") {
      blocks.push({
        node,
        quoteDepth: context.quoteDepth,
        parentType: context.parentType,
        orderKey: `${context.quoteDepth}:block:${index}`,
      });
      return;
    }

    if (node.type === "paragraph" || node.type === "heading") {
      collectInlineMathFromInlineNodes(node.content || [], {
        inlines,
        quoteDepth: context.quoteDepth,
        parentType: node.type,
      });
      return;
    }

    if (node.type === "blockquote") {
      const nested = collectMathPayload(node.content || [], {
        quoteDepth: context.quoteDepth + 1,
        parentType: node.type,
      });
      blocks.push(...nested.blocks);
      inlines.push(...nested.inlines);
      return;
    }

    if (Array.isArray(node.content) && node.content.length) {
      const nested = collectMathPayload(node.content || [], {
        quoteDepth: context.quoteDepth,
        parentType: node.type,
      });
      blocks.push(...nested.blocks);
      inlines.push(...nested.inlines);
    }
  });

  return { blocks, inlines };
}

function collectInlineMathFromInlineNodes(nodes, context) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  safeNodes.forEach((node, index) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "mathInline") {
      context.inlines.push({
        node,
        quoteDepth: context.quoteDepth,
        parentType: context.parentType,
        orderKey: `${context.quoteDepth}:inline:${index}`,
      });
      return;
    }
    if (node.type === "link") {
      collectInlineMathFromInlineNodes(node.content || [], context);
    }
  });
}

function buildMathBlockOperation(block, index, renderInput) {
  const formula = sanitizeText(String(block?.node?.text || "")).trim();
  const sourceFormat = normalizeSourceFormat(block?.node?.attrs?.sourceFormat);
  const fallbackText = buildMathFallbackText(formula, true);
  return {
    type: "render-math-block",
    sourceNodeType: "mathBlock",
    legacyType: "math",
    order: index,
    layout: {
      strategy: "flow-stack",
      stackIndex: index,
      quoteDepth: block.quoteDepth,
      gap: 20,
    },
    element: {
      id: createId("math"),
      type: "mathBlock",
      title: buildTextTitle(formula || "公式"),
      formula,
      sourceFormat,
      displayMode: true,
      fallbackText,
      width: estimateMathBlockWidth(formula),
      height: estimateMathBlockHeight(formula),
      x: 0,
      y: 0,
      locked: false,
      renderState: formula ? "ready" : "fallback-text",
    },
    structure: {
      sourceFormat,
      displayMode: true,
      formula,
      fallbackText,
      parentType: block.parentType,
    },
    meta: {
      descriptorId: String(renderInput?.descriptorId || ""),
      parserId: String(renderInput?.parserId || ""),
    },
  };
}

function buildMathInlineOperation(inline, index, renderInput) {
  const formula = sanitizeText(String(inline?.node?.text || "")).trim();
  const sourceFormat = normalizeSourceFormat(inline?.node?.attrs?.sourceFormat);
  const fallbackText = buildMathFallbackText(formula, false);
  return {
    type: "render-math-inline",
    sourceNodeType: "mathInline",
    legacyType: "math",
    order: index,
    layout: {
      strategy: "inline-anchor",
      stackIndex: index,
      quoteDepth: inline.quoteDepth,
      gap: 0,
    },
    element: {
      id: createId("math"),
      type: "mathInline",
      title: buildTextTitle(formula || "行内公式"),
      formula,
      sourceFormat,
      displayMode: false,
      fallbackText,
      width: estimateMathInlineWidth(formula),
      height: 28,
      x: 0,
      y: 0,
      locked: false,
      renderState: formula ? "ready" : "fallback-text",
    },
    structure: {
      sourceFormat,
      displayMode: false,
      formula,
      fallbackText,
      parentType: inline.parentType,
    },
    meta: {
      descriptorId: String(renderInput?.descriptorId || ""),
      parserId: String(renderInput?.parserId || ""),
    },
  };
}

function normalizeSourceFormat(value) {
  const format = String(value || "").trim().toLowerCase();
  return ["latex", "mathml", "omml"].includes(format) ? format : "latex";
}

function buildMathFallbackText(formula, displayMode) {
  const body = sanitizeText(String(formula || "")).trim();
  if (!body) {
    return displayMode ? "[公式]" : "[行内公式]";
  }
  return displayMode ? `$$${body}$$` : `$${body}$`;
}

function estimateMathBlockWidth(formula) {
  const lines = sanitizeText(formula || "").split("\n");
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return Math.max(200, Math.min(920, Math.round(72 + longest * 10.5)));
}

function estimateMathBlockHeight(formula) {
  const lines = sanitizeText(formula || "").split("\n");
  const lineCount = Math.max(1, lines.length);
  return Math.max(72, Math.round(30 + lineCount * 28));
}

function estimateMathInlineWidth(formula) {
  const text = sanitizeText(formula || "");
  return Math.max(56, Math.min(420, Math.round(20 + text.length * 9.2)));
}
