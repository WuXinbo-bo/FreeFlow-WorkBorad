import { sceneToScreen } from "./camera.js";
import { getElementBounds } from "./elements/index.js";
import { isLinearShape } from "./elements/shapes.js";
import { drawTextElement } from "./rendererText.js";
import { drawFileCard } from "./rendererFileCard.js";
import { drawShapeElement } from "./rendererShape.js";

const HINT_LOGO_SRC = "/assets/brand/FreeFlow_logo.svg";
let hintLogo = null;
let hintLogoLoaded = false;

function getHintLogo() {
  if (typeof Image === "undefined") {
    return null;
  }
  if (!hintLogo) {
    hintLogo = new Image();
    hintLogo.src = HINT_LOGO_SRC;
    hintLogo.onload = () => {
      hintLogoLoaded = true;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("canvas2d-hint-logo-loaded"));
      }
    };
    hintLogo.onerror = () => {
      hintLogoLoaded = false;
    };
  }
  return hintLogo;
}

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


function drawSelectionFrame(ctx, x, y, width, height, selected = false, hover = false) {
  if (!selected && !hover) {
    return;
  }
  ctx.save();
  ctx.setLineDash(selected ? [8, 6] : [6, 6]);
  ctx.strokeStyle = selected ? "rgba(59, 130, 246, 0.9)" : "rgba(59, 130, 246, 0.42)";
  ctx.lineWidth = selected ? 2 : 1.5;
  drawRoundedRect(ctx, x - 3, y - 3, width + 6, height + 6, 20);
  ctx.stroke();
  ctx.restore();
}

