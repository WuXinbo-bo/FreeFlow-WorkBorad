import { sanitizeText } from "../../utils.js";

const SEARCHABLE_TYPES = new Set([
  "text",
  "flowNode",
  "fileCard",
  "image",
  "codeBlock",
  "table",
  "mathBlock",
  "mathInline",
]);

const TYPE_LABELS = Object.freeze({
  text: "文本",
  flowNode: "节点",
  fileCard: "文件卡",
  image: "图片",
  codeBlock: "代码块",
  table: "表格",
  mathBlock: "公式",
  mathInline: "行内公式",
});

export function buildHostSearchResults(items, query, limit = 10) {
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

function buildSearchFields(item) {
  const linkMetaText = getLinkMetaText(item);
  const fields = [
    { key: "title", label: "标题", value: item?.title || item?.name || item?.fileName || "" },
    { key: "text", label: "正文", value: getBodyText(item) },
    { key: "link", label: "链接", value: linkMetaText.urls },
    { key: "linkMeta", label: "链接元数据", value: linkMetaText.meta },
    { key: "meta", label: "附加信息", value: getMetaText(item) },
    { key: "memo", label: "备忘录", value: item?.memo || "" },
  ]
    .map((entry) => ({
      ...entry,
      value: normalizeSearchText(entry.value),
    }))
    .filter((entry) => entry.value);

  return fields;
}

function getBodyText(item) {
  if (item?.type === "codeBlock") {
    return item?.plainText || item?.text || "";
  }
  if (item?.type === "table") {
    const rows = Array.isArray(item?.table?.rows) ? item.table.rows : [];
    return rows
      .flatMap((row) => (Array.isArray(row.cells) ? row.cells : []).map((cell) => cell?.plainText || ""))
      .join(" ");
  }
  if (item?.type === "mathBlock" || item?.type === "mathInline") {
    return item?.formula || item?.fallbackText || "";
  }
  if (item?.type === "image") {
    return (
      item?.structuredImport?.canonicalFragment?.attrs?.alt ||
      item?.structuredImport?.canonicalFragment?.attrs?.title ||
      item?.name ||
      ""
    );
  }
  if (item?.type === "fileCard") {
    return item?.fileName || item?.name || "";
  }
  return item?.plainText || item?.text || "";
}

function getMetaText(item) {
  if (item?.type === "fileCard") {
    return [item?.sourcePath, item?.ext, item?.mime].filter(Boolean).join(" ");
  }
  if (item?.type === "image") {
    return [item?.sourcePath, item?.mime].filter(Boolean).join(" ");
  }
  if (item?.type === "codeBlock") {
    return [item?.language, item?.structuredImport?.sourceNodeType].filter(Boolean).join(" ");
  }
  if (item?.type === "mathBlock" || item?.type === "mathInline") {
    return [item?.sourceFormat, item?.renderState].filter(Boolean).join(" ");
  }
  return "";
}

function getLinkMetaText(item) {
  const sourceTokens = [
    ...(Array.isArray(item?.structuredImport?.linkTokens) ? item.structuredImport.linkTokens : []),
    ...(Array.isArray(item?.linkTokens) ? item.linkTokens : []),
  ];
  const normalizedTokens = sourceTokens
    .map((token) => {
      const url = String(token?.url || token?.href || token?.value || "").trim();
      if (!url) return null;
      const fallbackDomain = deriveDomainFromUrl(url);
      return {
        url,
        domain: String(token?.domain || fallbackDomain || "").trim(),
        kindHint: String(token?.kindHint || "").trim(),
        fetchState: String(token?.fetchState || token?.state || "").trim(),
      };
    })
    .filter(Boolean);

  const metaCacheEntries = extractUrlMetaCacheEntries(item?.structuredImport?.urlMetaCache || item?.urlMetaCache);
  const cacheEntries = metaCacheEntries.map(({ url, meta }) => {
    const safeMeta = meta && typeof meta === "object" ? meta : {};
    return [
      url,
      safeMeta?.title,
      safeMeta?.description,
      safeMeta?.siteName,
      safeMeta?.domain,
      safeMeta?.fetchState,
      safeMeta?.status,
    ]
      .filter(Boolean)
      .join(" ");
  });

  const urls = normalizedTokens
    .flatMap((token) => [token.url, token.domain, token.kindHint, token.fetchState])
    .filter(Boolean)
    .join(" ");

  const meta = cacheEntries.join(" ");
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

function normalizeSearchText(value) {
  return sanitizeText(String(value || "")).replace(/\s+/g, " ").trim();
}
