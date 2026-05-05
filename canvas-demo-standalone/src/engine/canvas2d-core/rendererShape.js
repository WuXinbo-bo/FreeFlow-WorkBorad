import { getElementBounds } from "./elements/index.js";
import { isLinearShape } from "./elements/shapes.js";
import { sceneToScreen } from "./camera.js";
import { getElementScreenBounds, scaleSceneValue } from "./viewportMetrics.js";
import { drawStableRoundedRectPath } from "./render/cornerRadius.js";

function drawRoundedRect(ctx, x, y, width, height, radius = 18) {
  drawStableRoundedRectPath(ctx, x, y, width, height, radius);
}

export function drawShapeElement(ctx, element, view, selected, hover, helpers) {
  const bounds = getElementBounds(element);
  const screenBounds = getElementScreenBounds(view, element);
  const x = screenBounds.left;
  const y = screenBounds.top;
  const width = screenBounds.width;
  const height = screenBounds.height;
  const rotation = Number(element.rotation || 0);
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = element.strokeColor || "#334155";
  ctx.fillStyle = element.fillColor || "#ffffff";
  ctx.lineWidth = Math.max(0.75, scaleSceneValue(view, Number(element.strokeWidth || 2)));
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
      const headSize = Math.max(6, scaleSceneValue(view, 12));
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
    drawRotateHandle(ctx, x, y, width, height);
  }
  ctx.restore();
}

function drawRotateHandle(ctx, x, y, width, height) {
  const handleOffset = 26;
  const radius = 8;
  const centerX = x + width / 2;
  const centerY = y - handleOffset;
  const lineTop = y;
  ctx.save();
  ctx.strokeStyle = "rgba(59, 130, 246, 0.9)";
  ctx.lineWidth = 1.6;
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
  ctx.lineWidth = 1.4;
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
