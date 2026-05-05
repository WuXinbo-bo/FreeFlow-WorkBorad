import { normalizeTextElement } from "../../elements/text.js";
import { normalizeCodeBlockElement, updateCodeBlockElement } from "../../elements/codeBlock.js";
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
  const hasExplicitRichTextDocument = Object.prototype.hasOwnProperty.call(payload, "richTextDocument");
  const hasLegacyContentOverride =
    Object.prototype.hasOwnProperty.call(payload, "text") ||
    Object.prototype.hasOwnProperty.call(payload, "plainText") ||
    Object.prototype.hasOwnProperty.call(payload, "html");
  const nextRichTextDocument = hasExplicitRichTextDocument
    ? payload.richTextDocument
    : hasLegacyContentOverride
      ? null
      : item.richTextDocument ?? null;
  return normalizeTextElement({
    ...item,
    text: String(payload.text ?? item.text ?? ""),
    plainText: String(payload.plainText ?? payload.text ?? item.plainText ?? ""),
    html: String(payload.html ?? item.html ?? ""),
    richTextDocument: nextRichTextDocument,
    textBoxLayoutMode: String(payload.textBoxLayoutMode ?? item.textBoxLayoutMode ?? ""),
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
  const code = String(payload.code ?? payload.text ?? item.code ?? item.text ?? "");
  return updateCodeBlockElement(
    item,
    {
      code,
      text: code,
      plainText: code,
      language: String(payload.language ?? item.language ?? ""),
      width: payload.width ?? item.width,
      height: payload.height ?? item.height,
      wrap: Object.prototype.hasOwnProperty.call(payload, "wrap") ? Boolean(payload.wrap) : item.wrap,
      showLineNumbers: Object.prototype.hasOwnProperty.call(payload, "showLineNumbers")
        ? Boolean(payload.showLineNumbers)
        : item.showLineNumbers,
      headerVisible: Object.prototype.hasOwnProperty.call(payload, "headerVisible")
        ? Boolean(payload.headerVisible)
        : item.headerVisible,
      collapsed: Object.prototype.hasOwnProperty.call(payload, "collapsed")
        ? Boolean(payload.collapsed)
        : item.collapsed,
      autoHeight: Object.prototype.hasOwnProperty.call(payload, "autoHeight")
        ? Boolean(payload.autoHeight)
        : item.autoHeight,
      tabSize: payload.tabSize ?? item.tabSize,
      previewMode: payload.previewMode ?? item.previewMode,
      fontSize: payload.fontSize ?? item.fontSize,
    },
    {
      remeasure: true,
    }
  );
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
