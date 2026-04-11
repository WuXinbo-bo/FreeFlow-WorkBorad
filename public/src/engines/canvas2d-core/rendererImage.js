import { resolveImageSource } from "./utils.js";
import { getMemoLayout } from "./memoLayout.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeCrop(crop) {
  if (!crop || typeof crop !== "object") {
    return null;
  }
  const x = clamp(Number(crop.x ?? 0), 0, 1);
  const y = clamp(Number(crop.y ?? 0), 0, 1);
  const w = clamp(Number(crop.w ?? 1), 0, 1);
  const h = clamp(Number(crop.h ?? 1), 0, 1);
  if (w <= 0 || h <= 0) {
    return null;
  }
  return { x, y, w, h };
}

function applyImageTransform(ctx, width, height, rotation, flipX, flipY) {
  ctx.translate(width / 2, height / 2);
  const angle = (Number(rotation || 0) * Math.PI) / 180;
  if (angle) {
    ctx.rotate(angle);
  }
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.translate(-width / 2, -height / 2);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const nextRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + nextRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, nextRadius);
  ctx.arcTo(x + width, y + height, x, y + height, nextRadius);
  ctx.arcTo(x, y + height, x, y, nextRadius);
  ctx.arcTo(x, y, x + width, y, nextRadius);
  ctx.closePath();
}

function wrapTextByChar(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
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
    if (!part) {
      row += 1;
      continue;
    }
    let line = "";
    for (const char of Array.from(part)) {
      const nextLine = line + char;
      if (ctx.measureText(nextLine).width > maxWidth && line) {
        if (row === maxLines - 1) {
          ctx.fillText(addEllipsis(line), x, y + row * lineHeight);
          return;
        }
        ctx.fillText(line, x, y + row * lineHeight);
        line = char;
        row += 1;
        if (row >= maxLines) return;
      } else {
        line = nextLine;
      }
    }
    if (!line) {
      row += 1;
      continue;
    }
    if (row === maxLines - 1) {
      ctx.fillText(addEllipsis(line), x, y + row * lineHeight);
      return;
    }
    ctx.fillText(line, x, y + row * lineHeight);
    row += 1;
  }
}

function countWrappedTextLines(ctx, text, maxWidth, maxLines = 4) {
  const raw = String(text || "");
  const lines = raw.split("\n");
  let row = 0;

  for (const part of lines) {
    if (row >= maxLines) break;
    if (!part) {
      row += 1;
      continue;
    }

    let line = "";
    for (const char of Array.from(part)) {
      const nextLine = line + char;
      if (ctx.measureText(nextLine).width > maxWidth && line) {
        row += 1;
        line = char;
        if (row >= maxLines) return maxLines;
      } else {
        line = nextLine;
      }
    }

    if (line) {
      row += 1;
    }
  }

  return Math.max(1, Math.min(row, maxLines));
}

function drawImageMemo(ctx, item, x, y, width, height, scale) {
  if (!item?.memoVisible) {
    return;
  }
  ctx.save();
  ctx.textBaseline = "top";
  const memoLayout = getMemoLayout(item, { kind: "image" });
  const memoX = (memoLayout.left - Number(item.x || 0)) * scale;
  const memoY = (memoLayout.top - Number(item.y || 0)) * scale;
  const memoWidth = memoLayout.width * scale;
  const memoHeight = memoLayout.height * scale;

  drawRoundedRect(ctx, memoX, memoY, memoWidth, memoHeight, memoLayout.radius * scale);
  ctx.fillStyle = "rgba(248, 250, 252, 0.98)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
  ctx.shadowColor = "rgba(15, 23, 42, 0.12)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.stroke();
  const memoText = String(item.memo || "").trim();
  if (memoText) {
    const memoPadding = memoLayout.padding * scale;
    const memoFontSize = memoLayout.fontSize * scale;
    const memoLineHeight = memoLayout.lineHeight * scale;
    const memoTextWidth = memoLayout.textWidth * scale;
    ctx.fillStyle = "rgba(51, 65, 85, 0.92)";
    ctx.font = `500 ${memoFontSize}px "Segoe UI", "PingFang SC", sans-serif`;
    const memoLineCount = countWrappedTextLines(ctx, memoText, memoTextWidth, memoLayout.maxLines);
    const memoTextHeight = memoLineCount * memoLineHeight;
    const memoTextTop = memoY + Math.max(memoPadding, (memoHeight - memoTextHeight) / 2);
    wrapTextByChar(
      ctx,
      memoText,
      memoX + memoPadding,
      memoTextTop,
      memoTextWidth,
      memoLineHeight,
      memoLayout.maxLines
    );
  }
  ctx.restore();
}

