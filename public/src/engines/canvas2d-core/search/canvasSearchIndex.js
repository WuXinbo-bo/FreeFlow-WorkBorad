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
  const fields = [
    { key: "title", label: "标题", value: item?.title || item?.name || item?.fileName || "" },
    { key: "text", label: "正文", value: item?.plainText || item?.text || "" },
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
