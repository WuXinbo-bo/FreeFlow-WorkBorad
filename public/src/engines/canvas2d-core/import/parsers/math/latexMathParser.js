import { readLatexSpan, normalizeLatexSource } from "../../../textModel/latexSyntax.js";
import {
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../../protocols/inputDescriptor.js";
import { createCanonicalDocument, createCanonicalNode } from "../../canonical/canonicalDocument.js";

export const LATEX_MATH_PARSER_ID = "latex-math-parser";

export function createLatexMathParser(options = {}) {
  const id = options.id || LATEX_MATH_PARSER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 50;

  return {
    id,
    version: "1.0.0",
    displayName: "LaTeX Math Parser",
    priority,
    sourceKinds: [
      INPUT_SOURCE_KINDS.MATH_FORMULA,
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
    tags: ["builtin", "math", "latex"],
    supports({ descriptor }) {
      const mathEntries = collectMathEntries(descriptor);
      if (!mathEntries.length) {
        return { matched: false, score: -1, reason: "no-math-entry" };
      }
      const explicitMathEntries = mathEntries.filter((entry) => String(entry?.kind || "") === INPUT_ENTRY_KINDS.MATH);
      return {
        matched: true,
        score: explicitMathEntries.length ? 50 : 35,
        reason: explicitMathEntries.length ? "explicit-math-entry" : "math-like-text-entry",
      };
    },
    async parse({ descriptor }) {
      const mathEntries = collectMathEntries(descriptor);
      if (!mathEntries.length) {
        throw new Error("LaTeX math parser requires at least one math-compatible entry.");
      }

      const blocks = [];
      const stats = {
        sourceEntryCount: mathEntries.length,
        mathBlockCount: 0,
        mathInlineCount: 0,
        paragraphCount: 0,
      };

      mathEntries.forEach((entry, index) => {
        const raw = normalizeMathSource(readEntryMath(entry));
        if (!raw.trim()) {
          return;
        }
        const parsedBlocks = parseMathEntryContent(raw, {
          descriptor,
          parserId: id,
          originPrefix: `${descriptor?.descriptorId || "math"}-${index}`,
          stats,
          explicitMathEntry: String(entry?.kind || "") === INPUT_ENTRY_KINDS.MATH,
        });
        blocks.push(...parsedBlocks);
      });

      const document = createCanonicalDocument({
        meta: buildDocumentMeta(descriptor, id, ["math", "latex"]),
        content: blocks,
      });

      return {
        document,
        stats,
      };
    },
  };
}

function collectMathEntries(descriptor) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  const sourceKind = String(descriptor?.sourceKind || "");
  return entries.filter((entry) => {
    const kind = String(entry?.kind || "");
    if (kind === INPUT_ENTRY_KINDS.MATH) {
      return Boolean(readEntryMath(entry).trim());
    }
    if (sourceKind === INPUT_SOURCE_KINDS.MATH_FORMULA && kind === INPUT_ENTRY_KINDS.TEXT) {
      return Boolean(readEntryMath(entry).trim());
    }
    return false;
  });
}

function readEntryMath(entry) {
  return String(entry?.raw?.latex || entry?.raw?.text || "");
}

function buildDocumentMeta(descriptor, parserId, tags = []) {
  return {
    source: {
      kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.MATH_FORMULA,
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
      kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.MATH_FORMULA,
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

function normalizeMathSource(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseMathEntryContent(content, context) {
  const trimmed = String(content || "").trim();
  if (!trimmed) {
    return [];
  }

  if (isDisplayWrapped(trimmed)) {
    context.stats.mathBlockCount += 1;
    return [createMathBlockNode(stripDisplayWrapper(trimmed), context, `${context.originPrefix}-display`)];
  }

  if (context.explicitMathEntry) {
    if (trimmed.includes("\n") || looksLikeMathExpression(trimmed)) {
      context.stats.mathBlockCount += 1;
      return [createMathBlockNode(trimmed, context, `${context.originPrefix}-standalone`)];
    }
  }

  const paragraphs = splitParagraphs(content);
  return paragraphs.map((paragraph, index) => {
    const inlineContent = parseMathInlineContent(paragraph, context, `${context.originPrefix}-paragraph-${index}`);
    context.stats.paragraphCount += 1;
    return createCanonicalNode({
      type: "paragraph",
      meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-paragraph-${index}`, "latex-text"),
      content: inlineContent,
    });
  });
}

function splitParagraphs(content) {
  return normalizeMathSource(content)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function createMathBlockNode(text, context, originId) {
  return createCanonicalNode({
    type: "mathBlock",
    attrs: {
      sourceFormat: "latex",
      displayMode: true,
    },
    text: normalizeLatexSource(text),
    meta: buildNodeMeta(context.descriptor, context.parserId, originId, "latex-block"),
  });
}

function createMathInlineNode(text) {
  return createCanonicalNode({
    type: "mathInline",
    attrs: {
      sourceFormat: "latex",
      displayMode: false,
    },
    text: normalizeLatexSource(text),
  });
}

function parseMathInlineContent(text, context, originId) {
  const value = normalizeMathSource(text);
  const result = [];
  let cursor = 0;
  while (cursor < value.length) {
    const next = findNextInlineMath(value, cursor);
    if (!next) {
      pushTextNodes(result, value.slice(cursor));
      break;
    }
    if (next.index > cursor) {
      pushTextNodes(result, value.slice(cursor, next.index));
    }
    context.stats.mathInlineCount += 1;
    result.push(createMathInlineNode(next.content));
    cursor = next.end;
  }

  if (!result.length && looksLikeMathExpression(value) && !hasSurroundingText(value)) {
    context.stats.mathInlineCount += 1;
    return [createMathInlineNode(value)];
  }

  return compactInlineNodes(result);
}

function findNextInlineMath(text, startIndex) {
  for (let index = startIndex; index < text.length; index += 1) {
    if (text[index] !== "$" && text[index] !== "\\") continue;
    const span = readLatexSpan(text, index);
    if (span) return { index, end: span.end, content: span.formula };
    if (text.startsWith("$$", index)) index += 1;
  }
  return null;
}

function isDisplayWrapped(value) {
  const span = readLatexSpan(value);
  return span?.displayMode && span.end === value.length;
}

function stripDisplayWrapper(value) {
  return normalizeLatexSource(value);
}

function hasSurroundingText(value) {
  return /[。，“”‘’；：！？,.!?]/.test(value) || /\s/.test(value);
}

function looksLikeMathExpression(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  if (/^\d+(?:\.\d{1,2})?$/.test(text)) {
    return false;
  }
  if (/^[A-Za-z]{0,2}\d+(?:\.\d{1,2})?$/.test(text)) {
    return false;
  }
  return (
    /\\[A-Za-z]+/.test(text) ||
    /[_^{}]/.test(text) ||
    /[=+\-*/<>]/.test(text) ||
    /[A-Za-z]\s*[=+\-*/^_]\s*[A-Za-z0-9]/.test(text) ||
    /\\frac|\\int|\\sum|\\sqrt|\\alpha|\\beta|\\gamma/.test(text)
  );
}

function pushTextNodes(target, value) {
  const normalized = String(value || "");
  if (!normalized) {
    return;
  }
  const lines = normalized.split("\n");
  lines.forEach((line, index) => {
    if (line) {
      const last = target[target.length - 1];
      if (last?.type === "text" && (!last.marks || !last.marks.length)) {
        last.text += line;
      } else {
        target.push(
          createCanonicalNode({
            type: "text",
            text: line,
          })
        );
      }
    }
    if (index < lines.length - 1) {
      target.push(createCanonicalNode({ type: "hardBreak" }));
    }
  });
}

function compactInlineNodes(nodes) {
  const result = [];
  (Array.isArray(nodes) ? nodes : []).forEach((node) => {
    if (!node) {
      return;
    }
    if (node.type === "text" && !String(node.text || "").trim()) {
      return;
    }
    const last = result[result.length - 1];
    if (
      last?.type === "text" &&
      node.type === "text" &&
      JSON.stringify(last.marks || []) === JSON.stringify(node.marks || [])
    ) {
      last.text += node.text;
      return;
    }
    result.push(node);
  });
  return result;
}
