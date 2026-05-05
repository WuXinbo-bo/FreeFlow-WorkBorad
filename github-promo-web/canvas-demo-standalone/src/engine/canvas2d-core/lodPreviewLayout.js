function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function clampLodValue(value, min, max) {
  return clamp(Number(value) || 0, min, max);
}

export function resolveLodShellGeometry({
  x = 0,
  y = 0,
  width = 1,
  height = 1,
  radius = 12,
  inset = 4,
  panelRadius = null,
} = {}) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const maxInset = Math.max(0, Math.min(safeWidth, safeHeight) / 2);
  const safeInset = clampLodValue(inset, 0, maxInset);
  const panelX = Number(x) + safeInset;
  const panelY = Number(y) + safeInset;
  const panelWidth = Math.max(1, safeWidth - safeInset * 2);
  const panelHeight = Math.max(1, safeHeight - safeInset * 2);
  const safeRadius = clampLodValue(radius, 0, Math.min(Math.min(safeWidth, safeHeight) * 0.18, 18));
  const requestedPanelRadius = panelRadius == null ? Math.max(0, safeRadius - 4) : Number(panelRadius);
  const safePanelRadius = clampLodValue(requestedPanelRadius, 0, Math.min(Math.min(panelWidth, panelHeight) * 0.18, 16));
  return {
    x: Number(x) || 0,
    y: Number(y) || 0,
    width: safeWidth,
    height: safeHeight,
    radius: safeRadius,
    inset: safeInset,
    panelX,
    panelY,
    panelWidth,
    panelHeight,
    panelRadius: safePanelRadius,
  };
}

export function resolveLodHeaderLayout(rect, options = {}) {
  const maxHeight = Math.max(0, Number(rect?.panelHeight || 0) - 8);
  if (maxHeight <= 0) {
    return {
      height: 0,
    };
  }
  const requestedHeight = Number(options.height ?? Number(rect?.panelHeight || 0) * 0.22) || 0;
  return {
    height: clampLodValue(requestedHeight, 0, maxHeight),
  };
}

export function resolveLodTextBarLayout(rect, options = {}) {
  const panelX = Number(rect?.panelX || 0);
  const panelY = Number(rect?.panelY || 0);
  const panelWidth = Math.max(1, Number(rect?.panelWidth || 1) || 1);
  const panelHeight = Math.max(1, Number(rect?.panelHeight || 1) || 1);
  const requestedLineCount = Math.max(1, Number(options.lineCount || 3) || 3);
  const padX = clampLodValue(options.padX ?? panelWidth * 0.12, 0, panelWidth / 2);
  const padTop = clampLodValue(options.padTop ?? panelHeight * 0.18, 0, panelHeight);
  const padBottom = clampLodValue(options.padBottom ?? panelHeight * 0.12, 0, panelHeight);
  const availableWidth = Math.max(1, panelWidth - padX * 2);
  const contentTop = panelY + padTop;
  const contentBottom = panelY + panelHeight - padBottom;
  const availableHeight = Math.max(0, contentBottom - contentTop);
  if (availableHeight < 2) {
    return {
      fitLineCount: 0,
      lineHeight: 0,
      lineGap: 0,
      lines: [],
    };
  }
  const requestedLineHeight = Number(options.lineHeight ?? panelHeight * 0.12) || 0;
  const requestedLineGap = Number(options.lineGap ?? panelHeight * 0.1) || 0;
  const lineHeight = clampLodValue(requestedLineHeight, 2, availableHeight);
  const lineGap = clampLodValue(requestedLineGap, 0, Math.max(0, availableHeight - lineHeight));
  const fitLineCount = Math.max(
    1,
    Math.min(
      requestedLineCount,
      Math.floor((availableHeight + lineGap) / Math.max(1, lineHeight + lineGap))
    )
  );
  const widths = Array.isArray(options.widths) && options.widths.length ? options.widths : [0.84, 0.72, 0.58, 0.66];
  const align = options.align === "center" ? "center" : "left";
  const blockHeight = fitLineCount * lineHeight + Math.max(0, fitLineCount - 1) * lineGap;
  const verticalAlign = options.verticalAlign === "start" ? "start" : "center";
  const startY = verticalAlign === "start"
    ? contentTop
    : contentTop + Math.max(0, (availableHeight - blockHeight) / 2);
  const lines = Array.from({ length: fitLineCount }, (_, index) => {
    const ratio = clampLodValue(widths[index] ?? widths[widths.length - 1] ?? 0.62, 0.2, 1);
    const width = Math.max(2, availableWidth * ratio);
    const x = align === "center" ? panelX + (panelWidth - width) / 2 : panelX + padX;
    const y = startY + index * (lineHeight + lineGap);
    return {
      x,
      y,
      width,
      height: lineHeight,
      radius: Math.max(1, lineHeight * 0.5),
    };
  });
  return {
    fitLineCount,
    lineHeight,
    lineGap,
    lines,
  };
}
