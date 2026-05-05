import { renderBoardToCanvas as renderExportBoardToCanvas } from "../renderBoardToCanvas.js";
import { exportBoardAsPdf as runPdfExport } from "../exportBoardAsPdf.js";
import { buildHostExportSnapshot } from "../host/hostExportSnapshotAdapter.js";
import { htmlToPlainText, normalizeRichHtml, normalizeRichHtmlInlineFontSizes, sanitizeText } from "../../utils.js";
import { FLOW_NODE_TEXT_LAYOUT, TEXT_FONT_FAMILY, TEXT_FONT_WEIGHT, TEXT_LINE_HEIGHT_RATIO } from "../../rendererText.js";
import { flattenTableStructureToMatrix } from "../../elements/table.js";
import { getCodeBlockLanguageFileExtension, normalizeCodeBlockLanguageTag } from "../../codeBlock/languageRegistry.js";
import {
  mapTableMatrixToPlainTextRows,
  serializeTableMatrixToCsv,
  serializeTableMatrixToMarkdown,
  serializeTableMatrixToPlainText,
} from "../../elements/tableFormats.js";
import { buildWordExportAstFromCanvasSelection, buildWordExportAstFromRichTextItem } from "../word/buildWordExportAst.js";
import * as XLSX from "../../../../vendor/xlsx/xlsx.mjs";

