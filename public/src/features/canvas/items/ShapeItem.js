import { CanvasItem } from "./CanvasItem.js";
import { escapeCssColor, escapeHtml } from "../canvasUtils.js";
import { getShapeGeometry, getShapeHandleMap, isLinearShape, normalizeShapeType } from "../shapeUtils.js";

function buildArrowMarkerId(itemId = "") {
  return `canvas-arrow-marker-${String(itemId || "").replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export class ShapeItem extends CanvasItem {
  get shapeType() {
    return normalizeShapeType(this.payload.shapeType || "rect");
  }

  getGeometry() {
    return getShapeGeometry(this.payload);
  }

  getHandleMap() {
    return getShapeHandleMap(this.payload);
  }

  getStyle() {
    const geometry = this.getGeometry();
    const stroke = escapeCssColor(this.payload.stroke || "#334155");
    const fill =
      this.shapeType === "highlight"
        ? escapeCssColor(this.payload.fill || "rgba(255, 214, 102, 0.28)")
        : escapeCssColor(this.payload.fill || (this.shapeType === "ellipse" ? "rgba(148, 163, 184, 0.10)" : "rgba(255,255,255,0.92)"));
    const borderRadius = this.shapeType === "ellipse" ? "999px" : `${Math.max(4, Number(this.payload.radius) || 14)}px`;
    return {
      left: Math.round(geometry.left),
      top: Math.round(geometry.top),
      width: Math.round(geometry.width),
      height: Math.round(geometry.height),
      stroke,
      fill,
      borderRadius,
      strokeWidth: Math.max(1, Number(this.payload.strokeWidth) || 2),
    };
  }

  renderHandles(geometry, selected) {
    if (!selected) return "";
    const common = (key, x, y) => `
      <button
        class="canvas-shape-handle canvas-shape-handle-${key}"
        type="button"
        data-canvas-shape-handle="${escapeHtml(key)}"
        aria-label="${escapeHtml(key)}"
        style="left:${Math.round(x)}px;top:${Math.round(y)}px;"
      ></button>
    `;

    if (isLinearShape(this.shapeType)) {
      return [
        common("start", geometry.localX1, geometry.localY1),
        common("end", geometry.localX2, geometry.localY2),
      ].join("");
    }

    return [
      common("nw", 0, 0),
      common("ne", geometry.width, 0),
      common("sw", 0, geometry.height),
      common("se", geometry.width, geometry.height),
    ].join("");
  }

  render({ selected = false } = {}) {
    const geometry = this.getGeometry();
    const style = this.getStyle();
    const selectedClass = selected ? " is-selected" : "";
    const baseStyle = [
      `left:${style.left}px`,
      `top:${style.top}px`,
      `width:${Math.max(1, style.width)}px`,
      `height:${Math.max(1, style.height)}px`,
      `--canvas-shape-stroke:${style.stroke}`,
      `--canvas-shape-fill:${style.fill}`,
      `--canvas-shape-stroke-width:${style.strokeWidth}px`,
      `--canvas-shape-radius:${style.borderRadius}`,
    ].join(";");

    if (isLinearShape(this.shapeType)) {
      const markerId = buildArrowMarkerId(this.id);
      const strokeWidth = Math.max(1, Number(this.payload.strokeWidth) || 2);
      const markerEnd = this.shapeType === "arrow"
        ? `<defs><marker id="${escapeHtml(markerId)}" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 z" fill="${escapeHtml(style.stroke)}"></path></marker></defs>`
        : "";
      const lineProps = this.shapeType === "arrow" ? `marker-end="url(#${escapeHtml(markerId)})"` : "";
      return `
        <article class="canvas-shape canvas-shape-linear canvas-shape-${escapeHtml(this.shapeType)}${selectedClass}" data-canvas-item-id="${escapeHtml(
          this.id
        )}" style="${baseStyle}">
          <svg class="canvas-shape-svg" viewBox="0 0 ${Math.max(1, geometry.width)} ${Math.max(1, geometry.height)}" preserveAspectRatio="none" aria-hidden="true">
            ${markerEnd}
            <line x1="${geometry.localX1}" y1="${geometry.localY1}" x2="${geometry.localX2}" y2="${geometry.localY2}" stroke="${escapeHtml(
              style.stroke
            )}" stroke-width="${strokeWidth}" stroke-linecap="round" ${lineProps}></line>
          </svg>
          ${this.renderHandles(geometry, selected)}
        </article>
      `;
    }

    return `
      <article class="canvas-shape canvas-shape-box canvas-shape-${escapeHtml(this.shapeType)}${selectedClass}" data-canvas-item-id="${escapeHtml(
        this.id
      )}" style="${baseStyle}">
        <div class="canvas-shape-body"></div>
        ${this.renderHandles(geometry, selected)}
      </article>
    `;
  }
}
