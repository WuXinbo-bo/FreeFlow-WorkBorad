import {
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../../protocols/inputDescriptor.js";
import { createCanonicalDocument, createCanonicalNode } from "../../canonical/canonicalDocument.js";

export const CODE_PARSER_ID = "code-parser";

const MIME_LANGUAGE_MAP = Object.freeze({
  "application/json": "json",
  "application/javascript": "javascript",
  "application/typescript": "typescript",
  "text/javascript": "javascript",
  "text/typescript": "typescript",
  "text/x-python": "python",
  "text/x-java-source": "java",
  "text/x-csrc": "c",
  "text/x-c++src": "cpp",
  "text/x-csharp": "csharp",
  "text/x-go": "go",
  "text/x-rustsrc": "rust",
  "text/html": "html",
  "text/css": "css",
  "text/x-sql": "sql",
  "text/x-shellscript": "bash",
  "text/markdown": "markdown",
});

const EXTENSION_LANGUAGE_MAP = Object.freeze({
  py: "python",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  java: "java",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  json: "json",
  html: "html",
  css: "css",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  ps1: "powershell",
  md: "markdown",
  yml: "yaml",
  yaml: "yaml",
  xml: "xml",
});

export function createCodeParser(options = {}) {
  const id = options.id || CODE_PARSER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 45;

  return {
    id,
    version: "1.0.0",
    displayName: "Code Parser",
    priority,
    sourceKinds: [
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
    tags: ["builtin", "code", "source-preserving"],
    supports({ descriptor }) {
      const codeEntries = collectCodeEntries(descriptor);
      if (!codeEntries.length) {
        return { matched: false, score: -1, reason: "no-code-entry" };
      }
      const explicitCodeEntries = codeEntries.filter((entry) => String(entry?.kind || "") === INPUT_ENTRY_KINDS.CODE);
      return {
        matched: true,
        score: explicitCodeEntries.length ? 45 : 30,
        reason: explicitCodeEntries.length ? "explicit-code-entry" : "code-like-entry",
      };
    },
    async parse({ descriptor }) {
      const codeEntries = collectCodeEntries(descriptor);
      if (!codeEntries.length) {
        throw new Error("Code parser requires at least one code-compatible entry.");
      }

      const blocks = codeEntries.map((entry, index) => {
        const code = readEntryCode(entry);
        const language = inferCodeLanguage(entry, code);
        const meta = buildNodeMeta(
          descriptor,
          id,
          `${descriptor?.descriptorId || "code"}-block-${index}`,
          "code"
        );
        return createCanonicalNode({
          type: "codeBlock",
          attrs: language ? { language } : {},
          text: code,
          meta,
        });
      });

      const document = createCanonicalDocument({
        meta: buildDocumentMeta(descriptor, id, ["code"]),
        content: blocks,
      });

      return {
        document,
        stats: {
          sourceEntryCount: codeEntries.length,
          codeBlockCount: blocks.length,
          languages: blocks.map((node) => node.attrs?.language || "").filter(Boolean),
          totalLineCount: codeEntries.reduce((sum, entry) => sum + countLines(readEntryCode(entry)), 0),
        },
      };
    },
  };
}

function collectCodeEntries(descriptor) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  const sourceKind = String(descriptor?.sourceKind || "");
  return entries.filter((entry) => {
    const kind = String(entry?.kind || "");
    if (kind === INPUT_ENTRY_KINDS.CODE) {
      return Boolean(readEntryCode(entry).trim());
    }
    if (sourceKind === INPUT_SOURCE_KINDS.CODE && kind === INPUT_ENTRY_KINDS.TEXT) {
      return Boolean(readEntryCode(entry).trim());
    }
    return false;
  });
}

function readEntryCode(entry) {
  return String(entry?.raw?.code || entry?.raw?.text || "");
}

function buildDocumentMeta(descriptor, parserId, tags = []) {
  return {
    source: {
      kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.CODE,
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
      kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.CODE,
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

function inferCodeLanguage(entry, code) {
  const explicitLanguage = String(entry?.meta?.language || "").trim().toLowerCase();
  if (explicitLanguage) {
    return explicitLanguage;
  }

  const mimeType = String(entry?.mimeType || "").trim().toLowerCase();
  if (mimeType && MIME_LANGUAGE_MAP[mimeType]) {
    return MIME_LANGUAGE_MAP[mimeType];
  }

  const fileName = String(entry?.name || "").trim().toLowerCase();
  const extension = fileName.includes(".") ? fileName.split(".").pop() : String(entry?.meta?.extension || "").trim().toLowerCase();
  if (extension && EXTENSION_LANGUAGE_MAP[extension]) {
    return EXTENSION_LANGUAGE_MAP[extension];
  }

  const normalized = String(code || "");
  if (/^\s*def\s+\w+\s*\(/m.test(normalized) || /^\s*import\s+\w+/m.test(normalized) || /\bprint\(/.test(normalized)) {
    return "python";
  }
  if (/\bconst\b|\blet\b|\bfunction\b|=>/.test(normalized)) {
    return "javascript";
  }
  if (/\binterface\b|\btype\b|\bimplements\b/.test(normalized)) {
    return "typescript";
  }
  if (/\bSELECT\b|\bFROM\b|\bWHERE\b/i.test(normalized)) {
    return "sql";
  }
  if (/^\s*<[^>]+>/.test(normalized) && /<\/[a-z]/i.test(normalized)) {
    return "html";
  }
  if (/^\s*\{[\s\S]*\}\s*$/.test(normalized) && /":\s*/.test(normalized)) {
    return "json";
  }
  if (/^\s*(Get-|Set-|Write-|New-)\w+/m.test(normalized)) {
    return "powershell";
  }
  if (/^\s*#!/.test(normalized) || /\becho\b/.test(normalized)) {
    return "bash";
  }

  return "";
}

function countLines(value) {
  if (!String(value || "").length) {
    return 0;
  }
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").length;
}

