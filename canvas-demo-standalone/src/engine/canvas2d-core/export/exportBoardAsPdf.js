import { resolvePdfExportOptions } from "./pdfExportOptions.js";
import { savePdfBytes } from "./savePdfBytes.js";
import { loadVendorEsmModule } from "../vendor/loadVendorEsmModule.js";

const A4_PORTRAIT = Object.freeze({
  width: 595.28,
  height: 841.89,
});

const A4_LANDSCAPE = Object.freeze({
  width: 841.89,
  height: 595.28,
});

async function canvasToPngBytes(canvas) {
  if (!canvas || typeof canvas.toBlob !== "function") {
    return null;
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    return null;
  }
  return new Uint8Array(await blob.arrayBuffer());
}

function resolvePageSize(orientation = "auto", width = 1, height = 1) {
  if (orientation === "portrait") {
    return { ...A4_PORTRAIT, orientationApplied: "portrait" };
  }
  if (orientation === "landscape") {
    return { ...A4_LANDSCAPE, orientationApplied: "landscape" };
  }
  return width >= height
    ? { ...A4_LANDSCAPE, orientationApplied: "landscape" }
    : { ...A4_PORTRAIT, orientationApplied: "portrait" };
}

function fitImageToPage(imageWidth, imageHeight, pageWidth, pageHeight, padding = 24) {
  const maxWidth = Math.max(1, pageWidth - padding * 2);
  const maxHeight = Math.max(1, pageHeight - padding * 2);
  const ratio = Math.min(maxWidth / Math.max(1, imageWidth), maxHeight / Math.max(1, imageHeight));
  const width = Math.max(1, imageWidth * ratio);
  const height = Math.max(1, imageHeight * ratio);
  return {
    width,
    height,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
  };
}

export async function exportBoardAsPdf(renderBoard, inputOptions = {}, defaults = {}) {
  const { PDFDocument } = await loadVendorEsmModule("pdf-lib");
  const options = resolvePdfExportOptions(inputOptions, defaults);
  if (typeof renderBoard !== "function") {
    return {
      ok: false,
      canceled: false,
      code: "PDF_EXPORT_RENDER_FAILED",
      message: "导出失败：缺少画布渲染能力",
      fileName: "",
      filePath: "",
      bytes: 0,
      pageWidth: 0,
      pageHeight: 0,
      scaleApplied: 0,
    };
  }

  let renderResult = await renderBoard({
    scale: options.scale,
    backgroundFill: options.background === "transparent" ? "transparent" : "#ffffff",
    backgroundGrid: options.includeGrid,
    backgroundPattern: String(inputOptions?.backgroundPattern || "").trim().toLowerCase(),
    allowUnsafeSize: false,
  });

  const oversized =
    renderResult?.errorCode === "PDF_EXPORT_CANVAS_SIDE_EXCEEDED" ||
    renderResult?.errorCode === "PDF_EXPORT_CANVAS_PIXELS_EXCEEDED";
  if (oversized) {
    const continueExport =
      typeof inputOptions?.onOversizeConfirm === "function"
        ? await inputOptions.onOversizeConfirm({
            requestedCanvasWidth: renderResult?.requestedCanvasWidth,
            requestedCanvasHeight: renderResult?.requestedCanvasHeight,
            requestedTotalPixels: renderResult?.requestedTotalPixels,
          })
        : false;
    if (!continueExport) {
      return {
        ok: false,
        canceled: true,
        code: "PDF_EXPORT_CANCELED",
        message: "",
        fileName: "",
        filePath: "",
        bytes: 0,
        pageWidth: 0,
        pageHeight: 0,
        scaleApplied: 0,
      };
    }
    renderResult = await renderBoard({
      scale: options.scale,
      backgroundFill: options.background === "transparent" ? "transparent" : "#ffffff",
      backgroundGrid: options.includeGrid,
      backgroundPattern: String(inputOptions?.backgroundPattern || "").trim().toLowerCase(),
      allowUnsafeSize: true,
    });
  }

  if (renderResult?.canceled) {
    return {
      ok: false,
      canceled: true,
      code: renderResult.code || "PDF_EXPORT_CANCELED",
      message: "",
      fileName: "",
      filePath: "",
      bytes: 0,
      pageWidth: 0,
      pageHeight: 0,
      scaleApplied: 0,
    };
  }

  if (renderResult?.errorCode) {
    return {
      ok: false,
      canceled: false,
      code: renderResult.errorCode,
      message: renderResult.errorMessage || "导出失败",
      fileName: "",
      filePath: "",
      bytes: 0,
      pageWidth: 0,
      pageHeight: 0,
      scaleApplied: 0,
    };
  }

  if (!renderResult?.canvas || !renderResult?.width || !renderResult?.height) {
    return {
      ok: false,
      canceled: false,
      code: "PDF_EXPORT_EMPTY_BOARD",
      message: "导出失败：当前画布没有可导出的内容",
      fileName: "",
      filePath: "",
      bytes: 0,
      pageWidth: 0,
      pageHeight: 0,
      scaleApplied: 0,
    };
  }

  const pngBytes = await canvasToPngBytes(renderResult.canvas);
  if (!pngBytes?.byteLength) {
    return {
      ok: false,
      canceled: false,
      code: "PDF_EXPORT_CANVAS_TAINTED",
      message: "导出失败：存在无法捕获的图片内容",
      fileName: "",
      filePath: "",
      bytes: 0,
      pageWidth: 0,
      pageHeight: 0,
      scaleApplied: renderResult.scaleApplied || options.scale,
    };
  }

  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(pngBytes);
  const pageSize = resolvePageSize(options.orientation, renderResult.width, renderResult.height);
  const page = pdf.addPage([pageSize.width, pageSize.height]);
  const imageFrame = fitImageToPage(
    image.width,
    image.height,
    pageSize.width,
    pageSize.height
  );

  page.drawImage(image, imageFrame);

  const pdfBytes = await pdf.save();
  const saveResult = await savePdfBytes(pdfBytes, {
    fileName: options.fileName,
    preferDownload: options.preferDownload,
  });

  return {
    ...saveResult,
    message:
      saveResult?.ok && renderResult?.downgraded
        ? `PDF 已导出（已自动降级为 ${renderResult.scaleApplied}x 清晰度）`
        : saveResult?.message || "",
    pageWidth: pageSize.width,
    pageHeight: pageSize.height,
    scaleApplied: renderResult.scaleApplied || options.scale,
  };
}
