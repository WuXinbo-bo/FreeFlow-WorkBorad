import { normalizeBoard } from "../../elements/index.js";

export const HOST_PERSISTENCE_KIND = "structured-host-board";
export const HOST_PERSISTENCE_VERSION = "1.0.0";

export function serializeHostBoard(board, options = {}) {
  return {
    kind: HOST_PERSISTENCE_KIND,
    version: HOST_PERSISTENCE_VERSION,
    createdAt: Number(options.createdAt) || Date.now(),
    meta: options.meta && typeof options.meta === "object" ? { ...options.meta } : {},
    board: normalizeBoard(board || {}),
  };
}

export function deserializeHostBoard(raw) {
  const payload = migrateHostBoardPayload(parseRawPayload(raw));
  return {
    kind: HOST_PERSISTENCE_KIND,
    version: HOST_PERSISTENCE_VERSION,
    createdAt: Number(payload.createdAt) || Date.now(),
    meta: payload.meta && typeof payload.meta === "object" ? { ...payload.meta } : {},
    board: normalizeBoard(payload.board || {}),
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
      board: normalizeBoard(raw.board || {}),
    };
  }
  return {
    kind: HOST_PERSISTENCE_KIND,
    version: HOST_PERSISTENCE_VERSION,
    createdAt: Date.now(),
    meta: {
      migratedFromLegacy: true,
    },
    board: normalizeBoard(raw),
  };
}

function parseRawPayload(raw) {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? raw : {};
}
