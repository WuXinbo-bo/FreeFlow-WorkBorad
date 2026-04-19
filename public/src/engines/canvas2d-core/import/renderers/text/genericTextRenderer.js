import { buildTextTitle, createId, sanitizeText } from "../../../utils.js";
import { RENDER_PAYLOAD_KINDS } from "../rendererPipeline.js";
import {
  estimateTextHeight,
  estimateTextWidth,
  inferHeadingFontSize,
  inlineNodesToHtml,
  inlineNodesToPlainText,
} from "./sharedTextRenderUtils.js";

export const GENERIC_TEXT_RENDERER_ID = "generic-text-renderer";

export function createGenericTextRenderer(options = {}) {
  const id = options.id || GENERIC_TEXT_RENDERER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 70;

  return {
    id,
    version: "1.0.0",
    displayName: "Generic Text Renderer",
    priority,
    payloadKinds: [RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT],
    tags: ["builtin", "text", "canonical-renderer"],
    supports({ renderInput }) {
      const blocks = collectRenderableTextBlocks(renderInput?.payload?.content || []);
      if (!blocks.length) {
        return { matched: false, score: -1, reason: "no-renderable-text-blocks" };
      }
      return {
        matched: true,
        score: blocks.length >= 3 ? 18 : 12,
        reason: blocks.length >= 3 ? "multiple-text-blocks" : "text-block-available",
      };
    },
    async render({ renderInput }) {
      const blocks = collectRenderableTextBlocks(renderInput?.payload?.content || []);
      const operations = blocks.map((block, index) => buildTextOperation(block, index, renderInput));
      return {
        planId: `${id}:${renderInput?.descriptorId || "text-render-plan"}`,
        kind: "element-render-plan",
        payloadKind: renderInput?.kind || RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT,
        operations,
        stats: {
          textBlockCount: operations.length,
          headingCount: operations.filter((operation) => operation.blockRole === "heading").length,
          paragraphCount: operations.filter((operation) => operation.blockRole === "paragraph").length,
          quoteCount: operations.filter((operation) => operation.blockRole === "blockquote").length,
        },
        meta: {
          rendererId: id,
        },
      };
    },
  };
}

function collectRenderableTextBlocks(nodes = [], context = { quoteDepth: 0 }) {
  const result = [];
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  safeNodes.forEach((node, index) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "heading" || node.type === "paragraph") {
      const plainText = inlineNodesToPlainText(node.content || []);
      const html = inlineNodesToHtml(node.content || []);
      result.push({
        node,
        sourceNodeType: node.type,
        blockRole: context.quoteDepth > 0 ? "blockquote" : node.type,
        plainText,
        html,
        orderKey: `${context.quoteDepth}:${index}`,
        quoteDepth: context.quoteDepth,
      });
      return;
    }
    if (node.type === "blockquote") {
      result.push(
        ...collectRenderableTextBlocks(node.content || [], {
          quoteDepth: context.quoteDepth + 1,
        })
      );
    }
  });
  return result.filter((block) => block.plainText.trim() || block.html.trim());
}

function buildTextOperation(block, index, renderInput) {
  const fontSize = inferFontSize(block);
  const plainText = sanitizeText(block.plainText || "");
  const html = String(block.html || "");
  const title = buildTextTitle(plainText || block.blockRole || "文本");
  return {
    type: "render-generic-text-block",
    sourceNodeType: block.sourceNodeType,
    blockRole: block.blockRole,
    legacyType: "text",
    order: index,
    layout: {
      strategy: "flow-stack",
      stackIndex: index,
      quoteDepth: block.quoteDepth,
      gap: 18,
    },
    element: {
      id: createId("text"),
      type: "text",
      text: plainText,
      plainText,
      html,
      title,
      fontSize,
      color: block.blockRole === "blockquote" ? "#475569" : "#0f172a",
      wrapMode: "manual",
      textResizeMode: "auto-width",
      width: estimateTextWidth(plainText, fontSize),
      height: estimateTextHeight(plainText, fontSize),
      x: 0,
      y: 0,
      locked: false,
      structuredImport: {
        kind: "structured-import-v1",
        blockRole: block.blockRole,
        sourceNodeType: block.sourceNodeType,
        listRole: "",
        canonicalFragment: {
          type: block.sourceNodeType,
          role: block.blockRole,
          html,
          plainText,
        },
      },
    },
    meta: {
      descriptorId: String(renderInput?.descriptorId || ""),
      parserId: String(renderInput?.parserId || ""),
    },
  };
}

function inferFontSize(block) {
  if (block.sourceNodeType === "heading") {
    const level = Number(block?.node?.attrs?.level) || 1;
    return inferHeadingFontSize(level);
  }
  if (block.blockRole === "blockquote") {
    return 18;
  }
  return 20;
}
