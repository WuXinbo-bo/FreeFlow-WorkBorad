import { normalizeFileCardElement } from "../../../elements/fileCard.js";
import { buildFileCardElementFromBridgeOperation } from "./fileCardElementBridge.js";

export const FILE_CARD_LEGACY_ADAPTER_ID = "file-card-legacy-adapter";

export function createFileCardLegacyAdapter(options = {}) {
  const id = options.id || FILE_CARD_LEGACY_ADAPTER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 84;

  return {
    id,
    version: "1.0.0",
    displayName: "FileCard Legacy Adapter",
    priority,
    adapterTypes: ["fileCard"],
    legacyTypes: ["fileCard"],
    tags: ["builtin", "file-card", "legacy-bridge"],
    supports({ compatibility }) {
      const items = collectFileCardItems(compatibility);
      if (!items.length) {
        return { matched: false, score: -1, reason: "no-file-card-items" };
      }
      return {
        matched: true,
        score: items.length >= 2 ? 18 : 12,
        reason: items.length >= 2 ? "multiple-file-card-items" : "file-card-item-available",
      };
    },
    async adapt({ compatibility }) {
      const items = collectFileCardItems(compatibility);
      const operations = items.map((item, index) => buildFileCardOperation(item, index, compatibility));
      return {
        planId: `${id}:${compatibility?.descriptorId || "file-card-bridge-plan"}`,
        kind: "legacy-bridge-plan",
        adapterType: "fileCard",
        operations,
        stats: {
          itemCount: operations.length,
          localFileCount: operations.filter((operation) => Boolean(operation.structure.sourcePath)).length,
          totalSize: operations.reduce((sum, operation) => sum + (Number(operation.structure.size) || 0), 0),
        },
        meta: {
          adapterId: id,
          parserId: String(compatibility?.parserId || ""),
        },
      };
    },
  };
}

function collectFileCardItems(compatibility) {
  const items = Array.isArray(compatibility?.items) ? compatibility.items : [];
  return items.filter((item) => String(item?.legacyType || "") === "fileCard");
}

function buildFileCardOperation(item, index, compatibility) {
  const element = normalizeFileCardElement({
    id: String(item?.originId || ""),
    name: String(item?.name || item?.fileName || "未命名文件"),
    fileName: String(item?.fileName || item?.name || "未命名文件"),
    title: String(item?.title || ""),
    ext: String(item?.ext || ""),
    mime: String(item?.mime || ""),
    sourcePath: String(item?.sourcePath || ""),
    fileId: String(item?.fileId || item?.resourceId || ""),
    size: Number(item?.size) || 0,
    memo: String(item?.memo || ""),
    memoVisible: Boolean(item?.memoVisible),
    x: 0,
    y: 0,
  });

  const operation = {
    type: "bridge-file-card",
    legacyType: "fileCard",
    order: index,
    element,
    structure: {
      entryId: String(item?.entryId || ""),
      originId: String(item?.originId || ""),
      sourcePath: String(item?.sourcePath || ""),
      resourceId: String(item?.resourceId || ""),
      size: Number(item?.size) || 0,
      sizeLabel: String(item?.sizeLabel || ""),
      ext: String(item?.ext || ""),
      mime: String(item?.mime || ""),
    },
    meta: {
      descriptorId: String(compatibility?.descriptorId || ""),
      parserId: String(compatibility?.parserId || ""),
    },
  };
  operation.element = buildFileCardElementFromBridgeOperation(operation);
  return operation;
}
