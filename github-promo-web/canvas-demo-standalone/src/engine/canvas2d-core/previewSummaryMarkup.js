import { clampLodValue, resolveLodShellGeometry, resolveLodTextBarLayout } from "./lodPreviewLayout.js";

export function resolvePreviewSummaryLayout({
  width = 120,
  height = 48,
  lineCount = 3,
  widths = [0.82, 0.7, 0.58],
} = {}) {
  const safeWidth = Math.max(24, Number(width) || 120);
  const safeHeight = Math.max(18, Number(height) || 48);
  const safeLineCount = Math.max(1, Math.min(6, Number(lineCount || 3) || 3));
  const shortestSide = Math.max(18, Math.min(safeWidth, safeHeight));
  const lineHeight = clampLodValue(Math.round(shortestSide * 0.12), 4, 10);
  const lineGap = clampLodValue(Math.round(lineHeight * 1.5), 3, 10);
  const normalizedWidths = Array.from({ length: safeLineCount }, (_, index) => {
    const ratio = Number(widths[index] ?? widths[widths.length - 1] ?? 0.62) || 0.62;
    return clampLodValue(ratio, 0.24, 0.96);
  });
  return {
    width: safeWidth,
    height: safeHeight,
    lineCount: safeLineCount,
    lineHeight,
    lineGap,
    widths: normalizedWidths,
  };
}

export function buildUnifiedPreviewSummaryMarkup({
  width = 120,
  height = 48,
  showHeader = true,
  lineCount = 3,
  widths = [0.82, 0.7, 0.58],
  align = "left",
  drawFrame = true,
} = {}) {
  const layout = resolvePreviewSummaryLayout({ width, height, lineCount, widths });
  const outerInset = 0;
  const shellInset = 0;
  const shellRadius = clampLodValue(Math.min(layout.width, layout.height) * 0.08, 6, 14);
  const shell = resolveLodShellGeometry({
    x: outerInset,
    y: outerInset,
    width: layout.width - outerInset * 2,
    height: layout.height - outerInset * 2,
    radius: shellRadius,
    inset: shellInset,
    panelRadius: Math.max(4, shellRadius - 2),
  });
  const headerHeight = showHeader
    ? clampLodValue(Math.round(shell.panelHeight * 0.16), 0, Math.min(22, shell.panelHeight * 0.34))
    : 0;
  const padX = clampLodValue(shell.panelWidth * 0.08, 6, Math.max(6, shell.panelWidth * 0.18));
  const padTop = showHeader
    ? headerHeight + clampLodValue(shell.panelHeight * 0.1, 6, 14)
    : clampLodValue(shell.panelHeight * 0.16, 8, 18);
  const padBottom = clampLodValue(shell.panelHeight * 0.12, 6, 14);
  const lineLayout = resolveLodTextBarLayout(shell, {
    lineCount: layout.lineCount,
    widths: layout.widths,
    align,
    verticalAlign: "start",
    padX,
    padTop,
    padBottom,
    lineHeight: layout.lineHeight,
    lineGap: layout.lineGap,
  });
  const clipPathId = `canvas2d-preview-clip-${[
    Math.round(layout.width),
    Math.round(layout.height),
    showHeader ? 1 : 0,
    layout.lineCount,
    align,
    drawFrame ? 1 : 0,
    layout.widths.map((value) => value.toFixed(3)).join("-"),
  ].join("-")}`;
  const linesSvg = lineLayout.lines
    .map((line) => (
      `<rect x="${line.x}" y="${line.y}" width="${line.width}" height="${line.height}" rx="${line.radius}" fill="rgba(100, 116, 139, 0.12)"></rect>`
    ))
    .join("");
  const headerSvg = showHeader
    ? `<rect x="${shell.panelX}" y="${shell.panelY}" width="${shell.panelWidth}" height="${headerHeight}" fill="rgba(226, 232, 240, 0.84)"></rect>`
    : "";
  return `<div class="canvas2d-rich-skeleton-svg-wrap" aria-hidden="true">
    <svg class="canvas2d-rich-skeleton-svg" viewBox="0 0 ${layout.width} ${layout.height}" preserveAspectRatio="none" focusable="false">
      <defs>
        <clipPath id="${clipPathId}">
          <rect x="${shell.panelX}" y="${shell.panelY}" width="${shell.panelWidth}" height="${shell.panelHeight}" rx="${shell.panelRadius}"></rect>
        </clipPath>
      </defs>
      ${drawFrame ? `<rect x="${shell.x}" y="${shell.y}" width="${shell.width}" height="${shell.height}" rx="${shell.radius}" fill="rgba(248, 250, 252, 0.92)" stroke="rgba(148, 163, 184, 0.38)" stroke-width="1" vector-effect="non-scaling-stroke"></rect>` : ""}
      <g clip-path="url(#${clipPathId})">
        ${headerSvg}
        ${linesSvg}
      </g>
    </svg>
  </div>`;
}
