export function resolveVendorAssetUrl(pathname = "") {
  const cleanPath = String(pathname || "").trim().replace(/^\/+/, "");
  const baseUrl = String(import.meta.env?.BASE_URL || "/").trim() || "/";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(`${normalizedBase}${cleanPath}`, window.location.origin).toString();
  }
  return `${normalizedBase}${cleanPath}`;
}
