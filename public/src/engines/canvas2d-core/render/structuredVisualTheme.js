export const STRUCTURED_CODE_VISUAL_THEME = Object.freeze({
  radius: 8,
  surface: "#fbfcfe",
  headerSurface: "rgba(248, 250, 252, 0.9)",
  border: "rgba(148, 163, 184, 0.42)",
  divider: "rgba(203, 213, 225, 0.7)",
  text: "#172033",
  mutedText: "#64748b",
  gutterText: "#94a3b8",
  controlSurface: "rgba(255, 255, 255, 0.88)",
  shadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
});

export const STRUCTURED_TABLE_VISUAL_THEME = Object.freeze({
  radius: 8,
  surface: "rgba(255, 255, 255, 0.99)",
  headerSurface: "rgba(241, 245, 249, 0.94)",
  alternateSurface: "rgba(248, 250, 252, 0.68)",
  border: "rgba(148, 163, 184, 0.42)",
  divider: "rgba(148, 163, 184, 0.24)",
  text: "#172033",
  bodyWeight: 400,
  headerWeight: 650,
  shadow: "0 6px 18px rgba(15, 23, 42, 0.07)",
});

const STRUCTURED_VISUAL_CSS_VARIABLES = Object.freeze({
  "--canvas-code-radius": `${STRUCTURED_CODE_VISUAL_THEME.radius}px`,
  "--canvas-code-surface": STRUCTURED_CODE_VISUAL_THEME.surface,
  "--canvas-code-header-surface": STRUCTURED_CODE_VISUAL_THEME.headerSurface,
  "--canvas-code-border": STRUCTURED_CODE_VISUAL_THEME.border,
  "--canvas-code-divider": STRUCTURED_CODE_VISUAL_THEME.divider,
  "--canvas-code-text": STRUCTURED_CODE_VISUAL_THEME.text,
  "--canvas-code-muted-text": STRUCTURED_CODE_VISUAL_THEME.mutedText,
  "--canvas-code-gutter-text": STRUCTURED_CODE_VISUAL_THEME.gutterText,
  "--canvas-code-control-surface": STRUCTURED_CODE_VISUAL_THEME.controlSurface,
  "--canvas-code-shadow": STRUCTURED_CODE_VISUAL_THEME.shadow,
  "--canvas-table-radius": `${STRUCTURED_TABLE_VISUAL_THEME.radius}px`,
  "--canvas-table-surface": STRUCTURED_TABLE_VISUAL_THEME.surface,
  "--canvas-table-header-surface": STRUCTURED_TABLE_VISUAL_THEME.headerSurface,
  "--canvas-table-alternate-surface": STRUCTURED_TABLE_VISUAL_THEME.alternateSurface,
  "--canvas-table-border": STRUCTURED_TABLE_VISUAL_THEME.border,
  "--canvas-table-divider": STRUCTURED_TABLE_VISUAL_THEME.divider,
  "--canvas-table-text": STRUCTURED_TABLE_VISUAL_THEME.text,
  "--canvas-table-body-weight": String(STRUCTURED_TABLE_VISUAL_THEME.bodyWeight),
  "--canvas-table-header-weight": String(STRUCTURED_TABLE_VISUAL_THEME.headerWeight),
  "--canvas-table-shadow": STRUCTURED_TABLE_VISUAL_THEME.shadow,
});

export function applyStructuredVisualThemeVariables(target) {
  if (!target?.style?.setProperty) {
    return false;
  }
  Object.entries(STRUCTURED_VISUAL_CSS_VARIABLES).forEach(([name, value]) => {
    target.style.setProperty(name, value);
  });
  return true;
}

export function getStructuredVisualCssVariables() {
  return { ...STRUCTURED_VISUAL_CSS_VARIABLES };
}
