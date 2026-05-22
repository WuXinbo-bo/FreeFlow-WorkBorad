function normalizeId(value = "") {
  return String(value || "").trim();
}

function stopEventPropagation(event) {
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}

export function createStaticDisplayEventBridge({
  itemSelector = "",
  actionSelector = "",
  resolveItemById,
  selectItem,
  hideContextMenu,
  onPointerDownForward,
  onContextMenuForward,
  onDoubleClickItem,
  onClickItem,
  selectOnPointerDown = false,
  stopDoubleClickPropagation = false,
} = {}) {
  function resolveTarget(target, { includeAction = false } = {}) {
    if (!(target instanceof Element) || !itemSelector) {
      return null;
    }
    const actionTarget =
      !includeAction && actionSelector ? target.closest(actionSelector) : null;
    if (actionTarget instanceof Element) {
      return null;
    }
    const itemNode = target.closest(itemSelector);
    if (!(itemNode instanceof HTMLElement)) {
      return null;
    }
    const itemId = normalizeId(itemNode.dataset?.id);
    if (!itemId || typeof resolveItemById !== "function") {
      return null;
    }
    const item = resolveItemById(itemId) || null;
    if (!item) {
      return null;
    }
    return { target, itemNode, itemId, item };
  }

  function applySelection(context, reason, event) {
    if (typeof selectItem === "function" && context?.itemId) {
      selectItem({ ...context, reason, event });
    }
  }

  function handlePointerDown(event, options = {}) {
    const context = resolveTarget(event?.target, options);
    if (!context) {
      return false;
    }
    event.preventDefault();
    if (selectOnPointerDown) {
      applySelection(context, "pointerdown", event);
    }
    if (typeof onPointerDownForward === "function") {
      onPointerDownForward(event, context);
    }
    return true;
  }

  function handleContextMenu(event, options = {}) {
    const context = resolveTarget(event?.target, options);
    if (!context) {
      return false;
    }
    event.preventDefault();
    stopEventPropagation(event);
    if (typeof hideContextMenu === "function") {
      hideContextMenu(context, event);
    }
    applySelection(context, "contextmenu", event);
    if (typeof onContextMenuForward === "function") {
      onContextMenuForward(event, context);
    }
    return true;
  }

  function handleDoubleClick(event, options = {}) {
    const context = resolveTarget(event?.target, options);
    if (!context) {
      return false;
    }
    event.preventDefault();
    if (stopDoubleClickPropagation) {
      stopEventPropagation(event);
    }
    if (typeof onDoubleClickItem === "function") {
      onDoubleClickItem(event, context);
    }
    return true;
  }

  function handleClick(event, options = {}) {
    const context = resolveTarget(event?.target, options);
    if (!context) {
      return false;
    }
    if (typeof onClickItem === "function") {
      onClickItem(event, context);
      return true;
    }
    applySelection(context, "click", event);
    return true;
  }

  return {
    handleClick,
    handleContextMenu,
    handleDoubleClick,
    handlePointerDown,
    resolveTarget,
  };
}
