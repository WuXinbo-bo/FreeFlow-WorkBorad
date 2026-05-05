function normalizeId(value = "") {
  return String(value || "").trim();
}

function toIdSet(values = []) {
  if (values instanceof Set) {
    return new Set(Array.from(values, (value) => normalizeId(value)).filter(Boolean));
  }
  return new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeId(value))
      .filter(Boolean)
  );
}

export function createOverlayVirtualizer({ nodeMap, visibleIds } = {}) {
  const nodes = nodeMap instanceof Map ? nodeMap : new Map();
  const visibleSet = visibleIds instanceof Set ? visibleIds : null;

  function removeNode(itemId = "", { onRemove } = {}) {
    const id = normalizeId(itemId);
    if (!id) {
      return null;
    }
    const node = nodes.get(id) || null;
    if (!node) {
      visibleSet?.delete(id);
      return null;
    }
    if (typeof onRemove === "function") {
      onRemove(node, id);
    } else if (typeof node.remove === "function") {
      node.remove();
    }
    nodes.delete(id);
    visibleSet?.delete(id);
    return node;
  }

  function clear({ removeNodes = true, onRemove } = {}) {
    if (removeNodes) {
      Array.from(nodes.keys()).forEach((id) => {
        removeNode(id, { onRemove });
      });
      return;
    }
    nodes.clear();
    visibleSet?.clear();
  }

  function syncActiveIds(activeIds = [], { onRemove } = {}) {
    const activeSet = toIdSet(activeIds);
    Array.from(nodes.keys()).forEach((id) => {
      if (!activeSet.has(id)) {
        removeNode(id, { onRemove });
      }
    });
    return activeSet;
  }

  function ensureNode(itemId = "", createNode) {
    const id = normalizeId(itemId);
    if (!id) {
      return null;
    }
    let node = nodes.get(id) || null;
    if (!node && typeof createNode === "function") {
      node = createNode(id) || null;
      if (node) {
        nodes.set(id, node);
      }
    }
    return node;
  }

  function hideNode(itemId = "", { onHide } = {}) {
    const id = normalizeId(itemId);
    if (!id) {
      return null;
    }
    const node = nodes.get(id) || null;
    if (node) {
      if (typeof onHide === "function") {
        onHide(node, id);
      } else if (node.style) {
        node.style.display = "none";
      }
    }
    visibleSet?.delete(id);
    return node;
  }

  function showNode(itemId = "", { onShow } = {}) {
    const id = normalizeId(itemId);
    if (!id) {
      return null;
    }
    const node = nodes.get(id) || null;
    if (node) {
      if (typeof onShow === "function") {
        onShow(node, id);
      } else if (node.style) {
        node.style.display = "block";
      }
      visibleSet?.add(id);
    }
    return node;
  }

  function syncCollection({
    items = [],
    activeIds = null,
    getId,
    createNode,
    onRemove,
    shouldHide,
    onHide,
    onShow,
    syncNode,
    hideUnprocessed = false,
  } = {}) {
    const list = Array.isArray(items) ? items : [];
    const resolveId =
      typeof getId === "function"
        ? getId
        : (item) => normalizeId(item?.id);
    const nextActiveIds =
      activeIds == null
        ? new Set(list.map((item) => resolveId(item)).filter(Boolean))
        : toIdSet(activeIds);
    syncActiveIds(nextActiveIds, { onRemove });
    const processedIds = new Set();
    list.forEach((item, index) => {
      const itemId = normalizeId(resolveId(item, index));
      if (!itemId) {
        return;
      }
      processedIds.add(itemId);
      if (typeof shouldHide === "function" && shouldHide(item, itemId, index)) {
        hideNode(itemId, { onHide });
        return;
      }
      const node = ensureNode(itemId, () => (typeof createNode === "function" ? createNode(item, itemId, index) : null));
      if (!node) {
        return;
      }
      showNode(itemId, { onShow });
      if (typeof syncNode === "function") {
        syncNode(node, item, itemId, index);
      }
    });
    if (hideUnprocessed) {
      Array.from(nodes.keys()).forEach((id) => {
        if (nextActiveIds.has(id) && !processedIds.has(id)) {
          hideNode(id, { onHide });
        }
      });
    }
    return nextActiveIds;
  }

  return {
    clear,
    ensureNode,
    getNode: (itemId = "") => nodes.get(normalizeId(itemId)) || null,
    hasNode: (itemId = "") => nodes.has(normalizeId(itemId)),
    hideNode,
    removeNode,
    showNode,
    syncCollection,
    syncActiveIds,
  };
}
