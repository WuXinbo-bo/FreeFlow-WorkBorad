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
      return getItemLabel(item);
    })
    .join("\n")
    .trim();
}

function buildHtml(items = []) {
  const htmlItems = items
    .filter((item) => item?.type === "text" && item.html)
    .map((item) => `<div>${item.html}</div>`);
  return htmlItems.join("");
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

  async function copyItemsToClipboard(items = []) {
    const cleanItems = Array.isArray(items) ? items : [];
    const nextPayload = buildPayloadFromItems(items);
    setPayload(nextPayload);

    const filePaths = nextPayload.filePaths || [];
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
    getPayload,
    buildPayloadFromItems,
    copyItemsToClipboard,
    readSystemClipboardText,
    readSystemClipboardFiles,
  };
}
