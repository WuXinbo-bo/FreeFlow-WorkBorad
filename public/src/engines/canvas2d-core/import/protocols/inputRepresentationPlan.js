import {
  INPUT_DESCRIPTOR_STATUS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
  createInputDescriptor,
} from "./inputDescriptor.js";

export const INPUT_REPRESENTATION_STATUS = Object.freeze({
  PLANNED: "planned",
  CONSUMED: "consumed",
  DEDUPLICATED: "deduplicated",
  SKIPPED: "skipped",
  FAILED: "failed",
});

const BODY_ENTRY_PRIORITY = Object.freeze({
  [INPUT_ENTRY_KINDS.HTML]: 80,
  [INPUT_ENTRY_KINDS.MARKDOWN]: 70,
  [INPUT_ENTRY_KINDS.CODE]: 60,
  [INPUT_ENTRY_KINDS.MATH]: 55,
  [INPUT_ENTRY_KINDS.TEXT]: 40,
});

export function buildInputRepresentationPlan(descriptor = {}) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries.filter(Boolean) : [];
  const manifest = entries.map((entry) => createManifestEntry(entry));
  const groups = [];
  const internalEntry = entries.find(
    (entry) => isReadyEntry(entry) && entry.kind === INPUT_ENTRY_KINDS.INTERNAL_PAYLOAD && entry?.raw?.internalPayload
  );

  if (internalEntry) {
    groups.push(createGroup(descriptor, "internal", [internalEntry], groups.length));
    setManifestStatus(manifest, internalEntry, INPUT_REPRESENTATION_STATUS.PLANNED, "lossless-internal-payload");
    entries.forEach((entry) => {
      if (entry !== internalEntry) {
        setManifestStatus(manifest, entry, INPUT_REPRESENTATION_STATUS.DEDUPLICATED, "internal-payload-is-exclusive");
      }
    });
    return createPlan(descriptor, groups, manifest);
  }

  const bodyCandidates = entries
    .filter((entry) => isReadyEntry(entry) && hasBodyPayload(entry))
    .sort(compareBodyEntries);
  const selectedBody = selectPreferredBodyEntry(bodyCandidates);
  if (selectedBody) {
    groups.push(createGroup(descriptor, "body", [selectedBody], groups.length));
    setManifestStatus(manifest, selectedBody, INPUT_REPRESENTATION_STATUS.PLANNED, "preferred-body-representation");
    bodyCandidates.filter((entry) => entry !== selectedBody).forEach((entry) => {
      setManifestStatus(manifest, entry, INPUT_REPRESENTATION_STATUS.DEDUPLICATED, "alternative-body-representation");
    });
  }

  appendIndependentEntryGroups(groups, manifest, descriptor, entries, INPUT_ENTRY_KINDS.IMAGE, "image");
  appendIndependentEntryGroups(groups, manifest, descriptor, entries, INPUT_ENTRY_KINDS.FILE, "file");

  entries
    .filter((entry) => isReadyEntry(entry) && entry.kind === INPUT_ENTRY_KINDS.URI)
    .forEach((entry) => {
      if (selectedBody && isUriDuplicatedByBody(entry, selectedBody)) {
        setManifestStatus(manifest, entry, INPUT_REPRESENTATION_STATUS.DEDUPLICATED, "uri-duplicates-body");
        return;
      }
      groups.push(createGroup(descriptor, "uri", [entry], groups.length));
      setManifestStatus(manifest, entry, INPUT_REPRESENTATION_STATUS.PLANNED, "independent-uri");
    });

  const passthroughEntries = entries.filter((entry) => {
    if (!isReadyEntry(entry) || manifestStatus(manifest, entry) !== INPUT_REPRESENTATION_STATUS.SKIPPED) {
      return false;
    }
    return hasAnyPayload(entry?.raw);
  });
  if (passthroughEntries.length) {
    groups.push(createGroup(descriptor, "passthrough", passthroughEntries, groups.length));
    passthroughEntries.forEach((entry) => {
      setManifestStatus(manifest, entry, INPUT_REPRESENTATION_STATUS.PLANNED, "custom-parser-passthrough");
    });
  }

  return createPlan(descriptor, groups, manifest);
}

function appendIndependentEntryGroups(groups, manifest, descriptor, entries, entryKind, groupKind) {
  entries
    .filter((entry) => isReadyEntry(entry) && entry.kind === entryKind)
    .forEach((entry) => {
      groups.push(createGroup(descriptor, groupKind, [entry], groups.length));
      setManifestStatus(manifest, entry, INPUT_REPRESENTATION_STATUS.PLANNED, `independent-${groupKind}`);
    });
}

function createPlan(descriptor, groups, manifest) {
  return {
    kind: "input-representation-plan-v1",
    descriptorId: String(descriptor?.descriptorId || ""),
    groups,
    manifest,
  };
}

function createGroup(descriptor, kind, entries, index) {
  const groupId = `representation-${index}`;
  return {
    groupId,
    kind,
    index,
    entryIds: entries.map((entry) => String(entry?.entryId || "")),
    descriptor: createInputDescriptor({
      ...descriptor,
      descriptorId:
        Array.isArray(descriptor?.entries) && descriptor.entries.length === entries.length
          ? String(descriptor?.descriptorId || "")
          : `${String(descriptor?.descriptorId || "input")}:${groupId}`,
      sourceKind: inferGroupSourceKind(kind, entries),
      status: INPUT_DESCRIPTOR_STATUS.READY,
      errorCode: "none",
      mimeTypes: entries.map((entry) => String(entry?.mimeType || "")).filter(Boolean),
      entries,
    }),
  };
}

