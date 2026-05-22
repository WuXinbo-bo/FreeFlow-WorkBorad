import { CONFIG } from "../../config/index.js";
import {
  clampCanvasScale,
  buildCanvasTextTitle,
  normalizeCanvasTextBoxFontSize,
  sanitizeCanvasTextPreview,
  sanitizeCanvasTextboxText,
} from "./canvasUtils.js";

export const CANVAS_BOARD_VERSION = 2;

export const DEFAULT_CANVAS_VIEW = Object.freeze({
  scale: CONFIG.canvasDefaultScale,
  offsetX: CONFIG.canvasDefaultOffsetX,
  offsetY: CONFIG.canvasDefaultOffsetY,
});

export function getDefaultCanvasBoard() {
  return {
    version: CANVAS_BOARD_VERSION,
    updatedAt: Date.now(),
    view: { ...DEFAULT_CANVAS_VIEW },
    selectedIds: [],
    items: [],
  };
}

export function normalizeCanvasItem(item = {}, index = 0) {
  const source = item && typeof item === "object" ? (item.payload && typeof item.payload === "object" ? item.payload : item) : {};
  const kind = ["text", "image", "file", "textbox", "shape"].includes(source.kind) ? source.kind : "text";
  const isFileKind = kind === "file" || kind === "image";
  const shapeType = ["rect", "arrow", "line", "ellipse", "highlight"].includes(source.shapeType) ? source.shapeType : "rect";
  const normalizedX = Number.isFinite(Number(source.x)) ? Number(source.x) : index * 44;
  const normalizedY = Number.isFinite(Number(source.y)) ? Number(source.y) : index * 36;
  const normalizedWidth = Number.isFinite(Number(source.width)) ? Number(source.width) : kind === "shape" ? 160 : 320;
  const normalizedHeight = Number.isFinite(Number(source.height)) ? Number(source.height) : kind === "shape" ? 96 : 120;
  const startX = Number.isFinite(Number(source.startX)) ? Number(source.startX) : normalizedX;
  const startY = Number.isFinite(Number(source.startY)) ? Number(source.startY) : normalizedY;
  const endX = Number.isFinite(Number(source.endX)) ? Number(source.endX) : normalizedX + normalizedWidth;
  const endY = Number.isFinite(Number(source.endY)) ? Number(source.endY) : normalizedY + normalizedHeight;
  return {
    id: String(source.id || "").trim() || crypto.randomUUID(),
    kind,
    title: String(source.title || "").trim() || `素材 ${index + 1}`,
    text: kind === "textbox" ? sanitizeCanvasTextboxText(source.text || "") : sanitizeCanvasTextPreview(source.text || ""),
    dataUrl: typeof source.dataUrl === "string" ? source.dataUrl : "",
    filePath: String(source.filePath || "").trim(),
    fileName: String(source.fileName || "").trim(),
    fileBaseName: String(source.fileBaseName || "").trim(),
    fileExt: String(source.fileExt || "").trim().toLowerCase(),
    detectedExt: String(source.detectedExt || "").trim().toLowerCase(),
    mimeType: String(source.mimeType || "").trim(),
    detectedMimeType: String(source.detectedMimeType || "").trim(),
    hasFileSize: Boolean(source.hasFileSize),
    isDirectory: Boolean(source.isDirectory),
    fileSize: Number(source.fileSize) || 0,
    x: normalizedX,
    y: normalizedY,
    width:
      kind === "textbox" || kind === "text"
        ? Math.max(220, Math.min(420, Number(source.width) || CONFIG.canvasTextBoxDefaultWidth))
        : Math.max(220, Number(source.width) || (isFileKind ? 344 : CONFIG.canvasCardWidth)),
    height:
      kind === "textbox" || kind === "text"
        ? Math.max(88, Math.min(180, Number(source.height) || CONFIG.canvasTextBoxDefaultHeight))
        : Math.max(88, Number(source.height) || (isFileKind ? 140 : CONFIG.canvasCardHeight)),
    shapeType,
    stroke: String(source.stroke || "").trim(),
    fill: String(source.fill || "").trim(),
    strokeWidth: Number.isFinite(Number(source.strokeWidth)) ? Number(source.strokeWidth) : 2,
    radius: Number.isFinite(Number(source.radius)) ? Number(source.radius) : 16,
    startX,
    startY,
    endX,
    endY,
    startAttached: Boolean(source.startAttached),
    endAttached: Boolean(source.endAttached),
    fontSize: normalizeCanvasTextBoxFontSize(source.fontSize, CONFIG.canvasTextBoxDefaultFontSize),
    bold: Boolean(source.bold),
    highlighted: Boolean(source.highlighted),
    createdAt: Number(source.createdAt) || Date.now(),
  };
}

export function normalizeCanvasBoard(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const view = source.view && typeof source.view === "object" ? source.view : {};
  const items = Array.isArray(source.items) ? source.items : [];

  return {
    version: CANVAS_BOARD_VERSION,
    updatedAt: Number(source.updatedAt) || Date.now(),
    view: {
      scale: clampCanvasScale(view.scale, DEFAULT_CANVAS_VIEW.scale, CONFIG.canvasMinScale, CONFIG.canvasMaxScale),
      offsetX: Number(view.offsetX) || DEFAULT_CANVAS_VIEW.offsetX,
      offsetY: Number(view.offsetY) || DEFAULT_CANVAS_VIEW.offsetY,
    },
    selectedIds: Array.isArray(source.selectedIds)
      ? source.selectedIds.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 24)
      : [],
    items: items.map((item, index) => normalizeCanvasItem(item, index)).filter((item) => item.id).slice(0, 120),
  };
}

export function createCanvasTextTitle(text = "") {
  return buildCanvasTextTitle(text);
}
