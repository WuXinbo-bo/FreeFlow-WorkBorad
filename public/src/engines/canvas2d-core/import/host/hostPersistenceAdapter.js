import { normalizeBoard } from "../../elements/index.js";
import { toRelativePath, resolveRelativePath } from "../../utils.js";

export const HOST_PERSISTENCE_KIND = "structured-host-board";
export const HOST_PERSISTENCE_VERSION = "1.0.0";

function normalizeSourcePaths(items = [], basePath = "", toRelative = true) {
  if (!Array.isArray(items)) {
    return items;
  }
  return items.map((item) => {
    if (!item || (item.type !== "image" && item.type !== "fileCard")) {
      return item;
    }
    const sourcePath = String(item.sourcePath || "").trim();
    if (!sourcePath) {
      return item;
    }
    // If there's a dataUrl, clear sourcePath (image data is embedded)
    if (item.dataUrl) {
      return { ...item, sourcePath: "" };
    }
    if (toRelative && basePath) {
      // Convert absolute path to relative
      const relativePath = toRelativePath(sourcePath, basePath);
      if (relativePath && !relativePath.startsWith("file:")) {
        return { ...item, sourcePath: relativePath, _relative: true };
      }
    } else if (!toRelative && item._relative && basePath) {
      // Resolve relative path back to absolute
      const absolutePath = resolveRelativePath(sourcePath, basePath);
      return { ...item, sourcePath: absolutePath, _relative: undefined };
    }
    return item;
  });
}

function restoreSourcePaths(board, basePath = "") {
  if (!board || typeof board !== "object") {
    return board;
  }
  const items = normalizeSourcePaths(board.items || [], basePath, false);
  return { ...board, items };
}

export function serializeHostBoard(board, options = {}) {
  const basePath = String(options.meta?.boardFilePath || "").trim();
  // Convert absolute paths to relative for portability
  const normalizedItems = normalizeSourcePaths(board?.items || [], basePath, true);
  const normalizedBoard = normalizeBoard({ ...board, items: normalizedItems });
  return {
    kind: HOST_PERSISTENCE_KIND,
    version: HOST_PERSISTENCE_VERSION,
    createdAt: Number(options.createdAt) || Date.now(),
    meta: options.meta && typeof options.meta === "object" ? { ...options.meta } : {},
    board: normalizedBoard,
  };
}

export function deserializeHostBoard(raw) {
  const payload = migrateHostBoardPayload(parseRawPayload(raw));
  const basePath = String(payload.meta?.boardFilePath || "").trim();
  // Restore relative paths to absolute
  const restoredBoard = restoreSourcePaths(payload.board, basePath);
  return {
    kind: HOST_PERSISTENCE_KIND,
    version: HOST_PERSISTENCE_VERSION,
    createdAt: Number(payload.createdAt) || Date.now(),
    meta: payload.meta && typeof payload.meta === "object" ? { ...payload.meta } : {},
    board: normalizeBoard(restoredBoard || {}),
  };
}

export function migrateHostBoardPayload(raw) {
  if (!raw || typeof raw !== "object") {
    return serializeHostBoard({});
  }
  if (raw.kind === HOST_PERSISTENCE_KIND) {
    return {
      ...raw,
      version: HOST_PERSISTENCE_VERSION,
      board: raw.board && typeof raw.board === "object" ? { ...raw.board } : {},
    };
  }
  return {
    kind: HOST_PERSISTENCE_KIND,
    version: HOST_PERSISTENCE_VERSION,
    createdAt: Date.now(),
    meta: {
      migratedFromLegacy: true,
    },
    board: raw,
  };
}

function parseRawPayload(raw) {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw.replace(/^\uFEFF/, ""));
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? raw : {};
}
