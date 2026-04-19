import { normalizeTextElement } from "../../elements/text.js";
import { estimateCodeBlockSize, normalizeCodeBlockElement } from "../../elements/codeBlock.js";
import { normalizeTableElement, normalizeTableStructure } from "../../elements/table.js";
import { normalizeMathElement } from "../../elements/math.js";
import {
  isTaskListTextElement,
  setAllTaskListItemsChecked,
  setTaskListItemChecked,
  toggleTaskListItemChecked,
} from "../renderers/list/taskListInteraction.js";

export const HOST_EDIT_KINDS = Object.freeze({
  TEXT: "text",
  TASK_LIST: "task-list",
  CODE_BLOCK: "code-block",
  TABLE: "table",
  MATH: "math",
});

export function createHostEditProtocol() {
  function beginEdit(item, options = {}) {
    const kind = resolveEditKind(item, options);
    return {
      active: Boolean(kind),
      kind,
      target: String(options.target || ""),
      itemId: String(item?.id || ""),
      meta: buildEditMeta(item, kind),
    };
  }

  function applyEdit(session, item, payload = {}) {
    const kind = String(session?.kind || resolveEditKind(item, payload) || "");
    if (!kind) {
      return item;
    }
    if (kind === HOST_EDIT_KINDS.TASK_LIST) {
      return applyTaskListEdit(item, payload);
    }
    if (kind === HOST_EDIT_KINDS.CODE_BLOCK) {
      return applyCodeBlockEdit(item, payload);
    }
    if (kind === HOST_EDIT_KINDS.TABLE) {
      return applyTableEdit(item, payload);
    }
    if (kind === HOST_EDIT_KINDS.MATH) {
      return applyMathEdit(item, payload);
    }
    return applyTextEdit(item, payload);
  }

  function commitEdit(session, item, payload = {}) {
    return {
      session: {
        ...(session || {}),
        active: false,
        committedAt: Date.now(),
      },
      item: applyEdit(session, item, payload),
    };
  }

  return {
    beginEdit,
    applyEdit,
    commitEdit,
  };
}

export function resolveEditKind(item, options = {}) {
  if (!item || typeof item !== "object") {
    return "";
  }
  if (item.type === "codeBlock") {
    return HOST_EDIT_KINDS.CODE_BLOCK;
  }
  if (item.type === "table") {
    return HOST_EDIT_KINDS.TABLE;
  }
  if (item.type === "mathBlock" || item.type === "mathInline" || item.type === "math") {
    return HOST_EDIT_KINDS.MATH;
  }
  if (item.type === "text" && (options.target === "task-list" || isTaskListTextElement(item))) {
    return HOST_EDIT_KINDS.TASK_LIST;
  }
  if (item.type === "text") {
    return HOST_EDIT_KINDS.TEXT;
  }
  return "";
}

function buildEditMeta(item, kind) {
  return {
    type: String(item?.type || ""),
    kind,
    structuredImportKind: String(item?.structuredImport?.kind || ""),
  };
}

function applyTextEdit(item, payload) {
  return normalizeTextElement({
    ...item,
    text: String(payload.text ?? item.text ?? ""),
    plainText: String(payload.plainText ?? payload.text ?? item.plainText ?? ""),
    html: String(payload.html ?? item.html ?? ""),
  });
}

function applyTaskListEdit(item, payload) {
  if (payload.action === "toggle") {
    return toggleTaskListItemChecked(item, Number(payload.index) || 0);
  }
  if (payload.action === "set-one") {
    return setTaskListItemChecked(item, Number(payload.index) || 0, payload.checked === true);
  }
  if (payload.action === "set-all") {
    return setAllTaskListItemsChecked(item, payload.checked === true);
  }
  return item;
}

function applyCodeBlockEdit(item, payload) {
  const text = String(payload.text ?? item.text ?? "");
  const language = String(payload.language ?? item.language ?? "");
  const size = estimateCodeBlockSize(text, Number(item.fontSize) || 16);
  return normalizeCodeBlockElement({
    ...item,
    text,
    plainText: text,
    language,
    width: payload.width ?? size.width,
    height: payload.height ?? size.height,
  });
}

function applyTableEdit(item, payload) {
  const table = JSON.parse(JSON.stringify(item?.table || {}));
  const rowIndex = Number(payload.rowIndex);
  const cellIndex = Number(payload.cellIndex);
  if (
    Number.isInteger(rowIndex) &&
    rowIndex >= 0 &&
    Number.isInteger(cellIndex) &&
    cellIndex >= 0 &&
    Array.isArray(table.rows?.[rowIndex]?.cells) &&
    table.rows[rowIndex].cells[cellIndex]
  ) {
    const cell = table.rows[rowIndex].cells[cellIndex];
    cell.plainText = String(payload.plainText ?? payload.text ?? cell.plainText ?? "");
    cell.html = String(payload.html ?? cell.html ?? "");
  }
  return normalizeTableElement({
    ...item,
    table: normalizeTableStructure(table),
  });
}

function applyMathEdit(item, payload) {
  return normalizeMathElement({
    ...item,
    formula: String(payload.formula ?? item.formula ?? ""),
    sourceFormat: String(payload.sourceFormat ?? item.sourceFormat ?? "latex"),
    displayMode: Object.prototype.hasOwnProperty.call(payload, "displayMode")
      ? Boolean(payload.displayMode)
      : Boolean(item.displayMode),
  });
}
