// Scene units shared by vector, canvas, measurement, and editable text surfaces.
export const MIND_NODE_PADDING = Object.freeze({ x: 18, y: 14 });
export const MIND_CONNECTION_STYLE = Object.freeze({ color: "#a7b8b6", width: 1.5 });

export function getMindNodeFooterHeight(item = {}) {
  return (item.collapsed && item.childrenIds?.length) || item.links?.length ? 24 : 0;
}

export function getMindCollapsedBadgeBounds(item = {}) {
  const count = item.collapsed ? item.childrenIds?.length || 0 : 0;
  if (!count) return null;
  return {
    x: item.x + 10, y: item.y + item.height - 28,
    width: 30 + String(count).length * 7, height: 20, count,
  };
}

export function getMindNodeStyle(item = {}) {
  const depth = Math.max(0, Number(item.depth) || 0);
  const summary = item.type === "mindSummary";
  return {
    radius: depth === 0 && !summary ? 8 : 6,
    fill: summary ? "#f4f6f8" : depth === 0 ? "#edf5f2" : "#ffffff",
    stroke: summary ? "#aab6c2" : depth === 0 ? "#91b5aa" : depth === 1 ? "#b7c8c3" : "#d2d9de",
    strokeWidth: 1.25,
    fontWeight: depth === 0 ? "600" : "500",
    textColor: item.color || "#26343b",
    dash: summary ? [5, 4] : [],
  };
}
