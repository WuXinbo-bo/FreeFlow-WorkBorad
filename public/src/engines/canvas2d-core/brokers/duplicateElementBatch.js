import { clone, createId as defaultCreateId } from "../utils.js";

const INTERNAL_LINK_PREFIX = "freeflow://canvas/item/";
const RELATION_TYPES = new Set(["flowEdge", "mindRelationship"]);

export function prepareElementDuplicateBatch(items = [], options = {}) {
  const createId = typeof options.createId === "function" ? options.createId : defaultCreateId;
  const sourceItems = (Array.isArray(items) ? items : []).filter(
    (item) => item && typeof item === "object" && String(item.id || "").trim()
  );
  const sourceById = new Map(sourceItems.map((item) => [String(item.id), item]));
  const idMap = new Map(
    sourceItems.map((item) => [String(item.id), createId(String(item.type || "item"))])
  );
  const groupIdMap = new Map();

  sourceItems.forEach((item) => {
    const groupId = String(item.groupId || "").trim();
    if (groupId && !groupIdMap.has(groupId)) {
      groupIdMap.set(groupId, createId("group"));
    }
  });

  const duplicatedItems = sourceItems
    .filter((item) => !RELATION_TYPES.has(item.type) || hasDuplicatedRelationEndpoints(item, idMap))
    .map((item) => {
      const duplicated = remapInternalLinkValues(clone(item), idMap);
      duplicated.id = idMap.get(String(item.id));
      if (duplicated.groupId) {
        duplicated.groupId = groupIdMap.get(String(duplicated.groupId)) || "";
      }
      remapElementReferences(duplicated, item, { idMap, sourceById, createId });
      return duplicated;
    });

  return {
    items: duplicatedItems,
    idMap,
    groupIdMap,
  };
}

function hasDuplicatedRelationEndpoints(item, idMap) {
  return idMap.has(String(item.fromId || "")) && idMap.has(String(item.toId || ""));
}

function remapElementReferences(duplicated, source, context) {
  const { idMap, sourceById, createId } = context;
  if (duplicated.type === "flowEdge" || duplicated.type === "mindRelationship") {
    duplicated.fromId = idMap.get(String(source.fromId || "")) || "";
    duplicated.toId = idMap.get(String(source.toId || "")) || "";
    return;
  }
  if (duplicated.type === "mindNode") {
    const parentId = String(source.parentId || "");
    duplicated.parentId = idMap.get(parentId) || "";
    duplicated.childrenIds = (Array.isArray(source.childrenIds) ? source.childrenIds : [])
      .map((id) => idMap.get(String(id || "")))
      .filter(Boolean);
    duplicated.rootId = resolveDuplicatedMindRootId(source, idMap, sourceById);
    duplicated.depth = resolveDuplicatedMindDepth(source, idMap, sourceById);
    if (!duplicated.parentId) {
      duplicated.order = 0;
    }
    duplicated.links = (Array.isArray(source.links) ? source.links : []).map((entry) => ({
      ...entry,
      id: createId("mind-link"),
      targetId: idMap.get(String(entry?.targetId || "")) || String(entry?.targetId || ""),
    }));
    return;
  }
  if (duplicated.type === "mindSummary") {
    duplicated.summaryOwnerId = idMap.get(String(source.summaryOwnerId || "")) || "";
    duplicated.siblingIds = (Array.isArray(source.siblingIds) ? source.siblingIds : [])
      .map((id) => idMap.get(String(id || "")))
      .filter(Boolean);
    duplicated.rootId = idMap.get(String(source.rootId || "")) || "";
  }
}

function resolveDuplicatedMindRootId(source, idMap, sourceById) {
  let current = source;
  const visited = new Set();
  while (current?.parentId && idMap.has(String(current.parentId))) {
    const parentId = String(current.parentId);
    if (visited.has(parentId)) {
      break;
    }
    visited.add(parentId);
    current = sourceById.get(parentId) || current;
    if (String(current.id || "") === String(source.id || "")) {
      break;
    }
  }
  return idMap.get(String(current?.id || source.id || "")) || "";
}

function resolveDuplicatedMindDepth(source, idMap, sourceById) {
  let depth = 0;
  let current = source;
  const visited = new Set();
  while (current?.parentId && idMap.has(String(current.parentId))) {
    const parentId = String(current.parentId);
    if (visited.has(parentId)) {
      break;
    }
    visited.add(parentId);
    const parent = sourceById.get(parentId);
    if (!parent) {
      break;
    }
    depth += 1;
    current = parent;
  }
  return depth;
}

function remapInternalLinkValues(value, idMap) {
  if (typeof value === "string") {
    return value.replace(/freeflow:\/\/canvas\/item\/([^\s"'<>]+)/g, (match, encodedId) => {
      const previousId = decodeLinkId(encodedId);
      const nextId = idMap.get(previousId);
      return nextId ? `${INTERNAL_LINK_PREFIX}${encodeURIComponent(nextId)}` : match;
    });
  }
  if (Array.isArray(value)) {
    return value.map((entry) => remapInternalLinkValues(entry, idMap));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  Object.keys(value).forEach((key) => {
    value[key] = remapInternalLinkValues(value[key], idMap);
  });
  return value;
}

function decodeLinkId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
