import {
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../../protocols/inputDescriptor.js";

export const FILE_RESOURCE_COMPATIBILITY_ADAPTER_ID = "file-resource-compatibility-adapter";

export function createFileResourceCompatibilityAdapter(options = {}) {
  const id = options.id || FILE_RESOURCE_COMPATIBILITY_ADAPTER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 41;

  return {
    id,
    version: "1.0.0",
    displayName: "File Resource / FileCard Compatibility Adapter",
    priority,
    sourceKinds: [
      INPUT_SOURCE_KINDS.FILE_RESOURCE,
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
    tags: ["builtin", "file", "compatibility-adapter", "legacy-file-card"],
    supports({ descriptor }) {
      const fileEntries = collectFileEntries(descriptor);
      if (!fileEntries.length) {
        return { matched: false, score: -1, reason: "no-file-entry" };
      }

      const nonFileReadyEntries = collectNonFileReadyEntries(descriptor);
      if (nonFileReadyEntries.length) {
        return { matched: false, score: -1, reason: "mixed-non-file-entries-present" };
      }

      const explicitFileResource =
        String(descriptor?.sourceKind || "") === INPUT_SOURCE_KINDS.FILE_RESOURCE;

      return {
        matched: true,
        score: explicitFileResource ? 41 : 26,
        reason: explicitFileResource ? "explicit-file-resource" : "file-entry-only",
      };
    },
    async parse({ descriptor }) {
      const fileEntries = collectFileEntries(descriptor);
      if (!fileEntries.length) {
        throw new Error("File resource compatibility adapter requires at least one file entry.");
      }

      const items = fileEntries.map((entry, index) => buildCompatibilityItem(descriptor, entry, index));
      return {
        compatibility: {
          kind: "legacy-element-adapter",
          adapterType: "fileCard",
          parserId: id,
          descriptorId: String(descriptor?.descriptorId || ""),
          items,
        },
        stats: {
          sourceEntryCount: fileEntries.length,
          fileCardCount: items.length,
          localFileCount: items.filter((item) => Boolean(item.sourcePath)).length,
          totalSize: items.reduce((sum, item) => sum + (Number(item.size) || 0), 0),
        },
      };
    },
  };
}

function collectFileEntries(descriptor) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  return entries.filter((entry) => {
    const kind = String(entry?.kind || "");
    if (kind !== INPUT_ENTRY_KINDS.FILE) {
      return false;
    }
    return Boolean(entry?.raw?.filePath || entry?.name);
  });
}

function collectNonFileReadyEntries(descriptor) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  return entries.filter((entry) => {
    const kind = String(entry?.kind || "");
    const status = String(entry?.status || "");
    if (kind === INPUT_ENTRY_KINDS.FILE) {
      return false;
    }
    return status === "ready";
  });
}

function buildCompatibilityItem(descriptor, entry, index) {
  const fileName = normalizeFileName(entry?.name || basenameFromPath(entry?.raw?.filePath || "") || "未命名文件");
  const size = normalizeSize(entry?.size);
  return {
    kind: "legacy-file-card",
    entryId: String(entry?.entryId || ""),
    originId: `${descriptor?.descriptorId || "file"}-file-${index}`,
    legacyType: "fileCard",
    name: fileName,
    fileName,
    title: getFileBaseName(fileName),
    ext: getFileExtension(fileName),
    mime: String(entry?.mimeType || ""),
    sourcePath: String(entry?.raw?.filePath || ""),
    fileId: String(entry?.meta?.fileId || ""),
    size,
    sizeLabel: formatBytes(size),
    resourceId: buildResourceId(descriptor, entry),
    meta: {
      sourceKind: String(descriptor?.sourceKind || INPUT_SOURCE_KINDS.FILE_RESOURCE),
      channel: String(descriptor?.channel || ""),
      parserId: FILE_RESOURCE_COMPATIBILITY_ADAPTER_ID,
      descriptorId: String(descriptor?.descriptorId || ""),
      displayName: String(entry?.meta?.displayName || fileName),
    },
  };
}

function buildResourceId(descriptor, entry) {
  const descriptorId = String(descriptor?.descriptorId || "file");
  const entryId = String(entry?.entryId || "entry");
  return `${descriptorId}:${entryId}`;
}

function normalizeFileName(value) {
  return String(value || "").trim().replace(/[\\/]/g, "/").split("/").pop() || "未命名文件";
}

function basenameFromPath(filePath) {
  return String(filePath || "").trim().replace(/[\\/]/g, "/").split("/").pop() || "";
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

function normalizeSize(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatBytes(bytes) {
  const size = normalizeSize(bytes);
  if (size < 1024) {
    return `${size} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}
