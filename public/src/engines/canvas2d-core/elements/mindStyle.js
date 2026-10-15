// Scene units shared by vector, canvas, measurement, and editable text surfaces.
export const MIND_NODE_PADDING = Object.freeze({ x: 20, y: 16 });
export const MIND_CONNECTION_STYLE = Object.freeze({ color: "#a7b8b6", width: 1.7 });

export function getMindNodeFontSize(depth = 0) {
  const level = Math.max(0, Number(depth) || 0);
  if (level === 0) return 22;
  if (level === 1) return 18;
  if (level === 2) return 16;
  return 15;
}

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
  const root = depth === 0 && !summary;
  const branch = depth === 1 && !summary;
  return {
    radius: root ? 13 : branch ? 10 : summary ? 8 : 7,
    fill: summary ? "#f5f6f8" : root ? "#e8f3ef" : branch ? "#edf3f8" : depth === 2 ? "#ffffff" : "#fbfcfd",
    stroke: summary ? "#b7c1cc" : root ? "#6c9c8b" : branch ? "#8daabd" : depth === 2 ? "#c6d0d7" : "#d9e0e5",
    strokeWidth: root ? 2 : branch ? 1.6 : 1.15,
    fontWeight: root ? "700" : branch ? "650" : depth === 2 ? "550" : "450",
    textColor: item.color && item.color !== "#0f172a" ? item.color : (root ? "#1f473e" : branch ? "#26465f" : "#303d46"),
    dash: summary ? [5, 4] : [],
  };
}
