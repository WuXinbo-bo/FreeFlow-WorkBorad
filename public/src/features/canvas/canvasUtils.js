export function clampNumber(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(Math.max(numeric, min), max);
}

export function truncate(text, maxLength = 24) {
  return String(text || "").slice(0, Math.max(0, Number(maxLength) || 0));
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeCssColor(value = "") {
  return String(value || "").replace(/["'<>]/g, "").trim();
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function normalizePathLike(value = "") {
  return String(value || "").replace(/\0/g, "").replaceAll("\\", "/").trim();
}

function splitPathSegments(value = "") {
  return normalizePathLike(value).split("/").filter(Boolean);
}

export function getFileNameFromPath(filePath = "") {
  const normalized = normalizePathLike(filePath);
  if (!normalized) return "未命名文件";
  return splitPathSegments(normalized).pop() || "未命名文件";
}

export function getFileExtension(fileName = "") {
  const normalized = getFileNameFromPath(fileName);
  if (!normalized) return "";
  const index = normalized.lastIndexOf(".");
  if (index <= 0 || index === normalized.length - 1) {
    return "";
  }
  return normalized.slice(index + 1).toLowerCase();
}

export function getFileBaseName(fileName = "") {
  const normalized = getFileNameFromPath(fileName);
  const index = normalized.lastIndexOf(".");
  if (index <= 0) {
    return normalized;
  }
  return normalized.slice(0, index);
}

export function getDirectoryName(filePath = "") {
  const normalized = normalizePathLike(filePath);
  if (!normalized) return "";
  const segments = splitPathSegments(normalized);
  if (!segments.length) return "";
  segments.pop();
  return segments.join("/");
}

export function sanitizeCanvasTextPreview(text, maxLength = 8000) {
  return String(text || "").replace(/\0/g, "").trim().slice(0, maxLength);
}

export function sanitizeCanvasTextboxText(text, maxLength = 8000) {
  return String(text || "").replace(/\0/g, "").replace(/\r\n?/g, "\n").slice(0, maxLength);
}

export function normalizeCanvasTextBoxFontSize(fontSize, fallback = 18) {
  return clampNumber(fontSize, 14, 72, fallback);
}

export function clampCanvasScale(scale, fallback = 1, min = 0.02, max = 24) {
  return clampNumber(scale, min, max, fallback);
}

export function buildCanvasTextTitle(text = "") {
  const firstLine =
    String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || "文本框";
  return truncate(firstLine, 24);
}

export function formatCanvasTextboxHtml(text = "") {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

export function isExtractableCanvasFile(fileName = "", mimeType = "") {
  const normalizedName = String(fileName || "").trim().toLowerCase();
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  return (
    normalizedMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    normalizedMimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    normalizedMimeType === "application/pdf" ||
    normalizedName.endsWith(".docx") ||
    normalizedName.endsWith(".pptx") ||
    normalizedName.endsWith(".pdf")
  );
}