function drawLockBadge(ctx, element, view) {
  if (!element?.locked) {
    return;
  }
  const scale = Math.max(0.1, Number(view?.scale) || 1);
  const bounds = getElementBounds(element);
  const anchor = sceneToScreen(view, { x: bounds.left, y: bounds.top });
  const size = Math.max(12, 14 * scale);
  const padding = Math.max(6, 8 * scale);
  const x = anchor.x + padding;
  const y = anchor.y + padding;
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.7)";
  ctx.lineWidth = Math.max(1, 1.2 * scale);
  drawRoundedRect(ctx, x - size * 0.5, y - size * 0.5, size, size, Math.max(4, size * 0.28));
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
  ctx.font = `600 ${Math.max(8, size * 0.7)}px "Segoe UI Emoji", "Segoe UI", "PingFang SC", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("🔒", x, y + size * 0.04);
  ctx.restore();
}

function drawHandles(ctx, element, view) {
  const handleSize = 8;
  const points = [];
  if (element.type === "shape" && isLinearShape(element.shapeType)) {
    points.push(sceneToScreen(view, { x: element.startX, y: element.startY }));
    points.push(sceneToScreen(view, { x: element.endX, y: element.endY }));
  } else {
    const bounds = getElementBounds(element);
    points.push(sceneToScreen(view, { x: bounds.left, y: bounds.top }));
    points.push(sceneToScreen(view, { x: bounds.right, y: bounds.top }));
    points.push(sceneToScreen(view, { x: bounds.left, y: bounds.bottom }));
    points.push(sceneToScreen(view, { x: bounds.right, y: bounds.bottom }));
  }
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(59, 130, 246, 0.95)";
  ctx.lineWidth = 1.5;
  const isRect = element.type === "shape" && element.shapeType === "rect";
  points.forEach((point) => {
    ctx.beginPath();
    if (isRect) {
      ctx.rect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize);
    } else {
      ctx.rect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize);
    }
    ctx.fill();
    ctx.stroke();
  });
  if (isRect) {
    const bounds = getElementBounds(element);
    const inset = Math.max(6, 10 / Math.max(0.1, Number(view?.scale) || 1));
    const scale = Math.max(0.1, Number(view?.scale) || 1);
    const left = bounds.left * scale + Number(view?.offsetX || 0);
    const top = bounds.top * scale + Number(view?.offsetY || 0);
    const right = bounds.right * scale + Number(view?.offsetX || 0);
    const bottom = bounds.bottom * scale + Number(view?.offsetY || 0);
    const pointsInner = [
      { x: left + inset * scale, y: top + inset * scale },
      { x: right - inset * scale, y: top + inset * scale },
      { x: left + inset * scale, y: bottom - inset * scale },
      { x: right - inset * scale, y: bottom - inset * scale },
    ];
    pointsInner.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, handleSize * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
  ctx.restore();
}

function drawBackground(ctx, width, height, view, options = {}) {
  const { fill = "#ffffff", grid = true } = options || {};
  ctx.save();
  if (fill && fill !== "transparent") {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
  }
  if (grid) {
    const step = 18 * Math.max(0.4, Number(view?.scale) || 1);
    const offsetX = ((Number(view?.offsetX || 0) % step) + step) % step;
    const offsetY = ((Number(view?.offsetY || 0) % step) + step) % step;
    ctx.fillStyle = "rgba(76, 110, 245, 0.18)";
    for (let x = offsetX; x < width; x += step) {
      for (let y = offsetY; y < height; y += step) {
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    }
  }
  ctx.restore();
}

function drawMindNode(ctx, element, view, selected, hover) {
  const scale = Math.max(0.1, Number(view?.scale) || 1);
  const x = Number(element.x || 0) * scale + Number(view?.offsetX || 0);
  const y = Number(element.y || 0) * scale + Number(view?.offsetY || 0);
  const width = Math.max(1, Number(element.width) || 1) * scale;
  const height = Math.max(1, Number(element.height) || 1) * scale;
  const padding = Math.max(10, Number(element.width || 0) * 0.06) * scale;
  const fontSize = Math.min(Math.max(12, Number(element.fontSize || 18) * 1.05), 28) * scale;
  const lineHeight = Math.max(18, fontSize * 1.2);
  const title = String(element.title || "节点");

  ctx.save();
  drawRoundedRect(ctx, x, y, width, height, 22);
  ctx.fillStyle = "rgba(236, 254, 255, 0.98)";
  ctx.strokeStyle = "rgba(14, 116, 144, 0.25)";
  ctx.lineWidth = 1.2;
  ctx.shadowColor = "rgba(14, 116, 144, 0.14)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.stroke();

  ctx.save();
  drawRoundedRect(ctx, x, y, width, height, 22);
  ctx.clip();
  ctx.fillStyle = element.color || "#0f172a";
  ctx.font = `600 ${Math.max(1, fontSize)}px "Segoe UI", "PingFang SC", sans-serif`;
  ctx.textBaseline = "top";
  wrapTextWithEllipsis(ctx, title, x + padding, y + padding, width - padding * 2, lineHeight, 2);
  ctx.restore();

  drawSelectionFrame(ctx, x, y, width, height, selected, hover);
  if (selected) {
    drawHandles(ctx, element, view);
  }
  ctx.restore();
}


function drawSelectionRect(ctx, view, selectionRect) {
  if (!selectionRect?.start || !selectionRect?.current) {
    return;
  }
  const start = sceneToScreen(view, selectionRect.start);
  const current = sceneToScreen(view, selectionRect.current);
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  ctx.save();
  ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
  ctx.strokeStyle = "rgba(59, 130, 246, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  drawRoundedRect(ctx, left, top, width, height, 10);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawAlignmentSnapGuides(ctx, alignmentSnap, alignmentSnapConfig, viewportWidth, viewportHeight) {
  if (!alignmentSnap?.active || !Array.isArray(alignmentSnap?.guides) || !alignmentSnap.guides.length) {
    return;
  }
  const strokeStyle = String(alignmentSnapConfig?.guideColor || "rgba(59, 130, 246, 0.38)");
  const lineWidth = Math.max(1, Number(alignmentSnapConfig?.guideLineWidth || 1));
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);
  alignmentSnap.guides.forEach((guide) => {
    if (guide?.axis === "x" && Number.isFinite(guide.x)) {
      const y1 = Math.max(0, Math.min(viewportHeight, Number(guide.y1 || 0)));
      const y2 = Math.max(0, Math.min(viewportHeight, Number(guide.y2 || 0)));
      ctx.beginPath();
      ctx.moveTo(Number(guide.x || 0), y1);
      ctx.lineTo(Number(guide.x || 0), y2);
      ctx.stroke();
      return;
    }
    if (guide?.axis === "y" && Number.isFinite(guide.y)) {
      const x1 = Math.max(0, Math.min(viewportWidth, Number(guide.x1 || 0)));
      const x2 = Math.max(0, Math.min(viewportWidth, Number(guide.x2 || 0)));
      ctx.beginPath();
      ctx.moveTo(x1, Number(guide.y || 0));
      ctx.lineTo(x2, Number(guide.y || 0));
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawHint(ctx, width, height) {
  const centerX = width / 2;
  const titleY = height / 2 - 6;
  const subtitleY = height / 2 + 18;
  ctx.save();
  ctx.fillStyle = "rgba(71, 85, 105, 0.88)";
  ctx.textAlign = "center";
  ctx.font = '600 16px "Segoe UI", "PingFang SC", sans-serif';
  ctx.fillText("FreeFlow 轻量办公画布", centerX, titleY);
  ctx.fillStyle = "rgba(100, 116, 139, 0.9)";
  ctx.font = '500 13px "Segoe UI", "PingFang SC", sans-serif';
  ctx.fillText("拖入文本、图片、文件等素材，一站式搭建你的专属办公白板", centerX, subtitleY);
  ctx.restore();
}

export function createRenderer({ customRenderers = [] } = {}) {
  const renderers = Array.isArray(customRenderers) ? customRenderers : [];

  return {
      render({
        ctx,
        canvas,
        view,
        items,
        selectedIds,
        hoverId,
        selectionRect,
        draftElement,
        editingId,
        imageEditState,
        flowDraft,
        alignmentSnap,
        alignmentSnapConfig,
        allowLocalFileAccess,
        backgroundStyle,
        renderTextInCanvas,
      }) {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        drawBackground(ctx, width, height, view, backgroundStyle);

      const selected = new Set(selectedIds || []);
      items.forEach((item) => {
        const isSelected = selected.has(item.id);
        const isHover = hoverId === item.id && !isSelected;
        for (const renderElement of renderers) {
            const handled = renderElement?.({
              ctx,
              item,
              view,
              selected: isSelected,
              hover: isHover,
              editing: editingId === item.id,
              helpers: {
                drawSelectionFrame,
                drawHandles,
                imageEditState,
                flowDraft,
                allowLocalFileAccess,
                renderTextInCanvas,
                editingId,
              },
            });
          if (handled) {
            drawLockBadge(ctx, item, view);
            return;
          }
        }
        if (item.type === "fileCard") {
          drawFileCard(ctx, item, view, isSelected, isHover, {
            drawSelectionFrame,
            drawHandles,
          });
          drawLockBadge(ctx, item, view);
          return;
        }
        if (item.type === "mindNode") {
          drawMindNode(ctx, item, view, isSelected, isHover);
          drawLockBadge(ctx, item, view);
          return;
        }
          drawTextElement(ctx, item, view, isSelected, isHover, editingId === item.id, drawSelectionFrame, drawHandles, {
            renderText: Boolean(renderTextInCanvas),
          });
        drawLockBadge(ctx, item, view);
      });

      if (draftElement) {
        ctx.save();
        ctx.globalAlpha = 0.84;
        if (draftElement.type === "shape") {
          drawShapeElement(ctx, draftElement, view, false, false, {
            drawSelectionFrame,
            drawHandles,
          });
        }
        ctx.restore();
      }

      drawSelectionRect(ctx, view, selectionRect);
      drawAlignmentSnapGuides(ctx, alignmentSnap, alignmentSnapConfig, width, height);
      if (!items.length && !draftElement) {
        drawHint(ctx, width, height);
      }
      ctx.restore();
    },
  };
}
