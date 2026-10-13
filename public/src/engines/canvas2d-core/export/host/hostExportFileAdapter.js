function normalizeExportName(value, fallback = "freeflow-export") {
  const base = String(value || "").trim() || fallback;
  return base.replace(/[\\/:*?"<>|]+/g, "_");
}

function sanitizePngDataUrl(raw = "") {
  const value = String(raw || "").trim();
  if (!value.startsWith("data:image/png")) {
    return "";
  }
  if (value.length < 128) {
    return "";
  }
  const base64Marker = "base64,";
  const index = value.indexOf(base64Marker);
  if (index < 0) {
    return "";
  }
  const payload = value.slice(index + base64Marker.length).replace(/\s+/g, "");
  if (!payload || payload.length < 64) {
    return "";
  }
  if (!/^iVBOR/i.test(payload)) {
    return "";
  }
  return value;
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { ok: true, path: filename, message: `已导出 ${filename}` };
}

function buildSavedMessage(targetPath, fallback = "文件已导出") {
  const normalized = String(targetPath || "").trim();
  if (!normalized) {
    return fallback;
  }
  const segments = normalized.split(/[\\/]+/).filter(Boolean);
  const label = segments.length ? segments[segments.length - 1] : normalized;
  return `${fallback}：${label}`;
}

export function createHostExportFileAdapter({
  useLocalFileSystem = false,
  saveImageDataToImportFolder = null,
  setSaveToast = null,
} = {}) {
  const resolveUseLocalFileSystem =
    typeof useLocalFileSystem === "function" ? useLocalFileSystem : () => Boolean(useLocalFileSystem);

  async function saveBlobAsFile(blob, options = {}) {
    if (options.signal?.aborted) return { ok: false, canceled: true };
    const extension = String(options.extension || "").trim().replace(/^\./, "");
    const baseName = normalizeExportName(options.defaultName || "freeflow-export", "freeflow-export");
    const filename = extension ? `${baseName}.${extension}` : baseName;
    if (
      typeof globalThis?.desktopShell?.pickTextSavePath === "function" &&
      typeof globalThis?.desktopShell?.writeFile === "function"
    ) {
      const result = await globalThis.desktopShell.pickTextSavePath({
        defaultName: filename,
        title: options.title || "导出文件",
        buttonLabel: options.buttonLabel || "保存文件",
        filters: Array.isArray(options.filters) ? options.filters : undefined,
      });
      if (options.signal?.aborted || !result || result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (options.signal?.aborted) return { ok: false, canceled: true };
      const writeResult = await globalThis.desktopShell.writeFile(result.filePath, bytes);
      if (!writeResult?.ok) {
        return { ok: false, error: writeResult?.error || "写入文件失败" };
      }
      return {
        ok: true,
        path: result.filePath,
        size: bytes.byteLength,
        message: buildSavedMessage(result.filePath, "文件已导出"),
      };
    }
    if (options.signal?.aborted) return { ok: false, canceled: true };
    return triggerBlobDownload(blob, filename);
  }

  async function saveBytesAsFile(bytes, options = {}) {
    const payload =
      bytes instanceof Uint8Array
        ? bytes
        : ArrayBuffer.isView(bytes)
          ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
          : new Uint8Array(bytes || []);
    return saveBlobAsFile(new Blob([payload], { type: options.mimeType || "application/octet-stream" }), options);
  }

  async function saveGeneratedDocx(bytes, name, options) {
    const result = await saveBytesAsFile(bytes, {
      ...options,
      defaultName: name,
      extension: "docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      title: options.title || "导出 Word",
      buttonLabel: options.buttonLabel || "保存 Word",
      filters: [{ name: "Word 文档", extensions: ["docx"] }, { name: "所有文件", extensions: ["*"] }],
    });
    return result?.ok ? { ...result, message: buildSavedMessage(result.path, "Word 已导出") } : result;
  }

  async function saveDataUrlAsImage(dataUrl, options = {}) {
    if (options.signal?.aborted) return { ok: false, canceled: true };
    const name = normalizeExportName(options.defaultName || "freeflow-export", "freeflow-export");
    let raw = sanitizePngDataUrl(dataUrl);
    if (!raw && typeof options?.onFallbackDataUrl === "function") {
      try {
        raw = sanitizePngDataUrl(await options.onFallbackDataUrl());
      } catch {
        raw = "";
      }
    }
    if (options.signal?.aborted) return { ok: false, canceled: true };
    if (!raw) {
      return { ok: false, error: "图片生成失败：无效 PNG 数据" };
    }
    if (resolveUseLocalFileSystem() && typeof saveImageDataToImportFolder === "function") {
      const result = await saveImageDataToImportFolder({
        dataUrl: raw,
        name,
        mime: "image/png",
        isCurrent: () => !options.signal?.aborted,
      });
      if (options.signal?.aborted || result?.canceled) return { ok: false, canceled: true };
      if (result?.ok) {
        const message = "图片已保存至当前画布目录下的 importImage 文件夹";
        setSaveToast?.(message);
        return { ok: true, path: result.filePath, message, size: result.size || 0 };
      }
      return { ok: false, error: result?.error || "图片保存失败" };
    }
    const blob = await (await fetch(raw)).blob();
    if (options.signal?.aborted) return { ok: false, canceled: true };
    const filename = `${name}.png`;
    if (
      typeof globalThis?.desktopShell?.pickImageSavePath === "function" &&
      typeof globalThis?.desktopShell?.writeFile === "function"
    ) {
      const picked = await globalThis.desktopShell.pickImageSavePath({ defaultName: filename });
      if (options.signal?.aborted || !picked || picked.canceled || !picked.filePath) {
        return { ok: false, canceled: true };
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (options.signal?.aborted) return { ok: false, canceled: true };
      const writeResult = await globalThis.desktopShell.writeFile(picked.filePath, bytes);
      if (!writeResult?.ok) {
        return { ok: false, error: writeResult?.error || "写入文件失败" };
      }
      return { ok: true, path: picked.filePath, message: buildSavedMessage(picked.filePath, "图片已导出") };
    }
    if (options.signal?.aborted) return { ok: false, canceled: true };
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { ok: true, path: filename, message: buildSavedMessage(filename, "图片已导出") };
  }

  async function saveTextAsFile(text, options = {}) {
    if (options.signal?.aborted) return { ok: false, canceled: true };
    const name = normalizeExportName(options.defaultName || "freeflow-text", "freeflow-text");
    const filename = `${name}.txt`;
    if (
      typeof globalThis?.desktopShell?.pickTextSavePath === "function" &&
      typeof globalThis?.desktopShell?.writeFile === "function"
    ) {
      const result = await globalThis.desktopShell.pickTextSavePath({
        defaultName: filename,
        title: options.title || "导出文本",
        buttonLabel: options.buttonLabel || "保存文本",
        filters: Array.isArray(options.filters) ? options.filters : undefined,
      });
      if (options.signal?.aborted || !result || result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }
      const encoder = new TextEncoder();
      if (options.signal?.aborted) return { ok: false, canceled: true };
      const writeResult = await globalThis.desktopShell.writeFile(result.filePath, encoder.encode(String(text || "")));
      if (!writeResult?.ok) {
        return { ok: false, error: writeResult?.error || "写入文件失败" };
      }
      return { ok: true, path: result.filePath, message: buildSavedMessage(result.filePath, "文本已导出") };
    }
    const blob = new Blob([String(text || "")], { type: "text/plain" });
    if (options.signal?.aborted) return { ok: false, canceled: true };
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { ok: true, path: filename, message: buildSavedMessage(filename, "文本已导出") };
  }

  async function saveHtmlAsFile(html, options = {}) {
    if (options.signal?.aborted) return { ok: false, canceled: true };
    const name = normalizeExportName(options.defaultName || "freeflow-word", "freeflow-word");
    const filename = `${name}.html`;
    const payload = String(html || "");
    if (
      typeof globalThis?.desktopShell?.pickTextSavePath === "function" &&
      typeof globalThis?.desktopShell?.writeFile === "function"
    ) {
      const result = await globalThis.desktopShell.pickTextSavePath({
        defaultName: filename,
        title: options.title || "导出 HTML",
        buttonLabel: options.buttonLabel || "保存 HTML",
        filters: Array.isArray(options.filters) ? options.filters : undefined,
      });
      if (options.signal?.aborted || !result || result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }
      const encoder = new TextEncoder();
      if (options.signal?.aborted) return { ok: false, canceled: true };
      const writeResult = await globalThis.desktopShell.writeFile(result.filePath, encoder.encode(payload));
      if (!writeResult?.ok) {
        return { ok: false, error: writeResult?.error || "写入文件失败" };
      }
      return { ok: true, path: result.filePath, message: buildSavedMessage(result.filePath, "HTML 已导出") };
    }
    const blob = new Blob([payload], { type: "text/html;charset=utf-8" });
    if (options.signal?.aborted) return { ok: false, canceled: true };
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { ok: true, path: filename, message: buildSavedMessage(filename, "HTML 已导出") };
  }

  async function saveHtmlAsWordFile(html, options = {}) {
    if (options.signal?.aborted) return { ok: false, canceled: true };
    const name = normalizeExportName(options.defaultName || "freeflow-word", "freeflow-word");
    const filename = `${name}.doc`;
    const payload = String(html || "");
    if (
      typeof globalThis?.desktopShell?.pickTextSavePath === "function" &&
      typeof globalThis?.desktopShell?.writeFile === "function"
    ) {
      const result = await globalThis.desktopShell.pickTextSavePath({
        defaultName: filename,
        title: options.title || "导出 Word",
        buttonLabel: options.buttonLabel || "保存 Word",
        filters: Array.isArray(options.filters) ? options.filters : undefined,
      });
      if (options.signal?.aborted || !result || result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }
      const encoder = new TextEncoder();
      if (options.signal?.aborted) return { ok: false, canceled: true };
      const writeResult = await globalThis.desktopShell.writeFile(result.filePath, encoder.encode(payload));
      if (!writeResult?.ok) {
        return { ok: false, error: writeResult?.error || "写入文件失败" };
      }
      return { ok: true, path: result.filePath, message: buildSavedMessage(result.filePath, "Word 已导出") };
    }
    const blob = new Blob([payload], { type: "application/msword" });
    if (options.signal?.aborted) return { ok: false, canceled: true };
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { ok: true, path: filename, message: buildSavedMessage(filename, "Word 已导出") };
  }

  async function saveHtmlAsDocxWordFile(html, options = {}) {
    if (options.signal?.aborted) return { ok: false, canceled: true };
    const name = normalizeExportName(options.defaultName || "freeflow-word", "freeflow-word");
    const filename = `${name}.docx`;
    const payload = String(html || "");
    if (typeof globalThis?.desktopShell?.exportRichTextDocx === "function") {
      try {
        const result = await globalThis.desktopShell.exportRichTextDocx({
          html: payload,
          returnBytes: true,
          defaultName: filename,
          title: options.title || "导出 Word",
          buttonLabel: options.buttonLabel || "保存 Word",
          documentOptions: options.documentOptions && typeof options.documentOptions === "object"
            ? options.documentOptions
            : {},
        });
        if (options.signal?.aborted) return { ok: false, canceled: true };
        if (result?.ok && result.bytes) return saveGeneratedDocx(result.bytes, name, options);
        if (result?.ok) {
          return {
            ...result,
            message: result.message || buildSavedMessage(result.path || filename, "Word 已导出"),
          };
        }
        return result;
      } catch (error) {
        const message = String(error?.message || "").trim();
        const bridgeMissing =
          /No handler registered/i.test(message) ||
          /export-rich-text-docx/i.test(message) ||
          /channel closed/i.test(message);
        if (!bridgeMissing) {
          return {
            ok: false,
            canceled: false,
            error: message || "Word 导出失败",
          };
        }
      }
    }
    return saveHtmlAsWordFile(payload, {
      ...options,
      defaultName: name,
    });
  }

  async function saveWordAstAsDocxFile(ast, options = {}) {
    if (options.signal?.aborted) return { ok: false, canceled: true };
    const name = normalizeExportName(options.defaultName || "freeflow-word", "freeflow-word");
    const filename = `${name}.docx`;
    if (typeof globalThis?.desktopShell?.exportWordDocx === "function") {
      try {
        const result = await globalThis.desktopShell.exportWordDocx({
          ast: ast && typeof ast === "object" ? ast : null,
          returnBytes: true,
          defaultName: filename,
          title: options.title || "导出 Word",
          buttonLabel: options.buttonLabel || "保存 Word",
        });
        if (options.signal?.aborted) return { ok: false, canceled: true };
        if (result?.ok && result.bytes) return saveGeneratedDocx(result.bytes, name, options);
        if (result?.ok) {
          return {
            ...result,
            message: result.message || buildSavedMessage(result.path || filename, "Word 已导出"),
          };
        }
        return result;
      } catch (error) {
        const message = String(error?.message || "").trim();
        const bridgeMissing =
          /No handler registered/i.test(message) ||
          /export-word-docx/i.test(message) ||
          /channel closed/i.test(message);
        if (bridgeMissing) {
          return null;
        }
        return {
          ok: false,
          canceled: false,
          error: message || "结构化 Word 导出失败",
        };
      }
    }
    return null;
  }

  return {
    saveDataUrlAsImage,
    saveBlobAsFile,
    saveBytesAsFile,
    saveTextAsFile,
    saveHtmlAsFile,
    saveHtmlAsWordFile,
    saveHtmlAsDocxWordFile,
    saveWordAstAsDocxFile,
  };
}
