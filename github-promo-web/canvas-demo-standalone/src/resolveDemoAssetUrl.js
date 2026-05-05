const DEMO_ASSET_BASE_KEY = "__FREEFLOW_DEMO_ASSET_BASE__";

function normalizeBaseUrl(base = "") {
  const rawBase = String(base || "").trim();
  if (!rawBase) {
    return "/";
  }
  return rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
}

function readGlobalDemoAssetBase() {
  if (typeof globalThis === "undefined") {
    return "";
  }
  return String(globalThis[DEMO_ASSET_BASE_KEY] || "").trim();
}

export function getDemoAssetBase() {
  const globalBase = readGlobalDemoAssetBase();
  const envBase = typeof import.meta !== "undefined" ? String(import.meta.env?.BASE_URL || "").trim() : "";
  return normalizeBaseUrl(globalBase || envBase || "/");
}

export function setDemoAssetBase(base = "") {
  const normalizedBase = normalizeBaseUrl(base);
  if (typeof globalThis !== "undefined") {
    globalThis[DEMO_ASSET_BASE_KEY] = normalizedBase;
  }
  return normalizedBase;
}

export function resolveDemoAssetUrl(pathname = "") {
  const cleanPath = String(pathname || "").trim().replace(/^\/+/, "");
  const baseUrl = getDemoAssetBase();
  if (typeof location !== "undefined" && location.href) {
    const resolvedBase = new URL(baseUrl, location.href);
    return cleanPath ? new URL(cleanPath, resolvedBase).toString() : resolvedBase.toString();
  }
  return cleanPath ? `${baseUrl}${cleanPath}` : baseUrl;
}