function normalizeWordExportFontName(fontFamily = "") {
  const raw = String(fontFamily || "").trim();
  if (!raw) {
    return "Segoe UI";
  }
  const firstToken = raw.split(",")[0] || raw;
  const cleaned = firstToken.trim().replace(/^['"]+|['"]+$/g, "").trim();
  return cleaned || "Segoe UI";
}

function safeCanvasToDataUrl(canvas) {
  if (!canvas) {
    return "";
  }
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

function createEmptyBinaryExportResult(code, message = "") {
  return {
    ok: false,
    canceled: code === "PNG_EXPORT_CANCELED" || code === "PDF_EXPORT_CANCELED",
    code,
    message,
    fileName: "",
    filePath: "",
    bytes: 0,
  };
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRichTextHtmlFragment(item) {
  const bodyHtml = normalizeRichHtmlInlineFontSizes(String(item?.html || ""), item?.fontSize || 18).trim();
  const fallbackText = sanitizeText(item?.plainText || item?.text || htmlToPlainText(bodyHtml));
  if (bodyHtml) {
    return bodyHtml;
  }
  return fallbackText ? `<p>${escapeHtml(fallbackText)}</p>` : "";
}

function buildRichTextWordExportDocumentHtml(item) {
  const fragment = buildRichTextWordExportMarkup(item);
  if (!fragment) {
    return "";
  }
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(String(item?.name || item?.title || "文本"))}</title>
  </head>
  <body>${fragment}</body>
</html>`;
}

function appendInlineStyle(element, cssText = "") {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  const next = String(cssText || "").trim();
  if (!next) {
    return;
  }
  const current = String(element.getAttribute("style") || "").trim();
  element.setAttribute("style", current ? `${current}; ${next}` : next);
}

function buildRichTextWordExportMarkup(item) {
  const bodyHtml = buildRichTextHtmlFragment(item);
  if (!bodyHtml) {
    return "";
  }
  const fontSize = Math.max(8, Number(item?.fontSize || 18) || 18);
  const isFlowNode = item?.type === "flowNode";
  const lineHeightRatio = isFlowNode ? FLOW_NODE_TEXT_LAYOUT.lineHeightRatio : TEXT_LINE_HEIGHT_RATIO;
  const fontWeight = isFlowNode ? FLOW_NODE_TEXT_LAYOUT.fontWeight : TEXT_FONT_WEIGHT;
  const color = String(item?.color || "#0f172a");
  const width = Math.max(0, Number(item?.width || 0) || 0);
  const layoutMode = String(item?.textBoxLayoutMode || "").trim().toLowerCase();
  const rootWidthStyle =
    layoutMode && layoutMode !== "auto-width" && width > 0 ? `width:${Math.round(width)}px;max-width:${Math.round(width)}px;` : "";
  const rootStyle = [
    "box-sizing:border-box",
    rootWidthStyle,
    `font-family:${TEXT_FONT_FAMILY}`,
    `font-size:${fontSize}px`,
    `line-height:${lineHeightRatio}`,
    `font-weight:${fontWeight}`,
    `color:${color}`,
    "white-space:pre-wrap",
    "word-break:break-word",
    "overflow-wrap:anywhere",
    "margin:0",
    "padding:0",
  ]
    .filter(Boolean)
    .join(";");

  if (typeof document === "undefined") {
    return `<div data-freeflow-export="rich-text" style="${rootStyle}">${bodyHtml}</div>`;
  }

  const template = document.createElement("template");
  template.innerHTML = bodyHtml;
  const blockSpacingEm = 0.6;
  template.content.querySelectorAll("div,p,section,article,blockquote,pre,h1,h2,h3,h4,h5,h6,table,ul,ol,li,hr").forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    appendInlineStyle(node, "margin-top:0;margin-right:0;margin-left:0");
    if (node.tagName === "UL" || node.tagName === "OL") {
      appendInlineStyle(node, "padding-left:1.4em");
    } else if (node.tagName === "LI") {
      appendInlineStyle(node, "padding:0");
    } else if (node.tagName === "PRE") {
      appendInlineStyle(node, "white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere");
    }
  });
  const blocks = Array.from(template.content.children).filter((node) => node instanceof HTMLElement);
  blocks.forEach((node, index) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const marginBottom = index < blocks.length - 1 ? `${blockSpacingEm}em` : "0";
    appendInlineStyle(node, `margin-bottom:${marginBottom}`);
  });

  return `<div data-freeflow-export="rich-text" style="${rootStyle}">${template.innerHTML}</div>`;
}

function buildTableExportName(item) {
  return String(item?.name || item?.title || item?.table?.title || "表格").trim() || "表格";
}

function buildTableExportMatrix(item) {
  const matrix = flattenTableStructureToMatrix(item?.table || {});
  return Array.isArray(matrix) ? matrix : [];
}

function buildTableSheetColumnWidths(rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return [];
  }
  const columnCount = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  return Array.from({ length: columnCount }, (_, columnIndex) => ({
    wch: Math.min(
      40,
      Math.max(
        10,
        rows.reduce((max, row) => Math.max(max, String(row?.[columnIndex] || "").length), 0) + 2
      )
    ),
  }));
}

function buildCodeBlockExportName(item) {
  return String(item?.name || item?.title || "代码块").trim() || "代码块";
}

function buildCodeBlockSource(item) {
  return sanitizeText(String(item?.code ?? item?.text ?? item?.plainText ?? ""));
}

function buildCodeBlockMarkdown(item) {
  const language = normalizeCodeBlockLanguageTag(item?.language || "");
  const source = buildCodeBlockSource(item);
  return `\`\`\`${language || ""}\n${source}\n\`\`\``;
}

export function createStructuredExportRuntime({
  renderer,
  getElementBounds,
  getFlowEdgeBounds,
  allowLocalFileAccess = true,
  fileAdapter = null,
  assetAdapter = null,
  resolveDefaultFileName = () => "freeflow-board",
} = {}) {
  const resolveAllowLocalFileAccess =
    typeof allowLocalFileAccess === "function" ? allowLocalFileAccess : () => Boolean(allowLocalFileAccess);

  function buildSnapshot(board, options = {}) {
    return buildHostExportSnapshot(board, {
      ...options,
      getElementBounds,
      getFlowEdgeBounds,
    });
  }

  async function renderSnapshotToCanvas(snapshot, options = {}) {
    const sourceItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
    const hydratedItems = typeof assetAdapter?.hydrateImageItems === "function"
      ? await assetAdapter.hydrateImageItems(sourceItems)
      : sourceItems;
    if (typeof assetAdapter?.preloadImagesForItems === "function") {
      await assetAdapter.preloadImagesForItems(hydratedItems);
    }
    return renderExportBoardToCanvas(hydratedItems, {
      renderer,
      getElementBounds,
      getFlowEdgeBounds,
      allowLocalFileAccess: resolveAllowLocalFileAccess(),
      backgroundFill: options.backgroundFill ?? "transparent",
      backgroundGrid: Boolean(options.backgroundGrid),
      backgroundPattern: options.backgroundPattern,
      renderTextInCanvas: options.renderTextInCanvas !== false,
      scale: options.scale ?? 1,
      devicePixelRatio: options.devicePixelRatio ?? 1,
      exportBounds: snapshot?.bounds || null,
      allowUnsafeSize: Boolean(options.allowUnsafeSize),
    });
  }

  async function renderBoardToCanvas(board, options = {}) {
    const snapshot = buildSnapshot(board, options);
    return renderSnapshotToCanvas(snapshot, options);
  }

  async function rerenderOversizedSnapshot(snapshot, baseRenderOptions = {}, onOversizeConfirm = null) {
    let renderResult = await renderSnapshotToCanvas(snapshot, baseRenderOptions);
    const oversized =
      renderResult?.errorCode === "PDF_EXPORT_CANVAS_SIDE_EXCEEDED" ||
      renderResult?.errorCode === "PDF_EXPORT_CANVAS_PIXELS_EXCEEDED";
    if (!oversized) {
      return renderResult;
    }
    const continueExport =
      typeof onOversizeConfirm === "function"
        ? await onOversizeConfirm({
            requestedCanvasWidth: renderResult?.requestedCanvasWidth,
            requestedCanvasHeight: renderResult?.requestedCanvasHeight,
            requestedTotalPixels: renderResult?.requestedTotalPixels,
          })
        : false;
    if (!continueExport) {
      return {
        canceled: true,
        code: "PDF_EXPORT_CANCELED",
      };
    }
    renderResult = await renderSnapshotToCanvas(snapshot, {
      ...baseRenderOptions,
      allowUnsafeSize: true,
    });
    return renderResult;
  }

  async function exportBoardAsPng(board, options = {}) {
    const snapshot = buildSnapshot(board, { scope: options.scope || "board" });
    const renderResult = await rerenderOversizedSnapshot(
      snapshot,
      {
        scale: options.scale,
        backgroundFill: options.background === "transparent" ? "transparent" : "#ffffff",
        backgroundGrid: options.includeGrid,
        backgroundPattern: options.backgroundPattern,
      },
      options.onOversizeConfirm
    );
    if (renderResult?.canceled) {
      return createEmptyBinaryExportResult("PNG_EXPORT_CANCELED");
    }
    if (renderResult?.errorCode) {
      return createEmptyBinaryExportResult(renderResult.errorCode, renderResult.errorMessage || "PNG 导出失败");
    }
    const dataUrl = safeCanvasToDataUrl(renderResult?.canvas);
    if (!dataUrl) {
      return createEmptyBinaryExportResult("PNG_EXPORT_CANVAS_TAINTED", "PNG 导出失败：存在无法捕获的图片内容");
    }
    const saveResult = await fileAdapter?.saveDataUrlAsImage?.(dataUrl, {
      defaultName: options.defaultName || resolveDefaultFileName(),
    });
    if (!saveResult?.ok) {
      if (saveResult?.canceled) {
        return createEmptyBinaryExportResult("PNG_EXPORT_CANCELED");
      }
      return createEmptyBinaryExportResult("PNG_EXPORT_WRITE_FAILED", saveResult?.error || "PNG 导出失败");
    }
    return {
      ok: true,
      canceled: false,
      code: "PNG_EXPORT_OK",
      message: saveResult.message || "PNG 已导出",
      fileName: `${resolveDefaultFileName()}.png`,
      filePath: String(saveResult.path || "").trim(),
      bytes: Number(saveResult.size) || 0,
    };
  }

  async function exportBoardAsPdf(board, options = {}) {
    return runPdfExport(
      (renderOptions) =>
        renderBoardToCanvas(board, {
          ...renderOptions,
          scope: options.scope || "board",
          items: Array.isArray(options.items) ? options.items : undefined,
          backgroundPattern: options.backgroundPattern,
        }),
      options,
      {
        defaultFileName: resolveDefaultFileName(),
      }
    );
  }

  async function exportItemsAsImage(board, items = [], options = {}) {
    const snapshot = buildSnapshot(board, {
      scope: "items",
      items,
    });
    if (!snapshot.itemCount) {
      return { ok: false, canceled: false, code: "PNG_EXPORT_EMPTY_SELECTION", message: "导出失败：未选中可导出内容" };
    }
    const renderResult = await rerenderOversizedSnapshot(
      snapshot,
      {
        scale: options.scale ?? 1,
        backgroundFill: options.forceWhiteBackground ? "#ffffff" : "transparent",
        backgroundGrid: false,
        backgroundPattern: options.backgroundPattern,
      },
      options.onOversizeConfirm
    );
    if (renderResult?.canceled) {
      return createEmptyBinaryExportResult("PNG_EXPORT_CANCELED");
    }
    if (!renderResult?.canvas) {
      return createEmptyBinaryExportResult(renderResult?.errorCode || "PNG_EXPORT_RENDER_FAILED", renderResult?.errorMessage || "导出失败");
    }
    const dataUrl = safeCanvasToDataUrl(renderResult.canvas);
    if (!dataUrl) {
      return createEmptyBinaryExportResult("PNG_EXPORT_CANVAS_TAINTED", "导出失败：存在无法捕获的图片内容");
    }
    const saveResult = await fileAdapter?.saveDataUrlAsImage?.(dataUrl, {
      defaultName: options.defaultName || "freeflow-export",
    });
    if (!saveResult?.ok) {
      if (saveResult?.canceled) {
        return createEmptyBinaryExportResult("PNG_EXPORT_CANCELED");
      }
      return createEmptyBinaryExportResult("PNG_EXPORT_WRITE_FAILED", saveResult?.error || "导出失败");
    }
    return {
      ok: true,
      canceled: false,
      code: "PNG_EXPORT_OK",
      message: saveResult.message || "图片已导出",
      fileName: `${String(options.defaultName || "freeflow-export").trim() || "freeflow-export"}.png`,
      filePath: String(saveResult.path || "").trim(),
      bytes: Number(saveResult.size) || 0,
    };
  }

  async function exportRichTextItemAsWordFile(item, options = {}) {
    const ast = buildWordExportAstFromRichTextItem(item, {
      title: String(item?.name || item?.title || "文本"),
      creator: "FreeFlow",
      lastModifiedBy: "FreeFlow",
    });
    const astHasContent = Array.isArray(ast?.sections) && ast.sections.some((section) => Array.isArray(section?.children) && section.children.length);
    if (!astHasContent) {
      const html = buildRichTextWordExportDocumentHtml(item);
      if (!html) {
        return { ok: false, canceled: false, code: "WORD_EXPORT_EMPTY", message: "文本为空" };
      }
    }
    let html = "";
    if (!astHasContent) {
      html = buildRichTextWordExportDocumentHtml(item);
    }
    if (!astHasContent && !html) {
      return { ok: false, canceled: false, code: "WORD_EXPORT_EMPTY", message: "文本为空" };
    }
    let saveResult = null;
    if (astHasContent && typeof fileAdapter?.saveWordAstAsDocxFile === "function") {
      saveResult = await fileAdapter.saveWordAstAsDocxFile(ast, {
        defaultName: options.defaultName || item?.name || item?.title || "文本",
        title: "导出 Word",
        buttonLabel: "保存 Word",
      });
    }
    const shouldFallbackToHtmlDocx =
      saveResult &&
      saveResult.ok !== true &&
      saveResult.canceled !== true &&
      /Invalid value 'NaN' specified|Must be an integer|NaN/i.test(String(saveResult.error || saveResult.message || ""));
    if ((saveResult == null || shouldFallbackToHtmlDocx) && !html) {
      html = buildRichTextWordExportDocumentHtml(item);
    }
    if ((saveResult == null || shouldFallbackToHtmlDocx) && html) {
      saveResult = await fileAdapter?.saveHtmlAsDocxWordFile?.(html, {
        defaultName: options.defaultName || item?.name || item?.title || "文本",
        title: "导出 Word",
        buttonLabel: "保存 Word",
        documentOptions: {
          orientation: "portrait",
          pageSize: {
            width: "21cm",
            height: "29.7cm",
          },
          margins: {
            top: "2.54cm",
            right: "2.54cm",
            bottom: "2.54cm",
            left: "2.54cm",
            header: "1.27cm",
            footer: "1.27cm",
            gutter: 0,
          },
          title: String(item?.name || item?.title || "文本"),
          creator: "FreeFlow",
          lastModifiedBy: "FreeFlow",
          font: normalizeWordExportFontName(TEXT_FONT_FAMILY),
          fontSize: Math.max(16, Math.round((Number(item?.fontSize || 18) || 18) * 2)),
          decodeUnicode: true,
        },
      });
    }
    if (!saveResult?.ok) {
      if (saveResult?.canceled) {
        return { ok: false, canceled: true, code: "WORD_EXPORT_CANCELED", message: "" };
      }
      return {
        ok: false,
        canceled: false,
        code: "WORD_EXPORT_WRITE_FAILED",
        message: saveResult?.error || "导出失败",
      };
    }
    return {
      ok: true,
      canceled: false,
      code: "WORD_EXPORT_OK",
      message: "已导出 Word",
      filePath: String(saveResult.path || "").trim(),
      bytes: Number(saveResult.size) || 0,
    };
  }

  async function exportSelectionAsWordFile(items = [], options = {}) {
    const normalizedItems = (Array.isArray(items) ? items : []).filter((item) => item && typeof item === "object");
    if (!normalizedItems.length) {
      return { ok: false, canceled: false, code: "WORD_EXPORT_EMPTY_SELECTION", message: "未选中可导出内容" };
    }
    const ast = buildWordExportAstFromCanvasSelection(normalizedItems, {
      title: String(options.title || "画布导出").trim() || "画布导出",
      creator: "FreeFlow",
      lastModifiedBy: "FreeFlow",
    });
    const astHasContent = Array.isArray(ast?.sections) && ast.sections.some((section) => Array.isArray(section?.children) && section.children.length);
    if (!astHasContent) {
      return { ok: false, canceled: false, code: "WORD_EXPORT_EMPTY", message: "所选元素暂时无法导出为 Word" };
    }
    const saveResult = await fileAdapter?.saveWordAstAsDocxFile?.(ast, {
      defaultName: options.defaultName || "freeflow-selection-word",
      title: options.title || "导出 Word",
      buttonLabel: options.buttonLabel || "保存 Word",
    });
    if (!saveResult?.ok) {
      if (saveResult?.canceled) {
        return { ok: false, canceled: true, code: "WORD_EXPORT_CANCELED", message: "" };
      }
      return {
        ok: false,
        canceled: false,
        code: "WORD_EXPORT_WRITE_FAILED",
        message: saveResult?.error || "导出失败",
      };
    }
    const skippedItems = Array.isArray(ast?.selectionPlan?.skippedItems) ? ast.selectionPlan.skippedItems : [];
    const skippedSummary = skippedItems.length
      ? `，已跳过 ${skippedItems.length} 个暂不支持元素`
      : "";
    return {
      ok: true,
      canceled: false,
      code: "WORD_EXPORT_OK",
      message: `已导出 Word${skippedSummary}`,
      filePath: String(saveResult.path || "").trim(),
      bytes: Number(saveResult.size) || 0,
      skippedItems,
      ast,
    };
  }

  async function exportRichTextItemAsPdf(board, item, options = {}) {
    return exportBoardAsPdf(board, {
      ...options,
      scope: "items",
      items: [item],
      includeGrid: false,
      background: options.background || "white",
    });
  }

  async function exportRichTextItemAsPng(board, item, options = {}) {
    return exportItemsAsImage(board, [item], {
      ...options,
      forceWhiteBackground: options.forceWhiteBackground !== false,
      defaultName: options.defaultName || item?.name || item?.title || "文本",
    });
  }

  async function exportTextItem(item, options = {}) {
    const plain = sanitizeText(item?.plainText || item?.text || htmlToPlainText(item?.html || ""));
    if (!plain) {
      return { ok: false, canceled: false, code: "TEXT_EXPORT_EMPTY", message: "文本为空" };
    }
    const saveResult = await fileAdapter?.saveTextAsFile?.(plain, {
      defaultName: options.defaultName || item?.name || "文本",
    });
    if (!saveResult?.ok) {
      if (saveResult?.canceled) {
        return { ok: false, canceled: true, code: "TEXT_EXPORT_CANCELED", message: "" };
      }
      return { ok: false, canceled: false, code: "TEXT_EXPORT_WRITE_FAILED", message: saveResult?.error || "导出失败" };
    }
    return {
      ok: true,
      canceled: false,
      code: "TEXT_EXPORT_OK",
      message: "已导出 TXT",
      filePath: String(saveResult.path || "").trim(),
    };
  }

  async function exportTableItem(item, format = "xlsx", options = {}) {
    if (!item || item.type !== "table") {
      return { ok: false, canceled: false, code: "TABLE_EXPORT_INVALID_ITEM", message: "仅表格元素支持此导出" };
    }
    const matrix = buildTableExportMatrix(item);
    if (!matrix.length) {
      return { ok: false, canceled: false, code: "TABLE_EXPORT_EMPTY", message: "表格为空" };
    }
    const rows = mapTableMatrixToPlainTextRows(matrix);
    const defaultName = buildTableExportName(item);

    if (format === "md") {
      const markdown = serializeTableMatrixToMarkdown(matrix);
      if (!markdown) {
        return { ok: false, canceled: false, code: "TABLE_EXPORT_EMPTY", message: "表格为空" };
      }
      const saveResult = await fileAdapter?.saveBlobAsFile?.(
        new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
        {
          defaultName: options.defaultName || defaultName,
          extension: "md",
          title: "导出 Markdown 表格",
          buttonLabel: "保存 Markdown",
          filters: [
            { name: "Markdown 文件", extensions: ["md"] },
            { name: "所有文件", extensions: ["*"] },
          ],
        }
      );
      if (!saveResult?.ok) {
        return saveResult?.canceled
          ? { ok: false, canceled: true, code: "TABLE_EXPORT_CANCELED", message: "" }
          : { ok: false, canceled: false, code: "TABLE_EXPORT_WRITE_FAILED", message: saveResult?.error || "导出失败" };
      }
      return { ok: true, canceled: false, code: "TABLE_EXPORT_MD_OK", message: "已导出 Markdown 表格", filePath: String(saveResult.path || "").trim() };
    }

    if (format === "csv") {
      const csv = serializeTableMatrixToCsv(matrix);
      const saveResult = await fileAdapter?.saveBlobAsFile?.(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
        {
          defaultName: options.defaultName || defaultName,
          extension: "csv",
          title: "导出 CSV 表格",
          buttonLabel: "保存 CSV",
          filters: [
            { name: "CSV 文件", extensions: ["csv"] },
            { name: "所有文件", extensions: ["*"] },
          ],
        }
      );
      if (!saveResult?.ok) {
        return saveResult?.canceled
          ? { ok: false, canceled: true, code: "TABLE_EXPORT_CANCELED", message: "" }
          : { ok: false, canceled: false, code: "TABLE_EXPORT_WRITE_FAILED", message: saveResult?.error || "导出失败" };
      }
      return { ok: true, canceled: false, code: "TABLE_EXPORT_CSV_OK", message: "已导出 CSV 表格", filePath: String(saveResult.path || "").trim() };
    }

    if (format === "txt") {
      const text = serializeTableMatrixToPlainText(matrix, { hasHeader: item?.table?.hasHeader !== false });
      const saveResult = await fileAdapter?.saveTextAsFile?.(text, {
        defaultName: options.defaultName || defaultName,
      });
      if (!saveResult?.ok) {
        return saveResult?.canceled
          ? { ok: false, canceled: true, code: "TABLE_EXPORT_CANCELED", message: "" }
          : { ok: false, canceled: false, code: "TABLE_EXPORT_WRITE_FAILED", message: saveResult?.error || "导出失败" };
      }
      return { ok: true, canceled: false, code: "TABLE_EXPORT_TXT_OK", message: "已导出 TXT 表格", filePath: String(saveResult.path || "").trim() };
    }

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = buildTableSheetColumnWidths(rows);
    if (item?.table?.hasHeader !== false && rows.length >= 1 && rows[0]?.length) {
      sheet["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: Math.max(0, rows.length - 1), c: Math.max(0, rows[0].length - 1) },
        }),
      };
    }
    XLSX.utils.book_append_sheet(workbook, sheet, "Table");
    const bytes = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
      compression: true,
      cellStyles: true,
    });
    const saveResult = await fileAdapter?.saveBytesAsFile?.(new Uint8Array(bytes), {
      defaultName: options.defaultName || defaultName,
      extension: "xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      title: "导出 Excel 表格",
      buttonLabel: "保存 Excel",
      filters: [
        { name: "Excel 工作簿", extensions: ["xlsx"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (!saveResult?.ok) {
      return saveResult?.canceled
        ? { ok: false, canceled: true, code: "TABLE_EXPORT_CANCELED", message: "" }
        : { ok: false, canceled: false, code: "TABLE_EXPORT_WRITE_FAILED", message: saveResult?.error || "导出失败" };
    }
    return {
      ok: true,
      canceled: false,
      code: "TABLE_EXPORT_XLSX_OK",
      message: "已导出 Excel 表格",
      filePath: String(saveResult.path || "").trim(),
    };
  }

  async function exportCodeBlockItem(item, format = "source", options = {}) {
    if (!item || item.type !== "codeBlock") {
      return { ok: false, canceled: false, code: "CODE_EXPORT_INVALID_ITEM", message: "仅代码块元素支持此导出" };
    }
    const source = buildCodeBlockSource(item);
    if (!source.trim()) {
      return { ok: false, canceled: false, code: "CODE_EXPORT_EMPTY", message: "代码块为空" };
    }
    const defaultName = buildCodeBlockExportName(item);
    if (format === "markdown") {
      const markdown = buildCodeBlockMarkdown(item);
      const saveResult = await fileAdapter?.saveBlobAsFile?.(
        new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
        {
          defaultName: options.defaultName || defaultName,
          extension: "md",
          title: "导出 Markdown 代码块",
          buttonLabel: "保存 Markdown",
          filters: [
            { name: "Markdown 文件", extensions: ["md"] },
            { name: "所有文件", extensions: ["*"] },
          ],
        }
      );
      if (!saveResult?.ok) {
        return saveResult?.canceled
          ? { ok: false, canceled: true, code: "CODE_EXPORT_CANCELED", message: "" }
          : { ok: false, canceled: false, code: "CODE_EXPORT_WRITE_FAILED", message: saveResult?.error || "导出失败" };
      }
      return {
        ok: true,
        canceled: false,
        code: "CODE_EXPORT_MARKDOWN_OK",
        message: "已导出 Markdown 代码块",
        filePath: String(saveResult.path || "").trim(),
      };
    }

    const extension = getCodeBlockLanguageFileExtension(item?.language || "");
    const saveResult = await fileAdapter?.saveBlobAsFile?.(
      new Blob([source], { type: "text/plain;charset=utf-8" }),
      {
        defaultName: options.defaultName || defaultName,
        extension,
        title: "导出代码文件",
        buttonLabel: "保存代码文件",
        filters: [
          { name: "代码文件", extensions: [extension] },
          { name: "所有文件", extensions: ["*"] },
        ],
      }
    );
    if (!saveResult?.ok) {
      return saveResult?.canceled
        ? { ok: false, canceled: true, code: "CODE_EXPORT_CANCELED", message: "" }
        : { ok: false, canceled: false, code: "CODE_EXPORT_WRITE_FAILED", message: saveResult?.error || "导出失败" };
    }
    return {
      ok: true,
      canceled: false,
      code: "CODE_EXPORT_SOURCE_OK",
      message: "已导出代码文件",
      filePath: String(saveResult.path || "").trim(),
    };
  }

  return {
    buildSnapshot,
    renderSnapshotToCanvas,
    renderBoardToCanvas,
    exportBoardAsPng,
    exportBoardAsPdf,
    exportItemsAsImage,
    exportRichTextItemAsWordFile,
    exportSelectionAsWordFile,
    exportRichTextItemAsPdf,
    exportRichTextItemAsPng,
    exportTextItem,
    exportTableItem,
    exportCodeBlockItem,
  };
}
