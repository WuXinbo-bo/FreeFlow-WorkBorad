function normalizeExportName(value, fallback = "freeflow-board") {
  const base = String(value || "").trim() || fallback;
  return base.replace(/[\\/:*?"<>|]+/g, "_");
}

export function resolvePdfExportOptions(input = {}, defaults = {}) {
  const requestedScale = Number(input?.scale);
  const scale = [1, 2, 3].includes(requestedScale) ? requestedScale : 2;
  const background = input?.background === "transparent" ? "transparent" : "white";
  const orientation = ["portrait", "landscape", "auto"].includes(String(input?.orientation || ""))
    ? String(input.orientation)
    : "auto";
  const pageMode = "fit-single-page";
  const imageFormat = "png";
  const scope = "board";
  const includeGrid = Boolean(input?.includeGrid);
  const preferDownload = Boolean(input?.preferDownload);
  const fileName = normalizeExportName(input?.fileName, defaults.defaultFileName || "freeflow-board");

  return {
    scope,
    scale,
    background,
    includeGrid,
    pageMode,
    fileName,
    orientation,
    imageFormat,
    preferDownload,
  };
}

export function ensurePdfFileName(fileName = "", fallback = "freeflow-board") {
  const normalized = normalizeExportName(fileName, fallback);
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized}.pdf`;
}
