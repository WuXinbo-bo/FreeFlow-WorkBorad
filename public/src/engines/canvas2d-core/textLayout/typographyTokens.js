export const TEXT_BODY_LINE_HEIGHT_RATIO = 1.5;

export const TEXT_HEADING_FONT_SIZES = Object.freeze({
  h1: 36,
  h2: 30,
  h3: 26,
  h4: 22,
  h5: 20,
  h6: 18,
});

export const TEXT_HEADING_LINE_HEIGHT_RATIOS = Object.freeze({
  "h1": 1.25,
  "h2": 1.28,
  "h3": 1.3,
  "h4": 1.32,
  "h5": 1.35,
  "h6": 1.35,
});

export const TEXT_BLOCK_SPACING_EM = Object.freeze({
  paragraph: 0.6,
  listItem: 0.2,
  listBlock: 0.5,
  block: 0.6,
});

export function normalizeTagName(tagName = "") {
  return String(tagName || "").trim().toLowerCase();
}

export function getHeadingLineHeightRatio(tagName = "") {
  const key = normalizeTagName(tagName);
  return Number(TEXT_HEADING_LINE_HEIGHT_RATIOS[key] || 0) || TEXT_BODY_LINE_HEIGHT_RATIO;
}

export function getHeadingFontSize(tagName = "", fallback = 20) {
  const key = normalizeTagName(tagName);
  return Number(TEXT_HEADING_FONT_SIZES[key] || 0) || Number(fallback) || 20;
}

export function getHeadingFontSizeByLevel(level = 1, fallback = 20) {
  const safeLevel = Math.max(1, Math.min(6, Number(level) || 1));
  return getHeadingFontSize(`h${safeLevel}`, fallback);
}

export function getLineHeightRatioForTag(tagName = "") {
  const key = normalizeTagName(tagName);
  if (key in TEXT_HEADING_LINE_HEIGHT_RATIOS) {
    return getHeadingLineHeightRatio(key);
  }
  return TEXT_BODY_LINE_HEIGHT_RATIO;
}

export function getBlockSpacingEmForTag(tagName = "") {
  const key = normalizeTagName(tagName);
  if (key === "li") {
    return TEXT_BLOCK_SPACING_EM.listItem;
  }
  if (key === "ul" || key === "ol") {
    return TEXT_BLOCK_SPACING_EM.listBlock;
  }
  if (key === "blockquote" || key === "pre" || key === "table") {
    return TEXT_BLOCK_SPACING_EM.block;
  }
  if (
    key === "p" ||
    key === "div" ||
    key === "section" ||
    key === "article" ||
    key === "h1" ||
    key === "h2" ||
    key === "h3" ||
    key === "h4" ||
    key === "h5" ||
    key === "h6"
  ) {
    return TEXT_BLOCK_SPACING_EM.paragraph;
  }
  return 0;
}
