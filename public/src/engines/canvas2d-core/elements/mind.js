import { buildTextTitle, clamp, createId, sanitizeText } from "../utils.js";
import { measureTextBox } from "./text.js";

export function createMindNodeElement(point, title = "节点") {
  const cleanTitle = sanitizeText(title);
  const metrics = measureTextBox(cleanTitle, { minWidth: 200, maxWidth: 420, fontSize: 18 });
  return {
    id: createId("mind"),
    type: "mindNode",
    title: cleanTitle || "节点",
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    width: metrics.width,
    height: Math.max(96, metrics.height),
    fontSize: 18,
    color: "#0f172a",
    createdAt: Date.now(),
  };
}

export function normalizeMindNodeElement(element = {}) {
  const base = createMindNodeElement({ x: Number(element.x) || 0, y: Number(element.y) || 0 }, element.title || "节点");
  return {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "mindNode",
    title: buildTextTitle(element.title || base.title || "节点"),
    x: Number(element.x ?? base.x) || 0,
    y: Number(element.y ?? base.y) || 0,
    width: Math.max(160, Number(element.width ?? base.width) || base.width),
    height: Math.max(72, Number(element.height ?? base.height) || base.height),
    fontSize: clamp(Number(element.fontSize ?? base.fontSize) || base.fontSize, 12, 40),
    color: String(element.color || base.color),
    createdAt: Number(element.createdAt) || base.createdAt,
  };
}
