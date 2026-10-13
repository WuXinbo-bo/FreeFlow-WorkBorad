import { getFileName, sanitizeText } from "./utils.js";

function isImageUrl(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return false;
  if (/^data:image\//i.test(clean)) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(clean);
}

function extractImageUrlFromUriList(raw = "") {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  return lines.find((line) => isImageUrl(line)) || "";
}

function extractImageUrlFromHtml(html = "") {
  const match = String(html || "").match(/<img[^>]+src=["']([^"']+)["']/i);
  const src = match ? match[1] : "";
  return isImageUrl(src) ? src : "";
}

async function fetchImageAsObjectUrl(url = "") {
  const target = String(url || "").trim();
  if (!target) return "";
  const response = await fetch(target, { mode: "cors", credentials: "omit" });
  if (!response.ok) {
    throw new Error("Image fetch failed");
  }
  const blob = await response.blob();
  if (!blob || !blob.size) {
    throw new Error("Empty image blob");
  }
  return URL.createObjectURL(blob);
}

function buildPreviewLabel(dataTransfer) {
  const types = Array.from(dataTransfer?.types || []);
  if (types.includes("Files")) {
    const count = Array.from(dataTransfer?.items || []).filter(item => item.kind === "file").length || dataTransfer?.files?.length || 0;
    return count ? `在此导入 ${count} 个文件` : "在此导入文件";
  }
  if (types.includes("text/uri-list")) return "在此导入链接或图片";
  if (types.includes("text/html")) {
    return "松开导入网页富文本";
  }
  if (types.includes("text/plain") || types.includes("text")) {
    return "松开创建文本";
  }
  return "松开导入内容";
}

export function createDrawToolModule({
  createTextElement,
  createImageElement,
  readImageDimensions,
  readFileAsDataUrl,
} = {}) {
  let previewEl = null;

  function ensurePreview(surface) {
    if (previewEl && previewEl.isConnected) {
      return previewEl;
    }
    if (!(surface instanceof HTMLElement)) {
      return null;
    }
    previewEl = surface.querySelector(".canvas2d-drag-preview");
    if (!(previewEl instanceof HTMLDivElement)) {
      previewEl = document.createElement("div");
      previewEl.className = "canvas2d-drag-preview is-hidden";
      surface.appendChild(previewEl);
    }
    return previewEl;
  }

  function showPreview(surface, clientX, clientY, label) {
    const node = ensurePreview(surface);
    if (!node) return;
    node.textContent = label;
    const rect = surface.getBoundingClientRect();
    node.style.left = `${Math.round(Math.max(0, Math.min(clientX - rect.left + 12, rect.width - 180)))}px`;
    node.style.top = `${Math.round(Math.max(0, Math.min(clientY - rect.top + 12, rect.height - 40)))}px`;
    node.classList.remove("is-hidden");
  }

  function hidePreview() {
    if (previewEl) {
      previewEl.classList.add("is-hidden");
    }
  }

  function handleDragOver({ event, surface } = {}) {
    if (!event?.dataTransfer) {
      return;
    }
    const label = buildPreviewLabel(event.dataTransfer);
    showPreview(surface, event.clientX, event.clientY, label);
  }

  function handleDragLeave() {
    hidePreview();
  }

  async function handleDrop({ event, dataTransfer, anchor } = {}) {
    hidePreview();
    const transfer = dataTransfer || event?.dataTransfer;
    if (!transfer) {
      return { handled: false, items: [] };
    }

    const files = Array.from(transfer.files || []);
    const imageFile = files.find((file) => String(file?.type || "").startsWith("image/"));
    if (imageFile && typeof createImageElement === "function") {
      const dataUrl = await readFileAsDataUrl(imageFile);
      const dimensions = await readImageDimensions(dataUrl, "");
      return {
        handled: true,
        items: [createImageElement(imageFile, anchor, dataUrl, dimensions)],
      };
    }

    const uriList = transfer.getData?.("text/uri-list") || "";
    const html = transfer.getData?.("text/html") || "";
    const url = extractImageUrlFromUriList(uriList) || extractImageUrlFromHtml(html);
    if (url && typeof createImageElement === "function") {
      let dataUrl = "";
      try {
        dataUrl = await fetchImageAsObjectUrl(url);
      } catch {
        dataUrl = url;
      }
      const fileLike = {
        name: getFileName(url),
        type: "image/*",
        path: "",
      };
      const dimensions = await readImageDimensions(dataUrl, "");
      return {
        handled: true,
        items: [createImageElement(fileLike, anchor, dataUrl, dimensions)],
      };
    }

    const plain = transfer.getData?.("text/plain") || transfer.getData?.("text") || "";
    const clean = sanitizeText(plain);
    if (clean.trim() && typeof createTextElement === "function") {
      return {
        handled: true,
        items: [createTextElement(anchor, clean)],
      };
    }

    return { handled: false, items: [] };
  }

  return {
    handleDragOver,
    handleDragLeave,
    hidePreview,
    handleDrop,
  };
}
