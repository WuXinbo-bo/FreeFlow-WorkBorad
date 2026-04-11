import { getElementBounds } from "./elements/index.js";
import { isLinearShape } from "./elements/shapes.js";
import { sceneToScreen } from "./camera.js";

function drawRoundedRect(ctx, x, y, width, height, radius = 18) {
  const nextRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + nextRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, nextRadius);
  ctx.arcTo(x + width, y + height, x, y + height, nextRadius);
  ctx.arcTo(x, y + height, x, y, nextRadius);
  ctx.arcTo(x, y, x + width, y, nextRadius);
  ctx.closePath();
}

export function drawShapeElement(ctx, element, view, selected, hover, helpers) {
  const scale = Math.max(0.1, Number(view?.scale) || 1);
  const bounds = getElementBounds(element);
  const x = bounds.left * scale + Number(view?.offsetX || 0);
  const y = bounds.top * scale + Number(view?.offsetY || 0);
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  const rotation = Number(element.rotation || 0);
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = element.strokeColor || "#334155";
  ctx.fillStyle = element.fillColor || "#ffffff";
  ctx.lineWidth = Math.max(1.5, Number(element.strokeWidth || 2) * Math.max(0.45, scale * 0.45));
  ctx.setLineDash(element.shapeType === "line" && element.lineDash ? [8, 6] : []);
  if (rotation) {
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);
  }

  if (element.shapeType === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (element.shapeType === "line" || element.shapeType === "arrow") {
    const start = sceneToScreen(view, { x: element.startX, y: element.startY });
    const end = sceneToScreen(view, { x: element.endX, y: element.endY });
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    if (element.shapeType === "arrow") {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const headSize = 12 * Math.max(0.6, scale * 0.45);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - headSize * Math.cos(angle - Math.PI / 6), end.y - headSize * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(end.x - headSize * Math.cos(angle + Math.PI / 6), end.y - headSize * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = element.strokeColor || "#334155";
      ctx.fill();
    }
  } else {
    drawRoundedRect(ctx, x, y, width, height, element.shapeType === "highlight" ? 16 : Number(element.radius || 18));
    if (element.shapeType === "highlight") {
      ctx.globalAlpha = 0.95;
      ctx.fill();
      ctx.globalAlpha = 0.42;
      ctx.stroke();
    } else {
      ctx.fill();
      ctx.stroke();
    }
  }

  helpers?.drawSelectionFrame?.(ctx, x, y, width, height, selected, hover);
  if (selected) {
    helpers?.drawHandles?.(ctx, element, view);
    drawRotateHandle(ctx, x, y, width, height, scale);
  }
  ctx.restore();
}

function drawRotateHandle(ctx, x, y, width, height, scale) {
  const handleOffset = 26 * Math.max(0.6, scale);
  const radius = 8 * Math.max(0.6, scale);
  const centerX = x + width / 2;
  const centerY = y - handleOffset;
  const lineTop = y;
  ctx.save();
  ctx.strokeStyle = "rgba(59, 130, 246, 0.9)";
  ctx.lineWidth = Math.max(1.4, 1.6 * Math.max(0.6, scale));
  ctx.beginPath();
  ctx.moveTo(centerX, lineTop);
  ctx.lineTo(centerX, centerY + radius);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(59, 130, 246, 0.9)";
  ctx.lineWidth = Math.max(1.2, 1.4 * Math.max(0.6, scale));
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.6, Math.PI * 0.15, Math.PI * 1.45);
  ctx.stroke();
  const arrowAngle = Math.PI * 1.45;
  const arrowSize = radius * 0.45;
  const arrowX = centerX + Math.cos(arrowAngle) * radius * 0.6;
  const arrowY = centerY + Math.sin(arrowAngle) * radius * 0.6;
  ctx.beginPath();
  ctx.moveTo(arrowX, arrowY);
  ctx.lineTo(arrowX - arrowSize, arrowY - arrowSize * 0.2);
  ctx.lineTo(arrowX - arrowSize * 0.2, arrowY - arrowSize);
  ctx.closePath();
  ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
  ctx.fill();
  ctx.restore();
}

export function createShapeRenderer() {
  return function renderShapeElement({ ctx, item, view, selected, hover, helpers }) {
    if (item?.type !== "shape") {
      return false;
    }
    drawShapeElement(ctx, item, view, selected, hover, helpers);
    return true;
  };
}
