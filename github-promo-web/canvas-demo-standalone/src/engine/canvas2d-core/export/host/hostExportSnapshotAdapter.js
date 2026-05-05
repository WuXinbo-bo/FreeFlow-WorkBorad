import { buildExportReadyBoardItems } from "../buildExportReadyBoardItems.js";
import { getExportBounds } from "../renderBoardToCanvas.js";
import { clone, htmlToPlainText, sanitizeText } from "../../utils.js";

function getCardPairId(item, itemMap = new Map()) {
  if (!item || (item.type !== "fileCard" && item.type !== "image")) {
    return "";
  }
  const sourcePath = String(item.sourcePath || "").trim();
  const fileId = String(item.fileId || "").trim();
  for (const candidate of itemMap.values()) {
    if (!candidate || candidate.id === item.id) {
      continue;
    }
    if (candidate.type !== "fileCard" && candidate.type !== "image") {
      continue;
    }
    if (candidate.type === item.type) {
      continue;
    }
    const candidateFileId = String(candidate.fileId || "").trim();
    const candidateSourcePath = String(candidate.sourcePath || "").trim();
    if (fileId && candidateFileId && fileId === candidateFileId) {
      return candidate.id;
    }
    if (sourcePath && candidateSourcePath && sourcePath === candidateSourcePath) {
      return candidate.id;
    }
  }
  return "";
}

export function collectCardLinkedItems(items = [], boardItems = []) {
  const itemMap = new Map((Array.isArray(boardItems) ? boardItems : []).map((entry) => [entry.id, entry]));
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item) {
      return;
    }
    map.set(item.id, item);
    const pairId = getCardPairId(item, itemMap);
    if (pairId && itemMap.has(pairId)) {
      map.set(pairId, itemMap.get(pairId));
    }
  });
  return Array.from(map.values());
}

function resolveSnapshotItems(board, options = {}) {
  const items = Array.isArray(board?.items) ? board.items : [];
  const selectedIds = Array.isArray(board?.selectedIds) ? board.selectedIds : [];
  const scope = String(options.scope || (options.selectedOnly ? "selection" : "board")).trim().toLowerCase();
  let exportItems = [];
  if (scope === "items") {
    exportItems = Array.isArray(options.items) ? options.items.filter(Boolean) : [];
  } else if (scope === "selection") {
    exportItems = items.filter((item) => selectedIds.includes(item.id));
  } else {
    exportItems = items.slice();
  }
  if (options.includeLinkedItems !== false) {
    exportItems = collectCardLinkedItems(exportItems, items);
  }
  return {
    scope: scope === "items" || scope === "selection" ? scope : "board",
    items: exportItems,
  };
}

function buildExportSummary(items = []) {
  return {
    typeCounts: items.reduce((counts, item) => {
      const type = String(item?.type || "unknown");
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {}),
    text: items
      .map((item) =>
        sanitizeText(item?.plainText || item?.text || item?.title || item?.name || htmlToPlainText(item?.html || ""))
      )
      .filter(Boolean)
      .join("\n"),
  };
}

export function buildHostExportSnapshot(board, options = {}) {
  const { scope, items } = resolveSnapshotItems(board, options);
  const preparedItems = buildExportReadyBoardItems(items);
  const bounds =
    typeof options.getElementBounds === "function"
      ? getExportBounds(preparedItems, {
          getElementBounds: options.getElementBounds,
          getFlowEdgeBounds: options.getFlowEdgeBounds,
        })
      : null;
  return {
    kind: "host-export-snapshot",
    scope,
    selectedOnly: scope === "selection",
    itemCount: preparedItems.length,
    items: preparedItems,
    bounds,
    summary: buildExportSummary(preparedItems),
    view: board?.view ? clone(board.view) : null,
  };
}
