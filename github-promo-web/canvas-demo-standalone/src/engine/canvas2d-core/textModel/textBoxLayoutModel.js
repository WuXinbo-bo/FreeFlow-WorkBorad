export const TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH = "auto-width";
export const TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT = "auto-height";
export const TEXT_BOX_LAYOUT_MODE_FIXED_SIZE = "fixed-size";

export const LEGACY_TEXT_RESIZE_MODE_AUTO_WIDTH = "auto-width";
export const LEGACY_TEXT_RESIZE_MODE_WRAP = "wrap";

function firstDefined(...values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function normalizeLayoutModeAlias(value = "") {
  const token = String(value || "").trim().toLowerCase();
  if (!token) {
    return "";
  }
  if (token === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH || token === "auto_width" || token === "autowidth") {
    return TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH;
  }
  if (
    token === TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT ||
    token === "auto_height" ||
    token === "autoheight" ||
    token === LEGACY_TEXT_RESIZE_MODE_WRAP
  ) {
    return TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT;
  }
  if (
    token === TEXT_BOX_LAYOUT_MODE_FIXED_SIZE ||
    token === "fixed_size" ||
    token === "fixedsize" ||
    token === "fixed"
  ) {
    return TEXT_BOX_LAYOUT_MODE_FIXED_SIZE;
  }
  return "";
}

function normalizePositiveNumber(value, fallback, minimum = 1) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return Math.max(minimum, Number(fallback) || minimum);
  }
  return Math.max(minimum, numericValue);
}

export function normalizeLegacyTextResizeMode(value = "", legacyWrapMode = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === LEGACY_TEXT_RESIZE_MODE_WRAP) {
    return LEGACY_TEXT_RESIZE_MODE_WRAP;
  }
  if (normalized === LEGACY_TEXT_RESIZE_MODE_AUTO_WIDTH) {
    return LEGACY_TEXT_RESIZE_MODE_AUTO_WIDTH;
  }
  return String(legacyWrapMode || "").trim().toLowerCase() === LEGACY_TEXT_RESIZE_MODE_WRAP
    ? LEGACY_TEXT_RESIZE_MODE_WRAP
    : LEGACY_TEXT_RESIZE_MODE_AUTO_WIDTH;
}

export function normalizeTextBoxLayoutMode(value = "", legacyResizeMode = "", legacyWrapMode = "") {
  const normalized = normalizeLayoutModeAlias(value);
  if (normalized) {
    return normalized;
  }
  const legacy = normalizeLegacyTextResizeMode(legacyResizeMode, legacyWrapMode);
  return legacy === LEGACY_TEXT_RESIZE_MODE_WRAP
    ? TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT
    : TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH;
}

export function toLegacyTextResizeMode(layoutMode = "", legacyResizeMode = "", legacyWrapMode = "") {
  const normalized = normalizeTextBoxLayoutMode(layoutMode, legacyResizeMode, legacyWrapMode);
  return normalized === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH
    ? LEGACY_TEXT_RESIZE_MODE_AUTO_WIDTH
    : LEGACY_TEXT_RESIZE_MODE_WRAP;
}

export function coerceInteractiveTextBoxLayoutMode(layoutMode = "") {
  return normalizeTextBoxLayoutMode(layoutMode);
}

export function normalizeTextBoxLayoutModel(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const fallbackObject = fallback && typeof fallback === "object" ? fallback : {};
  const layoutMode = normalizeTextBoxLayoutMode(
    firstDefined(source.textBoxLayoutMode, source.layoutMode, fallbackObject.textBoxLayoutMode, fallbackObject.layoutMode),
    firstDefined(source.textResizeMode, source.resizeMode, fallbackObject.textResizeMode, fallbackObject.resizeMode),
    firstDefined(source.wrapMode, fallbackObject.wrapMode)
  );
  const legacyResizeMode = toLegacyTextResizeMode(
    layoutMode,
    firstDefined(source.textResizeMode, source.resizeMode, fallbackObject.textResizeMode, fallbackObject.resizeMode),
    firstDefined(source.wrapMode, fallbackObject.wrapMode)
  );
  const minWidth = normalizePositiveNumber(firstDefined(source.minWidth, fallbackObject.minWidth), 80, 1);
  const minHeight = normalizePositiveNumber(firstDefined(source.minHeight, fallbackObject.minHeight), 40, 1);
  const maxWidth = Math.max(
    minWidth,
    normalizePositiveNumber(firstDefined(source.maxWidth, fallbackObject.maxWidth), 720, minWidth)
  );
  const widthHint = Math.max(
    minWidth,
    normalizePositiveNumber(
      firstDefined(source.widthHint, source.width, fallbackObject.widthHint, fallbackObject.width),
      minWidth,
      minWidth
    )
  );
  const heightHint = Math.max(
    minHeight,
    normalizePositiveNumber(
      firstDefined(source.heightHint, source.height, fallbackObject.heightHint, fallbackObject.height),
      minHeight,
      minHeight
    )
  );
  return {
    layoutMode,
    interactiveLayoutMode: coerceInteractiveTextBoxLayoutMode(layoutMode),
    legacyResizeMode,
    textResizeMode: legacyResizeMode,
    widthHint,
    heightHint,
    minWidth,
    minHeight,
    maxWidth,
    autoWidth: layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH,
    autoHeight: layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
    fixedSize: layoutMode === TEXT_BOX_LAYOUT_MODE_FIXED_SIZE,
    fixedWidth: layoutMode !== TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH,
    contentFit: layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH,
    wraps: layoutMode !== TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH,
  };
}
