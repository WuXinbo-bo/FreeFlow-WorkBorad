const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "json", "yaml", "yml", "xml", "html", "css", "js", "ts", "jsx", "tsx", "py", "sh", "log"]);
export function getFileCapabilities(value = "") {
  const ext = String(value).split(/[\\/]/).pop().split(".").pop().toLowerCase();
  const previewKind = ext === "pdf" || ext === "docx" ? ext : ["csv", "tsv", "xlsx"].includes(ext) ? "table" : TEXT_EXTENSIONS.has(ext) ? "text" : ["png", "jpg", "jpeg", "webp"].includes(ext) ? "image" : "";
  const conversions = ext === "pdf" ? ["pdf-images"] : ["png", "jpg", "jpeg", "webp"].includes(ext) ? ["image-format", "images-pdf"] : ["txt", "md", "markdown"].includes(ext) ? ["text-docx", "text-pdf"] : ["csv", "tsv", "xlsx"].includes(ext) ? ["sheet-format", ...(ext === "xlsx" ? ["office-pdf"] : [])] : ["docx", "pptx"].includes(ext) ? ["office-pdf"] : [];
  return { ext, previewKind, conversions };
}
