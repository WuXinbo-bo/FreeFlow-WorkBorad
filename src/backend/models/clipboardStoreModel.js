const CLIPBOARD_STORE_SCHEMA_VERSION = 1;

function getDefaultClipboardStore() {
  return {
    schemaVersion: CLIPBOARD_STORE_SCHEMA_VERSION,
    mode: "manual",
    maxItems: 20,
    items: [],
    updatedAt: Date.now(),
  };
}

function normalizeClipboardStore(payload = {}) {
  const maxItems = Math.min(Math.max(Number(payload?.maxItems) || 20, 5), 100);
  const items = Array.isArray(payload?.items) ? payload.items : [];

  return {
    schemaVersion: CLIPBOARD_STORE_SCHEMA_VERSION,
    mode: payload?.mode === "auto" ? "auto" : "manual",
    maxItems,
    items: items
      .map((item) => ({
        id: String(item?.id || ""),
        content: typeof item?.content === "string" ? item.content.slice(0, 20000) : "",
        source: item?.source === "auto" ? "auto" : "manual",
        createdAt: Number(item?.createdAt) || Date.now(),
      }))
      .filter((item) => item.id && item.content.trim())
      .slice(0, maxItems),
    updatedAt: payload.updatedAt || Date.now(),
  };
}

module.exports = {
  CLIPBOARD_STORE_SCHEMA_VERSION,
  getDefaultClipboardStore,
  normalizeClipboardStore,
};
