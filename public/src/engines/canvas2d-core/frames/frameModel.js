import { createShapeElement } from "../elements/shapes.js";

export const FRAME_PRESETS = Object.freeze({
  "a4-portrait": { label: "A4 竖向", width: 794, height: 1123, pageWidth: 595.28, pageHeight: 841.89 },
  "a4-landscape": { label: "A4 横向", width: 1123, height: 794, pageWidth: 841.89, pageHeight: 595.28 },
  "16:9": { label: "16:9", width: 1280, height: 720, pageWidth: 960, pageHeight: 540 },
});

export function isFrame(item) {
  return item?.type === "shape" && item?.frame?.kind === "freeflow-frame-v1";
}

export function getFrames(items = []) {
  return items.filter(isFrame).sort((a, b) => (Number(a.frame.order) || 0) - (Number(b.frame.order) || 0) || String(a.id).localeCompare(String(b.id)));
}

export function normalizeFrameOrders(items = []) {
  const order = new Map(getFrames(items).map((frame, index) => [frame.id, index]));
  return items.map((item) => order.has(item.id) && item.frame.order !== order.get(item.id)
    ? { ...item, frame: { ...item.frame, order: order.get(item.id) } } : item);
}

export function createFrame(preset = "a4-portrait", point = { x: 0, y: 0 }, order = 0, title = "") {
  const size = FRAME_PRESETS[preset] || FRAME_PRESETS["a4-portrait"];
  return {
    ...createShapeElement("rect", point, { x: point.x + size.width, y: point.y + size.height }),
    radius: 0,
    fillColor: "rgba(255,255,255,0.04)",
    strokeColor: "#94a3b8",
    title: String(title || `板块 ${order + 1}`).slice(0, 200),
    frame: { kind: "freeflow-frame-v1", preset: FRAME_PRESETS[preset] ? preset : "a4-portrait", order },
  };
}

export function expandFrameSelection(items, ids) {
  const expanded = new Set(ids);
  const frames = new Set(items.filter((item) => expanded.has(item.id) && isFrame(item) && !item.locked).map((item) => item.id));
  for (const item of items) if (frames.has(item.frameId) && !isFrame(item)) expanded.add(item.id);
  return expanded;
}

export function getFramePagePlans(items, getBounds, { includeOutside = true } = {}) {
  const frames = getFrames(items);
  if (!frames.length) return [];
  const frameIds = new Set(frames.map((item) => item.id));
  const pages = frames.map((frame, index) => {
    const preset = FRAME_PRESETS[frame.frame.preset] || FRAME_PRESETS["a4-portrait"];
    const bounds = getBounds(frame);
    return { id: frame.id, title: frame.title, index, bounds, ...preset,
      items: [frame, ...items.filter((item) => !isFrame(item) && item.frameId === frame.id)] };
  });
  const outside = items.filter((item) => !isFrame(item) && !frameIds.has(item.frameId));
  if (includeOutside && outside.length) {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const item of outside) {
      if (["flowEdge", "mindRelationship"].includes(item.type)) continue;
      const b = getBounds(item);
      left = Math.min(left, b.left); top = Math.min(top, b.top);
      right = Math.max(right, b.right); bottom = Math.max(bottom, b.bottom);
    }
    if (Number.isFinite(left)) pages.push({ id: "outside", title: "板块外内容", index: pages.length,
      ...FRAME_PRESETS["a4-landscape"], bounds: { left, top, right, bottom, width: right - left || 1, height: bottom - top || 1 }, items: outside });
  }
  return pages;
}
