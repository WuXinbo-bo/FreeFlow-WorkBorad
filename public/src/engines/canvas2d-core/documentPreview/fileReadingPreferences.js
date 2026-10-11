const KEY = "freeflow-file-reading-v1";
export function readFileReadingPreference(sourcePath) {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]").find((entry) => entry.path === sourcePath) || {}; } catch { return {}; }
}
export function saveFileReadingPreference(sourcePath, patch) {
  if (!sourcePath) return;
  try {
    const entries = JSON.parse(localStorage.getItem(KEY) || "[]").filter((entry) => entry.path !== sourcePath);
    const current = readFileReadingPreference(sourcePath);
    entries.unshift({ path: String(sourcePath).slice(0, 4096), zoom: Math.min(1.9, Math.max(.34, Number(patch.zoom ?? current.zoom) || .82)), scrollOffset: Math.max(0, Number(patch.scrollOffset ?? current.scrollOffset) || 0) });
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 64)));
  } catch { /* Reading remains available if storage is unavailable. */ }
}
