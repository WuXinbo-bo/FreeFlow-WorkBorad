import {
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../../protocols/inputDescriptor.js";
import { createCanonicalDocument, createCanonicalNode } from "../../canonical/canonicalDocument.js";

export const URI_LIST_PARSER_ID = "uri-list-parser";

const SAFE_URI_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

export function createUriListParser(options = {}) {
  const id = options.id || URI_LIST_PARSER_ID;
  return {
    id,
    version: "1.0.0",
    displayName: "URI List Parser",
    priority: Number.isFinite(options.priority) ? options.priority : 35,
    sourceKinds: [INPUT_SOURCE_KINDS.URI_LIST, INPUT_SOURCE_KINDS.MIXED, INPUT_SOURCE_KINDS.UNKNOWN],
    channels: Object.values(INPUT_CHANNELS),
    tags: ["builtin", "uri-list", "link"],
    supports({ descriptor }) {
      const entries = collectUriEntries(descriptor);
      return entries.length
        ? { matched: true, score: 35, reason: "uri-entry-available" }
        : { matched: false, score: -1, reason: "no-uri-entry" };
    },
    async parse({ descriptor }) {
      const candidates = collectUriEntries(descriptor).flatMap((entry) => parseUriLines(entry?.raw?.uri || ""));
      const accepted = candidates.filter((uri) => isSafeUri(uri));
      if (!accepted.length) {
        throw new Error("URI list parser requires at least one safe URI.");
      }
      const content = accepted.map((uri, index) => createCanonicalNode({
        type: "paragraph",
        content: [createCanonicalNode({
          type: "text",
          text: uri,
          marks: [{ type: "link", attrs: { href: uri, target: "_blank" } }],
          meta: buildNodeMeta(descriptor, id, `uri-${index}`),
        })],
        meta: buildNodeMeta(descriptor, id, `uri-paragraph-${index}`),
      }));
      return {
        document: createCanonicalDocument({
          content,
          meta: {
            source: buildSourceMeta(descriptor, id),
            compat: { minReaderVersion: "1.0.0", featureFlags: ["uri-list"], legacyAliases: [] },
            tags: ["uri-list"],
            labels: [],
          },
        }),
        stats: {
          sourceEntryCount: collectUriEntries(descriptor).length,
          uriCount: accepted.length,
          rejectedCount: candidates.length - accepted.length,
        },
      };
    },
  };
}

function collectUriEntries(descriptor) {
  return (Array.isArray(descriptor?.entries) ? descriptor.entries : []).filter(
    (entry) => entry?.kind === INPUT_ENTRY_KINDS.URI && String(entry?.raw?.uri || "").trim()
  );
}

function parseUriLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function isSafeUri(value) {
  try {
    return SAFE_URI_SCHEMES.has(new URL(String(value || "")).protocol.toLowerCase());
  } catch {
    return false;
  }
}

function buildSourceMeta(descriptor, parserId) {
  return {
    kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.URI_LIST,
    channel: descriptor?.channel || "",
    parserId,
    descriptorId: descriptor?.descriptorId || "",
  };
}

function buildNodeMeta(descriptor, parserId, originId) {
  return {
    source: buildSourceMeta(descriptor, parserId),
    compat: { minReaderVersion: "1.0.0", featureFlags: ["uri-list"], legacyAliases: [] },
    originId,
    legacyType: "uri-list",
  };
}
