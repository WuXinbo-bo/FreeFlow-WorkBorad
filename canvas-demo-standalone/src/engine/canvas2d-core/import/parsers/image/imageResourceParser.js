import {
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../../protocols/inputDescriptor.js";
import { createCanonicalDocument, createCanonicalNode } from "../../canonical/canonicalDocument.js";

export const IMAGE_RESOURCE_PARSER_ID = "image-resource-parser";

export function createImageResourceParser(options = {}) {
  const id = options.id || IMAGE_RESOURCE_PARSER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 42;

  return {
    id,
    version: "1.0.0",
    displayName: "Image Resource Parser",
    priority,
    sourceKinds: [
      INPUT_SOURCE_KINDS.IMAGE_RESOURCE,
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
    tags: ["builtin", "image", "resource-compatible"],
    supports({ descriptor }) {
      const imageEntries = collectImageEntries(descriptor);
      if (!imageEntries.length) {
        return { matched: false, score: -1, reason: "no-image-entry" };
      }

      const nonImageReadyEntries = collectNonImageReadyEntries(descriptor);
      if (nonImageReadyEntries.length) {
        return { matched: false, score: -1, reason: "mixed-non-image-entries-present" };
      }

      const explicitImageResource =
        String(descriptor?.sourceKind || "") === INPUT_SOURCE_KINDS.IMAGE_RESOURCE;

      return {
        matched: true,
        score: explicitImageResource ? 42 : 28,
        reason: explicitImageResource ? "explicit-image-resource" : "image-entry-only",
      };
    },
    async parse({ descriptor }) {
      const imageEntries = collectImageEntries(descriptor);
      if (!imageEntries.length) {
        throw new Error("Image resource parser requires at least one image entry.");
      }

      const content = imageEntries.map((entry, index) => {
        const attrs = buildImageAttrs(descriptor, entry);
        return createCanonicalNode({
          type: "image",
          attrs,
          meta: buildNodeMeta(
            descriptor,
            id,
            `${descriptor?.descriptorId || "image"}-image-${index}`,
            "image"
          ),
        });
      });

      const document = createCanonicalDocument({
        meta: buildDocumentMeta(descriptor, id, ["image-resource"]),
        content,
      });

      return {
        document,
        stats: {
          sourceEntryCount: imageEntries.length,
          imageCount: content.length,
          localResourceCount: imageEntries.filter((entry) => Boolean(entry?.raw?.filePath)).length,
          embeddedResourceCount: imageEntries.filter((entry) => Boolean(entry?.raw?.imageDataUrl)).length,
        },
      };
    },
  };
}

function collectImageEntries(descriptor) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  return entries.filter((entry) => {
    const kind = String(entry?.kind || "");
    if (kind !== INPUT_ENTRY_KINDS.IMAGE) {
      return false;
    }
    return hasImagePayload(entry);
  });
}

function collectNonImageReadyEntries(descriptor) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  return entries.filter((entry) => {
    const kind = String(entry?.kind || "");
    const status = String(entry?.status || "");
    if (kind === INPUT_ENTRY_KINDS.IMAGE) {
      return false;
    }
    return status === "ready";
  });
}

function hasImagePayload(entry) {
  return Boolean(entry?.raw?.imageDataUrl || entry?.raw?.filePath || entry?.raw?.uri);
}

function buildImageAttrs(descriptor, entry) {
  const displayName = String(entry?.meta?.displayName || entry?.name || "").trim();
  const title = displayName || inferTitleFromPath(entry?.raw?.filePath || "");
  const src = String(entry?.raw?.imageDataUrl || entry?.raw?.filePath || entry?.raw?.uri || "");
  const width = normalizeOptionalNumber(entry?.meta?.width);
  const height = normalizeOptionalNumber(entry?.meta?.height);
  const attrs = {
    src,
    alt: title,
    title,
    resourceId: buildResourceId(descriptor, entry),
  };

  if (width != null) {
    attrs.width = width;
  }
  if (height != null) {
    attrs.height = height;
  }

  return attrs;
}

function buildDocumentMeta(descriptor, parserId, tags = []) {
  return {
    source: {
      kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.IMAGE_RESOURCE,
      channel: descriptor?.channel || "",
      parserId,
      descriptorId: descriptor?.descriptorId || "",
    },
    compat: {
      minReaderVersion: "1.0.0",
      featureFlags: ["image-resource"],
      legacyAliases: ["image"],
    },
    tags,
    labels: [],
  };
}

function buildNodeMeta(descriptor, parserId, originId, legacyType = "") {
  return {
    source: {
      kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.IMAGE_RESOURCE,
      channel: descriptor?.channel || "",
      parserId,
      descriptorId: descriptor?.descriptorId || "",
    },
    compat: {
      minReaderVersion: "1.0.0",
      featureFlags: ["image-resource"],
      legacyAliases: ["image"],
    },
    originId,
    legacyType,
  };
}

function buildResourceId(descriptor, entry) {
  const descriptorId = String(descriptor?.descriptorId || "image");
  const entryId = String(entry?.entryId || "entry");
  return `${descriptorId}:${entryId}`;
}

function inferTitleFromPath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || "";
}

function normalizeOptionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
