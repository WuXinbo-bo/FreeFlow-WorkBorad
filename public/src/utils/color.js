export function normalizeThemeHexColor(value, fallback) {
  const raw = typeof value === "string" && /^#?[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
  return raw.startsWith("#") ? raw.toLowerCase() : `#${raw.toLowerCase()}`;
}

export function clampColorChannel(value) {
  return Math.min(255, Math.max(0, Math.round(Number(value) || 0)));
}

export function hexToRgb(hexColor = "#0f1d3a") {
  const normalized = String(hexColor || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return { r: 15, g: 29, b: 58 };
  }

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

export function rgbToCss(rgb) {
  return `${clampColorChannel(rgb.r)} ${clampColorChannel(rgb.g)} ${clampColorChannel(rgb.b)}`;
}

export function mixRgb(base, target, amount = 0.5) {
  const ratio = Math.min(Math.max(Number(amount) || 0, 0), 1);
  return {
    r: clampColorChannel(base.r + (target.r - base.r) * ratio),
    g: clampColorChannel(base.g + (target.g - base.g) * ratio),
    b: clampColorChannel(base.b + (target.b - base.b) * ratio),
  };
}
