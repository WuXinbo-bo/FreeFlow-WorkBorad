const PREFIX = "freeflow.canvas.chrome.";

export function readChromePreference(name, fallback) {
  try {
    const value = localStorage.getItem(PREFIX + name);
    return value === "true" ? true : value === "false" ? false : fallback;
  } catch {
    return fallback;
  }
}

export function writeChromePreference(name, value) {
  try {
    localStorage.setItem(PREFIX + name, String(Boolean(value)));
  } catch {
    // Keep the current session usable when local storage is unavailable.
  }
}
