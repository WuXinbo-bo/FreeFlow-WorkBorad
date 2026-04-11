import {
  formatBytes,
  getDirectoryName,
  getFileBaseName,
  getFileExtension,
  getFileNameFromPath,
} from "./canvasUtils.js";

const FILE_KIND_DEFS = {
  folder: {
    label: "文件夹",
    icon: "📁",
    background: "#FFF4CC",
    textColor: "#8A6A00",
    borderColor: "#E7D48B",
  },
  image: {
    label: "图片",
    icon: "🖼️",
    background: "#E9F2FF",
    textColor: "#2F6DB3",
    borderColor: "#BCD5FF",
  },
  video: {
    label: "视频",
    icon: "🎞️",
    background: "#FFF0E0",
    textColor: "#B56A2E",
    borderColor: "#F1CAA0",
  },
  audio: {
    label: "音频",
    icon: "🎵",
    background: "#FDEBFF",
    textColor: "#9B4FB0",
    borderColor: "#E3BDEB",
  },
  pdf: {
    label: "PDF",
    icon: "📕",
    background: "#FFECEC",
    textColor: "#B24A4A",
    borderColor: "#F4C3C3",
  },
  document: {
    label: "文档",
    icon: "📄",
    background: "#E7F1FF",
    textColor: "#2F6DB3",
    borderColor: "#BFD8FF",
  },
  sheet: {
    label: "表格",
    icon: "📊",
    background: "#E6F7EA",
    textColor: "#2E7D4E",
    borderColor: "#B8E3C4",
  },
  archive: {
    label: "压缩包",
    icon: "🗜️",
    background: "#F4F0E8",
    textColor: "#7D6851",
    borderColor: "#D9CBB8",
  },
  code: {
    label: "代码",
    icon: "</>",
    background: "#EAF2F8",
    textColor: "#476B89",
    borderColor: "#C5D8E7",
  },
  font: {
    label: "字体",
    icon: "Aa",
    background: "#F3ECFF",
    textColor: "#6F53A7",
    borderColor: "#D7C4F3",
  },
  generic: {
    label: "文件",
    icon: "📦",
    background: "#F1F3F5",
    textColor: "#5F6B76",
    borderColor: "#D7DDE3",
  },
};

const EXT_KIND_RULES = [
  { kind: "pdf", extensions: ["pdf"] },
  {
    kind: "image",
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "heic", "avif", "svg"],
    mimeIncludes: ["image/"],
  },
  {
    kind: "video",
    extensions: ["mp4", "mov", "avi", "mkv", "webm", "flv", "m4v", "3gp"],
    mimeIncludes: ["video/"],
  },
  {
    kind: "audio",
    extensions: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "opus"],
    mimeIncludes: ["audio/"],
  },
  {
    kind: "sheet",
    extensions: ["xls", "xlsx", "csv", "ods", "numbers", "tsv"],
    mimeIncludes: ["spreadsheet", "excel", "csv"],
  },
  {
    kind: "document",
    extensions: ["doc", "docx", "rtf", "odt", "txt", "md", "markdown", "pages"],
    mimeIncludes: ["word", "document", "text/"],
  },
  {
    kind: "archive",
    extensions: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz"],
    mimeIncludes: ["zip", "rar", "compressed", "gzip", "tar"],
  },
  {
    kind: "code",
    extensions: [
      "js",
      "mjs",
      "cjs",
      "ts",
      "tsx",
      "jsx",
      "json",
      "yml",
      "yaml",
      "xml",
      "html",
      "htm",
      "css",
      "scss",
      "sass",
      "less",
      "py",
      "java",
      "go",
      "rs",
      "sh",
      "ps1",
      "bat",
      "cmd",
      "sql",
      "vue",
      "svelte",
      "toml",
      "ini",
    ],
    mimeIncludes: ["json", "xml", "javascript", "typescript", "python", "html", "css", "shellscript"],
  },
  {
    kind: "font",
    extensions: ["ttf", "otf", "woff", "woff2", "eot", "ttc"],
    mimeIncludes: ["font"],
  },
];

function normalizePathLike(value = "") {
  return String(value || "")
    .replace(/\0/g, "")
    .replaceAll("\\", "/")
    .trim();
}

function getPathParts(input = "") {
  const normalized = normalizePathLike(input);
  const baseName = getFileNameFromPath(normalized || "");
  const ext = getFileExtension(baseName);
  return {
    input: normalized,
    root: normalized.startsWith("/") ? "/" : "",
    dir: getDirectoryName(normalized),
    base: baseName,
    name: getFileBaseName(baseName),
    ext,
  };
}

