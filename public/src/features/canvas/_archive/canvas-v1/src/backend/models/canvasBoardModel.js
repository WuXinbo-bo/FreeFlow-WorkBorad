const CANVAS_BOARD_VERSION = 1;
const DEFAULT_CANVAS_VIEW = Object.freeze({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
});

function clampCanvasScale(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_CANVAS_VIEW.scale;
  }
  return Math.min(Math.max(numericValue, 0.02), 24);
}

function normalizeCanvasItem(item = {}, index = 0) {
  const source = item && typeof item === "object" ? item : {};
  return {
    id: String(source.id || "").trim(),
    kind: ["text", "image", "file", "textbox"].includes(source.kind) ? source.kind : "text",
    title: String(source.title || "").trim().slice(0, 200),
    text: typeof source.text === "string" ? source.text.slice(0, 20000) : "",
    dataUrl: typeof source.dataUrl === "string" ? source.dataUrl : "",
    filePath: String(source.filePath || "").trim(),
    fileName: String(source.fileName || "").trim(),
    mimeType: String(source.mimeType || "").trim(),
    isDirectory: Boolean(source.isDirectory),
    fileSize: Number(source.fileSize) || 0,
    x: Number.isFinite(Number(source.x)) ? Number(source.x) : index * 44,
    y: Number.isFinite(Number(source.y)) ? Number(source.y) : index * 36,
    width: Number.isFinite(Number(source.width)) ? Number(source.width) : 320,
    height: Number.isFinite(Number(source.height)) ? Number(source.height) : 96,
    fontSize: Number.isFinite(Number(source.fontSize)) ? Number(source.fontSize) : 18,
    bold: Boolean(source.bold),
    highlighted: Boolean(source.highlighted),
    createdAt: Number(source.createdAt) || Date.now(),
  };
}

function getDefaultCanvasBoard() {
  return {
    version: CANVAS_BOARD_VERSION,
    updatedAt: Date.now(),
    view: {
      ...DEFAULT_CANVAS_VIEW,
    },
    selectedIds: [],
    items: [],
  };
}

function normalizeCanvasBoard(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const view = source.view && typeof source.view === "object" ? source.view : {};
  const items = Array.isArray(source.items) ? source.items : [];

  return {
    version: CANVAS_BOARD_VERSION,
    updatedAt: Number(source.updatedAt) || Date.now(),
    view: {
      scale: clampCanvasScale(view.scale),
      offsetX: Number(view.offsetX) || DEFAULT_CANVAS_VIEW.offsetX,
      offsetY: Number(view.offsetY) || DEFAULT_CANVAS_VIEW.offsetY,
    },
    selectedIds: Array.isArray(source.selectedIds)
      ? source.selectedIds.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 24)
      : [],
    items: items.map((item, index) => normalizeCanvasItem(item, index)).filter((item) => item.id).slice(0, 120),
  };
}

module.exports = {
  CANVAS_BOARD_VERSION,
  getDefaultCanvasBoard,
  normalizeCanvasBoard,
};
