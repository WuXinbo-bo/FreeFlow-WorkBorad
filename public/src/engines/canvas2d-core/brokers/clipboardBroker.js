import { clone } from "../utils.js";
import {
  CANVAS_OPERATION_STATUS,
  createCanvasOperationResult,
} from "../operations/canvasOperationResult.js";

function getItemLabel(item = {}) {
  return (
    item.title ||
    item.name ||
    item.shapeType ||
    item.type ||
    "元素"
  );
}

function buildSummaryText(items = []) {
  return items.map((item) => getItemLabel(item)).join("\n");
}

function createClipboardId() {
  return globalThis.crypto?.randomUUID?.() || `clipboard_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildPlainText(items = []) {
  return items
    .map((item) => {
      if (item?.type === "text") {
        return item.plainText || item.text || "";
      }
      if (item?.type === "codeBlock") {
        const language = String(item?.language || "").trim().toLowerCase();
        const code = String(item?.plainText || item?.text || item?.code || "").trim();
        return language && code ? `${language}\n${code}` : code || getItemLabel(item);
      }
      if (item?.type === "table") {
        const rows = Array.isArray(item?.table?.rows) ? item.table.rows : [];
        const text = rows
          .map((row) =>
            (Array.isArray(row?.cells) ? row.cells : [])
              .map((cell) => String(cell?.plainText || "").trim())
              .join("\t")
          )
          .join("\n")
          .trim();
        return text || getItemLabel(item);
      }
      if (item?.type === "mathBlock" || item?.type === "mathInline") {
        return String(item?.fallbackText || item?.text || item?.formula || "").trim() || getItemLabel(item);
      }
      return getItemLabel(item);
    })
    .join("\n")
    .trim();
}

function buildHtml(items = []) {
  const htmlItems = items
    .map((item) => {
      if (item?.type === "text" && item.html) {
        return `<div>${item.html}</div>`;
      }
      if (item?.type === "codeBlock") {
        const code = String(item?.plainText || item?.text || item?.code || "");
        const language = String(item?.language || "").trim().toLowerCase();
        return `<pre data-copy-role="code-block"${language ? ` data-language="${escapeAttribute(language)}"` : ""}><code>${escapeHtml(code)}</code></pre>`;
      }
      if (item?.type === "table") {
        const rows = Array.isArray(item?.table?.rows) ? item.table.rows : [];
        return `<table data-copy-role="table">${rows
          .map((row) => {
            const cells = Array.isArray(row?.cells) ? row.cells : [];
            return `<tr>${cells
              .map((cell) => {
                const tag = cell?.header ? "th" : "td";
                const attrs = [];
                if (Number(cell?.colSpan) > 1) attrs.push(` colspan="${Number(cell.colSpan)}"`);
                if (Number(cell?.rowSpan) > 1) attrs.push(` rowspan="${Number(cell.rowSpan)}"`);
                if (cell?.align) attrs.push(` align="${escapeAttribute(cell.align)}"`);
                const body = String(cell?.html || "").trim() || escapeHtml(cell?.plainText || "");
                return `<${tag}${attrs.join("")}>${body}</${tag}>`;
              })
              .join("")}</tr>`;
          })
          .join("")}</table>`;
      }
      if (item?.type === "mathBlock" || item?.type === "mathInline") {
        const fallbackText = String(item?.fallbackText || item?.text || item?.formula || "").trim();
        if (!fallbackText) {
          return "";
        }
        return `<span data-copy-role="${item?.type === "mathInline" ? "math-inline" : "math-block"}">${escapeHtml(fallbackText)}</span>`;
      }
      return "";
    })
    .filter(Boolean);
  return htmlItems.join("");
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function extractFilePaths(items = []) {
  return items
    .filter((item) => item?.type === "fileCard" || item?.type === "image")
    .map((item) => String(item?.sourcePath || "").trim())
    .filter(Boolean);
}

function countFileBacked(items = []) {
  return items.filter((item) => (item?.type === "fileCard" || item?.type === "image") && item?.sourcePath).length;
}

export function createClipboardBroker({
  readClipboardText,
  readClipboardItems,
  writeClipboardPayload,
  writeClipboardText,
  writeClipboardHtml,
  readClipboardFiles,
  copyFilesToClipboard,
} = {}) {
  let payload = null;

  function setPayload(nextPayload) {
    payload = nextPayload || null;
  }

  function clearPayload() {
    payload = null;
  }

  function getPayload() {
    return payload;
  }

  function buildPayloadFromItems(items = []) {
    const cleanItems = Array.isArray(items) ? items : [];
    return {
      type: "canvas2d",
      source: "canvas",
      clipboardId: createClipboardId(),
      copiedAt: Date.now(),
      items: clone(cleanItems),
      text: buildPlainText(cleanItems) || buildSummaryText(cleanItems),
      html: buildHtml(cleanItems),
      filePaths: extractFilePaths(cleanItems),
    };
  }

  async function copyPayloadToClipboard(nextPayload = null) {
    if (!nextPayload || typeof nextPayload !== "object") {
      return createCanvasOperationResult({
        operation: "copy",
        status: CANVAS_OPERATION_STATUS.FAILED,
        code: "COPY_INVALID_PAYLOAD",
        message: "没有可复制的内容",
      });
    }
    setPayload(nextPayload);

    const cleanItems = Array.isArray(nextPayload.items) ? nextPayload.items : [];
    const filePaths = Array.isArray(nextPayload.filePaths) ? nextPayload.filePaths : [];
    const fileBackedCount = countFileBacked(cleanItems);
    const onlyFileBacked = fileBackedCount > 0 && fileBackedCount === cleanItems.length;
    const requestedFormats = onlyFileBacked && filePaths.length
      ? ["files"]
      : [
          nextPayload.html ? "text/html" : "",
          nextPayload.markdown ? "text/markdown" : "",
          nextPayload.text ? "text/plain" : "",
        ].filter(Boolean);
    const attempts = [];
    const errors = [];
    const recordFailure = (stage, error = null) => {
      errors.push({
        code: "CLIPBOARD_WRITE_FAILED",
        message: String(error?.message || ""),
        stage,
      });
      attempts.push({ id: stage, type: "clipboard-write", status: "failed", reason: "write-failed" });
    };
    const buildResult = ({ providedFormats = [], fallbackUsed = false, code = "" } = {}) => {
      const systemWritten = providedFormats.length > 0;
      const status = systemWritten && requestedFormats.every((format) => providedFormats.includes(format))
        ? CANVAS_OPERATION_STATUS.SUCCESS
        : CANVAS_OPERATION_STATUS.DEGRADED;
      return {
        ...createCanvasOperationResult({
          operation: "copy",
          status,
          code: status === CANVAS_OPERATION_STATUS.SUCCESS
            ? "COPY_OK"
            : code || (systemWritten ? "COPY_DOWNGRADED" : "COPY_INTERNAL_ONLY"),
          message: systemWritten
            ? status === CANVAS_OPERATION_STATUS.SUCCESS
              ? "已写入系统剪贴板"
              : "已降级写入系统剪贴板"
            : "系统剪贴板不可用，内容仅保留在画布内",
          internalStored: true,
          systemWritten,
          fallbackUsed,
          requestedFormats,
          providedFormats,
          entries: attempts,
          errors,
        }),
        payload: nextPayload,
      };
    };

    if (onlyFileBacked && filePaths.length && typeof copyFilesToClipboard === "function") {
      try {
        const result = await copyFilesToClipboard(filePaths);
        if (result?.ok) {
          attempts.push({ id: "files", type: "clipboard-write", status: "written", providedFormat: "files" });
          return buildResult({ providedFormats: ["files"], code: "COPY_OK" });
        }
        recordFailure("files");
      } catch (error) {
        recordFailure("files", error);
      }
    }

    if (typeof writeClipboardPayload === "function") {
      try {
        const result = await writeClipboardPayload(nextPayload);
        const ok = result === true || result?.ok === true;
        if (ok) {
          const providedFormats = Array.isArray(result?.writtenFormats) && result.writtenFormats.length
            ? result.writtenFormats
            : requestedFormats;
          attempts.push({ id: "rich-payload", type: "clipboard-write", status: "written" });
          return buildResult({ providedFormats, code: "COPY_OK" });
        }
        recordFailure("rich-payload");
      } catch (error) {
        recordFailure("rich-payload", error);
      }
    }

    if (typeof writeClipboardHtml === "function" && nextPayload.html) {
      try {
        const result = await writeClipboardHtml(nextPayload.html, nextPayload.text || "");
        if (result === true || result?.ok === true) {
          attempts.push({ id: "html", type: "clipboard-write", status: "written" });
          return buildResult({ providedFormats: ["text/html", "text/plain"], fallbackUsed: true });
        }
        recordFailure("html");
      } catch (error) {
        recordFailure("html", error);
      }
    }

    if (typeof writeClipboardText === "function" && nextPayload.text) {
      try {
        const result = await writeClipboardText(nextPayload.text);
        if (result === true || result?.ok === true) {
          attempts.push({ id: "plain-text", type: "clipboard-write", status: "written" });
          return buildResult({ providedFormats: ["text/plain"], fallbackUsed: true });
        }
        recordFailure("plain-text");
      } catch (error) {
        recordFailure("plain-text", error);
      }
    }

    return buildResult({ providedFormats: [], fallbackUsed: attempts.length > 1 });
  }

  async function copyItemsToClipboard(items = []) {
    return copyPayloadToClipboard(buildPayloadFromItems(items));
  }

  async function readSystemClipboardText() {
    if (typeof readClipboardText !== "function") {
      return "";
    }
    try {
      return String(await readClipboardText()) || "";
    } catch {
      return "";
    }
  }

  async function readSystemClipboardItems() {
    if (typeof readClipboardItems !== "function") {
      return [];
    }
    try {
      const items = await readClipboardItems();
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }

  async function readSystemClipboardFiles() {
    if (typeof readClipboardFiles !== "function") {
      return [];
    }
    try {
      const paths = await readClipboardFiles();
      return Array.isArray(paths) ? paths : [];
    } catch {
      return [];
    }
  }

  async function readSystemClipboardSnapshot() {
    const [text, filePaths, clipboardItems] = await Promise.all([
      readSystemClipboardText(),
      readSystemClipboardFiles(),
      readSystemClipboardItems(),
    ]);
    const richFormats = {
      html: "",
      markdown: "",
      uriList: "",
    };
    const mimeTargets = {
      "text/html": "html",
      "text/markdown": "markdown",
      "text/uri-list": "uriList",
    };
    for (const item of clipboardItems) {
      const types = Array.isArray(item?.types) ? item.types : [];
      for (const [mimeType, target] of Object.entries(mimeTargets)) {
        if (richFormats[target] || !types.includes(mimeType) || typeof item?.getType !== "function") {
          continue;
        }
        try {
          richFormats[target] = String(await (await item.getType(mimeType)).text()) || "";
        } catch {
          // Keep the remaining clipboard formats available when one MIME read fails.
        }
      }
    }
    return {
      text,
      filePaths,
      ...richFormats,
    };
  }

  return {
    setPayload,
    clearPayload,
    getPayload,
    buildPayloadFromItems,
    copyPayloadToClipboard,
    copyItemsToClipboard,
    readSystemClipboardItems,
    readSystemClipboardText,
    readSystemClipboardFiles,
    readSystemClipboardSnapshot,
  };
}
