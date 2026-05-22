import { normalizeCanvasItem } from "../schema.js";
import { CanvasItem } from "./CanvasItem.js";
import { TextItem, normalizeTextItemPayload } from "./TextItem.js";
import { FileItem } from "./FileItem.js";
import { ShapeItem } from "./ShapeItem.js";

export function createCanvasItem(payload = {}, index = 0, anchorPoint = null) {
  const normalized = normalizeCanvasItem(payload, index);
  const originalX = Number(normalized.x) || 0;
  const originalY = Number(normalized.y) || 0;
  const hasAnchorPoint =
    anchorPoint && Number.isFinite(Number(anchorPoint.x)) && Number.isFinite(Number(anchorPoint.y));
  if (hasAnchorPoint) {
    const staggerX = (index % 4) * 28;
    const staggerY = Math.floor(index / 4) * 28;
    const nextX = Number(anchorPoint.x) + staggerX;
    const nextY = Number(anchorPoint.y) + staggerY;
    const deltaX = nextX - originalX;
    const deltaY = nextY - originalY;
    normalized.x = nextX;
    normalized.y = nextY;
    if (normalized.kind === "shape") {
      normalized.startX = Number(normalized.startX) + deltaX;
      normalized.startY = Number(normalized.startY) + deltaY;
      normalized.endX = Number(normalized.endX) + deltaX;
      normalized.endY = Number(normalized.endY) + deltaY;
    }
  }
  if (normalized.kind === "textbox" || normalized.kind === "text") {
    return new TextItem(normalizeTextItemPayload(normalized));
  }
  if (normalized.kind === "shape") {
    return new ShapeItem(normalized);
  }
  return new FileItem(normalized);
}

export function isCanvasTextItem(item) {
  return item?.kind === "textbox" || item?.kind === "text";
}

export function getCanvasMaterialDimensions(item = {}) {
  if (isCanvasTextItem(item)) {
    return {
      width: Math.max(260, Math.min(420, Number(item?.width) || 320)),
      minHeight: Math.max(88, Math.min(180, Number(item?.height) || 96)),
    };
  }
  if (item?.kind === "image") {
    return {
      width: Math.max(220, Math.min(420, Number(item?.width) || 280)),
      minHeight: Math.max(180, Math.min(420, Number(item?.height) || 220)),
    };
  }
  if (item?.kind === "file") {
    return {
      width: Math.max(280, Math.min(420, Number(item?.width) || 344)),
      minHeight: Math.max(132, Math.min(220, Number(item?.height) || 140)),
    };
  }
  if (item?.kind === "shape") {
    return {
      width: Math.max(80, Math.min(680, Number(item?.width) || 160)),
      minHeight: Math.max(48, Math.min(420, Number(item?.height) || 96)),
    };
  }
  return {
    width: 320,
    minHeight: 96,
  };
}

export function getCanvasCardTitle(item = {}) {
  return String(item?.fileName || item?.title || "未命名素材").trim() || "未命名素材";
}

export function getCanvasFileMetaLine(item = {}) {
  return new FileItem(item).getFileMetaLine();
}

export { CanvasItem, TextItem, FileItem, ShapeItem };
