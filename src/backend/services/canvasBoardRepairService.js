const fs = require("fs/promises");
const path = require("path");
const {
  wrapFreeFlowBoardPayload,
  ensureFreeFlowBoardFileName,
} = require("../models/canvasBoardFileFormat");

const DEFAULT_REPAIRED_VIEW = Object.freeze({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
});

function normalizeText(value = "") {
  return String(value || "").replace(/^\uFEFF/, "");
}

function extractNumericField(text = "", fieldName = "") {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`);
  const match = pattern.exec(text);
  if (!match) {
    return null;
  }
  const numericValue = Number(match[1]);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function extractStringField(text = "", fieldName = "") {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const match = pattern.exec(text);
  if (!match) {
    return "";
  }
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

function findItemsArrayStart(text = "") {
  const itemsKeyIndex = text.indexOf('"items"');
  if (itemsKeyIndex < 0) {
    return -1;
  }
  return text.indexOf("[", itemsKeyIndex);
}

function salvageBoardItemsFromText(text = "") {
  const itemsArrayStart = findItemsArrayStart(text);
  if (itemsArrayStart < 0) {
    return {
      items: [],
      itemsArrayStart: -1,
      lastParsedIndex: -1,
      stopReason: "items-array-not-found",
    };
  }

  const items = [];
  let inString = false;
  let escaping = false;
  let objectDepth = 0;
  let arrayDepth = 1;
  let itemStart = -1;
  let stopReason = "items-array-truncated";
  let lastParsedIndex = itemsArrayStart;

  for (let index = itemsArrayStart + 1; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (arrayDepth === 1 && objectDepth === 0) {
        itemStart = index;
      }
      objectDepth += 1;
      continue;
    }

    if (char === "}") {
      if (objectDepth > 0) {
        objectDepth -= 1;
        if (arrayDepth === 1 && objectDepth === 0 && itemStart >= 0) {
          const rawItem = text.slice(itemStart, index + 1);
          try {
            const parsedItem = JSON.parse(rawItem);
            items.push(parsedItem);
            lastParsedIndex = index;
          } catch {
            stopReason = "item-parse-failed";
            break;
          }
          itemStart = -1;
        }
      }
      continue;
    }

    if (char === "[") {
      arrayDepth += 1;
      continue;
    }

    if (char === "]") {
      arrayDepth -= 1;
      if (arrayDepth === 0) {
        stopReason = "items-array-complete";
        lastParsedIndex = index;
        break;
      }
    }
  }

  return {
    items,
    itemsArrayStart,
    lastParsedIndex,
    stopReason,
  };
}

function deriveBoardPreferences(text = "") {
  const allowLocalFileAccess = /"allowLocalFileAccess"\s*:\s*true/.test(text);
  const backgroundPattern = extractStringField(text, "backgroundPattern") || "dots";
  return {
    allowLocalFileAccess,
    backgroundPattern,
  };
}

function buildRepairedBoard(rawText = "", salvagedItems = []) {
  const updatedAt = extractNumericField(rawText, "updatedAt") || Date.now();
  const createdAt = extractNumericField(rawText, "createdAt") || updatedAt;
  return {
    kind: "structured-host-board",
    version: "1.0.0",
    createdAt,
    meta: {
      boardRepair: {
        repairedAt: Date.now(),
        salvageMode: "valid-prefix-items",
      },
    },
    board: {
      items: salvagedItems,
      selectedIds: [],
      view: { ...DEFAULT_REPAIRED_VIEW },
      preferences: deriveBoardPreferences(rawText),
      updatedAt,
    },
  };
}

async function resolveUniqueRepairedPath(filePath = "") {
  const directoryPath = path.dirname(filePath);
  const extension = path.extname(filePath) || ".freeflow";
  const baseName = path.basename(filePath, extension);
  const normalizedExtension = ensureFreeFlowBoardFileName(`x${extension}`).replace(/^x/, "") || ".freeflow";
  let suffixIndex = 0;
  while (suffixIndex < 9999) {
    const suffix = suffixIndex === 0 ? "_repaired" : `_repaired_${suffixIndex}`;
    const candidatePath = path.join(directoryPath, `${baseName}${suffix}${normalizedExtension}`);
    try {
      await fs.access(candidatePath);
      suffixIndex += 1;
    } catch {
      return candidatePath;
    }
  }
  return path.join(directoryPath, `${baseName}_repaired_${Date.now()}${normalizedExtension}`);
}

async function repairCanvasBoardFile(filePath = "") {
  const targetPath = String(filePath || "").trim();
  if (!targetPath) {
    const error = new Error("filePath is required");
    error.statusCode = 400;
    throw error;
  }

  const rawText = normalizeText(await fs.readFile(targetPath, "utf8"));
  const salvage = salvageBoardItemsFromText(rawText);
  if (!salvage.items.length) {
    const error = new Error("画布文件没有可抢救的完整节点");
    error.statusCode = 422;
    error.code = "CANVAS_BOARD_REPAIR_EMPTY";
    throw error;
  }

  const repairedPayload = buildRepairedBoard(rawText, salvage.items);
  const repairedEnvelope = wrapFreeFlowBoardPayload(repairedPayload, {
    createdAt: repairedPayload.createdAt,
    updatedAt: repairedPayload.board.updatedAt,
  });
  const repairedPath = await resolveUniqueRepairedPath(targetPath);
  await fs.writeFile(repairedPath, JSON.stringify(repairedEnvelope, null, 2), "utf8");

  return {
    ok: true,
    sourceFile: targetPath,
    repairedFile: repairedPath,
    recoveredItemCount: salvage.items.length,
    stopReason: salvage.stopReason,
    warnings:
      salvage.stopReason === "items-array-complete"
        ? []
        : ["只恢复了损坏位置之前已完整闭合的节点，截断尾部内容未被猜测补全。"],
  };
}

module.exports = {
  repairCanvasBoardFile,
  salvageBoardItemsFromText,
};
