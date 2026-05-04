export function createCanvasImageStorageManager(deps) {
  const {
    state,
    useLocalFileSystem,
    resolveCanvasBoardSavePath,
    resolveCanvasImageSavePath,
    resolveBoardFolderPath,
    joinPath,
    stripTrailingSeparators,
    getFileNameFromPath,
    getFileExtension,
    readImageDimensions,
    resolveImageSource,
    setSaveToast,
    getImageItemById,
    renderImageToCanvas,
    safeCanvasToDataUrl,
    takeHistorySnapshot,
    commitHistory,
  } = deps;

  function normalizeExportName(value, fallback) {
    const base = String(value || "").trim() || fallback;
    return base.replace(/[\\/:*?"<>|]+/g, "_");
  }

  function getDataUrlMime(dataUrl = "") {
    const match = String(dataUrl || "").match(/^data:([^;]+);/i);
    return match ? match[1] : "";
  }

  async function readDataUrlAsBase64(dataUrl = "") {
    const raw = String(dataUrl || "").trim();
    if (!raw) {
      return { data: "", mime: "" };
    }
    if (raw.startsWith("data:")) {
      const mime = getDataUrlMime(raw);
      const data = raw.split(",")[1] || "";
      return { data, mime };
    }
    const response = await fetch(raw);
    if (!response.ok) {
      throw new Error("图片读取失败");
    }
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return { data: btoa(binary), mime: blob.type || "" };
  }

  function base64ToBytes(base64 = "") {
    const clean = String(base64 || "");
    if (!clean) {
      return new Uint8Array();
    }
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function getImageExtensionFromMime(mime = "", name = "", sourcePath = "") {
    const cleanMime = String(mime || "").toLowerCase();
    if (cleanMime.includes("png")) return "png";
    if (cleanMime.includes("jpeg") || cleanMime.includes("jpg")) return "jpg";
    if (cleanMime.includes("webp")) return "webp";
    if (cleanMime.includes("gif")) return "gif";
    if (cleanMime.includes("bmp")) return "bmp";
    const nameExt = getFileExtension(name || "");
    if (nameExt) {
      return nameExt.replace(/^\./, "");
    }
    const pathExt = getFileExtension(sourcePath || "");
    if (pathExt) {
      return pathExt.replace(/^\./, "");
    }
    return "png";
  }

  function formatImageMimeFromExtension(extension = "") {
    const ext = String(extension || "").trim().toLowerCase().replace(/^\./, "");
    if (!ext) {
      return "";
    }
    if (ext === "jpg") {
      return "image/jpeg";
    }
    if (ext === "svg") {
      return "image/svg+xml";
    }
    return `image/${ext}`;
  }

  async function resolveImportImageFolder() {
    if (!useLocalFileSystem || typeof globalThis?.desktopShell?.writeFile !== "function") {
      return "";
    }
    let baseFolder = resolveBoardFolderPath(state.boardFilePath);
    if (!baseFolder) {
      const settingsPath = await resolveCanvasBoardSavePath();
      baseFolder = resolveBoardFolderPath(settingsPath) || String(settingsPath || "").trim();
    }
    if (!baseFolder) {
      const configuredPath = await resolveCanvasImageSavePath();
      baseFolder = String(configuredPath || "").trim();
    }
    if (!baseFolder) {
      return "";
    }
    const normalizedFolder = stripTrailingSeparators(baseFolder);
    if (getFileNameFromPath(normalizedFolder).toLowerCase() === "importimage") {
      return normalizedFolder;
    }
    return joinPath(normalizedFolder, "importImage");
  }

  async function resolveCanvasImageManagerFolder() {
    const importFolder = await resolveImportImageFolder();
    if (importFolder) {
      return importFolder;
    }
    const configuredPath = await resolveCanvasImageSavePath();
    return String(configuredPath || "").trim();
  }

  async function ensureImportImageFolderExists() {
    if (!useLocalFileSystem || typeof globalThis?.desktopShell?.writeFile !== "function") {
      return false;
    }
    const folder = await resolveImportImageFolder();
    if (!folder) {
      return false;
    }
    const markerPath = joinPath(folder, ".keep");
    const result = await globalThis.desktopShell.writeFile(markerPath, new Uint8Array());
    return Boolean(result?.ok);
  }

  async function ensureCanvasImageManagerFolderExists() {
    const folder = await resolveCanvasImageManagerFolder();
    if (!folder || typeof globalThis?.desktopShell?.ensureDirectory !== "function") {
      return false;
    }
    const result = await globalThis.desktopShell.ensureDirectory(folder);
    return Boolean(result?.ok);
  }

  async function saveImageDataToImportFolder({ dataUrl = "", sourcePath = "", name = "image", mime = "" } = {}) {
    const folder = await resolveImportImageFolder();
    if (!folder) {
      return { ok: false, filePath: "", mime: "", error: "未找到当前画布目录" };
    }
    let payload = { data: "", mime: mime || "" };
    if (dataUrl) {
      payload = await readDataUrlAsBase64(dataUrl);
    }
    if (!payload.data && sourcePath && typeof globalThis?.desktopShell?.readFileBase64 === "function") {
      try {
        const result = await globalThis.desktopShell.readFileBase64(sourcePath);
        if (result?.ok && result.data) {
          payload = { data: result.data, mime: String(result.mime || payload.mime || "") };
        }
      } catch {
        // ignore read failures
      }
    }
    if (!payload.data) {
      return { ok: false, filePath: "", mime: "", error: "图片数据为空" };
    }
    const ext = getImageExtensionFromMime(payload.mime, name, sourcePath);
    const cleanName = normalizeExportName(name || "image", "image");
    const filename = `${cleanName}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${ext}`;
    const filePath = joinPath(folder, filename);
    let bytes;
    try {
      bytes = base64ToBytes(payload.data);
    } catch {
      try {
        const response = await fetch(dataUrl);
        const buffer = await response.arrayBuffer();
        bytes = new Uint8Array(buffer);
      } catch {
        return { ok: false, filePath: "", mime: "", error: "图片编码失败" };
      }
    }
    const result = await globalThis.desktopShell.writeFile(filePath, bytes);
    if (!result?.ok) {
      return { ok: false, filePath: "", mime: "", error: result?.error || "写入文件失败" };
    }
    return {
      ok: true,
      filePath: String(result.filePath || filePath),
      mime: payload.mime || `image/${ext === "jpg" ? "jpeg" : ext}`,
      size: Number(result.size || bytes.byteLength || 0),
    };
  }

  async function saveImageItemToImportFolder(item, { dataUrlOverride = "", nameOverride = "", resetTransforms = false } = {}) {
    if (!item || item.type !== "image") {
      return false;
    }
    const name = String(nameOverride || item.name || item.fileName || "image").trim() || "image";
    const dataUrl = String(dataUrlOverride || item.dataUrl || "").trim();
    const sourcePath = String(item.sourcePath || "").trim();
    const result = await saveImageDataToImportFolder({ dataUrl, sourcePath, name, mime: item.mime || "" });
    if (!result?.ok || !result.filePath) {
      return false;
    }
    item.sourcePath = result.filePath;
    item.source = "path";
    item.dataUrl = "";
    item.fileId = "";
    if (result.mime) {
      item.mime = result.mime;
    }
    if (resetTransforms) {
      item.crop = null;
      item.rotation = 0;
      item.flipX = false;
      item.flipY = false;
      item.brightness = 0;
      item.contrast = 0;
    }
    const dimensions = await readImageDimensions("", result.filePath, { allowLocalFileAccess: true });
    if (dimensions?.width && dimensions?.height) {
      item.naturalWidth = dimensions.width;
      item.naturalHeight = dimensions.height;
    }
    return true;
  }

  async function persistImportedImages(items = []) {
    if (!Array.isArray(items) || !items.length) {
      return false;
    }
    let saved = 0;
    for (const item of items) {
      if (item?.type !== "image") {
        continue;
      }
      const ok = await saveImageItemToImportFolder(item);
      if (ok) {
        saved += 1;
      }
    }
    if (saved) {
      setSaveToast("图片已保存至当前画布目录下的 importImage 文件夹");
    }
    return saved > 0;
  }

  async function saveCroppedImageItem(itemId) {
    const item = getImageItemById(itemId);
    if (!item) {
      return false;
    }
    const source = resolveImageSource(item.dataUrl, item.sourcePath, { allowLocalFileAccess: true });
    if (!source) {
      return false;
    }
    const image = await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = source;
    });
    if (!image) {
      return false;
    }
    const canvas = renderImageToCanvas(item, image);
    if (!canvas) {
      return false;
    }
    const dataUrl = safeCanvasToDataUrl(canvas);
    if (!dataUrl) {
      return false;
    }
    const before = takeHistorySnapshot();
    const ok = await saveImageItemToImportFolder(item, {
      dataUrlOverride: dataUrl,
      nameOverride: `${item.name || "image"}-crop`,
      resetTransforms: true,
    });
    if (!ok) {
      return false;
    }
    commitHistory(before, "保存裁剪图片");
    setSaveToast("图片已保存至当前画布目录下的 importImage 文件夹");
    return true;
  }

  async function listManagedImages(folderPath = "") {
    const targetFolder = String(folderPath || "").trim() || (await resolveCanvasImageManagerFolder());
    if (!targetFolder) {
      return { ok: true, folderPath: "", images: [], error: "" };
    }
    if (typeof globalThis?.desktopShell?.listCanvasImages !== "function") {
      return { ok: false, folderPath: targetFolder, images: [], error: "当前环境不支持读取图片目录" };
    }
    const result = await globalThis.desktopShell.listCanvasImages({ folderPath: targetFolder });
    if (!result?.ok) {
      return {
        ok: false,
        folderPath: String(result?.folderPath || targetFolder).trim(),
        images: [],
        error: result?.error || "读取图片目录失败",
      };
    }
    const images = Array.isArray(result.images)
      ? result.images.map((entry) => {
          const filePath = String(entry?.filePath || "").trim();
          const name = String(entry?.name || getFileNameFromPath(filePath) || "未命名图片").trim();
          const extension = String(entry?.extension || getFileExtension(name) || "").trim().replace(/^\./, "");
          return {
            id: filePath || `${name}-${entry?.modifiedAt || 0}`,
            name,
            filePath,
            size: Number(entry?.size || 0) || 0,
            modifiedAt: Number(entry?.modifiedAt || 0) || 0,
            extension,
            mime: formatImageMimeFromExtension(extension),
          };
        })
      : [];
    return {
      ok: true,
      folderPath: String(result.folderPath || targetFolder).trim(),
      images,
      error: "",
    };
  }

  return {
    normalizeExportName,
    resolveImportImageFolder,
    resolveCanvasImageManagerFolder,
    ensureImportImageFolderExists,
    ensureCanvasImageManagerFolderExists,
    saveImageDataToImportFolder,
    saveImageItemToImportFolder,
    persistImportedImages,
    saveCroppedImageItem,
    listManagedImages,
  };
}
