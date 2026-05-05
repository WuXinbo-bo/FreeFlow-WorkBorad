import { resolveImageSource } from "../../utils.js";

function mapWithConcurrency(items = [], iteratee, concurrency = 4) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Number(concurrency) || 1);
  let cursor = 0;
  const results = new Array(list.length);
  return Promise.all(
    Array.from({ length: Math.min(limit, list.length || 1) }, async () => {
      while (cursor < list.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await iteratee(list[index], index);
      }
    })
  ).then(() => results);
}

function preloadImageSource(source, timeoutMs = 2000) {
  return new Promise((resolve) => {
    if (!source) {
      resolve(false);
      return;
    }
    let done = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    const finish = (ok) => {
      if (done) {
        return;
      }
      done = true;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    image.onload = () => {
      clearTimeout(timer);
      finish(true);
    };
    image.onerror = () => {
      clearTimeout(timer);
      finish(false);
    };
    image.src = source;
  });
}

function isDataUrlSource(source = "") {
  return /^data:/i.test(String(source || "").trim());
}

function buildExportImageFallbackItem(item, reason = "missing") {
  return {
    ...item,
    dataUrl: "",
    sourcePath: "",
    source: "missing",
    exportFallbackPlaceholder: true,
    exportFallbackReason: String(reason || "missing").trim() || "missing",
  };
}

async function blobToDataUrl(blob) {
  if (!blob) {
    return "";
  }
  if (typeof FileReader === "function") {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  }
  if (typeof Buffer === "function") {
    const bytes = Buffer.from(await blob.arrayBuffer());
    const mime = String(blob.type || "application/octet-stream").trim() || "application/octet-stream";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  }
  return "";
}

async function readFilePathAsDataUrl(sourcePath, readCache, readFileBase64) {
  if (!sourcePath || typeof readFileBase64 !== "function") {
    return "";
  }
  try {
    if (!readCache.has(sourcePath)) {
      readCache.set(sourcePath, Promise.resolve(readFileBase64(sourcePath)).catch(() => null));
    }
    const result = await readCache.get(sourcePath);
    if (!result?.ok || !result?.data) {
      return "";
    }
    const mime = String(result.mime || "image/png");
    return `data:${mime};base64,${result.data}`;
  } catch {
    return "";
  }
}

async function fetchSourceAsDataUrl(source = "") {
  const target = String(source || "").trim();
  if (!target || typeof fetch !== "function") {
    return "";
  }
  try {
    const response = await fetch(target);
    if (!response.ok) {
      return "";
    }
    const blob = await response.blob();
    return blobToDataUrl(blob);
  } catch {
    return "";
  }
}

export function createHostExportAssetAdapter({
  allowLocalFileAccess = true,
  readFileBase64 = null,
} = {}) {
  const resolveAllowLocalFileAccess =
    typeof allowLocalFileAccess === "function" ? allowLocalFileAccess : () => Boolean(allowLocalFileAccess);

  async function hydrateImageItems(items = []) {
    const list = Array.isArray(items) ? items : [];
    const readCache = new Map();
    return mapWithConcurrency(
      list,
      async (item) => {
        if (!item || item.type !== "image") {
          return item;
        }
        const currentDataUrl = String(item.dataUrl || "").trim();
        const sourcePath = String(item.sourcePath || "").trim();
        if (isDataUrlSource(currentDataUrl)) {
          return item;
        }
        const resolvedSource = resolveImageSource(currentDataUrl, sourcePath, {
          allowLocalFileAccess: Boolean(resolveAllowLocalFileAccess()),
        });
        const nextDataUrl =
          (await readFilePathAsDataUrl(sourcePath, readCache, readFileBase64)) ||
          (await fetchSourceAsDataUrl(resolvedSource));
        if (!isDataUrlSource(nextDataUrl)) {
          return buildExportImageFallbackItem(item, resolvedSource ? "unresolved-source" : "missing-source");
        }
        return {
          ...item,
          dataUrl: nextDataUrl,
          source: "blob",
        };
      },
      4
    );
  }

  async function preloadImagesForItems(items = []) {
    const list = Array.isArray(items) ? items : [];
    const sourceStatusCache = new Map();
    const results = await mapWithConcurrency(
      list,
      async (item) => {
        if (!item || item.type !== "image") {
          return { item, loaded: true, source: "", fallbackApplied: false };
        }
        if (item.exportFallbackPlaceholder) {
          return { item, loaded: false, source: "", fallbackApplied: true };
        }
        const source = resolveImageSource(item.dataUrl, item.sourcePath, {
          allowLocalFileAccess: Boolean(resolveAllowLocalFileAccess()),
        });
        if (!source) {
          return {
            item: buildExportImageFallbackItem(item, "missing-source"),
            loaded: false,
            source: "",
            fallbackApplied: true,
          };
        }
        if (!sourceStatusCache.has(source)) {
          sourceStatusCache.set(source, preloadImageSource(source));
        }
        const loaded = await sourceStatusCache.get(source);
        if (loaded) {
          return { item, loaded: true, source, fallbackApplied: false };
        }
        return {
          item: buildExportImageFallbackItem(item, "preload-failed"),
          loaded: false,
          source,
          fallbackApplied: true,
        };
      },
      4
    );
    return {
      ok: true,
      items: results.map((entry) => entry?.item || null),
      failedCount: results.filter((entry) => entry && entry.loaded === false).length,
      fallbackCount: results.filter((entry) => entry && entry.fallbackApplied).length,
    };
  }

  return {
    hydrateImageItems,
    preloadImagesForItems,
  };
}
