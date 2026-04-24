import { buildTextTitle, createId, sanitizeText } from "../../../utils.js";
import { RENDER_PAYLOAD_KINDS } from "../rendererPipeline.js";
import {
  buildTextElementContentFields,
  estimateTextHeight,
  estimateTextWidth,
  inferHeadingFontSize,
  inlineNodesToHtml,
  inlineNodesToPlainText,
  resolveImportedTextBoxLayout,
} from "./sharedTextRenderUtils.js";
import { deriveNodeSourceOrder } from "../shared/sourceOrder.js";

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
    async render({ renderInput, pipelineOutput }) {
      const blocks = collectRenderableTextBlocks(renderInput?.payload?.content || []);
      const forceWrap = shouldForceImportedWrapMode(pipelineOutput);
      const operations = shouldAggregateBlocksAsSingleTextBox(renderInput, blocks)
        ? [buildAggregatedTextOperation(blocks, renderInput, { forceWrap })]
        : blocks.map((block, index) => buildTextOperation(block, index, renderInput, { forceWrap }));
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

function shouldAggregateBlocksAsSingleTextBox(renderInput, blocks = []) {
  if (!Array.isArray(blocks) || blocks.length <= 1) {
    return false;
  }
  if (String(renderInput?.parserId || "") !== "plain-text-parser") {
    return false;
  }
  return blocks.every((block) => String(block?.sourceNodeType || "") === "paragraph");
}

function buildAggregatedTextOperation(blocks = [], renderInput, options = {}) {
  const fontSize = 20;
  const plainText = blocks.map((block) => sanitizeText(block?.plainText || "")).join("\n\n");
  const html = blocks.map((block) => wrapBlockHtml(block, block?.html || "")).join("");
  const content = buildTextElementContentFields(
    {
      html,
      plainText,
      text: plainText,
      fontSize,
    },
    {
      fontSize,
    }
  );
  const initialLayout = resolveImportedTextBoxLayout(content.plainText, fontSize, {
    forceWrap: options?.forceWrap === true,
  });
  return {
    type: "render-generic-text-document",
    sourceNodeType: "paragraph",
    blockRole: "paragraph",
    legacyType: "text",
    order: 0,
    layout: {
      strategy: "flow-stack",
      stackIndex: 0,
      quoteDepth: 0,
      gap: 18,
    },
    element: {
      id: createId("text"),
      type: "text",
      text: content.text,
      plainText: content.plainText,
      html: content.html,
      richTextDocument: content.richTextDocument,
      title: buildTextTitle(content.plainText || "文本"),
      fontSize,
      color: "#0f172a",
      wrapMode: "manual",
      textBoxLayoutMode: initialLayout.textBoxLayoutMode,
      textResizeMode: initialLayout.textResizeMode,
      width: initialLayout.width || estimateTextWidth(content.plainText, fontSize),
      height: initialLayout.height || estimateTextHeight(content.plainText, fontSize),
      x: 0,
      y: 0,
      locked: false,
      structuredImport: {
        kind: "structured-import-v1",
        blockRole: "paragraph",
        sourceNodeType: "paragraph",
        listRole: "",
        canonicalFragment: {
          type: "doc",
          content: blocks.map((block) => ({
            type: String(block?.sourceNodeType || "paragraph"),
            role: String(block?.blockRole || "paragraph"),
            html: String(block?.html || ""),
            plainText: sanitizeText(block?.plainText || ""),
          })),
        },
      },
    },
    meta: {
      descriptorId: String(renderInput?.descriptorId || ""),
      parserId: String(renderInput?.parserId || ""),
    },
    sourceOrder: deriveNodeSourceOrder(blocks[0]?.node, 0),
  };
}

function wrapParagraphHtml(html = "") {
  const clean = String(html || "").trim();
  return `<div>${clean || "<br>"}</div>`;
}

function wrapBlockHtml(block, html = "") {
  const clean = String(html || "").trim() || "<br>";
  if (block?.sourceNodeType === "heading") {
    const level = Math.min(6, Math.max(1, Number(block?.node?.attrs?.level) || 1));
    return `<h${level}>${clean}</h${level}>`;
  }
  if (block?.blockRole === "blockquote") {
    return `<blockquote><div>${clean}</div></blockquote>`;
  }
  return wrapParagraphHtml(clean);
}

function buildTextOperation(block, index, renderInput, options = {}) {
  const fontSize = inferFontSize(block);
  const normalizedHtml = wrapBlockHtml(block, String(block.html || ""));
  const content = buildTextElementContentFields(
    {
      html: normalizedHtml,
      plainText: sanitizeText(block.plainText || ""),
      text: sanitizeText(block.plainText || ""),
      fontSize,
    },
    {
      fontSize,
    }
  );
  const plainText = content.plainText;
  const initialLayout = resolveImportedTextBoxLayout(plainText, fontSize, {
    forceWrap: options?.forceWrap === true,
  });
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
      text: content.text,
      plainText: content.plainText,
      html: content.html,
      richTextDocument: content.richTextDocument,
      title,
      fontSize,
      color: block.blockRole === "blockquote" ? "#475569" : "#0f172a",
      wrapMode: "manual",
      textBoxLayoutMode: initialLayout.textBoxLayoutMode,
      textResizeMode: initialLayout.textResizeMode,
      width: initialLayout.width || estimateTextWidth(plainText, fontSize),
      height: initialLayout.height || estimateTextHeight(plainText, fontSize),
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
          html: content.html,
          plainText: content.plainText,
        },
      },
    },
    meta: {
      descriptorId: String(renderInput?.descriptorId || ""),
      parserId: String(renderInput?.parserId || ""),
    },
    sourceOrder: deriveNodeSourceOrder(block?.node, index),
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

function shouldForceImportedWrapMode(pipelineOutput) {
  const channel = String(pipelineOutput?.descriptor?.channel || "").trim().toLowerCase();
  return channel === "drag-drop";
}
