import { sceneToScreen } from "./camera.js";
import { getElementBounds } from "./elements/index.js";
import { isLinearShape } from "./elements/shapes.js";
import { drawTextElement } from "./rendererText.js";
import { drawFileCard } from "./rendererFileCard.js";
import { drawShapeElement } from "./rendererShape.js";
import { getElementScreenBounds, getScreenFixed, getScreenPoint, getViewScale, scaleSceneValue } from "./viewportMetrics.js";
import { createBackgroundPatternCache, createViewportCuller } from "./rendererPerf.js";

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
  const bounds = getElementBounds(element);
  const anchor = getScreenPoint(view, { x: bounds.left, y: bounds.top });
  const size = 14;
  const padding = 8;
  const x = anchor.x + padding;
  const y = anchor.y + padding;
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.7)";
  ctx.lineWidth = 1.2;
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
    points.push(getScreenPoint(view, { x: element.startX, y: element.startY }));
    points.push(getScreenPoint(view, { x: element.endX, y: element.endY }));
  } else {
    const bounds = getElementBounds(element);
    points.push(getScreenPoint(view, { x: bounds.left, y: bounds.top }));
    points.push(getScreenPoint(view, { x: bounds.right, y: bounds.top }));
    points.push(getScreenPoint(view, { x: bounds.left, y: bounds.bottom }));
    points.push(getScreenPoint(view, { x: bounds.right, y: bounds.bottom }));
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
    const bounds = getElementScreenBounds(view, element);
    const inset = 10;
    const pointsInner = [
      { x: bounds.left + inset, y: bounds.top + inset },
      { x: bounds.right - inset, y: bounds.top + inset },
      { x: bounds.left + inset, y: bounds.bottom - inset },
      { x: bounds.right - inset, y: bounds.bottom - inset },
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

function drawBackgroundPatternFallback(ctx, width, height, view, resolvedPattern) {
  const scale = Math.max(0.4, Number(view?.scale) || 1);
  const step = 18 * scale;
  const offsetX = ((Number(view?.offsetX || 0) % step) + step) % step;
  const offsetY = ((Number(view?.offsetY || 0) % step) + step) % step;
  if (resolvedPattern === "dots") {
    ctx.fillStyle = "rgba(76, 110, 245, 0.18)";
    for (let x = offsetX; x < width; x += step) {
      for (let y = offsetY; y < height; y += step) {
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    }
  } else if (resolvedPattern === "grid") {
    ctx.strokeStyle = "rgba(76, 110, 245, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = offsetX; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = offsetY; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  } else if (resolvedPattern === "lines") {
    const lineStep = step * 1.6;
    const lineOffsetY = ((Number(view?.offsetY || 0) % lineStep) + lineStep) % lineStep;
    ctx.strokeStyle = "rgba(76, 110, 245, 0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = lineOffsetY; y < height; y += lineStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  } else if (resolvedPattern === "engineering") {
    const majorStep = step * 5;
    const majorOffsetX = ((Number(view?.offsetX || 0) % majorStep) + majorStep) % majorStep;
    const majorOffsetY = ((Number(view?.offsetY || 0) % majorStep) + majorStep) % majorStep;
    ctx.strokeStyle = "rgba(76, 110, 245, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = offsetX; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = offsetY; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(37, 99, 235, 0.16)";
    ctx.beginPath();
    for (let x = majorOffsetX; x < width; x += majorStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = majorOffsetY; y < height; y += majorStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }
}

function drawBackground(ctx, width, height, view, options = {}, backgroundPatternCache = null) {
  const { fill = "#ffffff", grid = true, pattern = grid ? "dots" : "none" } = options || {};
  ctx.save();
  if (fill && fill !== "transparent") {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
  }
  const resolvedPattern = String(pattern || (grid ? "dots" : "none")).trim().toLowerCase();
  if (resolvedPattern !== "none") {
    const drawnWithCache = backgroundPatternCache?.draw(ctx, width, height, view, resolvedPattern) || false;
    if (!drawnWithCache) {
      drawBackgroundPatternFallback(ctx, width, height, view, resolvedPattern);
    }
  }
  ctx.restore();
}

function drawMindNode(ctx, element, view, selected, hover) {
  const bounds = getElementScreenBounds(view, element);
  const x = bounds.left;
  const y = bounds.top;
  const width = bounds.width;
  const height = bounds.height;
  const logicalWidth = Math.max(1, Number(element.width) || 1);
  const padding = scaleSceneValue(view, Math.max(10, logicalWidth * 0.06));
  const fontSize = scaleSceneValue(view, Math.min(Math.max(12, Number(element.fontSize || 18) * 1.05), 28));
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
  const viewportCuller = createViewportCuller();
  const backgroundPatternCache = createBackgroundPatternCache();

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
        pixelRatio,
      }) {
        const dpr = Math.max(1, Number(pixelRatio) || window.devicePixelRatio || 1);
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        const frameStart = typeof performance !== "undefined" ? performance.now() : Date.now();
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        drawBackground(ctx, width, height, view, backgroundStyle, backgroundPatternCache);

      const cullResult = viewportCuller(items, view, width, height, {
        selectedIds,
        hoverId,
        editingId,
      });
      const visibleItems = cullResult.items;

      const selected = new Set(selectedIds || []);
      let customRendererHandledCount = 0;
      visibleItems.forEach((item) => {
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
            customRendererHandledCount += 1;
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
      const frameEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
      const backgroundStats = backgroundPatternCache.getStats();
      canvas.__ffRenderStats = {
        frameDurationMs: Number((frameEnd - frameStart).toFixed(2)),
        viewport: { width, height },
        culling: cullResult.stats,
        renderedItems: visibleItems.length,
        customRendererHandledCount,
        background: backgroundStats,
      };
      ctx.restore();
    },
  };
}
