import { clone } from "../utils.js";

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
      copiedAt: Date.now(),
      items: clone(cleanItems),
      text: buildPlainText(cleanItems) || buildSummaryText(cleanItems),
      html: buildHtml(cleanItems),
      filePaths: extractFilePaths(cleanItems),
    };
  }

  async function copyPayloadToClipboard(nextPayload = null) {
    if (!nextPayload || typeof nextPayload !== "object") {
      return null;
    }
    setPayload(nextPayload);

    const cleanItems = Array.isArray(nextPayload.items) ? nextPayload.items : [];
    const filePaths = Array.isArray(nextPayload.filePaths) ? nextPayload.filePaths : [];
    const fileBackedCount = countFileBacked(cleanItems);
    const onlyFileBacked = fileBackedCount > 0 && fileBackedCount === cleanItems.length;
    if (onlyFileBacked && filePaths.length && typeof copyFilesToClipboard === "function") {
      try {
        const result = await copyFilesToClipboard(filePaths);
        if (result?.ok) {
          return nextPayload;
        }
      } catch {
        // Ignore system clipboard failures.
      }
    }

    if (typeof writeClipboardPayload === "function") {
      try {
        const ok = await writeClipboardPayload(nextPayload);
        if (ok) {
          return nextPayload;
        }
      } catch {
        // Ignore system clipboard failures.
      }
    }

    if (typeof writeClipboardText === "function" && nextPayload.text) {
      try {
        await writeClipboardText(nextPayload.text);
      } catch {
        // Ignore system clipboard failures.
      }
    }

    if (typeof writeClipboardHtml === "function" && nextPayload.html) {
      try {
        await writeClipboardHtml(nextPayload.html, nextPayload.text || "");
      } catch {
        // Ignore system clipboard failures.
      }
    }

    return nextPayload;
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
  };
}