function inferGroupSourceKind(kind, entries) {
  if (kind === "internal") return INPUT_SOURCE_KINDS.INTERNAL_ITEMS;
  if (kind === "image") return INPUT_SOURCE_KINDS.IMAGE_RESOURCE;
  if (kind === "file") return INPUT_SOURCE_KINDS.FILE_RESOURCE;
  if (kind === "uri") return INPUT_SOURCE_KINDS.URI_LIST;
  const entryKind = String(entries?.[0]?.kind || "");
  if (entryKind === INPUT_ENTRY_KINDS.HTML) return INPUT_SOURCE_KINDS.HTML;
  if (entryKind === INPUT_ENTRY_KINDS.MARKDOWN) return INPUT_SOURCE_KINDS.MARKDOWN;
  if (entryKind === INPUT_ENTRY_KINDS.CODE) return INPUT_SOURCE_KINDS.CODE;
  if (entryKind === INPUT_ENTRY_KINDS.MATH) return INPUT_SOURCE_KINDS.MATH_FORMULA;
  if (entryKind === INPUT_ENTRY_KINDS.TEXT) return INPUT_SOURCE_KINDS.PLAIN_TEXT;
  return INPUT_SOURCE_KINDS.UNKNOWN;
}

function compareBodyEntries(left, right) {
  return (BODY_ENTRY_PRIORITY[right.kind] || 0) - (BODY_ENTRY_PRIORITY[left.kind] || 0);
}

function selectPreferredBodyEntry(entries) {
  const candidates = Array.isArray(entries) ? entries : [];
  const htmlEntry = candidates.find((entry) => entry.kind === INPUT_ENTRY_KINDS.HTML) || null;
  const markdownEntry = candidates.find((entry) => entry.kind === INPUT_ENTRY_KINDS.MARKDOWN) || null;
  if (htmlEntry && markdownEntry && markdownAddsMissingSemantics(markdownEntry, htmlEntry)) {
    return markdownEntry;
  }
  return candidates[0] || null;
}

function markdownAddsMissingSemantics(markdownEntry, htmlEntry) {
  const markdown = String(markdownEntry?.raw?.markdown || "");
  const html = String(htmlEntry?.raw?.html || "");
  const checks = [
    { markdown: /^\s{0,3}#{1,6}\s+/m, html: /<h[1-6]\b/i },
    { markdown: /^\s*(?:[-+*]|\d+[.)])\s+/m, html: /<(?:ul|ol|li)\b/i },
    { markdown: /^\s*\|?.+\|.+\r?\n\s*\|?\s*:?-{3,}/m, html: /<table\b/i },
    { markdown: /^\s*```/m, html: /<pre\b|data-ff-code-block/i },
    { markdown: /\$\$[\s\S]+?\$\$|\$[^$\n]+\$/m, html: /data-role=["']math-|data-ff-rich-math|class=["'][^"']*(?:katex|mathjax)/i },
  ];
  return checks.some((check) => check.markdown.test(markdown) && !check.html.test(html));
}

function hasBodyPayload(entry) {
  if (!Object.prototype.hasOwnProperty.call(BODY_ENTRY_PRIORITY, String(entry?.kind || ""))) {
    return false;
  }
  const raw = entry?.raw || {};
  return Boolean(raw.html || raw.markdown || raw.code || raw.latex || raw.mathml || raw.text);
}

function hasAnyPayload(raw = {}) {
  return Boolean(
    raw.text || raw.html || raw.markdown || raw.code || raw.latex || raw.mathml || raw.officeFormula ||
      raw.uri || raw.filePath || raw.imageDataUrl || raw.internalPayload || raw.binaryBase64
  );
}

function isReadyEntry(entry) {
  return String(entry?.status || INPUT_DESCRIPTOR_STATUS.READY) === INPUT_DESCRIPTOR_STATUS.READY;
}

function isUriDuplicatedByBody(uriEntry, bodyEntry) {
  const uris = parseUriList(uriEntry?.raw?.uri || "");
  if (!uris.length) {
    return false;
  }
  const bodyText = normalizeComparableText(
    bodyEntry?.raw?.text || bodyEntry?.raw?.markdown || bodyEntry?.raw?.code || bodyEntry?.raw?.latex || ""
  );
  return uris.length === 1 && normalizeComparableText(uris[0]) === bodyText;
}

function parseUriList(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function normalizeComparableText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function createManifestEntry(entry) {
  return {
    entryId: String(entry?.entryId || ""),
    kind: String(entry?.kind || INPUT_ENTRY_KINDS.UNKNOWN),
    mimeType: String(entry?.mimeType || ""),
    status: INPUT_REPRESENTATION_STATUS.SKIPPED,
    reason: isReadyEntry(entry) ? "no-representation-strategy" : "entry-not-ready",
  };
}

function manifestStatus(manifest, entry) {
  return manifest.find((item) => item.entryId === String(entry?.entryId || ""))?.status || "";
}

function setManifestStatus(manifest, entry, status, reason) {
  const item = manifest.find((candidate) => candidate.entryId === String(entry?.entryId || ""));
  if (!item) {
    return;
  }
  item.status = status;
  item.reason = reason;
}
