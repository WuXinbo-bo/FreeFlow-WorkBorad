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
        if (!item || item.type !== "image" || item.dataUrl) {
          return item;
        }
        const sourcePath = String(item.sourcePath || "").trim();
        if (!sourcePath || typeof readFileBase64 !== "function") {
          return item;
        }
        try {
          if (!readCache.has(sourcePath)) {
            readCache.set(sourcePath, Promise.resolve(readFileBase64(sourcePath)).catch(() => null));
          }
          const result = await readCache.get(sourcePath);
          if (!result?.ok || !result?.data) {
            return item;
          }
          const mime = String(result.mime || "image/png");
          return {
            ...item,
            dataUrl: `data:${mime};base64,${result.data}`,
            source: "blob",
          };
        } catch {
          return item;
        }
      },
      4
    );
  }

  async function preloadImagesForItems(items = []) {
    const sources = new Set();
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (item?.type !== "image") {
        return;
      }
      const source = resolveImageSource(item.dataUrl, item.sourcePath, {
        allowLocalFileAccess: Boolean(resolveAllowLocalFileAccess()),
      });
      if (source) {
        sources.add(source);
      }
    });
    if (!sources.size) {
      return true;
    }
    await Promise.all(Array.from(sources, (source) => preloadImageSource(source)));
    return true;
  }

  return {
    hydrateImageItems,
    preloadImagesForItems,
  };
}
