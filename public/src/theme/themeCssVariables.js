import { hexToRgb, mixRgb, rgbToCss } from "../utils/color.js";
import { normalizeThemeSettings } from "./themeSettings.js";

function mixToBlack(rgb, ratio) {
  return mixRgb(rgb, { r: 0, g: 0, b: 0 }, ratio);
}

function mixToWhite(rgb, ratio) {
  return mixRgb(rgb, { r: 255, g: 255, b: 255 }, ratio);
}

export function buildThemeCssVariables(payload = {}) {
  const theme = normalizeThemeSettings(payload);
  const baseColor = hexToRgb(theme.backgroundColor);
  const textColor = hexToRgb(theme.textColor);
  const patternColor = hexToRgb(theme.patternColor);
  const buttonBase = hexToRgb(theme.buttonColor);
  const buttonText = hexToRgb(theme.buttonTextColor);
  const shellPanelColor = hexToRgb(theme.shellPanelColor);
  const shellPanelTextColor = hexToRgb(theme.shellPanelTextColor);
  const controlColor = hexToRgb(theme.controlColor);
  const controlActiveColor = hexToRgb(theme.controlActiveColor);
  const floatingPanelColor = hexToRgb(theme.floatingPanelColor);
  const inputColor = hexToRgb(theme.inputColor);
  const inputTextColor = hexToRgb(theme.inputTextColor);
  const messageColor = hexToRgb(theme.messageColor);
  const userMessageColor = hexToRgb(theme.userMessageColor);
  const dialogColor = hexToRgb(theme.dialogColor);

  const deepColor = mixRgb(baseColor, { r: 3, g: 6, b: 14 }, 0.64);
  const edgeColor = mixToWhite(baseColor, 0.08);
  const ambientA = mixRgb(baseColor, { r: 110, g: 167, b: 255 }, 0.46);
  const ambientB = mixRgb(baseColor, { r: 159, g: 167, b: 255 }, 0.5);
  const ambientC = mixRgb(baseColor, { r: 179, g: 169, b: 255 }, 0.4);
  const shellSurface = shellPanelColor;
  const shellSurfaceStrong = mixToWhite(shellPanelColor, 0.08);
  const shellSurfaceDeep = mixToBlack(shellPanelColor, 0.14);
  const shellSurfaceDeeper = mixToBlack(shellPanelColor, 0.22);
  const shellOverlay = mixRgb(shellPanelColor, floatingPanelColor, 0.38);
  const shellUnderlay = mixToBlack(shellPanelColor, 0.34);
  const buttonStart = mixToWhite(buttonBase, 0.14);
  const buttonEnd = mixRgb(buttonBase, { r: 9, g: 18, b: 34 }, 0.08);
  const buttonGhost = mixToWhite(buttonBase, 0.08);
  const buttonShadow = mixRgb(buttonBase, { r: 10, g: 16, b: 28 }, 0.36);

  const controlSurface = controlColor;
  const controlSurfaceStrong = mixToWhite(controlColor, 0.08);
  const controlSurfaceActive = controlActiveColor;
  const floatingSurface = floatingPanelColor;
  const floatingSurfaceStrong = mixToWhite(floatingPanelColor, 0.08);
  const messageSurface = messageColor;
  const userMessageSurface = userMessageColor;
  const thinkingSurface = mixRgb(messageColor, floatingPanelColor, 0.34);
  const codeSurface = mixRgb(inputColor, floatingPanelColor, 0.26);
  const badgeSurface = mixRgb(controlColor, buttonBase, 0.24);
  const badgeText = mixRgb(shellPanelTextColor, buttonText, 0.14);
  const indicator = mixToWhite(buttonBase, 0.24);
  const inlineCodeSurface = mixToWhite(inputColor, 0.06);
  const inlineCodeBorder = mixToWhite(buttonBase, 0.12);
  const passThroughSurface = dialogColor;
  const passThroughBorder = mixToWhite(dialogColor, 0.18);
  const assistantAvatarStart = mixRgb(shellSurfaceStrong, buttonBase, 0.22);
  const assistantAvatarEnd = mixRgb(shellSurfaceDeeper, buttonBase, 0.08);

  return {
    "--app-bg-start-rgb": rgbToCss(edgeColor),
    "--app-bg-end-rgb": rgbToCss(deepColor),
    "--app-bg-ambient-a-rgb": rgbToCss(ambientA),
    "--app-bg-ambient-b-rgb": rgbToCss(ambientB),
    "--app-bg-ambient-c-rgb": rgbToCss(ambientC),
    "--app-bg-opacity": theme.backgroundOpacity.toFixed(2),
    "--app-shell-surface-rgb": rgbToCss(shellSurface),
    "--app-shell-surface-strong-rgb": rgbToCss(shellSurfaceStrong),
    "--app-shell-surface-deep-rgb": rgbToCss(shellSurfaceDeep),
    "--app-shell-surface-deeper-rgb": rgbToCss(shellSurfaceDeeper),
    "--app-shell-overlay-rgb": rgbToCss(shellOverlay),
    "--app-shell-underlay-rgb": rgbToCss(shellUnderlay),
    "--app-text-rgb": rgbToCss(shellPanelTextColor),
    "--app-pattern-rgb": rgbToCss(patternColor),
    "--app-accent-rgb": rgbToCss(buttonBase),
    "--app-button-rgb": rgbToCss(buttonStart),
    "--app-button-strong-rgb": rgbToCss(buttonEnd),
    "--app-button-ghost-rgb": rgbToCss(buttonGhost),
    "--app-button-shadow-rgb": rgbToCss(buttonShadow),
    "--app-button-text-rgb": rgbToCss(buttonText),
    "--surface-alpha": theme.panelOpacity.toFixed(2),
    "--canvas-viewport-alpha": theme.canvasOpacity.toFixed(2),
    "--surface-elevated-alpha": Math.min(theme.panelOpacity + 0.04, 0.98).toFixed(2),
    "--surface-card-alpha": Math.max(theme.panelOpacity - 0.02, 0.5).toFixed(2),
    "--surface-desktop-alpha": Math.max(theme.panelOpacity - 0.44, 0.14).toFixed(2),
    "--accent": theme.buttonColor,
    "--accent-strong": `rgb(${rgbToCss(buttonEnd)} / 1)`,
    "--ui-primary": `rgb(${rgbToCss(buttonStart)} / 1)`,
    "--ui-primary-strong": `rgb(${rgbToCss(buttonEnd)} / 1)`,
    "--overlay-primary": `rgb(${rgbToCss(buttonBase)} / 1)`,
    "--ui-shadow-glow": `0 0 28px rgb(${rgbToCss(buttonBase)} / 0.16)`,
    "--ui-text": `rgb(${rgbToCss(shellPanelTextColor)} / 1)`,
    "--ui-text-soft": `rgb(${rgbToCss(shellPanelTextColor)} / 0.78)`,
    "--ui-text-muted": `rgb(${rgbToCss(shellPanelTextColor)} / 0.62)`,
    "--theme-global-text-rgb": rgbToCss(textColor),
    "--theme-panel-surface-rgb": rgbToCss(shellPanelColor),
    "--theme-panel-text-rgb": rgbToCss(shellPanelTextColor),
    "--theme-control-surface-rgb": rgbToCss(controlSurface),
    "--theme-control-surface-strong-rgb": rgbToCss(controlSurfaceStrong),
    "--theme-control-active-rgb": rgbToCss(controlSurfaceActive),
    "--theme-floating-surface-rgb": rgbToCss(floatingSurface),
    "--theme-floating-surface-strong-rgb": rgbToCss(floatingSurfaceStrong),
    "--theme-input-surface-rgb": rgbToCss(inputColor),
    "--theme-input-text-rgb": rgbToCss(inputTextColor),
    "--theme-message-surface-rgb": rgbToCss(messageSurface),
    "--theme-message-user-surface-rgb": rgbToCss(userMessageSurface),
    "--theme-thinking-surface-rgb": rgbToCss(thinkingSurface),
    "--theme-code-surface-rgb": rgbToCss(codeSurface),
    "--theme-badge-surface-rgb": rgbToCss(badgeSurface),
    "--theme-badge-text-rgb": rgbToCss(badgeText),
    "--theme-indicator-rgb": rgbToCss(indicator),
    "--theme-inline-code-surface-rgb": rgbToCss(inlineCodeSurface),
    "--theme-inline-code-border-rgb": rgbToCss(inlineCodeBorder),
    "--theme-pass-through-surface-rgb": rgbToCss(passThroughSurface),
    "--theme-pass-through-border-rgb": rgbToCss(passThroughBorder),
    "--theme-pass-through-shadow-rgb": rgbToCss(mixToBlack(passThroughSurface, 0.46)),
    "--theme-assistant-avatar-start-rgb": rgbToCss(assistantAvatarStart),
    "--theme-assistant-avatar-end-rgb": rgbToCss(assistantAvatarEnd),
  };
}

export function applyThemeCssVariables(root, payload = {}) {
  const target = root || document.documentElement;
  const variables = buildThemeCssVariables(payload);

  for (const [name, value] of Object.entries(variables)) {
    target.style.setProperty(name, value);
  }

  return variables;
}
