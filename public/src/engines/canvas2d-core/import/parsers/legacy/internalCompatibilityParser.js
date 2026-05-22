import {
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../../protocols/inputDescriptor.js";

export const INTERNAL_COMPATIBILITY_PARSER_ID = "internal-legacy-compatibility-parser";

const SUPPORTED_LEGACY_TYPES = Object.freeze([
  "text",
  "image",
  "fileCard",
  "flowNode",
  "flowEdge",
  "mindNode",
  "mindRelationship",
  "shape",
]);

export function createInternalCompatibilityParser(options = {}) {
  const id = options.id || INTERNAL_COMPATIBILITY_PARSER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 60;

  return {
    id,
    version: "1.0.0",
    displayName: "Internal Legacy Compatibility Parser",
    priority,
    sourceKinds: [
      INPUT_SOURCE_KINDS.INTERNAL_ITEMS,
      INPUT_SOURCE_KINDS.MIXED,
      INPUT_SOURCE_KINDS.UNKNOWN,
    ],
    channels: [
      INPUT_CHANNELS.INTERNAL_COPY,
      INPUT_CHANNELS.PASTE_NATIVE,
      INPUT_CHANNELS.PASTE_CONTEXT_MENU,
      INPUT_CHANNELS.DRAG_DROP,
      INPUT_CHANNELS.PROGRAMMATIC,
    ],
    tags: ["builtin", "internal-payload", "legacy-compatible"],
    supports({ descriptor }) {
      const entries = collectInternalPayloadEntries(descriptor);
      if (!entries.length) {
        return { matched: false, score: -1, reason: "no-internal-payload-entry" };
      }

      const compatibleItems = entries.flatMap((entry) => collectCompatibleItems(entry));
      if (!compatibleItems.length) {
        return { matched: false, score: -1, reason: "no-compatible-items" };
      }

      return {
        matched: true,
        score:
          String(descriptor?.sourceKind || "") === INPUT_SOURCE_KINDS.INTERNAL_ITEMS ? 60 : 44,
        reason:
          String(descriptor?.sourceKind || "") === INPUT_SOURCE_KINDS.INTERNAL_ITEMS
            ? "explicit-internal-items"
            : "internal-payload-available",
      };
    },
    async parse({ descriptor }) {
      const entries = collectInternalPayloadEntries(descriptor);
      if (!entries.length) {
        throw new Error("Internal compatibility parser requires at least one internal payload entry.");
      }

      const items = [];
      entries.forEach((entry, entryIndex) => {
        const compatibleItems = collectCompatibleItems(entry);
        compatibleItems.forEach((rawItem, itemIndex) => {
          const normalized = normalizeLegacySnapshot(rawItem);
          const normalizedType = String(normalized?.type || "");
          items.push({
            kind: "legacy-native-item",
            entryId: String(entry?.entryId || ""),
            originId: `${descriptor?.descriptorId || "internal"}-item-${entryIndex}-${itemIndex}`,
            legacyType: normalizedType,
            item: normalized,
            meta: {
              sourceKind: String(descriptor?.sourceKind || INPUT_SOURCE_KINDS.INTERNAL_ITEMS),
              channel: String(descriptor?.channel || ""),
              parserId: id,
              descriptorId: String(descriptor?.descriptorId || ""),
            },
          });
        });
      });

      return {
        compatibility: {
          kind: "legacy-element-adapter",
          adapterType: "native-items",
          parserId: id,
          descriptorId: String(descriptor?.descriptorId || ""),
          items,
          groups: buildTypeGroups(items),
        },
        stats: {
          sourceEntryCount: entries.length,
          itemCount: items.length,
          typeCounts: buildTypeCounts(items),
        },
      };
    },
  };
}

function collectInternalPayloadEntries(descriptor) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  return entries.filter((entry) => {
    const kind = String(entry?.kind || "");
    return kind === INPUT_ENTRY_KINDS.INTERNAL_PAYLOAD && entry?.raw?.internalPayload;
  });
}

function collectCompatibleItems(entry) {
  const payload = entry?.raw?.internalPayload;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.filter((item) => {
    const normalizedType = inferNormalizedLegacyType(item);
    return SUPPORTED_LEGACY_TYPES.includes(normalizedType);
  });
}

function inferNormalizedLegacyType(item) {
  const legacyKind = String(item?.kind || "").trim().toLowerCase();
  const type = String(item?.type || legacyKind || "").trim().toLowerCase();
  if (type === "shape") {
    return "shape";
  }
  if (type === "image") {
    return "image";
  }
  if (type === "filecard" || type === "file") {
    return "fileCard";
  }
  if (type === "mindnode" || type === "mind") {
    return "mindNode";
  }
  if (type === "mindrelationship" || type === "mind-relationship") {
    return "mindRelationship";
  }
  if (type === "flownode" || type === "flow-node" || type === "node") {
    return "flowNode";
  }
  if (type === "flowedge" || type === "flow-edge" || type === "edge") {
    return "flowEdge";
  }
  return "text";
}

