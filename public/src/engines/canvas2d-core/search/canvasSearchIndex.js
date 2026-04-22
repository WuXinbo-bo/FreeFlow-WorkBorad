const SEARCHABLE_TYPES = new Set(["text", "flowNode", "fileCard", "image"]);

const TYPE_LABELS = Object.freeze({
  text: "文本",
  flowNode: "节点",
  fileCard: "文件卡",
  image: "图片",
});

function normalizeSearchText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildSearchFields(item) {
  const linkMetaText = getLinkMetaText(item);
  const fields = [
    { key: "title", label: "标题", value: item?.title || item?.name || item?.fileName || "" },
    { key: "text", label: "正文", value: item?.plainText || item?.text || "" },
    { key: "link", label: "链接", value: linkMetaText.urls },
    { key: "linkMeta", label: "链接元数据", value: linkMetaText.meta },
    { key: "memo", label: "备忘录", value: item?.memo || "" },
    { key: "note", label: "标签", value: item?.note || "" },
    { key: "fileName", label: "文件名", value: item?.fileName || "" },
  ]
    .map((entry) => ({
      ...entry,
      value: normalizeSearchText(entry.value),
    }))
    .filter((entry) => entry.value);

  return fields;
}

function getLinkMetaText(item) {
  if (item?.type !== "text") {
    return { urls: "", meta: "" };
  }
  const sourceTokens = [
    ...(Array.isArray(item?.structuredImport?.linkTokens) ? item.structuredImport.linkTokens : []),
    ...(Array.isArray(item?.linkTokens) ? item.linkTokens : []),
  ];
  const normalizedTokens = sourceTokens
    .map((token) => {
      const url = String(token?.url || token?.href || token?.value || "").trim();
      if (!url) {
        return null;
      }
      const fallbackDomain = deriveDomainFromUrl(url);
      return {
        url,
        domain: String(token?.domain || fallbackDomain || "").trim(),
      };
    })
    .filter(Boolean);

  const metaCacheEntries = extractUrlMetaCacheEntries(item?.structuredImport?.urlMetaCache || item?.urlMetaCache);
  const meta = metaCacheEntries
    .map(({ url, meta: cacheMeta }) =>
      [url, cacheMeta?.title, cacheMeta?.description, cacheMeta?.siteName].filter(Boolean).join(" ")
    )
    .filter(Boolean)
    .join(" ");

  const urls = normalizedTokens
    .flatMap((token) => [token.url, token.domain])
    .filter(Boolean)
    .join(" ");

  return { urls, meta };
}

function extractUrlMetaCacheEntries(cache) {
  if (!cache) {
    return [];
  }
  if (cache instanceof Map) {
    return Array.from(cache.entries()).map(([url, meta]) => ({ url: String(url || ""), meta: normalizeMetaValue(meta) }));
  }
  if (Array.isArray(cache)) {
    return cache
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const url = String(entry.url || entry.href || "").trim();
        if (!url) {
          return null;
        }
        return { url, meta: normalizeMetaValue(entry.meta || entry) };
      })
      .filter(Boolean);
  }
  if (typeof cache === "object") {
    return Object.entries(cache).map(([url, meta]) => ({ url: String(url || ""), meta: normalizeMetaValue(meta) }));
  }
  return [];
}

function normalizeMetaValue(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value;
}

function deriveDomainFromUrl(value) {
  const input = String(value || "").trim();
  if (!input) {
    return "";
  }
  try {
    const parsed = new URL(input);
    return parsed.hostname || "";
  } catch {
    return "";
  }
}

export function buildCanvasSearchResults(items, query, limit = 10) {
  const normalizedQuery = normalizeSearchText(query).toLowerCase();
  if (!normalizedQuery) {
    return [];
  }
  if (!Array.isArray(items) || !items.length) {
    return [];
  }

  const matches = [];
  for (const item of items) {
    if (!item || !SEARCHABLE_TYPES.has(item.type)) {
      continue;
    }
    const fields = buildSearchFields(item);
    if (!fields.length) {
      continue;
    }
    const matchedField = fields.find((field) => field.value.toLowerCase().includes(normalizedQuery));
    if (!matchedField) {
      continue;
    }
    const title = fields[0]?.value || `${TYPE_LABELS[item.type] || item.type} ${item.id || ""}`.trim();
    const score = matchedField.value.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
    matches.push({
      id: item.id,
      type: item.type,
      typeLabel: TYPE_LABELS[item.type] || item.type,
      title,
      summary: matchedField.value,
      matchLabel: matchedField.label,
      score,
    });
  }

  return matches
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title, "zh-CN"))
    .slice(0, Math.max(1, limit));
}
