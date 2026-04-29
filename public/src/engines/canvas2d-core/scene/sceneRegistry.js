function normalizeId(value = "") {
  return String(value || "").trim();
}

function normalizeIdList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeId(value))
        .filter(Boolean)
    )
  );
}

export function createSceneRegistry({ getSceneIndex, getSelectedIds } = {}) {
  let lastSelectionKey = "";
  let cachedSelectedIds = [];
  let cachedSelectedSet = new Set();

  function readSceneIndex() {
    return typeof getSceneIndex === "function" ? getSceneIndex() : null;
  }

  function readSelectedIds() {
    return typeof getSelectedIds === "function" ? normalizeIdList(getSelectedIds()) : [];
  }

  function getSelectedState() {
    const ids = readSelectedIds();
    const key = ids.join("|");
    if (key !== lastSelectionKey) {
      lastSelectionKey = key;
      cachedSelectedIds = ids;
      cachedSelectedSet = new Set(ids);
    }
    return {
      ids: cachedSelectedIds.slice(),
      set: new Set(cachedSelectedSet),
    };
  }

  function getItemById(itemId = "", expectedType = "") {
    const id = normalizeId(itemId);
    if (!id) {
      return null;
    }
    const item = readSceneIndex()?.itemById?.get(id) || null;
    if (!item) {
      return null;
    }
    if (expectedType && item.type !== expectedType) {
      return null;
    }
    return item;
  }

  function getItemsByIds(itemIds = [], expectedType = "") {
    return normalizeIdList(itemIds)
      .map((itemId) => getItemById(itemId, expectedType))
      .filter(Boolean);
  }

  function getSelectedIdsList() {
    return getSelectedState().ids;
  }

  function getSelectedSet() {
    return getSelectedState().set;
  }

  function isSelected(itemId = "") {
    return getSelectedSet().has(normalizeId(itemId));
  }

  function getSelectedItems(expectedType = "") {
    return getItemsByIds(getSelectedIdsList(), expectedType);
  }

  function getSingleSelectedId(expectedType = "") {
    const ids = getSelectedIdsList();
    if (ids.length !== 1) {
      return "";
    }
    if (!expectedType) {
      return ids[0] || "";
    }
    return getItemById(ids[0], expectedType) ? ids[0] : "";
  }

  function getSingleSelectedItem(expectedType = "") {
    const itemId = getSingleSelectedId(expectedType);
    return itemId ? getItemById(itemId, expectedType) : null;
  }

  return {
    getItemById,
    getItemsByIds,
    getSelectedIds: getSelectedIdsList,
    getSelectedSet,
    isSelected,
    getSelectedItems,
    getSingleSelectedId,
    getSingleSelectedItem,
  };
}
