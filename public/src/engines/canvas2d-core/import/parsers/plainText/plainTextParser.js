import {
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../../protocols/inputDescriptor.js";
import { createCanonicalDocument, createCanonicalNode } from "../../canonical/canonicalDocument.js";

export const PLAIN_TEXT_PARSER_ID = "plain-text-parser";

export function createPlainTextParser(options = {}) {
  const id = options.id || PLAIN_TEXT_PARSER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 10;

  return {
    id,
    version: "1.0.0",
    displayName: "Plain Text Parser",
    priority,
    sourceKinds: [
      INPUT_SOURCE_KINDS.PLAIN_TEXT,
      INPUT_SOURCE_KINDS.CODE,
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
    tags: ["builtin", "plain-text", "fallback-safe"],
    supports({ descriptor }) {
      const textEntries = collectTextEntries(descriptor);
      if (!textEntries.length) {
        return { matched: false, score: -1, reason: "no-text-entry" };
      }
      const htmlEntries = collectEntriesByKind(descriptor, INPUT_ENTRY_KINDS.HTML);
      if (htmlEntries.length && textEntries.length === 0) {
        return { matched: false, score: -1, reason: "html-without-text" };
      }
      return {
        matched: true,
        score: textEntries.length > 1 ? 15 : 10,
        reason: textEntries.length > 1 ? "multiple-text-entries" : "text-entry-available",
      };
    },
    async parse({ descriptor }) {
      const textEntries = collectTextEntries(descriptor);
      if (!textEntries.length) {
        throw new Error("Plain text parser requires at least one text-compatible entry.");
      }

      const paragraphs = flattenTextEntries(textEntries);
      const document = createCanonicalDocument({
        meta: {
          source: {
            kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.PLAIN_TEXT,
            channel: descriptor?.channel || "",
            parserId: id,
            descriptorId: descriptor?.descriptorId || "",
          },
          compat: {
            minReaderVersion: "1.0.0",
            featureFlags: [],
            legacyAliases: [],
          },
          tags: ["plain-text"],
          labels: [],
        },
        content: paragraphs.map((paragraph, index) => {
          const paragraphNode = createCanonicalNode({
            type: "paragraph",
            meta: {
              source: {
                kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.PLAIN_TEXT,
                channel: descriptor?.channel || "",
                parserId: id,
                descriptorId: descriptor?.descriptorId || "",
              },
              compat: {
                minReaderVersion: "1.0.0",
                featureFlags: [],
                legacyAliases: [],
              },
              originId: `paragraph-${index}`,
              legacyType: "text",
            },
            content: buildInlineContent(paragraph),
          });
          return paragraphNode;
        }),
      });

      return {
        document,
        stats: {
          paragraphCount: paragraphs.length,
          sourceEntryCount: textEntries.length,
        },
      };
    },
  };
}

function collectTextEntries(descriptor) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  return entries.filter((entry) => {
    const kind = String(entry?.kind || "");
    return (
      kind === INPUT_ENTRY_KINDS.TEXT ||
      kind === INPUT_ENTRY_KINDS.CODE ||
      kind === INPUT_ENTRY_KINDS.MATH ||
      (kind === INPUT_ENTRY_KINDS.UNKNOWN && typeof entry?.raw?.text === "string" && entry.raw.text.trim())
    );
  });
}

function collectEntriesByKind(descriptor, kind) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  return entries.filter((entry) => String(entry?.kind || "") === kind);
}

function flattenTextEntries(entries) {
  const paragraphs = [];
  for (const entry of entries) {
    const rawText = readEntryText(entry);
    const nextParagraphs = splitIntoParagraphs(rawText);
    paragraphs.push(...nextParagraphs);
  }
  return paragraphs.length ? paragraphs : [""];
}

function readEntryText(entry) {
  if (entry?.kind === INPUT_ENTRY_KINDS.CODE) {
    return String(entry?.raw?.code || entry?.raw?.text || "");
  }
  if (entry?.kind === INPUT_ENTRY_KINDS.MATH) {
    return String(entry?.raw?.latex || entry?.raw?.text || "");
  }
  return String(entry?.raw?.text || "");
}

function splitIntoParagraphs(text) {
  const normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const parts = normalized
    .split(/\n\s*\n+/g)
    .map((part) => part.replace(/^\n+|\n+$/g, ""))
    .filter((part) => part.length > 0);
  return parts.length ? parts : [""];
}

function buildInlineContent(paragraph) {
  const value = String(paragraph || "");
  if (!value) {
    return [];
  }
  const lines = value.split("\n");
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
      content.push(
        createCanonicalNode({
          type: "hardBreak",
        })
      );
    }
  });
  return content;
}
