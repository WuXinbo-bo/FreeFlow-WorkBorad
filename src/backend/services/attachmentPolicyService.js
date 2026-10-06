const path = require("path");

const MIB = 1024 * 1024;

const DEFAULT_ATTACHMENT_POLICY = Object.freeze({
  imageMaxBytes: 5 * MIB,
  fileMaxBytes: 10 * MIB,
  videoMaxBytes: 0,
  batchMaxBytes: 25 * MIB,
  repositoryWarningBytes: 200 * MIB,
  repositoryMaxBytes: 500 * MIB,
  syncDocuments: true,
  syncImages: true,
  syncVideos: false,
});

const VIDEO_MIME_RE = /^video\//i;
const IMAGE_MIME_RE = /^image\//i;
const TEXT_MIME_RE = /^(text\/|application\/(json|xml|javascript|x-javascript|rtf))/i;
const DOCUMENT_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf", ".txt", ".md",
]);

function finiteBytes(value, fallback = 0) {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? Math.floor(bytes) : fallback;
}

function normalizePolicy(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const result = { ...DEFAULT_ATTACHMENT_POLICY };
  for (const key of Object.keys(DEFAULT_ATTACHMENT_POLICY)) {
    if (typeof DEFAULT_ATTACHMENT_POLICY[key] === "boolean") {
      result[key] = source[key] == null ? DEFAULT_ATTACHMENT_POLICY[key] : Boolean(source[key]);
    } else if (source[key] != null) {
      result[key] = finiteBytes(source[key], DEFAULT_ATTACHMENT_POLICY[key]);
    }
  }
  result.imageMaxBytes = Math.min(result.imageMaxBytes, 50 * MIB);
  result.fileMaxBytes = Math.min(result.fileMaxBytes, 50 * MIB);
  result.videoMaxBytes = Math.min(result.videoMaxBytes, 50 * MIB);
  result.batchMaxBytes = Math.min(result.batchMaxBytes, 100 * MIB);
  result.repositoryWarningBytes = Math.min(result.repositoryWarningBytes, result.repositoryMaxBytes);
  return result;
}

function classifyAttachment({ name = "", mime = "", kind = "" } = {}) {
  const cleanMime = String(mime || "").trim().toLowerCase();
  const extension = path.extname(String(name || "")).toLowerCase();
  if (VIDEO_MIME_RE.test(cleanMime) || String(kind).toLowerCase() === "video") return "video";
  if (IMAGE_MIME_RE.test(cleanMime) || String(kind).toLowerCase() === "image") return "image";
  if (TEXT_MIME_RE.test(cleanMime) || DOCUMENT_EXTENSIONS.has(extension)) return "document";
  return "file";
}

function evaluateAttachment(input = {}, options = {}) {
  const policy = normalizePolicy(options.policy || options);
  const category = classifyAttachment(input);
  const sizeBytes = finiteBytes(input.sizeBytes ?? input.size, 0);
  const limit = category === "image" ? policy.imageMaxBytes : category === "video" ? policy.videoMaxBytes : policy.fileMaxBytes;
  let reason = "";
  if (category === "video" && !policy.syncVideos) reason = "video-disabled";
  else if (category === "image" && !policy.syncImages) reason = "image-disabled";
  else if (category === "document" && !policy.syncDocuments) reason = "document-disabled";
  else if (limit <= 0) reason = "type-disabled";
  else if (sizeBytes > limit) reason = "too-large";
  else if (finiteBytes(options.repositoryBytes, 0) + sizeBytes > policy.repositoryMaxBytes) reason = "repository-quota";
  return {
    category,
    sizeBytes,
    limitBytes: limit,
    syncable: !reason,
    mode: reason ? "placeholder" : "asset",
    reason,
    name: String(input.name || "附件").trim() || "附件",
    mime: String(input.mime || input.mimeType || "application/octet-stream").trim() || "application/octet-stream",
  };
}

function createPlaceholderMetadata(input = {}, evaluation = {}) {
  const result = evaluation && typeof evaluation === "object" ? evaluation : evaluateAttachment(input);
  return {
    resourceStatus: "placeholder",
    syncable: false,
    syncReason: String(result.reason || "not-syncable"),
    name: String(input.name || result.name || "附件").trim() || "附件",
    mime: String(input.mime || input.mimeType || result.mime || "application/octet-stream").trim(),
    sizeBytes: finiteBytes(input.sizeBytes ?? input.size, result.sizeBytes),
    category: result.category || classifyAttachment(input),
  };
}

function formatBytes(bytes) {
  const value = finiteBytes(bytes, 0);
  if (value < MIB) return `${value} B`;
  return `${(value / MIB).toFixed(value >= 10 * MIB ? 0 : 1)} MiB`;
}

module.exports = {
  MIB,
  DEFAULT_ATTACHMENT_POLICY,
  normalizePolicy,
  classifyAttachment,
  evaluateAttachment,
  createPlaceholderMetadata,
  formatBytes,
};
