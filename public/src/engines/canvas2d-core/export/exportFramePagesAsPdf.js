import { loadVendorEsmModule } from "../vendor/loadVendorEsmModule.js";
import { savePdfBytes } from "./savePdfBytes.js";

export async function exportFramePagesAsPdf(pages, renderPage, options = {}) {
  const { PDFDocument } = await loadVendorEsmModule("pdf-lib");
  const pdf = await PDFDocument.create();
  let fallbackCount = 0;
  for (let index = 0; index < pages.length; index += 1) {
    if (options.signal?.aborted) return { ok: false, canceled: true, code: "PDF_EXPORT_CANCELED" };
    await options.onProgress?.(`正在生成第 ${index + 1} / ${pages.length} 页…`);
    const plan = pages[index];
    const rendered = await renderPage(plan);
    const canvas = rendered?.canvas;
    try {
      if (!canvas || rendered.errorCode) throw new Error(rendered?.errorMessage || `第 ${index + 1} 页渲染失败`);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error(`第 ${index + 1} 页图片无法读取，请重试`);
      const image = await pdf.embedPng(new Uint8Array(await blob.arrayBuffer()));
      const page = pdf.addPage([plan.pageWidth, plan.pageHeight]);
      const scale = Math.min(plan.pageWidth / image.width, plan.pageHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, { x: (plan.pageWidth - width) / 2, y: (plan.pageHeight - height) / 2, width, height });
      fallbackCount += Number(rendered.exportImageFallbackCount) || 0;
    } finally {
      if (canvas) { canvas.width = 1; canvas.height = 1; }
    }
  }
  if (options.signal?.aborted) return { ok: false, canceled: true, code: "PDF_EXPORT_CANCELED" };
  const result = await savePdfBytes(await pdf.save(), { fileName: options.defaultName || "freeflow-frames.pdf", preferDownload: options.preferDownload });
  return { ...result, pageCount: pages.length, exportImageFallbackCount: fallbackCount,
    message: result.ok ? `已导出 ${pages.length} 页 PDF${fallbackCount ? `（${fallbackCount} 张图片使用占位）` : ""}` : result.message };
}
