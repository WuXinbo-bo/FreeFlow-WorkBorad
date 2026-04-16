import { ensurePdfFileName } from "./pdfExportOptions.js";

export async function savePdfBytes(bytes, options = {}) {
  const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!payload.byteLength) {
    return {
      ok: false,
      canceled: false,
      code: "PDF_EXPORT_WRITE_FAILED",
      message: "导出失败：PDF 数据为空",
      fileName: "",
      filePath: "",
      bytes: 0,
    };
  }

  const fileName = ensurePdfFileName(options.fileName, "freeflow-board");

  if (
    typeof globalThis?.desktopShell?.pickPdfSavePath === "function" &&
    typeof globalThis?.desktopShell?.writeFile === "function" &&
    !options.preferDownload
  ) {
    const picked = await globalThis.desktopShell.pickPdfSavePath({ defaultName: fileName });
    if (!picked) {
      return {
        ok: false,
        canceled: false,
        code: "PDF_EXPORT_SAVE_DIALOG_FAILED",
        message: "导出失败：保存对话框没有返回结果",
        fileName,
        filePath: "",
        bytes: 0,
      };
    }
    if (picked.canceled) {
      return {
        ok: false,
        canceled: true,
        code: "PDF_EXPORT_CANCELED",
        message: "",
        fileName,
        filePath: "",
        bytes: 0,
      };
    }
    if (!picked.filePath) {
      return {
        ok: false,
        canceled: false,
        code: "PDF_EXPORT_SAVE_PATH_MISSING",
        message: "导出失败：保存对话框未返回文件路径",
        fileName,
        filePath: "",
        bytes: 0,
      };
    }
    const writeResult = await globalThis.desktopShell.writeFile(picked.filePath, payload);
    if (!writeResult?.ok) {
      return {
        ok: false,
        canceled: false,
        code: "PDF_EXPORT_WRITE_FAILED",
        message: writeResult?.error || "导出失败：无法写入 PDF 文件",
        fileName,
        filePath: "",
        bytes: 0,
      };
    }
    return {
      ok: true,
      canceled: false,
      code: "PDF_EXPORT_OK",
      message: "PDF 已导出",
      fileName,
      filePath: String(writeResult.filePath || picked.filePath || "").trim(),
      bytes: Number(writeResult.size) || payload.byteLength,
    };
  }

  try {
    const blob = new Blob([payload], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return {
      ok: true,
      canceled: false,
      code: "PDF_EXPORT_OK",
      message: "PDF 已导出",
      fileName,
      filePath: "",
      bytes: payload.byteLength,
    };
  } catch (error) {
    return {
      ok: false,
      canceled: false,
      code: "PDF_EXPORT_DOWNLOAD_FAILED",
      message: error?.message || "导出失败：浏览器下载失败",
      fileName,
      filePath: "",
      bytes: 0,
    };
  }
}
