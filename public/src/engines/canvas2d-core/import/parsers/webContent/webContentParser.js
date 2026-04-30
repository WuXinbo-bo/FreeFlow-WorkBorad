import {
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../../protocols/inputDescriptor.js";
import {
  HTML_PARSER_ID,
  extractTextContent,
  parseHtmlEntriesToCanonical,
  parseHtmlToTree,
  serializeRawNode,
  walkRawTree,
} from "../html/htmlParser.js";

export const WEB_CONTENT_PARSER_ID = "web-content-parser";

const STRONG_CONTENT_TAGS = new Set(["article", "main"]);
const WEAK_CONTENT_TAGS = new Set(["section", "div"]);
const NOISE_TAGS = new Set(["nav", "aside", "footer", "form", "button", "menu", "dialog", "script", "style", "noscript"]);
const NOISE_NAME_PATTERNS = [
  /nav/i,
  /sidebar/i,
  /comment/i,
  /share/i,
  /toolbar/i,
  /popup/i,
  /modal/i,
  /advert/i,
  /\bad(s|vert)?\b/i,
  /promo/i,
  /banner/i,
  /related/i,
  /recommend/i,
];
const CONTENT_NAME_PATTERNS = [
  /article/i,
  /\bmain\b/i,
  /content/i,
  /post/i,
  /entry/i,
  /markdown/i,
  /body/i,
  /read/i,
];

export function createWebContentParser(options = {}) {
  const id = options.id || WEB_CONTENT_PARSER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 40;

  return {
    id,
    version: "1.0.0",
    displayName: "Web Content Parser",
    priority,
    sourceKinds: [
      INPUT_SOURCE_KINDS.HTML,
      INPUT_SOURCE_KINDS.MIXED,
      INPUT_SOURCE_KINDS.UNKNOWN,
    ],
    channels: [
      INPUT_CHANNELS.PASTE_NATIVE,
      INPUT_CHANNELS.PASTE_CONTEXT_MENU,
      INPUT_CHANNELS.DRAG_DROP,
      INPUT_CHANNELS.PROGRAMMATIC,
    ],
    tags: ["builtin", "web-content", "article-extraction"],
    supports({ descriptor }) {
      const htmlEntries = collectHtmlEntries(descriptor);
      if (!htmlEntries.length) {
        return { matched: false, score: -1, reason: "no-html-entry" };
      }
      if (isDragHtmlFragmentDescriptor(descriptor)) {
        return {
          matched: false,
          score: -1,
          reason: "drag-html-fragment-prefers-generic-html-parser",
        };
      }
      const sourceUrl = String(descriptor?.sourceUrl || "");
      const score =
        (sourceUrl ? 20 : 0) +
        (htmlEntries.some((entry) => /<\s*(article|main)\b/i.test(String(entry?.raw?.html || ""))) ? 25 : 10);
      return {
        matched: true,
        score,
        reason: sourceUrl ? "web-source-url-and-html" : "html-with-web-structure",
      };
    },
    async parse({ descriptor }) {
      const htmlEntries = collectHtmlEntries(descriptor);
      if (!htmlEntries.length) {
        throw new Error("Web content parser requires at least one html entry.");
      }

      const extractedEntries = [];
      const extractionStats = {
        sourceEntryCount: htmlEntries.length,
        extractedEntryCount: 0,
        extractionMode: "web-content",
        fallbackToGenericHtml: 0,
        candidateScore: 0,
      };

      htmlEntries.forEach((entry, index) => {
        const html = String(entry?.raw?.html || "");
        const extracted = extractPrimaryContentHtml(html);
        if (extracted.ok && extracted.html.trim()) {
          extractionStats.extractedEntryCount += 1;
          extractionStats.candidateScore = Math.max(extractionStats.candidateScore, extracted.score);
          extractedEntries.push({
            ...entry,
            raw: {
              ...entry.raw,
              html: extracted.html,
            },
          });
          return;
        }
        extractionStats.fallbackToGenericHtml += 1;
        extractedEntries.push(entry);
      });

      const parsed = parseHtmlEntriesToCanonical({
        descriptor,
        entries: extractedEntries,
        parserId: id,
        documentTags: ["html", "web-content"],
        originPrefixBase: "web-entry",
      });

      return {
        document: parsed.document,
        stats: {
          ...parsed.stats,
          ...extractionStats,
        },
        meta: {
          extractionFallbackParserId: HTML_PARSER_ID,
        },
      };
    },
  };
}

function isDragHtmlFragmentDescriptor(descriptor) {
  const channel = String(descriptor?.channel || "").trim();
  if (channel !== INPUT_CHANNELS.DRAG_DROP) {
    return false;
  }
  const tags = new Set((Array.isArray(descriptor?.tags) ? descriptor.tags : []).map((tag) => String(tag || "").trim()));
  if (tags.has("rich-html") || tags.has("contains-html")) {
    return true;
  }
  const origin = String(descriptor?.context?.origin || "").trim();
  return origin === "engine-drop-html";
}

function collectHtmlEntries(descriptor) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  return entries.filter((entry) => {
    const kind = String(entry?.kind || "");
    return kind === INPUT_ENTRY_KINDS.HTML && typeof entry?.raw?.html === "string" && entry.raw.html.trim();
  });
}

