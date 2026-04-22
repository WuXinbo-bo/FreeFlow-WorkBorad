import { buildTextTitle, createId, sanitizeText } from "../../../utils.js";
import { RENDER_PAYLOAD_KINDS } from "../rendererPipeline.js";
import { deriveNodeSourceOrder } from "../shared/sourceOrder.js";
import {
  resolveImportedTextBoxLayout,
} from "../text/sharedTextRenderUtils.js";

export const CODE_BLOCK_RENDERER_ID = "code-block-renderer";

export function createCodeBlockRenderer(options = {}) {
  const id = options.id || CODE_BLOCK_RENDERER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 74;

  return {
    id,
    version: "1.0.0",
    displayName: "Code Block Renderer",
    priority,
    payloadKinds: [RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT],
    tags: ["builtin", "code", "canonical-renderer"],
    supports({ renderInput }) {
      const blocks = collectCodeBlocks(renderInput?.payload?.content || []);
      if (!blocks.length) {
        return { matched: false, score: -1, reason: "no-code-blocks" };
      }
      return {
        matched: true,
        score: blocks.length >= 2 ? 22 : 16,
        reason: blocks.length >= 2 ? "multiple-code-blocks" : "code-block-available",
      };
    },
    async render({ renderInput }) {
      const blocks = collectCodeBlocks(renderInput?.payload?.content || []);
      const operations = blocks.map((block, index) => buildCodeOperation(block, index, renderInput));
      return {
        planId: `${id}:${renderInput?.descriptorId || "code-render-plan"}`,
        kind: "element-render-plan",
        payloadKind: renderInput?.kind || RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT,
        operations,
        stats: {
          codeBlockCount: operations.length,
          languages: operations.map((operation) => operation.structure.language).filter(Boolean),
          totalLineCount: operations.reduce((sum, operation) => sum + operation.structure.lineCount, 0),
        },
        meta: {
          rendererId: id,
        },
      };
    },
  };
}

function collectCodeBlocks(nodes = [], context = { quoteDepth: 0, parentType: "doc" }) {
  const result = [];
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  safeNodes.forEach((node, index) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "codeBlock") {
      result.push({
        node,
        quoteDepth: context.quoteDepth,
        parentType: context.parentType,
        orderKey: `${context.quoteDepth}:${index}`,
      });
      return;
    }
    if (Array.isArray(node.content) && node.content.length) {
      result.push(
        ...collectCodeBlocks(node.content, {
          quoteDepth: node.type === "blockquote" ? context.quoteDepth + 1 : context.quoteDepth,
          parentType: node.type,
        })
      );
    }
  });
  return result;
}

function buildCodeOperation(block, index, renderInput) {
  const code = sanitizeText(String(block?.node?.text || ""));
  const language = String(block?.node?.attrs?.language || "").trim().toLowerCase();
  const sourceMeta = {
    descriptorId: String(renderInput?.descriptorId || ""),
    parserId: String(renderInput?.parserId || ""),
    entryId: String(renderInput?.entryId || ""),
  };
  const title = buildTextTitle(language ? `${language} 代码块` : "Markdown 代码块");
  const lineCount = countLines(code);
  const initialLayout = resolveImportedTextBoxLayout(code, 16, {
    forceWrap: true,
  });
  return {
    type: "render-code-block",
    sourceNodeType: "codeBlock",
    blockRole: "code-block",
    legacyType: "codeBlock",
    order: index,
    layout: {
      strategy: "flow-stack",
      stackIndex: index,
      quoteDepth: block.quoteDepth,
      gap: 20,
    },
    element: {
      id: createId("code"),
      type: "codeBlock",
      title,
      language,
      text: code,
      plainText: code,
      fontSize: 16,
      width: Math.max(initialLayout.width || 0, estimateCodeWidth(code)),
      height: Math.max(initialLayout.height || 0, estimateCodeHeight(code)),
      x: 0,
      y: 0,
      locked: false,
      theme: "default",
      sourceMeta,
    },
    structure: {
      language,
      lineCount,
      parentType: block.parentType,
      code,
    },
    meta: sourceMeta,
    sourceOrder: deriveNodeSourceOrder(block?.node, index),
  };
}

function estimateCodeWidth(code) {
  const lines = sanitizeText(code || "").split("\n");
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return Math.max(220, Math.min(920, Math.round(64 + longest * 9.2)));
}

function estimateCodeHeight(code) {
  const lines = sanitizeText(code || "").split("\n");
  const lineCount = Math.max(1, lines.length);
  return Math.max(84, Math.round(42 + lineCount * 24));
}

function countLines(code) {
  if (!String(code || "").length) {
    return 0;
  }
  return sanitizeText(code).split("\n").length;
}
