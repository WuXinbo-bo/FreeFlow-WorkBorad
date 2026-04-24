import {
  TEXT_BOLD_WEIGHT,
  TEXT_FONT_FAMILY,
  TEXT_FONT_WEIGHT,
  TEXT_LINE_HEIGHT_RATIO,
} from "../rendererText.js";
import { normalizeTextContentModel } from "../textModel/textContentModel.js";
import { normalizeTextBoxLayoutModel } from "../textModel/textBoxLayoutModel.js";

const DEFAULT_FONT_SIZE = 20;

function normalizeFontSize(value, fallback = DEFAULT_FONT_SIZE) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return Math.max(12, Number(fallback) || DEFAULT_FONT_SIZE);
  }
  return Math.max(12, numericValue);
}

export function normalizeTextMeasurementInput(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const fallbackObject = fallback && typeof fallback === "object" ? fallback : {};
  const content = normalizeTextContentModel(source.content || source, fallbackObject.content || fallbackObject);
  const layout = normalizeTextBoxLayoutModel(source.layout || source, fallbackObject.layout || fallbackObject);
  const fontSize = normalizeFontSize(source.fontSize, fallbackObject.fontSize ?? DEFAULT_FONT_SIZE);
  return {
    content,
    layout,
    typography: {
      fontSize,
      lineHeightRatio: Math.max(
        1,
        Number(source.lineHeightRatio ?? fallbackObject.lineHeightRatio ?? TEXT_LINE_HEIGHT_RATIO) || TEXT_LINE_HEIGHT_RATIO
      ),
      fontWeight: String(source.fontWeight || fallbackObject.fontWeight || TEXT_FONT_WEIGHT),
      boldWeight: String(source.boldWeight || fallbackObject.boldWeight || TEXT_BOLD_WEIGHT),
      fontFamily: String(source.fontFamily || fallbackObject.fontFamily || TEXT_FONT_FAMILY),
    },
    environment: {
      editorElement: source.editorElement || fallbackObject.editorElement || null,
      scale: Math.max(0.1, Number(source.scale ?? fallbackObject.scale ?? 1) || 1),
      wrapMode: String(source.wrapMode || fallbackObject.wrapMode || ""),
    },
  };
}

export function createTextMeasurementResultModel(inputModel, measurement = {}, meta = {}) {
  const input = inputModel && typeof inputModel === "object" ? inputModel : normalizeTextMeasurementInput();
  const contentWidth = Math.max(1, Math.ceil(Number(measurement.contentWidth || measurement.frameWidth || 0) || 1));
  const contentHeight = Math.max(1, Math.ceil(Number(measurement.contentHeight || measurement.frameHeight || 0) || 1));
  const frameWidth = input.layout.autoWidth
    ? Math.max(input.layout.minWidth, Math.ceil(Number(measurement.frameWidth || contentWidth) || contentWidth))
    : Math.max(input.layout.minWidth, input.layout.widthHint);
  const frameHeight = input.layout.fixedSize
    ? Math.max(input.layout.minHeight, input.layout.heightHint)
    : Math.max(input.layout.minHeight, Math.ceil(Number(measurement.frameHeight || contentHeight) || contentHeight));
  return {
    content: input.content,
    layout: input.layout,
    typography: input.typography,
    contentSize: {
      width: contentWidth,
      height: contentHeight,
    },
    frame: {
      width: frameWidth,
      height: frameHeight,
    },
    contentWidth,
    contentHeight,
    frameWidth,
    frameHeight,
    resizeMode: input.layout.legacyResizeMode,
    layoutMode: input.layout.layoutMode,
    measuredWith: String(meta.measuredWith || "fallback"),
    reason: String(meta.reason || ""),
  };
}
