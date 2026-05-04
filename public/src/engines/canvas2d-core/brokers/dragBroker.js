import { getFileName, normalizeRichHtmlInlineFontSizes } from "../utils.js";
import { normalizeTextElement } from "../elements/text.js";

const PASTED_TEXT_INITIAL_WIDTH = 760;
const PASTED_TEXT_MIN_WIDTH = 520;
const PASTED_TEXT_MAX_WIDTH = 860;

function isImagePath(path = "") {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(path || "").trim());
}

function normalizeAnchorPoint(point) {
  return {
    x: Number(point?.x || 0),
    y: Number(point?.y || 0),
  };
}

export function createDragBroker({
  createImageElement,
  createFileCardElement,
  createTextElement,
  readFileAsDataUrl,
  readImageDimensions,
  sanitizeText,
  sanitizeHtml,
  htmlToPlainText,
  isImageFile,
  getFilePath,
  getFileId,
  hasMarkdownMathText,
  htmlContainsRenderableMath,
  convertPlainTextToSemanticHtml,
  downgradeExternalHtmlToCanvasTextSemantics,
} = {}) {
  async function createElementsFromFiles(files = [], anchorPoint) {
    const list = Array.from(files || []);
    if (!list.length) {
      return [];
    }

    const items = [];
    let offset = 0;
    const basePoint = normalizeAnchorPoint(anchorPoint);
    for (const file of list) {
      const point = { x: basePoint.x + offset, y: basePoint.y + offset };
      const resolvedPath = typeof getFilePath === "function" ? getFilePath(file) : "";
      if (resolvedPath && !file.path) {
        file.path = resolvedPath;
      }
      if (typeof getFileId === "function" && file.path && !file.fileId) {
        try {
          file.fileId = await getFileId(file.path);
        } catch {
          // Ignore file id resolution failures.
        }
      }
      if (typeof isImageFile === "function" && isImageFile(file)) {
        const dataUrl = file.path ? "" : await readFileAsDataUrl(file);
        const dimensions = await readImageDimensions(dataUrl, file.path);
        items.push(createImageElement(file, point, dataUrl, dimensions));
      } else {
        items.push(createFileCardElement(file, point));
      }
      offset += 28;
    }

    return items;
  }

  function createElementsFromText(text, anchorPoint) {
    const clean = typeof sanitizeText === "function" ? sanitizeText(text) : String(text || "");
    if (!clean.trim()) {
      return [];
    }
    const point = normalizeAnchorPoint(anchorPoint);
    const item = createTextElement(point, clean);
    return [
      normalizeTextElement({
        ...item,
        textBoxLayoutMode: "auto-height",
        textResizeMode: "wrap",
        width: Math.max(PASTED_TEXT_MIN_WIDTH, Math.min(PASTED_TEXT_MAX_WIDTH, PASTED_TEXT_INITIAL_WIDTH)),
      }),
    ];
  }

  function createElementsFromHtml(html, anchorPoint) {
    const cleanHtml =
      typeof downgradeExternalHtmlToCanvasTextSemantics === "function"
        ? downgradeExternalHtmlToCanvasTextSemantics(html)
        : typeof normalizeRichHtmlInlineFontSizes === "function"
          ? normalizeRichHtmlInlineFontSizes(html)
        : String(html || "");
    const plainText = typeof htmlToPlainText === "function" ? htmlToPlainText(cleanHtml) : String(cleanHtml || "");
    if (!plainText.trim() && !cleanHtml.trim()) {
      return [];
    }
    const point = normalizeAnchorPoint(anchorPoint);
    const item = createTextElement(point, plainText, cleanHtml);
    return [
      normalizeTextElement({
        ...item,
        textBoxLayoutMode: "auto-height",
        textResizeMode: "wrap",
        width: Math.max(PASTED_TEXT_MIN_WIDTH, Math.min(PASTED_TEXT_MAX_WIDTH, PASTED_TEXT_INITIAL_WIDTH)),
      }),
    ];
  }

  async function createFileCardsFromPaths(paths = [], anchorPoint) {
    const list = Array.from(paths || []);
    if (!list.length) {
      return [];
    }

    const items = [];
    let offset = 0;
    const basePoint = normalizeAnchorPoint(anchorPoint);
    for (const path of list) {
      const cleanPath = String(path || "").trim();
      if (!cleanPath) {
        continue;
      }
      const point = { x: basePoint.x + offset, y: basePoint.y + offset };
      const name = getFileName(cleanPath);
      let fileId = "";
      if (typeof getFileId === "function") {
        try {
          fileId = await getFileId(cleanPath);
        } catch {
          fileId = "";
        }
      }
      const fakeFile = {
        name,
        path: cleanPath,
        type: isImagePath(cleanPath) ? "image/*" : "",
        size: 0,
        fileId,
      };
      if (isImagePath(cleanPath)) {
        const dimensions = await readImageDimensions("", cleanPath);
        items.push(createImageElement(fakeFile, point, "", dimensions));
      } else {
        items.push(createFileCardElement(fakeFile, point));
      }
      offset += 28;
    }

    return items;
  }

  async function importFromDataTransfer(dataTransfer, anchorPoint) {
    const files = Array.from(dataTransfer?.files || []);
    if (files.length) {
      return {
        handled: true,
        items: await createElementsFromFiles(files, anchorPoint),
      };
    }

    const html = dataTransfer?.getData?.("text/html") || "";
    const text =
      dataTransfer?.getData?.("text/plain") ||
      dataTransfer?.getData?.("text") ||
      dataTransfer?.getData?.("text/uri-list") ||
      "";
    const shouldPreferSemanticPlainText =
      Boolean(html && text) &&
      typeof hasMarkdownMathText === "function" &&
      hasMarkdownMathText(text) &&
      !(typeof htmlContainsRenderableMath === "function" && htmlContainsRenderableMath(html));
    if (shouldPreferSemanticPlainText && typeof convertPlainTextToSemanticHtml === "function") {
      const semanticHtml = await convertPlainTextToSemanticHtml(text);
      if (semanticHtml && String(semanticHtml).trim()) {
        const items = createElementsFromHtml(semanticHtml, anchorPoint);
        if (items.length) {
          return {
            handled: true,
            items,
          };
        }
      }
    }

    if (html && html.trim()) {
      const items = createElementsFromHtml(html, anchorPoint);
      if (items.length) {
        return {
          handled: true,
          items,
        };
      }
    }

    if (text && text.trim()) {
      if (typeof convertPlainTextToSemanticHtml === "function") {
        const semanticHtml = await convertPlainTextToSemanticHtml(text);
        if (semanticHtml && String(semanticHtml).trim()) {
          const items = createElementsFromHtml(semanticHtml, anchorPoint);
          if (items.length) {
            return {
              handled: true,
              items,
            };
          }
        }
      }
      return {
        handled: true,
        items: createElementsFromText(text, anchorPoint),
      };
    }

    return { handled: false, items: [] };
  }

  return {
    createElementsFromFiles,
    createElementsFromText,
    createElementsFromHtml,
    createFileCardsFromPaths,
    importFromDataTransfer,
  };
}
