import { ICON_NODES } from "./iconNodes.mjs";

export { ICON_NODES };
export const ICON_STROKE_WIDTH = 1.75;

export function getAppIconNodes(name) {
  return Object.hasOwn(ICON_NODES, name) ? ICON_NODES[name] : ICON_NODES["circle-help"];
}

export function normalizeAppIconSize(size = 18) {
  const dimension = Number(size);
  return Number.isFinite(dimension) && dimension > 0 ? dimension : 18;
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderAppIcon(name, { className = "", size = 18 } = {}) {
  const dimension = normalizeAppIconSize(size);
  const children = getAppIconNodes(name).map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).map(([key, value]) => `${key}="${escapeAttribute(value)}"`).join(" ")}/>`).join("");
  return `<svg class="app-icon${className ? ` ${escapeAttribute(className)}` : ""}" data-ui-icon="${escapeAttribute(name)}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${dimension}" height="${dimension}" style="--app-icon-size:${dimension}px" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${children}</svg>`;
}

const canvasPaths = new Map();

// Cache only immutable icon geometry; canvas state, transforms and colors remain local.
export function drawAppIcon(ctx, name, x, y, size = 18, { color = ctx.strokeStyle } = {}) {
  if (typeof Path2D !== "function") return false;
  const key = Object.hasOwn(ICON_NODES, name) ? name : "circle-help";
  let path = canvasPaths.get(key);
  if (!path) {
    path = new Path2D();
    for (const [tag, attrs] of getAppIconNodes(key)) {
      const number = (attribute) => Number(attrs[attribute] || 0);
      if (tag === "path") path.addPath(new Path2D(attrs.d));
      else if (tag === "circle") { path.moveTo(number("cx") + number("r"), number("cy")); path.arc(number("cx"), number("cy"), number("r"), 0, Math.PI * 2); }
      else if (tag === "ellipse") { path.moveTo(number("cx") + number("rx"), number("cy")); path.ellipse(number("cx"), number("cy"), number("rx"), number("ry"), 0, 0, Math.PI * 2); }
      else if (tag === "rect") path.roundRect(number("x"), number("y"), number("width"), number("height"), number("rx"));
      else if (tag === "line") { path.moveTo(number("x1"), number("y1")); path.lineTo(number("x2"), number("y2")); }
      else if (tag === "polyline" || tag === "polygon") {
        const points = attrs.points.trim().split(/[\s,]+/).map(Number);
        for (let index = 0; index < points.length; index += 2) {
          if (index === 0) path.moveTo(points[index], points[index + 1]);
          else path.lineTo(points[index], points[index + 1]);
        }
        if (tag === "polygon") path.closePath();
      }
    }
    canvasPaths.set(key, path);
  }
  ctx.save();
  ctx.translate(x, y);
  const scale = normalizeAppIconSize(size) / 24;
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = ICON_STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(path);
  ctx.restore();
  return true;
}
