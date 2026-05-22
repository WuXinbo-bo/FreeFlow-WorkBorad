const FILE_TYPE_TAGS = [
  {
    key: "folder",
    label: "文件夹",
    background: "#FFF4CC",
    textColor: "#8A6A00",
    borderColor: "#E7D48B",
    extensions: [],
    mimeIncludes: ["inode/directory"],
  },
  {
    key: "document",
    label: "文档",
    background: "#E7F1FF",
    textColor: "#2F6DB3",
    borderColor: "#BFD8FF",
    extensions: ["doc", "docx", "rtf", "odt", "txt", "md", "pages"],
    mimeIncludes: ["word", "officedocument.wordprocessingml", "rtf", "text/plain"],
  },
  {
    key: "sheet",
    label: "表格",
    background: "#E6F7EA",
    textColor: "#2E7D4E",
    borderColor: "#B8E3C4",
    extensions: ["xls", "xlsx", "csv", "ods", "numbers"],
    mimeIncludes: ["excel", "spreadsheet", "csv"],
  },
  {
    key: "slide",
    label: "PPT",
    background: "#FFE8E6",
    textColor: "#B2534A",
    borderColor: "#F6C2BC",
    extensions: ["ppt", "pptx", "key"],
    mimeIncludes: ["powerpoint", "presentation"],
  },
  {
    key: "pdf",
    label: "PDF",
    background: "#FFECEC",
    textColor: "#B24A4A",
    borderColor: "#F4C3C3",
    extensions: ["pdf"],
    mimeIncludes: ["pdf"],
  },
  {
    key: "image",
    label: "图片",
    background: "#F4ECFF",
    textColor: "#7B55B5",
    borderColor: "#D8C2F4",
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "heic"],
    mimeIncludes: ["image/"],
  },
  {
    key: "video",
    label: "视频",
    background: "#FFF0E0",
    textColor: "#B56A2E",
    borderColor: "#F1CAA0",
    extensions: ["mp4", "mov", "avi", "mkv", "webm", "flv"],
    mimeIncludes: ["video/"],
  },
  {
    key: "audio",
    label: "音频",
    background: "#FDEBFF",
    textColor: "#9B4FB0",
    borderColor: "#E3BDEB",
    extensions: ["mp3", "wav", "flac", "aac", "ogg", "m4a"],
    mimeIncludes: ["audio/"],
  },
  {
    key: "archive",
    label: "压缩包",
    background: "#F4F0E8",
    textColor: "#7D6851",
    borderColor: "#D9CBB8",
    extensions: ["zip", "rar", "7z", "tar", "gz", "bz2"],
    mimeIncludes: ["zip", "rar", "compressed", "gzip", "tar"],
  },
  {
    key: "code",
    label: "代码",
    background: "#EAF2F8",
    textColor: "#476B89",
    borderColor: "#C5D8E7",
    extensions: [
      "js",
      "ts",
      "tsx",
      "jsx",
      "json",
      "yml",
      "yaml",
      "xml",
      "html",
      "css",
      "scss",
      "py",
      "java",
      "go",
      "rs",
      "sh",
      "ps1",
      "bat",
      "sql",
      "vue",
    ],
    mimeIncludes: ["json", "xml", "javascript", "typescript", "python", "html", "css", "shellscript"],
  },
  {
    key: "design",
    label: "设计",
    background: "#FFF1F7",
    textColor: "#B25A83",
    borderColor: "#F0C6D8",
    extensions: ["psd", "ai", "fig", "sketch", "xd"],
    mimeIncludes: [],
  },
  {
    key: "app",
    label: "程序",
    background: "#EEF0F4",
    textColor: "#5B6475",
    borderColor: "#D5DAE3",
    extensions: ["exe", "msi", "apk", "dmg", "pkg", "app"],
    mimeIncludes: ["application/x-msdownload", "application/vnd.android.package-archive"],
  },
  {
    key: "generic",
    label: "文件",
    background: "#F1F3F5",
    textColor: "#5F6B76",
    borderColor: "#D7DDE3",
    extensions: [],
    mimeIncludes: [],
  },
];

function getExtension(fileName = "") {
  const normalized = String(fileName || "").trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex + 1) : "";
}

export function getCanvasFileTypeTagMeta(item = {}) {
  const mimeType = String(item?.mimeType || "").trim().toLowerCase();
  const extension = getExtension(item?.fileName || item?.title || "");

  if (item?.isDirectory || mimeType === "inode/directory") {
    return FILE_TYPE_TAGS[0];
  }

  for (const entry of FILE_TYPE_TAGS) {
    if (entry.key === "folder" || entry.key === "generic") continue;
    if (entry.extensions.includes(extension)) {
      return entry;
    }
    if (entry.mimeIncludes.some((pattern) => mimeType.includes(pattern))) {
      return entry;
    }
  }

  return FILE_TYPE_TAGS.find((entry) => entry.key === "generic");
}

export { FILE_TYPE_TAGS };