export function extractPrimaryContentHtml(html) {
  const root = parseHtmlToTree(String(html || ""));
  const candidates = [];

  walkRawTree(root, (node) => {
    if (node?.type !== "element" || node.tagName === "root") {
      return;
    }
    if (NOISE_TAGS.has(node.tagName)) {
      return;
    }
    const score = scoreCandidate(node);
    if (score > 0) {
      candidates.push({ node, score });
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] || null;
  if (!best || best.score < 50) {
    return {
      ok: false,
      score: best?.score || 0,
      html: "",
    };
  }

  const cleaned = pruneNoiseNodes(cloneRawNode(best.node), true);
  const serialized = serializePreferredContent(cleaned);
  const textLength = extractTextContent(cleaned, { preserveWhitespace: false }).trim().length;
  if (!serialized.trim() || textLength < 20) {
    return {
      ok: false,
      score: best.score,
      html: "",
    };
  }

  return {
    ok: true,
    score: best.score,
    html: serialized,
  };
}

function serializePreferredContent(node) {
  if (!node || node.type !== "element") {
    return "";
  }
  if (["article", "main", "section", "div"].includes(node.tagName)) {
    const childHtml = (Array.isArray(node.children) ? node.children : []).map(serializeRawNode).join("").trim();
    if (childHtml) {
      return childHtml;
    }
  }
  return serializeRawNode(node);
}

function scoreCandidate(node) {
  const textLength = extractTextContent(node, { preserveWhitespace: false }).trim().length;
  if (textLength < 20) {
    return 0;
  }

  let score = Math.min(80, Math.floor(textLength / 8));
  if (STRONG_CONTENT_TAGS.has(node.tagName)) {
    score += 80;
  } else if (WEAK_CONTENT_TAGS.has(node.tagName)) {
    score += 20;
  }

  const names = [node.attrs?.id, node.attrs?.class].filter(Boolean).join(" ");
  if (names) {
    CONTENT_NAME_PATTERNS.forEach((pattern) => {
      if (pattern.test(names)) {
        score += 25;
      }
    });
    NOISE_NAME_PATTERNS.forEach((pattern) => {
      if (pattern.test(names)) {
        score -= 60;
      }
    });
  }

  const paragraphCount = countDescendants(node, (child) => child?.type === "element" && child.tagName === "p");
  const headingCount = countDescendants(node, (child) => child?.type === "element" && /^h[1-6]$/.test(child.tagName));
  const imageCount = countDescendants(node, (child) => child?.type === "element" && child.tagName === "img");
  score += paragraphCount * 10;
  score += headingCount * 8;
  score += Math.min(imageCount * 3, 15);

  if (NOISE_TAGS.has(node.tagName)) {
    score -= 100;
  }

  return score;
}

function pruneNoiseNodes(node, isRoot = false) {
  if (!node || node.type !== "element") {
    return node;
  }
  const nextChildren = [];
  (Array.isArray(node.children) ? node.children : []).forEach((child) => {
    if (child?.type !== "element") {
      nextChildren.push(child);
      return;
    }
    if (shouldDropNode(child)) {
      return;
    }
    nextChildren.push(pruneNoiseNodes(child, false));
  });
  node.children = nextChildren;

  if (!isRoot && !STRONG_CONTENT_TAGS.has(node.tagName) && !extractTextContent(node, { preserveWhitespace: false }).trim()) {
    return {
      ...node,
      children: [],
    };
  }
  return node;
}

function shouldDropNode(node) {
  if (NOISE_TAGS.has(node?.tagName)) {
    return true;
  }
  const names = [node?.attrs?.id, node?.attrs?.class].filter(Boolean).join(" ");
  return NOISE_NAME_PATTERNS.some((pattern) => pattern.test(names));
}

function countDescendants(node, predicate) {
  let count = 0;
  walkRawTree(node, (child) => {
    if (child !== node && predicate(child)) {
      count += 1;
    }
  });
  return count;
}

function cloneRawNode(node) {
  if (!node || typeof node !== "object") {
    return node;
  }
  if (node.type === "text") {
    return { ...node };
  }
  return {
    ...node,
    attrs: { ...(node.attrs || {}) },
    children: (Array.isArray(node.children) ? node.children : []).map(cloneRawNode),
  };
}
