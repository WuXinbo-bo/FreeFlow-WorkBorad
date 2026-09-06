const RELATION_TYPES = new Set(["flowEdge", "mindRelationship"]);

function normalizeId(value = "") {
  return String(value || "").trim();
}

function addById(id, selectedIds, itemById) {
  const normalizedId = normalizeId(id);
  if (!normalizedId || selectedIds.has(normalizedId) || !itemById.has(normalizedId)) {
    return false;
  }
  selectedIds.add(normalizedId);
  return true;
}

export function resolveSelectionDependencyClosure(selectedItems = [], boardItems = []) {
  const allItems = (Array.isArray(boardItems) ? boardItems : []).filter(
    (item) => item && typeof item === "object" && normalizeId(item.id)
  );
  const itemById = new Map(allItems.map((item) => [normalizeId(item.id), item]));
  const selectedIds = new Set(
    (Array.isArray(selectedItems) ? selectedItems : [])
      .map((item) => normalizeId(item?.id))
      .filter((id) => id && itemById.has(id))
  );
  if (!selectedIds.size) {
    return [];
  }

  let changed = true;
  while (changed) {
    changed = false;
    const selectedSnapshot = Array.from(selectedIds)
      .map((id) => itemById.get(id))
      .filter(Boolean);

    const selectedGroupIds = new Set(
      selectedSnapshot.map((item) => normalizeId(item.groupId)).filter(Boolean)
    );
    if (selectedGroupIds.size) {
      allItems.forEach((item) => {
        if (selectedGroupIds.has(normalizeId(item.groupId))) {
          changed = addById(item.id, selectedIds, itemById) || changed;
        }
      });
    }

    selectedSnapshot.forEach((item) => {
      if (item.type === "mindNode") {
        (Array.isArray(item.childrenIds) ? item.childrenIds : []).forEach((id) => {
          changed = addById(id, selectedIds, itemById) || changed;
        });
        (Array.isArray(item.links) ? item.links : []).forEach((link) => {
          changed = addById(link?.targetId, selectedIds, itemById) || changed;
        });
      }
      if (RELATION_TYPES.has(item.type)) {
        changed = addById(item.fromId, selectedIds, itemById) || changed;
        changed = addById(item.toId, selectedIds, itemById) || changed;
      }
      if (item.type === "mindSummary") {
        changed = addById(item.summaryOwnerId, selectedIds, itemById) || changed;
        (Array.isArray(item.siblingIds) ? item.siblingIds : []).forEach((id) => {
          changed = addById(id, selectedIds, itemById) || changed;
        });
      }
    });

    allItems.forEach((item) => {
      if (
        RELATION_TYPES.has(item.type) &&
        selectedIds.has(normalizeId(item.fromId)) &&
        selectedIds.has(normalizeId(item.toId))
      ) {
        changed = addById(item.id, selectedIds, itemById) || changed;
      }
      if (item.type === "mindSummary" && !selectedIds.has(normalizeId(item.id))) {
        const dependencyIds = [item.summaryOwnerId, ...(Array.isArray(item.siblingIds) ? item.siblingIds : [])]
          .map(normalizeId)
          .filter(Boolean);
        if (dependencyIds.length && dependencyIds.every((id) => selectedIds.has(id))) {
          changed = addById(item.id, selectedIds, itemById) || changed;
        }
      }
    });
  }

  return allItems.filter((item) => selectedIds.has(normalizeId(item.id)));
}
