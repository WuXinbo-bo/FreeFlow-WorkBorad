const DEFAULT_MAX_CACHE_ENTRIES = 8;
const DEFAULT_MAX_CACHE_BYTES = 96 * 1024 * 1024;

function normalizeId(value = "") {
  return String(value || "").trim();
}

function decodeBase64(base64 = "") {
  const normalized = String(base64 || "").trim();
  if (!normalized) {
    return null;
  }
  const binary = globalThis.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function hashBytes(bytes) {
  let hash = 2166136261;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createCacheKey(kind, mime, bytes, contentKey = "") {
  const identity = normalizeId(contentKey);
  if (identity) {
    return `identity:${identity}`;
  }
  return `${kind || "document"}:${mime || "application/octet-stream"}:${bytes.length}:${hashBytes(bytes)}`;
}

function estimateArtifactBytes(value) {
  if (typeof value === "string") {
    return value.length * 2;
  }
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  if (ArrayBuffer.isView(value)) {
    return value.byteLength;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return value.size;
  }
  try {
    return JSON.stringify(value)?.length * 2 || 0;
  } catch {
    return 0;
  }
}

function getCacheEntryBytes(entry = null) {
  return Number(entry?.bytes?.byteLength || 0) + Number(entry?.artifactByteSize || 0);
}

export function createDocumentPreviewRuntime({
  maxEntries = DEFAULT_MAX_CACHE_ENTRIES,
  maxBytes = DEFAULT_MAX_CACHE_BYTES,
} = {}) {
  const sessions = new Map();
  const cache = new Map();
  let totalBytes = 0;
  let generationSeed = 0;
  let evictionCount = 0;
  let staleCommitCount = 0;

  function touchCacheEntry(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    cache.delete(key);
    cache.set(key, entry);
    return entry;
  }

  function evictCacheEntry(key, reason = "budget") {
    const entry = cache.get(key);
    if (!entry || entry.refs > 0) return false;
    cache.delete(key);
    totalBytes = Math.max(0, totalBytes - getCacheEntryBytes(entry));
    if (reason === "budget") evictionCount += 1;
    return true;
  }

  function enforceBudget(targetBytes = maxBytes) {
    const target = Math.max(0, Number(targetBytes) || 0);
    let scanned = 0;
    while ((cache.size > maxEntries || totalBytes > target) && scanned < cache.size) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      const entry = cache.get(oldestKey);
      if (entry?.refs > 0) {
        cache.delete(oldestKey);
        cache.set(oldestKey, entry);
        scanned += 1;
        continue;
      }
      evictCacheEntry(oldestKey, "budget");
      scanned = 0;
    }
  }

  function releaseSessionCache(session, { enforce = true } = {}) {
    const key = normalizeId(session?.cacheKey);
    if (!key) return;
    const entry = cache.get(key);
    if (entry) {
      entry.refs = Math.max(0, entry.refs - 1);
    }
    session.cacheKey = "";
    if (enforce) {
      enforceBudget();
    }
  }

  function createSession({ id, kind = "document", mime = "", sourcePath = "", fileName = "" } = {}) {
    const sessionId = normalizeId(id) || `document-preview-${Date.now()}-${++generationSeed}`;
    if (sessions.has(sessionId)) {
      closeSession(sessionId);
    }
    const session = {
      id: sessionId,
      generation: ++generationSeed,
      kind: String(kind || "document").trim().toLowerCase() || "document",
      mime: String(mime || "").trim().toLowerCase(),
      sourcePath: String(sourcePath || "").trim(),
      fileName: String(fileName || "").trim(),
      status: "loading",
      error: "",
      cacheKey: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      abortController: new AbortController(),
    };
    sessions.set(sessionId, session);
    return getHandle(sessionId);
  }

  function getHandle(id = "") {
    const session = sessions.get(normalizeId(id));
    if (!session) return null;
    const entry = session.cacheKey ? cache.get(session.cacheKey) : null;
    return Object.freeze({
      id: session.id,
      generation: session.generation,
      kind: session.kind,
      mime: session.mime,
      sourcePath: session.sourcePath,
      fileName: session.fileName,
      status: session.status,
      error: session.error,
      contentKey: session.cacheKey,
      byteLength: entry?.bytes?.byteLength || 0,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  }

  function commit(id = "", generation = 0, { bytes = null, base64 = "", mime = "", kind = "", contentKey = "" } = {}) {
    const session = sessions.get(normalizeId(id));
    if (!session || Number(generation) !== session.generation || session.abortController.signal.aborted) {
      staleCommitCount += 1;
      return null;
    }
    const nextBytes = bytes instanceof Uint8Array ? bytes : decodeBase64(base64);
    if (!nextBytes?.byteLength) {
      return fail(id, generation, "预览文档为空");
    }
    releaseSessionCache(session, { enforce: false });
    session.kind = String(kind || session.kind || "document").trim().toLowerCase();
    session.mime = String(mime || session.mime || "").trim().toLowerCase();
    const cacheKey = createCacheKey(session.kind, session.mime, nextBytes, contentKey);
    let entry = touchCacheEntry(cacheKey);
    if (!entry) {
      entry = { bytes: nextBytes, refs: 0, artifacts: new Map(), artifactByteSize: 0 };
      cache.set(cacheKey, entry);
      totalBytes += nextBytes.byteLength;
    } else if (entry.bytes.byteLength !== nextBytes.byteLength) {
      totalBytes -= getCacheEntryBytes(entry);
      entry.bytes = nextBytes;
      entry.artifacts = new Map();
      entry.artifactByteSize = 0;
      totalBytes += getCacheEntryBytes(entry);
    }
    entry.refs += 1;
    session.cacheKey = cacheKey;
    session.status = "ready";
    session.error = "";
    session.updatedAt = Date.now();
    enforceBudget();
    return getHandle(session.id);
  }

  function attachCached(id = "", generation = 0, contentKey = "") {
    const session = sessions.get(normalizeId(id));
    const cacheKey = createCacheKey("", "", new Uint8Array(), contentKey);
    const entry = cache.get(cacheKey);
    if (!session || Number(generation) !== session.generation || session.abortController.signal.aborted || !entry?.bytes) {
      return null;
    }
    releaseSessionCache(session, { enforce: false });
    touchCacheEntry(cacheKey);
    entry.refs += 1;
    session.cacheKey = cacheKey;
    session.status = "ready";
    session.error = "";
    session.updatedAt = Date.now();
    enforceBudget();
    return getHandle(session.id);
  }

  function getArtifact(id = "", generation = 0, artifactKey = "") {
    const session = sessions.get(normalizeId(id));
    const key = normalizeId(artifactKey);
    if (!session || session.status !== "ready" || Number(generation) !== session.generation || !key) {
      return null;
    }
    const entry = touchCacheEntry(session.cacheKey);
    return entry?.artifacts?.get(key) || null;
  }

  function setArtifact(id = "", generation = 0, artifactKey = "", value = null) {
    const session = sessions.get(normalizeId(id));
    const key = normalizeId(artifactKey);
    if (!session || session.status !== "ready" || Number(generation) !== session.generation || !key || value == null) {
      return false;
    }
    const entry = touchCacheEntry(session.cacheKey);
    if (!entry) return false;
    if (!(entry.artifacts instanceof Map)) {
      entry.artifacts = new Map();
      entry.artifactByteSize = 0;
    }
    const previous = entry.artifacts.get(key);
    const previousBytes = estimateArtifactBytes(previous);
    const nextBytes = estimateArtifactBytes(value);
    entry.artifacts.set(key, value);
    entry.artifactByteSize = Math.max(0, Number(entry.artifactByteSize || 0) - previousBytes + nextBytes);
    totalBytes = Math.max(0, totalBytes - previousBytes + nextBytes);
    enforceBudget();
    return true;
  }

  function fail(id = "", generation = 0, error = "文件预览加载失败") {
    const session = sessions.get(normalizeId(id));
    if (!session || Number(generation) !== session.generation) {
      staleCommitCount += 1;
      return null;
    }
    releaseSessionCache(session);
    session.status = "failed";
    session.error = String(error || "文件预览加载失败").trim() || "文件预览加载失败";
    session.updatedAt = Date.now();
    return getHandle(session.id);
  }

  function retry(id = "") {
    const session = sessions.get(normalizeId(id));
    if (!session) return null;
    session.abortController.abort();
    releaseSessionCache(session);
    session.generation = ++generationSeed;
    session.status = "loading";
    session.error = "";
    session.updatedAt = Date.now();
    session.abortController = new AbortController();
    return getHandle(session.id);
  }

  function getData(id = "", generation = 0, { copy = true } = {}) {
    const session = sessions.get(normalizeId(id));
    if (!session || session.status !== "ready" || Number(generation) !== session.generation) {
      return null;
    }
    const entry = touchCacheEntry(session.cacheKey);
    if (!entry?.bytes) return null;
    session.updatedAt = Date.now();
    return Object.freeze({
      handle: getHandle(session.id),
      bytes: copy ? entry.bytes.slice() : entry.bytes,
    });
  }

  function closeSession(id = "") {
    const sessionId = normalizeId(id);
    const session = sessions.get(sessionId);
    if (!session) return false;
    session.abortController.abort();
    releaseSessionCache(session);
    sessions.delete(sessionId);
    enforceBudget();
    return true;
  }

  function trimToBytes(targetBytes = maxBytes) {
    const before = totalBytes;
    enforceBudget(targetBytes);
    return Math.max(0, before - totalBytes);
  }

  function getStats() {
    return Object.freeze({
      size: cache.size,
      byteSize: totalBytes,
      maxEntries,
      maxBytes,
      artifactByteSize: Array.from(cache.values()).reduce((sum, entry) => sum + Number(entry.artifactByteSize || 0), 0),
      activeSessions: sessions.size,
      readySessions: Array.from(sessions.values()).filter((session) => session.status === "ready").length,
      evictionCount,
      staleCommitCount,
    });
  }

  function dispose() {
    Array.from(sessions.keys()).forEach(closeSession);
    Array.from(cache.keys()).forEach((key) => evictCacheEntry(key, "dispose"));
  }

  return Object.freeze({
    createSession,
    getHandle,
    getData,
    getAbortSignal: (id = "") => sessions.get(normalizeId(id))?.abortController?.signal || null,
    commit,
    attachCached,
    fail,
    retry,
    closeSession,
    trimToBytes,
    getStats,
    getArtifact,
    setArtifact,
    dispose,
  });
}
