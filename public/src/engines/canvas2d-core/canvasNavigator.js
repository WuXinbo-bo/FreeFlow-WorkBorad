const NAVIGATOR_VERSION = 2;
const DEFAULT_NAVIGATOR_TITLE = "画布目录";

export const CANVAS_NAVIGATOR_ENTRY_KIND_FOLDER = "folder";
export const CANVAS_NAVIGATOR_ENTRY_KIND_CANVAS_ITEM = "canvasItem";

const NAVIGATOR_SUPPORTED_TYPES = new Set([
  "text",
  "flowNode",
  "mindNode",
  "mindSummary",
  "fileCard",
  "codeBlock",
  "table",
  "image",
  "shape",
]);

function cleanString(value = "", fallback = "") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function createNavigatorEntryId(seed = "entry") {
  return `nav-${String(seed || "entry").replace(/[^a-zA-Z0-9_-]/g, "-")}-${Date.now().toString(36)}`;
}

function normalizeEntryKind(value = "") {
  const kind = cleanString(value).toLowerCase();
  if (kind === "folder" || kind === "directory" || kind === "group") {
    return CANVAS_NAVIGATOR_ENTRY_KIND_FOLDER;
  }
  return CANVAS_NAVIGATOR_ENTRY_KIND_CANVAS_ITEM;
}

export function resolveCanvasNavigatorItemTitle(item = null) {
  if (!item || typeof item !== "object") {
    return "未知元素";
  }
  const explicit = cleanString(item.title || item.name || item.label);
  if (explicit) {
    return explicit;
  }
  const text = cleanString(item.plainText || item.text || item.description);
  if (text) {
    return text.replace(/\s+/g, " ").slice(0, 48);
  }
  const type = cleanString(item.type, "item");
  const labels = {
    text: "文本笔记",
    flowNode: "节点",
    mindNode: "思维节点",
    mindSummary: "摘要节点",
    fileCard: "文件卡片",
    codeBlock: "代码块",
    table: "表格",
    image: "图片",
    shape: "图形",
  };
  return labels[type] || "画布元素";
}

export function normalizeCanvasNavigatorEntry(entry = {}, index = 0) {
  const source = entry && typeof entry === "object" ? entry : {};
  const targetId = cleanString(source.targetId || source.itemId);
  const legacyTargetId = cleanString(source.targetId || source.itemId || source.id);
  const kind = source.kind ? normalizeEntryKind(source.kind) : targetId ? CANVAS_NAVIGATOR_ENTRY_KIND_CANVAS_ITEM : CANVAS_NAVIGATOR_ENTRY_KIND_FOLDER;
  const effectiveTargetId = kind === CANVAS_NAVIGATOR_ENTRY_KIND_CANVAS_ITEM ? legacyTargetId : targetId;
  if (kind === CANVAS_NAVIGATOR_ENTRY_KIND_CANVAS_ITEM && !effectiveTargetId) {
    return null;
  }
  const createdAt = Number(source.createdAt) || Date.now();
  const fallbackTitle = kind === CANVAS_NAVIGATOR_ENTRY_KIND_FOLDER ? "新建文件夹" : "未命名笔记";
  const id = cleanString(
    source.id && source.id !== effectiveTargetId ? source.id : "",
    createNavigatorEntryId(effectiveTargetId || source.title || kind)
  );
  return {
    id,
    kind,
    targetId: effectiveTargetId,
    title: cleanString(source.title, fallbackTitle),
    type: cleanString(source.type || source.targetType, kind === CANVAS_NAVIGATOR_ENTRY_KIND_FOLDER ? "folder" : "item"),
    parentId: cleanString(source.parentId),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : index,
    collapsed: Boolean(source.collapsed),
    createdAt,
    updatedAt: Number(source.updatedAt) || createdAt,
  };
}

function normalizeTreeRelations(entries = []) {
  const idSet = new Set(entries.map((entry) => entry.id));
  const childMap = new Map();
  entries.forEach((entry) => {
    const parentId = idSet.has(entry.parentId) && entry.parentId !== entry.id ? entry.parentId : "";
    if (!childMap.has(parentId)) {
      childMap.set(parentId, []);
    }
    childMap.get(parentId).push(entry.id);
  });
  const visiting = new Set();
  const visited = new Set();
  function hasCycle(id) {
    if (visiting.has(id)) {
      return true;
    }
    if (visited.has(id)) {
      return false;
    }
    visiting.add(id);
    const children = childMap.get(id) || [];
    const cycle = children.some((childId) => hasCycle(childId));
    visiting.delete(id);
    visited.add(id);
    return cycle;
  }
  return entries.map((entry) => {
    if (!entry.parentId || !idSet.has(entry.parentId) || entry.parentId === entry.id || hasCycle(entry.id)) {
      return { ...entry, parentId: "" };
    }
    return entry;
  });
}