function normalizeLegacySnapshot(item = {}) {
  const type = inferNormalizedLegacyType(item);
  if (type === "image") {
    return {
      id: String(item.id || ""),
      type: "image",
      name: String(item.name || item.fileName || "图片"),
      mime: String(item.mime || item.mimeType || "image/*"),
      source: String(item.source || (item.dataUrl ? "blob" : "path") || "path"),
      sourcePath: String(item.sourcePath || ""),
      fileId: String(item.fileId || ""),
      dataUrl: String(item.dataUrl || ""),
      x: normalizeNumber(item.x),
      y: normalizeNumber(item.y),
      width: normalizePositiveNumber(item.width, 320),
      height: normalizePositiveNumber(item.height, 220),
      naturalWidth: normalizePositiveNumber(item.naturalWidth || item.width, 320),
      naturalHeight: normalizePositiveNumber(item.naturalHeight || item.height, 220),
      memo: String(item.memo || item.note || ""),
      memoVisible: Boolean(item.memoVisible),
    };
  }
  if (type === "fileCard") {
    const fileName = normalizeFileName(item.fileName || item.name || "未命名文件");
    return {
      id: String(item.id || ""),
      type: "fileCard",
      name: fileName,
      fileName,
      title: String(item.title || getFileBaseName(fileName)),
      ext: String(item.ext || item.fileExt || getFileExtension(fileName)),
      mime: String(item.mime || item.mimeType || ""),
      sourcePath: String(item.sourcePath || ""),
      fileId: String(item.fileId || ""),
      size: normalizeNumber(item.size || item.fileSize),
      x: normalizeNumber(item.x),
      y: normalizeNumber(item.y),
      width: normalizePositiveNumber(item.width, 320),
      height: normalizePositiveNumber(item.height, 120),
      marked: Boolean(item.marked),
      memo: String(item.memo || item.note || ""),
      memoVisible: Boolean(item.memoVisible),
    };
  }
  if (type === "flowNode") {
    return {
      id: String(item.id || ""),
      type: "flowNode",
      html: String(item.html || ""),
      plainText: String(item.plainText || item.text || ""),
      wrapMode: "flow",
      x: normalizeNumber(item.x),
      y: normalizeNumber(item.y),
      width: normalizePositiveNumber(item.width, 260),
      height: normalizePositiveNumber(item.height, 120),
      fontSize: normalizePositiveNumber(item.fontSize, 18),
      color: String(item.color || "#0f172a"),
    };
  }
  if (type === "flowEdge") {
    return {
      id: String(item.id || ""),
      type: "flowEdge",
      fromId: String(item.fromId || item.startId || ""),
      fromSide: String(item.fromSide || "right"),
      toId: String(item.toId || item.endId || ""),
      toSide: String(item.toSide || "left"),
      style: normalizeFlowEdgeStyle(item.style),
      arrowDirection: String(item.arrowDirection || "forward") === "backward" ? "backward" : "forward",
    };
  }
  if (type === "mindNode") {
    return {
      id: String(item.id || ""),
      type: "mindNode",
      text: String(item.text || item.plainText || ""),
      x: normalizeNumber(item.x),
      y: normalizeNumber(item.y),
      width: normalizePositiveNumber(item.width, 220),
      height: normalizePositiveNumber(item.height, 96),
      level: normalizeNumber(item.level),
    };
  }
  if (type === "mindRelationship") {
    return {
      id: String(item.id || ""),
      type: "mindRelationship",
      fromId: String(item.fromId || ""),
      toId: String(item.toId || ""),
      createdAt: normalizeNumber(item.createdAt, Date.now()),
    };
  }
  if (type === "shape") {
    return {
      id: String(item.id || ""),
      type: "shape",
      shapeType: normalizeShapeType(item.shapeType),
      x: normalizeNumber(item.x),
      y: normalizeNumber(item.y),
      width: normalizePositiveNumber(item.width, 1),
      height: normalizePositiveNumber(item.height, 1),
      startX: normalizeNumber(item.startX, normalizeNumber(item.x)),
      startY: normalizeNumber(item.startY, normalizeNumber(item.y)),
      endX: normalizeNumber(item.endX, normalizeNumber(item.x) + normalizePositiveNumber(item.width, 1)),
      endY: normalizeNumber(item.endY, normalizeNumber(item.y) + normalizePositiveNumber(item.height, 1)),
      strokeColor: String(item.strokeColor || item.stroke || "#334155"),
      fillColor: String(item.fillColor || item.fill || "transparent"),
      strokeWidth: normalizePositiveNumber(item.strokeWidth, 2),
    };
  }
  return {
    id: String(item.id || ""),
    type: "text",
    text: String(item.text || item.plainText || ""),
    html: String(item.html || ""),
    plainText: String(item.plainText || item.text || ""),
    x: normalizeNumber(item.x),
    y: normalizeNumber(item.y),
    width: normalizePositiveNumber(item.width, 160),
    height: normalizePositiveNumber(item.height, 48),
    fontSize: normalizePositiveNumber(item.fontSize, 20),
    color: String(item.color || "#0f172a"),
    locked: Boolean(item.locked),
  };
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeFileName(value) {
  return String(value || "").trim().replace(/[\\/]/g, "/").split("/").pop() || "未命名文件";
}

function getFileBaseName(fileName) {
  const value = String(fileName || "");
  const index = value.lastIndexOf(".");
  return index > 0 ? value.slice(0, index) : value;
}

function getFileExtension(fileName) {
  const value = String(fileName || "");
  const index = value.lastIndexOf(".");
  return index > 0 && index < value.length - 1 ? value.slice(index + 1).toLowerCase() : "";
}

function normalizeFlowEdgeStyle(value) {
  const style = String(value || "solid").toLowerCase();
  return style === "dashed" || style === "arrow" || style === "solid" ? style : "solid";
}

function normalizeShapeType(value) {
  const shapeType = String(value || "").toLowerCase();
  return ["rect", "ellipse", "line", "arrow", "highlight"].includes(shapeType) ? shapeType : "rect";
}

function buildTypeGroups(items) {
  return SUPPORTED_LEGACY_TYPES.reduce((accumulator, type) => {
    accumulator[type] = items.filter((item) => item.legacyType === type).map((item) => item.originId);
    return accumulator;
  }, {});
}

function buildTypeCounts(items) {
  return SUPPORTED_LEGACY_TYPES.reduce((accumulator, type) => {
    accumulator[type] = items.filter((item) => item.legacyType === type).length;
    return accumulator;
  }, {});
}
