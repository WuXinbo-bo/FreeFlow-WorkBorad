import { sceneToScreen } from "./camera.js";
import { getElementBounds } from "./elements/index.js";
import { isLinearShape } from "./elements/shapes.js";
import { drawTextElement } from "./rendererText.js";
import { drawFileCard } from "./rendererFileCard.js";
import { drawShapeElement } from "./rendererShape.js";
import { drawLodHeaderStrip, drawLodTextBars, drawTableStyleLodShell } from "./rendererLod.js";
import { getElementScreenBounds, getScreenFixed, getScreenPoint, getViewScale, scaleSceneValue } from "./viewportMetrics.js";
import { createBackgroundPatternCache, createViewportCuller } from "./rendererPerf.js";
import { createTileSceneCache } from "./render/tileSceneCache.js";
import { drawStableRoundedRectPath, resolveScreenCornerRadius } from "./render/cornerRadius.js";
import {
  getMultiSelectionBounds,
  getMultiSelectionHandleMap,
  getMultiSelectionHandleRadiusPx,
  shouldShowMultiSelectionEdgeHandles,
} from "./multiSelectionTransform.js";

const HINT_LOGO_SRC = "/assets/brand/FreeFlow_logo.svg";
let hintLogo = null;
let hintLogoLoaded = false;
const CANVAS_LOD_TEXT_MIN_SCALE = 0.15;
const CANVAS_LOD_FILE_CARD_MIN_SCALE = 0.15;
const CANVAS_LOD_MIND_NODE_MIN_SCALE = 0.15;
const CANVAS_LOD_IMAGE_MIN_SCALE = 0.15;
const CANVAS_LOD_TABLE_MIN_SCALE = 0.15;
const CANVAS_LOD_CODE_BLOCK_MIN_SCALE = 0.15;
const CANVAS_LOD_MATH_MIN_SCALE = 0.15;
const CANVAS_LOD_FILE_CARD_MIN_WIDTH_PX = 72;
const CANVAS_LOD_FILE_CARD_MIN_HEIGHT_PX = 28;

function getCanvasLodScalePercent(scale = 1) {
  return Math.round(Math.max(0.1, Number(scale) || 1) * 100);
}

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
  drawStableRoundedRectPath(ctx, x, y, width, height, radius);
}

function wrapTextWithEllipsis(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const raw = String(text || "");
  const lines = raw.split("\n");
  let row = 0;
  const addEllipsis = (value) => {
    const ellipsis = "…";
    let trimmed = value;
    while (trimmed && ctx.measureText(`${trimmed}${ellipsis}`).width > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    return `${trimmed}${ellipsis}`;
  };

  for (const part of lines) {
    if (row >= maxLines) break;
    const words = part.split(/\s+/).filter(Boolean);
    if (!words.length) {
      row += 1;
      continue;
    }
    let line = "";
    for (const word of words) {
      const nextLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(nextLine).width > maxWidth && line) {
        if (row === maxLines - 1) {
          ctx.fillText(addEllipsis(line), x, y + row * lineHeight);
          return;
        }
        ctx.fillText(line, x, y + row * lineHeight);
        line = word;
        row += 1;
        if (row >= maxLines) return;
      } else {
        line = nextLine;
      }
    }
    if (row === maxLines - 1) {
      ctx.fillText(addEllipsis(line), x, y + row * lineHeight);
      return;
    }
    ctx.fillText(line, x, y + row * lineHeight);
    row += 1;
  }
}

function getSelectionFrameRadius(width = 0, height = 0) {
  return resolveScreenCornerRadius(width, height, 10, {
    maxRadiusPx: 10,
    maxCornerRatio: 0.18,
    minRadiusPx: 4,
  });
}