function inferKindFromSignature({
  kind = "",
  fileName = "",
  mimeType = "",
  detectedMimeType = "",
  ext = "",
  isDirectory = false,
} = {}) {
  const explicitKind = String(kind || "").trim();
  if (["folder", "image", "video", "audio", "pdf", "document", "sheet", "archive", "code", "font", "generic"].includes(explicitKind)) {
    return explicitKind;
  }
  const normalizedMime = String(detectedMimeType || mimeType || "").trim().toLowerCase();
  const normalizedExt = String(ext || getFileExtension(fileName) || "").trim().toLowerCase();

  if (isDirectory || normalizedMime === "inode/directory") {
    return "folder";
  }

  for (const rule of EXT_KIND_RULES) {
    if (rule.extensions?.includes(normalizedExt)) {
      return rule.kind;
    }
  }

  for (const rule of EXT_KIND_RULES) {
    if (rule.mimeIncludes?.some((needle) => normalizedMime.includes(needle))) {
      return rule.kind;
    }
  }

  if (normalizedMime.startsWith("image/")) return "image";
  if (normalizedMime.startsWith("video/")) return "video";
  if (normalizedMime.startsWith("audio/")) return "audio";
  return "generic";
}

export function getCanvasFileKindMeta(item = {}) {
  const kind = inferKindFromSignature(item);
  return FILE_KIND_DEFS[kind] || FILE_KIND_DEFS.generic;
}

export function parseCanvasFilePath(input = "") {
  return getPathParts(input);
}

export function buildCanvasFileMetadataFromPath(filePath = "") {
  const pathInfo = getPathParts(filePath);
  const kind = inferKindFromSignature({
    fileName: pathInfo.base,
    ext: pathInfo.ext,
  });
  const kindMeta = getCanvasFileKindMeta({ kind, fileName: pathInfo.base, ext: pathInfo.ext });
  return {
    kind,
    title: pathInfo.base,
    fileName: pathInfo.base,
    fileBaseName: pathInfo.name,
    fileExt: pathInfo.ext,
    detectedExt: "",
    mimeType: "",
    detectedMimeType: "",
    fileSize: 0,
    hasFileSize: false,
    sizeLabel: "未读取",
    locationLabel: pathInfo.dir || (pathInfo.root ? pathInfo.root : "本地文件"),
    pathInfo,
    iconKey: kind,
    iconLabel: kindMeta.icon,
    typeLabel: kindMeta.label,
    summaryLabel: [pathInfo.ext ? `.${pathInfo.ext}` : kindMeta.label, "路径素材"].filter(Boolean).join(" · "),
  };
}

export async function detectCanvasFileMetadata(file) {
  const name = getFileNameFromPath(String(file?.name || ""));
  const relativePath = normalizePathLike(file?.path || file?.webkitRelativePath || name);
  const pathInfo = getPathParts(relativePath || name);
  const mimeType = String(file?.type || "").trim().toLowerCase();
  const detectedExt = "";
  const fileExt = pathInfo.ext || getFileExtension(name);
  const kind = inferKindFromSignature({
    fileName: name,
    mimeType,
    detectedMimeType: mimeType,
    ext: fileExt,
    isDirectory: Boolean(file?.isDirectory),
  });
  const kindMeta = getCanvasFileKindMeta({
    kind,
    fileName: name,
    mimeType,
    detectedMimeType: mimeType,
    ext: fileExt,
  });
  const fileSize = Number(file?.size) || 0;
  const locationLabel = pathInfo.dir || (file?.webkitRelativePath ? "文件夹选择" : file?.path ? "本地文件" : "浏览器文件");
  const summaryLabel = [fileExt ? `.${fileExt}` : kindMeta.label, formatBytes(fileSize), locationLabel]
    .filter(Boolean)
    .join(" · ");

  return {
    kind,
    title: name || pathInfo.base || "未命名文件",
    fileName: name || pathInfo.base || "未命名文件",
    fileBaseName: pathInfo.name || name || "未命名文件",
    fileExt,
    detectedExt,
    mimeType,
    detectedMimeType: mimeType,
    fileSize,
    hasFileSize: true,
    sizeLabel: formatBytes(fileSize),
    locationLabel,
    pathInfo,
    iconKey: kind,
    iconLabel: kindMeta.icon,
    typeLabel: kindMeta.label,
    summaryLabel,
  };
}
