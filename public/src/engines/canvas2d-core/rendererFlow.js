import { getFlowNodeConnectors } from "./elements/flow.js";
import { drawRichTextInBox, FLOW_NODE_TEXT_LAYOUT, getFlowNodeTextPadding } from "./rendererText.js";
import { getElementScreenBounds, getScreenPoint, scaleSceneValue } from "./viewportMetrics.js";

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

function drawConnector(ctx, point, active = false) {
  const size = 5;
  ctx.save();
  ctx.fillStyle = active ? "rgba(37, 99, 235, 0.95)" : "rgba(148, 163, 184, 0.9)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFlowEdge(
  ctx,
  view,
  fromPoint,
  toPoint,
  style = "solid",
  { selected = false, hover = false, arrowDirection = "forward" } = {}
) {
  const sx = getScreenPoint(view, fromPoint).x;
  const sy = getScreenPoint(view, fromPoint).y;
  const ex = getScreenPoint(view, toPoint).x;
  const ey = getScreenPoint(view, toPoint).y;
  const showFocus = selected || hover;
  ctx.save();
  ctx.lineWidth = Math.max(0.75, scaleSceneValue(view, 1.8));
  ctx.strokeStyle = "rgba(71, 85, 105, 0.9)";
  ctx.setLineDash(style === "dashed" ? [8, 6] : []);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  if (showFocus) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = selected ? "rgba(37, 99, 235, 0.95)" : "rgba(59, 130, 246, 0.5)";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
  }
  if (style === "arrow") {
    const forward = arrowDirection !== "backward";
    const tipX = forward ? ex : sx;
    const tipY = forward ? ey : sy;
    const tailX = forward ? sx : ex;
    const tailY = forward ? sy : ey;
    const angle = Math.atan2(tipY - tailY, tipX - tailX);
    const headSize = Math.max(6, scaleSceneValue(view, 12));
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headSize * Math.cos(angle - Math.PI / 6), tipY - headSize * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tipX - headSize * Math.cos(angle + Math.PI / 6), tipY - headSize * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = showFocus && selected ? "rgba(37, 99, 235, 0.95)" : "rgba(71, 85, 105, 0.9)";
    ctx.fill();
  }
  ctx.restore();
}

function drawFlowNode(ctx, node, view, selected, hover, helpers) {
  const screenBounds = getElementScreenBounds(view, node);
  const x = screenBounds.left;
  const y = screenBounds.top;
  const width = screenBounds.width;
  const height = screenBounds.height;

  ctx.save();
  drawRoundedRect(ctx, x, y, width, height, 18);
  ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.shadowColor = "rgba(15, 23, 42, 0.12)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.stroke();
  ctx.restore();

  if (helpers?.renderTextInCanvas && helpers?.editingId !== node.id) {
    const padding = getFlowNodeTextPadding(view, {
      width: Number(node.width || 1),
      height: Number(node.height || 1),
    });
    const text = String(node.plainText || node.text || "");
    if (text || node.html) {
      ctx.save();
      drawRichTextInBox(ctx, {
        x: x + padding.x,
        y: y + padding.y,
        width: Math.max(1, width - padding.x * 2),
        height: Math.max(1, height - padding.y * 2),
        html: node.html || "",
        text,
        color: node.color || "rgba(15, 23, 42, 0.92)",
        fontSize: Math.max(12, Number(node.fontSize || 18)),
        scale: Math.max(0.1, Number(view?.scale) || 1),
        lineHeightRatio: FLOW_NODE_TEXT_LAYOUT.lineHeightRatio,
        fontWeight: FLOW_NODE_TEXT_LAYOUT.fontWeight,
        boldWeight: FLOW_NODE_TEXT_LAYOUT.boldWeight,
      });
      ctx.restore();
    }
  }

  helpers?.drawSelectionFrame?.(ctx, x, y, width, height, selected, hover);
  if (selected) {
    helpers?.drawHandles?.(ctx, node, view);
  }

  const showConnectors = selected || hover || helpers?.flowDraft?.fromId === node.id;
  if (showConnectors) {
    const connectors = getFlowNodeConnectors(node);
    const screenPoints = Object.values(connectors).map((point) => getScreenPoint(view, point));
    screenPoints.forEach((point) => drawConnector(ctx, point));
  }
}

export function createFlowRenderer({ getItemById } = {}) {
  return function renderFlowElement({ ctx, item, view, selected, hover, helpers }) {
    if (item?.type === "flowEdge") {
      const fromNode = getItemById?.(item.fromId);
      const toNode = getItemById?.(item.toId);
      if (!fromNode || !toNode) {
        return true;
      }
      const fromPoint = getFlowNodeConnectors(fromNode)[item.fromSide] || getFlowNodeConnectors(fromNode).right;
      const toPoint = getFlowNodeConnectors(toNode)[item.toSide] || getFlowNodeConnectors(toNode).left;
      drawFlowEdge(ctx, view, fromPoint, toPoint, item.style, {
        selected,
        hover,
        arrowDirection: item.arrowDirection,
      });
      return true;
    }
    if (item?.type === "flowNode") {
      drawFlowNode(ctx, item, view, selected, hover, helpers);
      const draft = helpers?.flowDraft;
      if (draft && draft.fromId === item.id && draft.toPoint) {
        const fromPoint = getFlowNodeConnectors(item)[draft.fromSide] || getFlowNodeConnectors(item).right;
        drawFlowEdge(ctx, view, fromPoint, draft.toPoint, draft.style);
      }
      return true;
    }
    return false;
  };
}