function drawArrow(ctx, x1, y1, x2, y2, size) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(6, size);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
}

function drawAnnotations(ctx, annotations, width, height, scale = 1, draft = {}) {
  const lines = Array.isArray(annotations?.lines) ? annotations.lines : [];
  const texts = Array.isArray(annotations?.texts) ? annotations.texts : [];
  const rects = Array.isArray(annotations?.rects) ? annotations.rects : [];
  const arrows = Array.isArray(annotations?.arrows) ? annotations.arrows : [];
  const draftLine = draft?.line || null;
  const draftRect = draft?.rect || null;
  const draftArrow = draft?.arrow || null;
  if (!lines.length && !texts.length && !rects.length && !arrows.length) {
    if (!draftLine && !draftRect && !draftArrow) {
      return;
    }
  }
  ctx.save();
  ctx.lineWidth = Math.max(1.5, 2 * Math.max(0.6, scale));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  lines.forEach((line) => {
    const x1 = Number(line?.x1 || 0) * width;
    const y1 = Number(line?.y1 || 0) * height;
    const x2 = Number(line?.x2 || 0) * width;
    const y2 = Number(line?.y2 || 0) * height;
    ctx.strokeStyle = line?.color || "rgba(239, 68, 68, 0.92)";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });
  if (draftLine) {
    const x1 = Number(draftLine?.x1 || 0) * width;
    const y1 = Number(draftLine?.y1 || 0) * height;
    const x2 = Number(draftLine?.x2 || 0) * width;
    const y2 = Number(draftLine?.y2 || 0) * height;
    ctx.strokeStyle = draftLine?.color || "rgba(239, 68, 68, 0.92)";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  rects.forEach((rect) => {
    const x = Number(rect?.x || 0) * width;
    const y = Number(rect?.y || 0) * height;
    const w = Number(rect?.w || 0) * width;
    const h = Number(rect?.h || 0) * height;
    if (!w || !h) {
      return;
    }
    ctx.strokeStyle = rect?.color || "rgba(15, 23, 42, 0.9)";
    const radius = Math.max(0, Number(rect?.radius || 0)) * Math.min(width, height);
    drawRoundedRect(ctx, x, y, w, h, radius);
    ctx.stroke();
  });
  if (draftRect) {
    const x = Number(draftRect?.x || 0) * width;
    const y = Number(draftRect?.y || 0) * height;
    const w = Number(draftRect?.w || 0) * width;
    const h = Number(draftRect?.h || 0) * height;
    if (w && h) {
      ctx.strokeStyle = draftRect?.color || "rgba(15, 23, 42, 0.9)";
      const radius = Math.max(0, Number(draftRect?.radius || 0)) * Math.min(width, height);
      drawRoundedRect(ctx, x, y, w, h, radius);
      ctx.stroke();
    }
  }
  arrows.forEach((arrow) => {
    const x1 = Number(arrow?.x1 || 0) * width;
    const y1 = Number(arrow?.y1 || 0) * height;
    const x2 = Number(arrow?.x2 || 0) * width;
    const y2 = Number(arrow?.y2 || 0) * height;
    ctx.strokeStyle = arrow?.color || "rgba(15, 23, 42, 0.9)";
    drawArrow(ctx, x1, y1, x2, y2, 8 * Math.max(0.6, scale));
  });
  if (draftArrow) {
    const x1 = Number(draftArrow?.x1 || 0) * width;
    const y1 = Number(draftArrow?.y1 || 0) * height;
    const x2 = Number(draftArrow?.x2 || 0) * width;
    const y2 = Number(draftArrow?.y2 || 0) * height;
    ctx.strokeStyle = draftArrow?.color || "rgba(15, 23, 42, 0.9)";
    drawArrow(ctx, x1, y1, x2, y2, 8 * Math.max(0.6, scale));
  }
  texts.forEach((entry) => {
    const text = String(entry?.text || "");
    if (!text) {
      return;
    }
    const x = Number(entry?.x || 0) * width;
    const y = Number(entry?.y || 0) * height;
    const baseFontSize = Number(entry?.fontSize || 0);
    const fontSize = Math.max(12, (baseFontSize || 16) * Math.max(0.6, scale));
    ctx.fillStyle = entry?.color || "rgba(15, 23, 42, 0.95)";
    ctx.font = `600 ${fontSize}px "Segoe UI", "PingFang SC", sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(text, x, y);
  });
  ctx.restore();
}

function drawImageContent(ctx, image, item, width, height, scale, cropOverride, drafts) {
  const crop = normalizeCrop(cropOverride ?? item.crop);
  const srcWidth = image.naturalWidth || item.naturalWidth || width;
  const srcHeight = image.naturalHeight || item.naturalHeight || height;
  const sx = crop ? crop.x * srcWidth : 0;
  const sy = crop ? crop.y * srcHeight : 0;
  const sw = crop ? crop.w * srcWidth : srcWidth;
  const sh = crop ? crop.h * srcHeight : srcHeight;

  const brightness = clamp(Number(item.brightness || 0), -100, 100);
  const contrast = clamp(Number(item.contrast || 0), -100, 100);
  const needsFilter = brightness !== 0 || contrast !== 0;
  const needsTransform = Number(item.rotation || 0) !== 0 || item.flipX || item.flipY;

  if (needsFilter) {
    ctx.filter = `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100})`;
  }
  ctx.save();
  if (needsTransform) {
    applyImageTransform(ctx, width, height, item.rotation, item.flipX, item.flipY);
  }
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  drawAnnotations(ctx, item.annotations, width, height, scale, drafts);
  ctx.restore();
  if (needsFilter) {
    ctx.filter = "none";
  }
}

function drawCropOverlay(ctx, width, height, crop) {
  if (!crop) {
    return;
  }
  const x = crop.x * width;
  const y = crop.y * height;
  const w = crop.w * width;
  const h = crop.h * height;
  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
  ctx.fillRect(0, 0, width, y);
  ctx.fillRect(0, y + h, width, height - y - h);
  ctx.fillRect(0, y, x, h);
  ctx.fillRect(x + w, y, width - x - w, h);
  ctx.strokeStyle = "rgba(59, 130, 246, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(x, y, w, h);
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

export function createImageRenderer() {
  const imageCache = new Map();

  return function renderImageElement({ ctx, item, view, selected, hover, helpers }) {
    if (item?.type !== "image") {
      return false;
    }

    const scale = Math.max(0.1, Number(view?.scale) || 1);
    const x = Number(item.x || 0) * scale + Number(view?.offsetX || 0);
    const y = Number(item.y || 0) * scale + Number(view?.offsetY || 0);
    const width = Math.max(1, Number(item.width) || 1) * scale;
    const height = Math.max(1, Number(item.height) || 1) * scale;

    ctx.save();
    ctx.translate(x, y);
    const source = resolveImageSource(item.dataUrl, item.sourcePath, {
      allowLocalFileAccess: helpers?.allowLocalFileAccess,
    });
    const cacheKey = source || item.id;
    let entry = imageCache.get(cacheKey);
    if (!entry && source) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = source;
      entry = { image, source };
      imageCache.set(cacheKey, entry);
    } else if (entry && source && entry.source !== source) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = source;
      entry = { image, source };
      imageCache.set(cacheKey, entry);
    }

    const image = entry?.image;
    drawImageMemo(ctx, item, 0, 0, width, height, scale);
    if (image?.complete && image.naturalWidth) {
      const cropPreview = helpers?.imageEditState?.id === item.id && helpers?.imageEditState?.cropPreview
        ? helpers.imageEditState.cropPreview
        : null;
      drawImageContent(ctx, image, item, width, height, scale, null);
      if (helpers?.imageEditState?.id === item.id && helpers?.imageEditState?.mode === "crop") {
        drawCropOverlay(ctx, width, height, cropPreview || item.crop);
      }
    } else {
      ctx.fillStyle = "rgba(71, 85, 105, 0.86)";
      ctx.font = '600 13px "Segoe UI", "PingFang SC", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("图片载入中", width / 2, height / 2);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }

    ctx.restore();
    helpers?.drawSelectionFrame?.(ctx, x, y, width, height, selected, hover);
    if (selected) {
      helpers?.drawHandles?.(ctx, item, view);
      drawRotateHandle(ctx, x, y, width, height, scale);
    }
    return true;
  };
}