function normalizeSiblingOrders(entries = []) {
  const groups = new Map();
  entries.forEach((entry) => {
    const parentId = cleanString(entry.parentId);
    if (!groups.has(parentId)) {
      groups.set(parentId, []);
    }
    groups.get(parentId).push(entry);
  });
  const ordered = [];
  groups.forEach((siblings) => {
    siblings
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .forEach((entry, order) => ordered.push({ ...entry, order }));
  });
  return ordered.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

export function normalizeCanvasNavigator(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const entries = Array.isArray(source.entries)
    ? source.entries
        .map((entry, index) => normalizeCanvasNavigatorEntry(entry, index))
        .filter(Boolean)
    : [];
  const seenIds = new Set();
  const uniqueEntries = entries.filter((entry) => {
    if (seenIds.has(entry.id)) {
      return false;
    }
    seenIds.add(entry.id);
    return true;
  });
  return {
    version: NAVIGATOR_VERSION,
    title: cleanString(source.title, DEFAULT_NAVIGATOR_TITLE),
    collapsed: source.collapsed === true,
    entries: normalizeSiblingOrders(normalizeTreeRelations(uniqueEntries)),
  };
}

export function createNavigatorEntryFromItem(item = {}, options = {}) {
  const targetId = cleanString(item?.id);
  if (!targetId) {
    return null;
  }
  return normalizeCanvasNavigatorEntry({
    id: options.id || createNavigatorEntryId(targetId),
    kind: CANVAS_NAVIGATOR_ENTRY_KIND_CANVAS_ITEM,
    targetId,
    title: cleanString(options.title, resolveCanvasNavigatorItemTitle(item)),
    type: cleanString(item?.type, "item"),
    parentId: cleanString(options.parentId),
    order: Number.isFinite(Number(options.order)) ? Number(options.order) : Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export function createNavigatorFolderEntry(options = {}) {
  return normalizeCanvasNavigatorEntry({
    id: options.id || createNavigatorEntryId(options.title || "folder"),
    kind: CANVAS_NAVIGATOR_ENTRY_KIND_FOLDER,
    targetId: cleanString(options.targetId),
    title: cleanString(options.title, "新建文件夹"),
    type: "folder",
    parentId: cleanString(options.parentId),
    order: Number.isFinite(Number(options.order)) ? Number(options.order) : Date.now(),
    collapsed: Boolean(options.collapsed),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export function canAddItemToCanvasNavigator(item = null) {
  if (!item || typeof item !== "object") {
    return false;
  }
  return NAVIGATOR_SUPPORTED_TYPES.has(String(item.type || ""));
}

export function pruneCanvasNavigator(navigator = {}, items = []) {
  const normalized = normalizeCanvasNavigator(navigator);
  const itemIds = new Set((Array.isArray(items) ? items : []).map((item) => String(item?.id || "")).filter(Boolean));
  const removedIds = new Set(
    normalized.entries
      .filter((entry) => entry.kind === CANVAS_NAVIGATOR_ENTRY_KIND_CANVAS_ITEM && !itemIds.has(entry.targetId))
      .map((entry) => entry.id)
  );
  if (!removedIds.size) {
    return normalized;
  }
  const removedParentById = new Map(normalized.entries.filter((entry) => removedIds.has(entry.id)).map((entry) => [entry.id, entry.parentId]));
  const nextEntries = normalized.entries
    .filter((entry) => !removedIds.has(entry.id))
    .map((entry) => {
      if (!removedIds.has(entry.parentId)) {
        return entry;
      }
      return {
        ...entry,
        parentId: removedParentById.get(entry.parentId) || "",
        updatedAt: Date.now(),
      };
    });
  return normalizeCanvasNavigator({
    ...normalized,
    entries: nextEntries,
  });
}

export function buildCanvasNavigatorViewModel(navigator = {}, items = [], selectedIds = []) {
  const normalized = pruneCanvasNavigator(navigator, items);
  const itemById = new Map((Array.isArray(items) ? items : []).map((item) => [String(item?.id || ""), item]));
  const selectedSet = new Set((Array.isArray(selectedIds) ? selectedIds : []).map((id) => String(id || "")));
  const entries = normalized.entries.map((entry, index) => {
    const target = entry.targetId ? itemById.get(entry.targetId) || null : null;
    return {
      ...entry,
      order: index,
      missing: Boolean(entry.targetId) && !target,
      selected: Boolean(entry.targetId) && selectedSet.has(entry.targetId),
      targetTitle: target ? resolveCanvasNavigatorItemTitle(target) : "",
      targetType: target ? String(target.type || "") : entry.type,
      children: [],
      depth: 0,
    };
  });
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const rootEntries = [];
  entries.forEach((entry) => {
    const parent = entry.parentId ? entryById.get(entry.parentId) : null;
    if (!parent || parent.id === entry.id) {
      rootEntries.push(entry);
      return;
    }
    parent.children.push(entry);
  });
  function assignDepth(nodes = [], depth = 0) {
    nodes.forEach((node) => {
      node.depth = depth;
      node.children.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
      assignDepth(node.children, depth + 1);
    });
  }
  rootEntries.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  assignDepth(rootEntries, 0);
  return {
    ...normalized,
    entries,
    rootEntries,
  };
}

export function buildCanvasNavigatorSuggestions(navigator = {}, items = [], limit = 8) {
  const normalized = normalizeCanvasNavigator(navigator);
  const existingTargets = new Set(
    normalized.entries
      .filter((entry) => entry.kind === CANVAS_NAVIGATOR_ENTRY_KIND_CANVAS_ITEM)
      .map((entry) => entry.targetId)
  );
  return (Array.isArray(items) ? items : [])
    .filter((item) => canAddItemToCanvasNavigator(item) && !existingTargets.has(String(item?.id || "")))
    .map((item) => ({
      targetId: String(item.id || ""),
      title: resolveCanvasNavigatorItemTitle(item),
      type: String(item.type || "item"),
      score: computeSuggestionScore(item),
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-Hans-CN"))
    .slice(0, Math.max(0, Number(limit) || 8));
}

function computeSuggestionScore(item = {}) {
  const text = cleanString(item.plainText || item.text || item.title || item.name);
  let score = 0;
  if (item.type === "mindNode" || item.type === "mindSummary") {
    score += 40;
  }
  if (item.type === "text") {
    score += 30;
  }
  if (/^#{1,3}\s+/.test(text) || /<h[1-3]\b/i.test(String(item.html || ""))) {
    score += 45;
  }
  if (text.length >= 12) {
    score += 10;
  }
  return score;
}

function isDescendant(entries = [], entryId = "", candidateParentId = "") {
  let current = cleanString(candidateParentId);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  while (current) {
    if (current === entryId) {
      return true;
    }
    current = cleanString(byId.get(current)?.parentId);
  }
  return false;
}

export function moveCanvasNavigatorEntry(entries = [], entryId = "", options = {}) {
  const normalized = normalizeCanvasNavigator({ entries }).entries;
  const id = cleanString(entryId);
  const target = normalized.find((entry) => entry.id === id);
  if (!target) {
    return normalized;
  }
  const parentId = Object.prototype.hasOwnProperty.call(options, "parentId") ? cleanString(options.parentId) : target.parentId;
  const parent = parentId ? normalized.find((entry) => entry.id === parentId) : null;
  if (parentId && (!parent || parent.kind !== CANVAS_NAVIGATOR_ENTRY_KIND_FOLDER || isDescendant(normalized, id, parentId))) {
    return normalized;
  }
  const moving = { ...target, parentId, updatedAt: Date.now() };
  const withoutMoving = normalized.filter((entry) => entry.id !== id);
  const siblings = withoutMoving
    .filter((entry) => cleanString(entry.parentId) === parentId)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const rawIndex = Number.isFinite(Number(options.index)) ? Number(options.index) : siblings.length;
  const index = Math.min(Math.max(0, rawIndex), siblings.length);
  siblings.splice(index, 0, moving);
  const siblingIds = new Set(siblings.map((entry) => entry.id));
  const reorderedSiblings = siblings.map((entry, order) => ({ ...entry, order }));
  return normalizeCanvasNavigator({
    entries: withoutMoving.filter((entry) => !siblingIds.has(entry.id)).concat(reorderedSiblings),
  }).entries;
}

export function reorderCanvasNavigatorEntries(entries = [], entryId = "", direction = 0) {
  const normalized = normalizeCanvasNavigator({ entries }).entries;
  const target = normalized.find((entry) => String(entry?.id || "") === String(entryId || ""));
  if (!target) {
    return normalized;
  }
  const siblings = normalized
    .filter((entry) => cleanString(entry.parentId) === cleanString(target.parentId))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const index = siblings.findIndex((entry) => entry.id === target.id);
  const delta = Number(direction) < 0 ? -1 : 1;
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= siblings.length) {
    return normalized;
  }
  return moveCanvasNavigatorEntry(normalized, target.id, {
    parentId: target.parentId,
    index: nextIndex,
  });
}