function drawSelectionFrame(ctx, x, y, width, height, selected = false, hover = false) {
  if (!selected && !hover) {
    return;
  }
  const frameInset = 3;
  const frameRadius = getSelectionFrameRadius(width + frameInset * 2, height + frameInset * 2);
  ctx.save();
  ctx.setLineDash(selected ? [8, 6] : [6, 6]);
  ctx.strokeStyle = selected ? "rgba(59, 130, 246, 0.9)" : "rgba(59, 130, 246, 0.42)";
  ctx.lineWidth = selected ? 2 : 1.5;
  drawRoundedRect(ctx, x - frameInset, y - frameInset, width + frameInset * 2, height + frameInset * 2, frameRadius);
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

function drawMultiSelectionHandles(ctx, view, selectedItems = []) {
  const bounds = getMultiSelectionBounds(selectedItems);
  if (!bounds) {
    return;
  }
  const scale = Math.max(0.1, Number(view?.scale) || 1);
  const leftTop = getScreenPoint(view, { x: bounds.left, y: bounds.top });
  const rightBottom = getScreenPoint(view, { x: bounds.right, y: bounds.bottom });
  const width = Math.max(1, Math.abs(rightBottom.x - leftTop.x));
  const height = Math.max(1, Math.abs(rightBottom.y - leftTop.y));
  const x = Math.min(leftTop.x, rightBottom.x);
  const y = Math.min(leftTop.y, rightBottom.y);

  drawSelectionFrame(ctx, x, y, width, height, true, false);

  const handles = getMultiSelectionHandleMap(bounds);
  const visibleHandles = [
    "multi-nw",
    "multi-ne",
    "multi-se",
    "multi-sw",
    ...(shouldShowMultiSelectionEdgeHandles(bounds, scale) ? ["multi-n", "multi-e", "multi-s", "multi-w"] : []),
  ];

  const handleRadius = getMultiSelectionHandleRadiusPx();
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(59, 130, 246, 0.95)";
  ctx.lineWidth = 1.5;
  visibleHandles.forEach((handleKey) => {
    const handlePoint = handles[handleKey];
    if (!handlePoint) {
      return;
    }
    const point = getScreenPoint(view, handlePoint);
    ctx.beginPath();
    ctx.arc(point.x, point.y, handleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
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

function drawMindNodeLod(ctx, element, view, selected, hover) {
  const bounds = getElementScreenBounds(view, element);
  const x = bounds.left;
  const y = bounds.top;
  const width = bounds.width;
  const height = bounds.height;

  ctx.save();
  const rect = drawTableStyleLodShell(ctx, x, y, width, height);
  drawLodTextBars(ctx, rect, {
    lineCount: 3,
    fill: "rgba(100, 116, 139, 0.12)",
    verticalAlign: "start",
    widths: [0.78, 0.64, 0.56],
  });
  drawSelectionFrame(ctx, x, y, width, height, selected, hover);
  if (selected) {
    drawHandles(ctx, element, view);
  }
  ctx.restore();
}

function drawTextElementLod(ctx, element, view, selected, hover) {
  const bounds = getElementScreenBounds(view, element);
  const x = bounds.left;
  const y = bounds.top;
  const width = bounds.width;
  const height = bounds.height;
  ctx.save();
  const rect = drawTableStyleLodShell(ctx, x, y, width, height);
  drawLodTextBars(ctx, rect, {
    lineCount: 3,
    fill: "rgba(100, 116, 139, 0.12)",
    verticalAlign: "start",
    widths: [0.82, 0.7, 0.58],
  });
  drawSelectionFrame(ctx, x, y, width, height, selected, hover);
  if (selected) {
    drawHandles(ctx, element, view);
  }
  ctx.restore();
}

function drawFileCardLod(ctx, element, view, selected, hover, { drawSelectionFrame, drawHandles } = {}) {
  const scale = Math.max(0.1, Number(view?.scale) || 1);
  const x = Number(element.x || 0) * scale + Number(view?.offsetX || 0);
  const y = Number(element.y || 0) * scale + Number(view?.offsetY || 0);
  const width = Math.max(1, Number(element.width) || 1) * scale;
  const height = Math.max(1, Number(element.height) || 1) * scale;
  ctx.save();
  const rect = drawTableStyleLodShell(ctx, x, y, width, height);
  const headerHeight = drawLodHeaderStrip(ctx, rect, {
    height: Math.max(8, rect.panelHeight * 0.22),
  });
  drawLodTextBars(ctx, rect, {
    lineCount: 2,
    fill: "rgba(100, 116, 139, 0.12)",
    verticalAlign: "start",
    padTop: headerHeight + Math.max(6, rect.panelHeight * 0.14),
    widths: [0.76, 0.52],
  });

  if (element.marked) {
    ctx.save();
    drawRoundedRect(ctx, x + 4, y + 4, Math.max(1, width - 8), Math.max(1, height - 8), 14);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.82)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  drawSelectionFrame?.(ctx, x, y, width, height, selected, hover);
  if (selected) {
    drawHandles?.(ctx, element, view);
  }
  ctx.restore();
}

function resolveCanvasLodMode(item, view, { renderTextInCanvas = false } = {}) {
  const scale = Math.max(0.1, Number(view?.scale) || 1);
  const scalePercent = getCanvasLodScalePercent(scale);
  if (!item || typeof item !== "object") {
    return "full";
  }
  const screenWidth = Math.max(1, Number(item.width || 1) || 1) * scale;
  const screenHeight = Math.max(1, Number(item.height || 1) || 1) * scale;
  if (
    item.type === "fileCard" &&
    (
      scalePercent <= Math.round(CANVAS_LOD_FILE_CARD_MIN_SCALE * 100) ||
      screenWidth <= CANVAS_LOD_FILE_CARD_MIN_WIDTH_PX ||
      screenHeight <= CANVAS_LOD_FILE_CARD_MIN_HEIGHT_PX
    )
  ) {
    return "summary";
  }
  if (item.type === "mindNode" && scalePercent <= Math.round(CANVAS_LOD_MIND_NODE_MIN_SCALE * 100)) {
    return "summary";
  }
  if (item.type === "image" && scalePercent <= Math.round(CANVAS_LOD_IMAGE_MIN_SCALE * 100)) {
    return "summary";
  }
  if (item.type === "table" && scalePercent <= Math.round(CANVAS_LOD_TABLE_MIN_SCALE * 100)) {
    return "summary";
  }
  if (item.type === "codeBlock" && scalePercent <= Math.round(CANVAS_LOD_CODE_BLOCK_MIN_SCALE * 100)) {
    return "summary";
  }
  if ((item.type === "mathBlock" || item.type === "mathInline") && scalePercent <= Math.round(CANVAS_LOD_MATH_MIN_SCALE * 100)) {
    return "summary";
  }
  if ((item.type === "text" || item.type === "flowNode") && scalePercent <= Math.round(CANVAS_LOD_TEXT_MIN_SCALE * 100)) {
    return "summary";
  }
  return "full";
}

function shouldBypassStaticTileCache(item, dynamicIdSet) {
  if (!item || typeof item !== "object") {
    return false;
  }
  const itemId = String(item.id || "");
  if (itemId && dynamicIdSet?.has(itemId)) {
    return true;
  }
  return item.type === "image" || item.type === "table";
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

function drawVisibleItemsToContext({
  ctx,
  items = [],
  view,
  selectedIds,
  hoverId,
  editingId,
  imageEditState,
  flowDraft,
  allowLocalFileAccess,
  renderTextInCanvas,
  renderers = [],
}) {
  const selected = new Set(selectedIds || []);
  let customRendererHandledCount = 0;
  let lodSimplifiedCount = 0;
  (Array.isArray(items) ? items : []).forEach((item) => {
    const isSelected = selected.has(item.id);
    const isHover = hoverId === item.id && !isSelected;
    const lodMode = resolveCanvasLodMode(item, view, { renderTextInCanvas });
    for (const renderElement of renderers) {
      const handled = renderElement?.({
        ctx,
        item,
        view,
        selected: isSelected,
        hover: isHover,
        editing: editingId === item.id,
        lodMode,
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
        if (handled !== true && handled?.lodSimplified) {
          lodSimplifiedCount += 1;
        }
        drawLockBadge(ctx, item, view);
        return;
      }
    }
    if (item.type === "fileCard") {
      if (lodMode !== "full") {
        lodSimplifiedCount += 1;
        drawFileCardLod(ctx, item, view, isSelected, isHover, {
          drawSelectionFrame,
          drawHandles,
        });
        drawLockBadge(ctx, item, view);
        return;
      }
      drawFileCard(ctx, item, view, isSelected, isHover, {
        drawSelectionFrame,
        drawHandles,
      });
      drawLockBadge(ctx, item, view);
      return;
    }
    if (item.type === "mindNode") {
      if (lodMode !== "full") {
        lodSimplifiedCount += 1;
        drawMindNodeLod(ctx, item, view, isSelected, isHover);
        drawLockBadge(ctx, item, view);
        return;
      }
      drawMindNode(ctx, item, view, isSelected, isHover);
      drawLockBadge(ctx, item, view);
      return;
    }
    if ((item.type === "text" || item.type === "flowNode") && lodMode !== "full") {
      lodSimplifiedCount += 1;
      drawTextElementLod(ctx, item, view, isSelected, isHover);
      drawLockBadge(ctx, item, view);
      return;
    }
    drawTextElement(ctx, item, view, isSelected, isHover, editingId === item.id, drawSelectionFrame, drawHandles, {
      renderText: Boolean(renderTextInCanvas),
    });
    drawLockBadge(ctx, item, view);
  });
  return {
    customRendererHandledCount,
    lodSimplifiedCount,
  };
}

function createRenderSurface(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const nextCanvas = document.createElement("canvas");
    nextCanvas.width = width;
    nextCanvas.height = height;
    return nextCanvas;
  }
  return null;
}

function createCanvasLayerStore() {
  const layers = new Map();
  let metrics = { pixelWidth: 0, pixelHeight: 0, width: 0, height: 0, dpr: 1 };

  function ensureLayer(name, width, height, dpr) {
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    let entry = layers.get(name) || null;
    if (!entry || entry.canvas.width !== pixelWidth || entry.canvas.height !== pixelHeight) {
      const canvas = createRenderSurface(pixelWidth, pixelHeight);
      const ctx = canvas?.getContext?.("2d") || null;
      if (!canvas || !ctx) {
        return null;
      }
      entry = { canvas, ctx };
      layers.set(name, entry);
    }
    entry.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return entry;
  }

  return {
    ensure(name, width, height, dpr) {
      metrics = {
        pixelWidth: Math.max(1, Math.round(width * dpr)),
        pixelHeight: Math.max(1, Math.round(height * dpr)),
        width,
        height,
        dpr,
      };
      return ensureLayer(name, width, height, dpr);
    },
    get(name) {
      return layers.get(name) || null;
    },
    getMetrics() {
      return { ...metrics };
    },
    clear() {
      layers.clear();
      metrics = { pixelWidth: 0, pixelHeight: 0, width: 0, height: 0, dpr: 1 };
    },
  };
}

function clearLayerContext(layerEntry, width, height) {
  const layerCtx = layerEntry?.ctx || null;
  if (!layerCtx) {
    return;
  }
  layerCtx.clearRect(0, 0, width, height);
}

function drawDraftElement(ctx, draftElement, view) {
  if (!draftElement) {
    return;
  }
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

function drawInteractionLayer(ctx, {
  view,
  width,
  height,
  selectionRect,
  alignmentSnap,
  alignmentSnapConfig,
  items,
  draftElement,
  hoveredItem,
  selectedItems = [],
} = {}) {
  if (hoveredItem) {
    const bounds = getElementBounds(hoveredItem);
    const topLeft = sceneToScreen(view, { x: bounds.left, y: bounds.top });
    const bottomRight = sceneToScreen(view, { x: bounds.right, y: bounds.bottom });
    drawSelectionFrame(
      ctx,
      Math.min(topLeft.x, bottomRight.x),
      Math.min(topLeft.y, bottomRight.y),
      Math.max(1, Math.abs(bottomRight.x - topLeft.x)),
      Math.max(1, Math.abs(bottomRight.y - topLeft.y)),
      false,
      true
    );
  }
  drawSelectionRect(ctx, view, selectionRect);
  if (Array.isArray(selectedItems) && selectedItems.length >= 2) {
    drawMultiSelectionHandles(ctx, view, selectedItems);
  }
  drawAlignmentSnapGuides(ctx, alignmentSnap, alignmentSnapConfig, width, height);
  if (!(Array.isArray(items) && items.length) && !draftElement) {
    drawHint(ctx, width, height);
  }
}

function getRectSignature(rect = null) {
  if (!rect?.start && !rect?.current) {
    return "";
  }
  const start = rect?.start || rect?.current || {};
  const current = rect?.current || rect?.start || {};
  return [
    Math.round(Number(start.x || 0) * 10) / 10,
    Math.round(Number(start.y || 0) * 10) / 10,
    Math.round(Number(current.x || 0) * 10) / 10,
    Math.round(Number(current.y || 0) * 10) / 10,
  ].join(":");
}

function getDynamicVisualSignature({
  dynamicItems = [],
  draftElement = null,
  flowDraft = null,
  imageEditState = null,
} = {}) {
  const dynamicIds = (Array.isArray(dynamicItems) ? dynamicItems : [])
    .map((item) => String(item?.id || "").trim())
    .filter(Boolean)
    .sort()
    .join("|");
  const draftSignature = draftElement
    ? [
        String(draftElement.type || ""),
        String(draftElement.shapeType || ""),
        Math.round(Number(draftElement.x || draftElement.startX || 0)),
        Math.round(Number(draftElement.y || draftElement.startY || 0)),
        Math.round(Number(draftElement.width || draftElement.endX || 0)),
        Math.round(Number(draftElement.height || draftElement.endY || 0)),
      ].join(":")
    : "";
  const flowDraftSignature = flowDraft
    ? [
        String(flowDraft.fromId || ""),
        String(flowDraft.fromSide || ""),
        Math.round(Number(flowDraft.toPoint?.x || 0)),
        Math.round(Number(flowDraft.toPoint?.y || 0)),
        String(flowDraft.style || ""),
      ].join(":")
    : "";
  const imageEditSignature =
    imageEditState && typeof imageEditState === "object"
      ? [
          String(imageEditState.id || ""),
          String(imageEditState.mode || ""),
          imageEditState.cropPreview ? 1 : 0,
        ].join(":")
      : "";
  return [dynamicIds, draftSignature, flowDraftSignature, imageEditSignature].join("||");
}

function getInteractionVisualSignature({
  selectionRect = null,
  alignmentSnap = null,
  items = [],
  draftElement = null,
  hoveredItem = null,
  selectedIds = [],
} = {}) {
  const guides = Array.isArray(alignmentSnap?.guides) ? alignmentSnap.guides : [];
  const guideSignature = guides
    .map((guide) =>
      [
        String(guide?.axis || ""),
        Math.round(Number(guide?.x ?? guide?.position ?? 0)),
        Math.round(Number(guide?.y ?? guide?.position ?? 0)),
      ].join(":")
    )
    .join("|");
  const hintVisible = !(Array.isArray(items) && items.length) && !draftElement ? "hint" : "";
  return [
    getRectSignature(selectionRect),
    String(hoveredItem?.id || ""),
    Array.isArray(selectedIds) ? selectedIds.map((id) => String(id || "")).filter(Boolean).sort().join("|") : "",
    alignmentSnap?.active ? "active" : "",
    guideSignature,
    hintVisible,
  ].join("||");
}

function getViewVisualSignature(view = null) {
  return [
    Math.round((Number(view?.scale || 1) || 1) * 10000) / 10000,
    Math.round(Number(view?.offsetX || 0) || 0),
    Math.round(Number(view?.offsetY || 0) || 0),
  ].join(":");
}

export function createRenderer({ customRenderers = [] } = {}) {
  const renderers = Array.isArray(customRenderers) ? customRenderers : [];
  const viewportCuller = createViewportCuller();
  const backgroundPatternCache = createBackgroundPatternCache();
  const staticTileLayer = createTileSceneCache();
  const layerStore = createCanvasLayerStore();
  let lastStaticExclusionSignature = "";
  let lastTileStats = {
    tileCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    invalidatedTiles: 0,
    reusedVisibleTiles: 0,
    rerasterizedDirtyTiles: 0,
    coldRenderedTiles: 0,
    dirtyVisibleTiles: 0,
    cacheSize: 0,
  };
  let lastDynamicStats = { customRendererHandledCount: 0, lodSimplifiedCount: 0 };
  let lastDynamicVisualSignature = "";
  let lastInteractionVisualSignature = "";
  let lastViewVisualSignature = "";

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
      visibleItems = null,
      sceneIndex = null,
      sceneKey = "",
      dirtyState = null,
      layerState = null,
    }) {
      const dpr = Math.max(1, Number(pixelRatio) || window.devicePixelRatio || 1);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const frameStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const layerDirty = layerState?.dirty || {
        background: true,
        staticScene: true,
        dynamicScene: true,
        interaction: true,
      };

      const backgroundLayer = layerStore.ensure("background", width, height, dpr);
      const staticLayer = layerStore.ensure("staticScene", width, height, dpr);
      const dynamicLayer = layerStore.ensure("dynamicScene", width, height, dpr);
      const interactionLayer = layerStore.ensure("interaction", width, height, dpr);
      if (!backgroundLayer || !staticLayer || !dynamicLayer || !interactionLayer) {
        return null;
      }

      const cullResult =
        Array.isArray(visibleItems)
          ? {
              items: visibleItems,
              stats: {
                totalCount: Array.isArray(items) ? items.length : 0,
                renderedCount: visibleItems.length,
                culledCount: Math.max(0, (Array.isArray(items) ? items.length : 0) - visibleItems.length),
                forceRenderedCount: 0,
              },
            }
          : viewportCuller(items, view, width, height, {
              selectedIds,
              hoverId,
              editingId,
            });
      const frameVisibleItems = cullResult.items;
      const hoveredItem = frameVisibleItems.find((item) => String(item?.id || "") === String(hoverId || "")) || null;
      const requiresDynamicHover = hoveredItem?.type === "flowNode";
      const dynamicIdSet = new Set(
        [
          editingId,
          ...(requiresDynamicHover ? [hoverId] : []),
          ...(Array.isArray(selectedIds) ? selectedIds : []),
        ]
          .map((value) => String(value || ""))
          .filter(Boolean)
      );
      const staticItems = frameVisibleItems.filter((item) => !shouldBypassStaticTileCache(item, dynamicIdSet));
      const dynamicItems = frameVisibleItems.filter((item) => shouldBypassStaticTileCache(item, dynamicIdSet));
      const dynamicRenderIdSet = new Set(
        dynamicItems
          .map((item) => String(item?.id || "").trim())
          .filter(Boolean)
      );
      const staticExclusionSignature = dynamicItems
        .map((item) => String(item?.id || "").trim())
        .filter(Boolean)
        .sort()
        .join("|");
      const dynamicVisualSignature = getDynamicVisualSignature({
        dynamicItems,
        draftElement,
        flowDraft,
        imageEditState,
      });
      const interactionVisualSignature = getInteractionVisualSignature({
        selectionRect,
        alignmentSnap,
        items,
        draftElement,
        hoveredItem: hoveredItem && !dynamicRenderIdSet.has(String(hoveredItem.id || "")) ? hoveredItem : null,
        selectedIds,
      });
      const viewVisualSignature = getViewVisualSignature(view);
      const forceStaticSceneRedraw = staticExclusionSignature !== lastStaticExclusionSignature;
      const forceDynamicSceneRedraw = dynamicVisualSignature !== lastDynamicVisualSignature;
      const forceInteractionRedraw = interactionVisualSignature !== lastInteractionVisualSignature;
      const forceViewRedraw = viewVisualSignature !== lastViewVisualSignature;
      lastStaticExclusionSignature = staticExclusionSignature;
      lastDynamicVisualSignature = dynamicVisualSignature;
      lastInteractionVisualSignature = interactionVisualSignature;
      lastViewVisualSignature = viewVisualSignature;

      let tileStats = {
        tileCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
        invalidatedTiles: 0,
        reusedVisibleTiles: 0,
        rerasterizedDirtyTiles: 0,
        coldRenderedTiles: 0,
        dirtyVisibleTiles: 0,
      };
      let customRendererHandledCount = 0;
      let lodSimplifiedCount = 0;
      const effectiveBackgroundDirty = Boolean(layerDirty.background || forceViewRedraw);
      const effectiveStaticSceneDirty = Boolean(layerDirty.staticScene || forceStaticSceneRedraw || forceViewRedraw);
      const effectiveDynamicSceneDirty = Boolean(
        forceViewRedraw ||
        forceDynamicSceneRedraw ||
        (
          layerDirty.dynamicScene &&
          (dirtyState?.sceneDirty || dirtyState?.viewDirty || dirtyState?.interactionDirty || forceStaticSceneRedraw)
        )
      );
      const effectiveInteractionDirty = Boolean(
        forceViewRedraw ||
        forceInteractionRedraw ||
        (
          layerDirty.interaction &&
          (dirtyState?.sceneDirty || dirtyState?.viewDirty || dirtyState?.interactionDirty || forceStaticSceneRedraw)
        )
      );

      if (effectiveBackgroundDirty) {
        clearLayerContext(backgroundLayer, width, height);
        drawBackground(backgroundLayer.ctx, width, height, view, backgroundStyle, backgroundPatternCache);
      }

      if (effectiveStaticSceneDirty) {
        clearLayerContext(staticLayer, width, height);
        tileStats =
          staticItems.length && sceneIndex && sceneKey
            ? staticTileLayer.draw({
                ctx: staticLayer.ctx,
                sceneIndex,
                sceneKey,
                view,
                viewportWidth: width,
                viewportHeight: height,
                excludeIds: Array.from(dynamicRenderIdSet),
                sceneChanged: Boolean(dirtyState?.sceneDirty),
                dirtyItemIds: Array.isArray(dirtyState?.itemIds) ? dirtyState.itemIds : [],
                drawItems: ({ ctx: tileCtx, items: tileItems, view: tileView }) =>
                  drawVisibleItemsToContext({
                    ctx: tileCtx,
                    items: tileItems,
                    view: tileView,
                    selectedIds: [],
                    hoverId: null,
                    editingId: null,
                    imageEditState: null,
                    flowDraft: null,
                    allowLocalFileAccess,
                    renderTextInCanvas,
                    renderers,
                  }),
              })
            : staticItems.length
              ? drawVisibleItemsToContext({
                  ctx: staticLayer.ctx,
                  items: staticItems,
                  view,
                  selectedIds: [],
                  hoverId: null,
                  editingId: null,
                  imageEditState: null,
                  flowDraft: null,
                  allowLocalFileAccess,
                  renderTextInCanvas,
                  renderers,
                })
              : {
                  tileCount: 0,
                  cacheHits: 0,
                  cacheMisses: 0,
                  invalidatedTiles: 0,
                  reusedVisibleTiles: 0,
                  rerasterizedDirtyTiles: 0,
                  coldRenderedTiles: 0,
                  dirtyVisibleTiles: 0,
                };
        lastTileStats = {
          ...tileStats,
          cacheSize: staticTileLayer.getSize(),
        };
      } else {
        tileStats = {
          ...lastTileStats,
          cacheHits: 0,
          cacheMisses: 0,
          invalidatedTiles: 0,
          reusedVisibleTiles: Math.max(0, Number(lastTileStats.tileCount || 0) || 0),
          rerasterizedDirtyTiles: 0,
          coldRenderedTiles: 0,
          dirtyVisibleTiles: 0,
        };
      }

      if (effectiveDynamicSceneDirty) {
        clearLayerContext(dynamicLayer, width, height);
        const dynamicStats = drawVisibleItemsToContext({
          ctx: dynamicLayer.ctx,
          items: dynamicItems,
          view,
          selectedIds,
          hoverId,
          editingId,
          imageEditState,
          flowDraft,
          allowLocalFileAccess,
          renderTextInCanvas,
          renderers,
        });
        customRendererHandledCount = Number(dynamicStats?.customRendererHandledCount || 0) || 0;
        lodSimplifiedCount = Number(dynamicStats?.lodSimplifiedCount || 0) || 0;
        lastDynamicStats = {
          customRendererHandledCount,
          lodSimplifiedCount,
        };
        drawDraftElement(dynamicLayer.ctx, draftElement, view);
      } else {
        customRendererHandledCount = Number(lastDynamicStats.customRendererHandledCount || 0) || 0;
        lodSimplifiedCount = Number(lastDynamicStats.lodSimplifiedCount || 0) || 0;
      }

      if (effectiveInteractionDirty) {
        const selectedIdSet = new Set(Array.isArray(selectedIds) ? selectedIds : []);
        clearLayerContext(interactionLayer, width, height);
        drawInteractionLayer(interactionLayer.ctx, {
          view,
          width,
          height,
          selectionRect,
          alignmentSnap,
          alignmentSnapConfig,
          items,
          draftElement,
          hoveredItem: hoveredItem && !dynamicRenderIdSet.has(String(hoveredItem.id || "")) ? hoveredItem : null,
          selectedItems:
            Array.isArray(selectedIds) && selectedIds.length >= 2
              ? frameVisibleItems.filter((item) => selectedIdSet.has(item.id))
              : [],
        });
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(backgroundLayer.canvas, 0, 0, width, height);
      ctx.drawImage(staticLayer.canvas, 0, 0, width, height);
      ctx.drawImage(dynamicLayer.canvas, 0, 0, width, height);
      ctx.drawImage(interactionLayer.canvas, 0, 0, width, height);
      const frameEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
      const backgroundStats = backgroundPatternCache.getStats();
      canvas.__ffRenderStats = {
        frameDurationMs: Number((frameEnd - frameStart).toFixed(2)),
        viewport: { width, height },
        culling: cullResult.stats,
        renderedItems: frameVisibleItems.length,
        staticRenderedItems: staticItems.length,
        dynamicRenderedItems: dynamicItems.length,
        customRendererHandledCount:
          customRendererHandledCount + Math.max(0, Number(tileStats?.customRendererHandledCount || 0) || 0),
        lodSimplifiedCount:
          lodSimplifiedCount + Math.max(0, Number(tileStats?.lodSimplifiedCount || 0) || 0),
        background: backgroundStats,
        layerReuse: {
          backgroundReused: !effectiveBackgroundDirty,
          staticSceneReused: !effectiveStaticSceneDirty,
          dynamicSceneReused: !effectiveDynamicSceneDirty,
          interactionReused: !effectiveInteractionDirty,
        },
        renderReason: String(layerState?.renderReason || dirtyState?.reason || "render"),
        renderReasons: Array.isArray(layerState?.reasons) ? layerState.reasons.slice() : [],
        layerState: layerState
          ? {
              revisions: { ...(layerState.revisions || {}) },
              dirty: { ...(layerState.dirty || {}) },
            }
          : null,
        tileCache: {
          ...tileStats,
          cacheSize: Number(tileStats?.cacheSize || staticTileLayer.getSize()) || 0,
          reused: !effectiveStaticSceneDirty,
        },
      };
      ctx.restore();
    },
  };
}
