const VENDOR_MODULE_URLS = Object.freeze({
  mermaid: new URL("../../../../assets/vendor/mermaid/mermaid.esm.min.mjs", import.meta.url).toString(),
  "pdf-lib": new URL("../../../../assets/vendor/pdf-lib.esm.min.js", import.meta.url).toString(),
  "docx-preview": new URL("../../../../assets/vendor/docx-preview/docx-preview.mjs", import.meta.url).toString(),
  "pdfjs-dist": new URL("../../../../assets/vendor/pdfjs-dist/pdf.mjs", import.meta.url).toString(),
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
