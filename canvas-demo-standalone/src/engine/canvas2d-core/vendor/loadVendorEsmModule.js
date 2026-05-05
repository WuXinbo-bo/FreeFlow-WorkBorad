import { resolveVendorAssetUrl } from "./resolveVendorAssetUrl.js";

const VENDOR_MODULE_URLS = Object.freeze({
  mermaid: resolveVendorAssetUrl("assets/vendor/mermaid/mermaid.esm.min.mjs"),
  "pdf-lib": resolveVendorAssetUrl("assets/vendor/pdf-lib.esm.min.js"),
  "docx-preview": resolveVendorAssetUrl("assets/vendor/docx-preview/docx-preview.mjs"),
  "pdfjs-dist": resolveVendorAssetUrl("assets/vendor/pdfjs-dist/pdf.mjs"),
});

const vendorModulePromiseCache = new Map();

export function resolveVendorModuleUrl(key = "") {
  const normalized = String(key || "").trim();
  return VENDOR_MODULE_URLS[normalized] || "";
}

export async function loadVendorEsmModule(key = "") {
  const normalized = String(key || "").trim();
  const moduleUrl = resolveVendorModuleUrl(normalized);
  if (!moduleUrl) {
    throw new Error(`Unknown vendor module: ${normalized || "(empty)"}`);
  }
  if (!vendorModulePromiseCache.has(moduleUrl)) {
    vendorModulePromiseCache.set(
      moduleUrl,
      import(moduleUrl).catch((error) => {
        vendorModulePromiseCache.delete(moduleUrl);
        throw new Error(`Failed to load vendor module "${normalized}" from ${moduleUrl}: ${error?.message || error}`);
      })
    );
  }
  return vendorModulePromiseCache.get(moduleUrl);
}
