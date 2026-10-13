import { createByteBudgetLru } from "./byteBudgetLru.js";

// Browsing resources are separate from the original-image cache used by export/editing.
// Keep only two full-resolution decodes alive, then release them after downsampling.
export function createImagePreviewCache({ maxBytes = 64 * 1024 * 1024, concurrency = 2 } = {}) {
  const decodeLimit = Math.max(1, Math.floor(Number(concurrency) || 2));
  const queue = new Map();
  const active = new Set();
  let timer = 0;
  let generation = 0;
  let decodedCount = 0;
  const cache = createByteBudgetLru({
    maxBytes,
    maxEntries: 256,
    estimateSize: (entry) => entry.byteSize,
    onEvict: (entry, key) => {
      queue.delete(key);
      entry.disposed = true;
      releaseImage(entry.image);
      entry.listeners.clear();
      entry.cancel?.();
    },
  });

  function releaseImage(image) {
    if (!image) return;
    if (typeof image.close === "function") image.close();
    else { image.width = 0; image.height = 0; }
  }

  function schedule() {
    if (timer || !queue.size || active.size >= decodeLimit) return;
    timer = setTimeout(() => {
      timer = 0;
      while (queue.size && active.size < decodeLimit) {
        const [key, entry] = queue.entries().next().value;
        queue.delete(key);
        void decode(key, entry);
      }
    }, 0);
  }

  async function decode(key, entry) {
    const epoch = generation;
    active.add(entry);
    entry.status = "loading";
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    let bitmap = null;
    try {
      await new Promise((resolve, reject) => {
        entry.cancel = () => reject(new Error("canceled"));
        image.onload = resolve;
        image.onerror = () => reject(new Error("image-load"));
        image.src = entry.source;
      });
      if (entry.disposed || epoch !== generation) return;
      // onload alone can still leave a synchronous decode inside createImageBitmap.
      if (typeof image.decode === "function") await image.decode();
      if (entry.disposed || epoch !== generation) return;
      entry.naturalWidth = image.naturalWidth;
      entry.naturalHeight = image.naturalHeight;
      const ratio = Math.min(1, entry.edge / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * ratio));
      const height = Math.max(1, Math.round(image.naturalHeight * ratio));
      if (typeof createImageBitmap === "function") {
        try {
          bitmap = await createImageBitmap(image, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
        } catch { /* Fall back for formats unsupported by createImageBitmap. */ }
      }
      if (entry.disposed || epoch !== generation) { releaseImage(bitmap); return; }
      if (!bitmap) {
        const surface = document.createElement("canvas");
        surface.width = width;
        surface.height = height;
        surface.getContext("2d").drawImage(image, 0, 0, width, height);
        bitmap = surface;
      }
      if (entry.disposed || epoch !== generation) { releaseImage(bitmap); return; }
      entry.image = bitmap;
      entry.ready = true;
      entry.status = "ready";
      entry.byteSize = width * height * 4;
      decodedCount += 1;
      if (cache.set(key, entry)) {
        for (const [oldKey, oldEntry] of cache.entries()) {
          if (oldKey !== key && oldEntry.source === entry.source && oldEntry.edge < entry.edge) {
            oldEntry.listeners.forEach((listener, id) => entry.listeners.set(id, listener));
            cache.delete(oldKey);
          }
        }
        entry.listeners.forEach((listener, id) => listener?.(id, "ready", epoch));
        entry.listeners.clear();
      }
    } catch {
      if (!entry.disposed && epoch === generation) {
        entry.status = "error";
        entry.listeners.forEach((listener, id) => listener?.(id, "error", epoch));
        entry.listeners.clear();
      }
    } finally {
      entry.cancel = null;
      image.onload = null;
      image.onerror = null;
      image.src = "";
      active.delete(entry);
      schedule();
    }
  }

  function request(source, item, helpers = {}) {
    if (!source) return null;
    const cropScale = Math.max(0.01, Math.min(Number(item.crop?.w ?? 1), Number(item.crop?.h ?? 1)));
    const requested = Math.max(256, Number(item.width) || 256, Number(item.height) || 256) / cropScale;
    const edge = Math.min(2048, Math.ceil(requested / 128) * 128);
    for (const [candidateKey, candidate] of cache.entries()) {
      if (candidate.source === source && candidate.ready && candidate.edge >= edge) {
        return cache.get(candidateKey);
      }
    }
    const key = `${edge}:${source}`;
    let entry = cache.get(key);
    if (!entry) {
      entry = { source, edge, image: null, ready: false, status: "queued", byteSize: 0, disposed: false, listeners: new Map() };
      if (!cache.set(key, entry)) return null;
      queue.set(key, entry);
      schedule();
    }
    if (!entry.ready && entry.status !== "error" && helpers.onImageResourceStateChange) {
      entry.listeners.set(String(item.id), helpers.onImageResourceStateChange);
    }
    if (entry.ready || entry.status === "error") return entry;
    // A size upgrade keeps the previous valid pixels until the replacement is ready.
    for (const [, candidate] of cache.entries()) {
      if (candidate.source === source && candidate.ready) return candidate;
    }
    return entry;
  }

  function clear() {
    generation += 1;
    clearTimeout(timer);
    timer = 0;
    queue.clear();
    cache.clear();
  }

  return {
    request,
    clear,
    retainSources(sources) {
      for (const [key, entry] of cache.entries()) if (!sources.has(entry.source)) cache.delete(key);
    },
    trimToBytes: (bytes) => cache.trimToBytes(bytes),
    getStats: () => ({ ...cache.getStats(), queued: queue.size, decoding: active.size, decodedCount }),
  };
}
