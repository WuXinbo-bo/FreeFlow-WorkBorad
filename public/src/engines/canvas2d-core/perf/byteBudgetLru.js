function normalizeLimit(value, fallback = Infinity) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

export function createByteBudgetLru({
  maxEntries = Infinity,
  maxBytes = Infinity,
  estimateSize = () => 0,
  onEvict = null,
} = {}) {
  const entries = new Map();
  const entryLimit = normalizeLimit(maxEntries);
  const byteLimit = normalizeLimit(maxBytes);
  let totalBytes = 0;
  let evictionCount = 0;

  function evict(key, reason = "delete") {
    const record = entries.get(key);
    if (!record) return false;
    entries.delete(key);
    totalBytes = Math.max(0, totalBytes - record.bytes);
    if (reason === "budget") evictionCount += 1;
    onEvict?.(record.value, key, reason);
    return true;
  }

  function enforceBudget() {
    while (entries.size > entryLimit || totalBytes > byteLimit) {
      if (entries.size === 1 && entries.size <= entryLimit && totalBytes > byteLimit) break;
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      evict(oldestKey, "budget");
    }
  }

  function trimToBytes(targetBytes = byteLimit) {
    const target = normalizeLimit(targetBytes, byteLimit);
    const before = totalBytes;
    while (entries.size && totalBytes > target) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      evict(oldestKey, "budget");
    }
    return Math.max(0, before - totalBytes);
  }

  function set(key, value) {
    const previous = entries.get(key);
    if (previous) {
      entries.delete(key);
      totalBytes = Math.max(0, totalBytes - previous.bytes);
      if (previous.value !== value) onEvict?.(previous.value, key, "replace");
    }
    const bytes = Math.max(0, normalizeLimit(estimateSize(value, key), 0));
    entries.set(key, { value, bytes });
    totalBytes += bytes;
    enforceBudget();
    return entries.has(key);
  }

  function get(key) {
    const record = entries.get(key);
    if (!record) return undefined;
    entries.delete(key);
    entries.set(key, record);
    return record.value;
  }

  function clear() {
    Array.from(entries.keys()).forEach((key) => evict(key, "clear"));
  }

  function* iterateEntries() {
    for (const [key, record] of entries) {
      yield [key, record.value];
    }
  }

  return Object.freeze({
    get,
    set,
    has: (key) => entries.has(key),
    delete: (key) => evict(key, "delete"),
    clear,
    keys: () => entries.keys(),
    entries: iterateEntries,
    trimToBytes,
    get size() {
      return entries.size;
    },
    get byteSize() {
      return totalBytes;
    },
    getStats() {
      return Object.freeze({
        size: entries.size,
        byteSize: totalBytes,
        maxEntries: entryLimit,
        maxBytes: byteLimit,
        evictionCount,
      });
    },
  });
}
