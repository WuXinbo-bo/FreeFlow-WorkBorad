import {
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../../protocols/inputDescriptor.js";
import { createCanonicalDocument } from "../../canonical/canonicalDocument.js";
import { parseHtmlEntriesToCanonical } from "../html/htmlParser.js";
import { renderMarkdownHtml } from "../../../textModel/markdownRuntime.js";

export const MARKDOWN_PARSER_ID = "markdown-parser";

export function createMarkdownParser(options = {}) {
  const id = options.id || MARKDOWN_PARSER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 35;

  return {
    id,
    version: "1.0.0",
    displayName: "Markdown / GFM Parser",
    priority,
    sourceKinds: [
      INPUT_SOURCE_KINDS.MARKDOWN,
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
    tags: ["builtin", "markdown", "gfm"],
    supports({ descriptor }) {
      const markdownEntries = collectMarkdownEntries(descriptor);
      if (!markdownEntries.length) {
        return { matched: false, score: -1, reason: "no-markdown-entry" };
      }
      let score = 30;
      if (markdownEntries.some((entry) => looksLikeGfm(String(entry?.raw?.markdown || "")))) {
        score += 10;
      }
      return {
        matched: true,
        score,
        reason: "markdown-entry-available",
      };
    },
    async parse({ descriptor }) {
      const markdownEntries = collectMarkdownEntries(descriptor);
      if (!markdownEntries.length) {
        throw new Error("Markdown parser requires at least one markdown entry.");
      }

      const blocks = [];
      const stats = {
        sourceEntryCount: markdownEntries.length,
        headingCount: 0,
        listCount: 0,
        taskListCount: 0,
        tableCount: 0,
        codeBlockCount: 0,
        blockquoteCount: 0,
        footnoteCount: 0,
        mathBlockCount: 0,
        paragraphCount: 0,
      };

      markdownEntries.forEach((entry, index) => {
        const markdown = String(entry?.raw?.markdown || "");
        if (!markdown.trim()) return;
        const parsed = parseHtmlEntriesToCanonical({
          descriptor, parserId: id, documentTags: ["markdown", "gfm"], originPrefixBase: `md-entry-${index}`,
          entries: [{ raw: { html: renderMarkdownHtml(markdown) } }],
        });
        for (const key of Object.keys(stats)) {
          if (key !== "sourceEntryCount") stats[key] += Number(parsed.stats[key] || 0);
        }
        const countExtensions = nodes => nodes.forEach(node => {
          const key = { taskList: "taskListCount", footnote: "footnoteCount", mathBlock: "mathBlockCount", blockquote: "blockquoteCount" }[node.type];
          if (key) stats[key] += 1;
          countExtensions(node.content || []);
        });
        countExtensions(parsed.document.content);
        blocks.push(...parsed.document.content);
      });

      const document = createCanonicalDocument({
        meta: buildDocumentMeta(descriptor, id, ["markdown", "gfm"]),
        content: blocks,
      });

      stats.paragraphCount = document.content.filter((node) => node.type === "paragraph").length;

      return {
        document,
        stats,
      };
    },
  };
}

function collectMarkdownEntries(descriptor) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  return entries.filter((entry) => {
    const kind = String(entry?.kind || "");
    return kind === INPUT_ENTRY_KINDS.MARKDOWN && typeof entry?.raw?.markdown === "string" && entry.raw.markdown.trim();
  });
}

function looksLikeGfm(markdown) {
  const value = String(markdown || "");
  return (
    /^\s*[-*+]\s+\[[ xX]\]\s+/m.test(value) ||
    /^\|.+\|\s*$/m.test(value) ||
    /^\[\^[^\]]+\]:/m.test(value) ||
    /^```/m.test(value)
  );
}

function buildDocumentMeta(descriptor, parserId, tags = []) {
  return {
    source: {
      kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.MARKDOWN,
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
