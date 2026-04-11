const DEFAULT_DRAG_THRESHOLD = 4;
const DEFAULT_LONG_PRESS_MS = 120;

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || min, min), max);
}

function getPointerTargetElement(event) {
  return event.target instanceof Element ? event.target : null;
}

function isResizeHandle(target) {
  const handle = target?.closest?.("[data-canvas-image-resize]");
  if (!handle) return null;
  return {
    element: handle,
    itemId: String(handle.dataset.canvasImageResize || "").trim(),
    handle: String(handle.dataset.canvasImageResizeHandle || "right").trim() || "right",
  };
}

function resolveCanvasDropZone({ clientX, clientY }, refs) {
  const element = document.elementFromPoint(clientX, clientY);
  if (!element) return "outside";
  if (refs.chatFormEl?.contains(element) || element.closest?.(".conversation-panel")) {
    return "composer";
  }
  if (refs.screenSourcePanelEl?.contains(element) || refs.screenSourceHeaderSlotEl?.contains(element)) {
    return "screen";
  }
  if (refs.canvasViewportEl?.contains(element)) {
    return "canvas";
  }
  return "outside";
}

function getResizeGeometry(gesture, event, scale) {
  const dx = (event.clientX - gesture.startX) / scale;
  const dy = (event.clientY - gesture.startY) / scale;
  const minWidth = gesture.minWidth;
  const minHeight = gesture.minHeight;
  const maxWidth = gesture.maxWidth;
  const maxHeight = gesture.maxHeight;

  const handle = gesture.handle;
  const isLeft = handle.includes("left");
  const isRight = handle.includes("right");
  const isTop = handle.includes("top");
  const isBottom = handle.includes("bottom");
  const isCorner = isLeft || isRight ? isTop || isBottom : false;

  let x = gesture.startItem.x;
  let y = gesture.startItem.y;
  let width = gesture.startItem.width;
  let height = gesture.startItem.height;

  if (isCorner && event.shiftKey) {
    const ratio = gesture.aspectRatio || 1;
    const useHorizontal = Math.abs(dx) >= Math.abs(dy);
    if (isLeft && useHorizontal) {
      width = clamp(gesture.startItem.width - dx, minWidth, maxWidth);
      height = clamp(width / ratio, minHeight, maxHeight);
      x = gesture.startItem.x + (gesture.startItem.width - width);
      if (isTop) {
        y = gesture.startItem.y + (gesture.startItem.height - height);
      }
    } else if (isRight && useHorizontal) {
      width = clamp(gesture.startItem.width + dx, minWidth, maxWidth);
      height = clamp(width / ratio, minHeight, maxHeight);
      if (isTop) {
        y = gesture.startItem.y + (gesture.startItem.height - height);
      }
    } else if (isTop) {
      height = clamp(gesture.startItem.height - dy, minHeight, maxHeight);
      width = clamp(height * ratio, minWidth, maxWidth);
      y = gesture.startItem.y + (gesture.startItem.height - height);
      if (isLeft) {
        x = gesture.startItem.x + (gesture.startItem.width - width);
      }
    } else if (isBottom) {
      height = clamp(gesture.startItem.height + dy, minHeight, maxHeight);
      width = clamp(height * ratio, minWidth, maxWidth);
      if (isLeft) {
        x = gesture.startItem.x + (gesture.startItem.width - width);
      }
    }
    return { x, y, width, height };
  }

  if (isLeft) {
    width = clamp(gesture.startItem.width - dx, minWidth, maxWidth);
    x = gesture.startItem.x + (gesture.startItem.width - width);
  } else if (isRight) {
    width = clamp(gesture.startItem.width + dx, minWidth, maxWidth);
  }

  if (isTop) {
    height = clamp(gesture.startItem.height - dy, minHeight, maxHeight);
    y = gesture.startItem.y + (gesture.startItem.height - height);
  } else if (isBottom) {
    height = clamp(gesture.startItem.height + dy, minHeight, maxHeight);
  }

  return { x, y, width, height };
}

function getCanvasItemInteractionId(target) {
  const itemEl = target?.closest?.("[data-canvas-item-id]");
  if (!itemEl) return "";
  return String(itemEl.dataset.canvasItemId || "").trim();
}

export function createCanvasItemInteractionController(options = {}) {
  const refs = {
    canvasViewportEl: options.canvasViewportEl || null,
    chatFormEl: options.chatFormEl || null,
    screenSourcePanelEl: options.screenSourcePanelEl || null,
    screenSourceHeaderSlotEl: options.screenSourceHeaderSlotEl || null,
  };

  const api = {
    getState: options.getState,
    getCanvasItemById: options.getCanvasItemById,
    getSelectedCanvasItems: options.getSelectedCanvasItems,
    setSelectionToCanvasItem: options.setSelectionToCanvasItem,
    clearCanvasSelection: options.clearCanvasSelection,
    renderCanvasBoard: options.renderCanvasBoard,
    saveCanvasBoardToStorage: options.saveCanvasBoardToStorage,
    setCanvasStatus: options.setCanvasStatus,
    closeCanvasContextMenu: options.closeCanvasContextMenu,
    openCanvasContextMenu: options.openCanvasContextMenu,
    openCanvasImageLightbox: options.openCanvasImageLightbox,
    startEditingCanvasTextbox: options.startEditingCanvasTextbox,
    openCanvasItem: options.openCanvasItem,
    createCanvasTextboxAt: options.createCanvasTextboxAt,
    updateCanvasView: options.updateCanvasView,
    onExternalDrop: options.onExternalDrop,
    isEditableElement: options.isEditableElement,
    getCanvasPositionFromClientPoint: options.getCanvasPositionFromClientPoint,
    setActiveClipboardZone: options.setActiveClipboardZone,
  };

  const gesture = {
    leftPress: null,
    leftDrag: null,
    rightPress: null,
    rightDrag: null,
    resize: null,
    pan: null,
    suppressContextMenu: false,
  };

  function getState() {
    return typeof api.getState === "function" ? api.getState() : null;
  }

  function getScale() {
    return Number(getState()?.canvasBoard?.view?.scale) || 1;
  }

  function getSelectedIds() {
    const state = getState();
    return Array.isArray(state?.canvasBoard?.selectedIds) ? state.canvasBoard.selectedIds : [];
  }

  function beginMoveGesture(event, itemId) {
    const state = getState();
    const item = api.getCanvasItemById?.(itemId);
    if (!state || !item) return;

    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const beforeSelection = getSelectedIds().slice();
    const wasSelected = beforeSelection.includes(itemId);
    if (additive) {
      api.setSelectionToCanvasItem?.(itemId, { additive: true });
      api.renderCanvasBoard?.();
      api.saveCanvasBoardToStorage?.();
    } else if (!wasSelected) {
      api.setSelectionToCanvasItem?.(itemId);
      api.renderCanvasBoard?.();
      api.saveCanvasBoardToStorage?.();
    }

    gesture.leftPress = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      itemIds: additive ? [itemId] : wasSelected ? beforeSelection : [itemId],
    };
  }

  function beginResizeGesture(event, resizeHandle) {
    const item = api.getCanvasItemById?.(resizeHandle.itemId);
    if (!item || item.kind !== "image") return;

    api.setSelectionToCanvasItem?.(item.id);
    api.renderCanvasBoard?.();
    api.saveCanvasBoardToStorage?.();

    gesture.resize = {
      pointerId: event.pointerId,
      itemId: item.id,
      handle: resizeHandle.handle,
      startX: event.clientX,
      startY: event.clientY,
      startItem: {
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        width: Math.max(180, Number(item.width) || 0),
        height: Math.max(140, Number(item.height) || 0),
      },
      aspectRatio: Math.max(0.01, (Number(item.width) || 1) / Math.max(1, Number(item.height) || 1)),
      minWidth: 180,
      minHeight: 140,
      maxWidth: 720,
      maxHeight: 720,
    };
  }

  function beginRightDrag(event, itemId) {
    const item = api.getCanvasItemById?.(itemId);
    if (!item) return;

    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const beforeSelection = getSelectedIds().slice();
    const wasSelected = beforeSelection.includes(itemId);
    if (additive) {
      api.setSelectionToCanvasItem?.(itemId, { additive: true });
      api.renderCanvasBoard?.();
      api.saveCanvasBoardToStorage?.();
    } else if (!wasSelected) {
      api.setSelectionToCanvasItem?.(itemId);
      api.renderCanvasBoard?.();
      api.saveCanvasBoardToStorage?.();
    }

    gesture.rightPress = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      itemIds: additive ? [itemId] : wasSelected ? beforeSelection : [itemId],
    };
  }

  function beginPanGesture(event) {
    gesture.pan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: Number(getState()?.canvasBoard?.view?.offsetX) || 0,
      offsetY: Number(getState()?.canvasBoard?.view?.offsetY) || 0,
    };
  }

  function beginMoveDragIfNeeded(event) {
    if (!gesture.leftPress || event.pointerId !== gesture.leftPress.pointerId || gesture.leftDrag) return;
    const deltaX = event.clientX - gesture.leftPress.startX;
    const deltaY = event.clientY - gesture.leftPress.startY;
    const travel = Math.hypot(deltaX, deltaY);
    if (travel < DEFAULT_DRAG_THRESHOLD || performance.now() - gesture.leftPress.startedAt < DEFAULT_LONG_PRESS_MS) {
      return;
    }

    gesture.leftDrag = {
      pointerId: gesture.leftPress.pointerId,
      startX: gesture.leftPress.startX,
      startY: gesture.leftPress.startY,
      items: gesture.leftPress.itemIds
        .map((itemId) => {
          const item = api.getCanvasItemById?.(itemId);
          return item
            ? {
                id: item.id,
                x: Number(item.x) || 0,
                y: Number(item.y) || 0,
              }
            : null;
        })
        .filter(Boolean),
    };
  }

  function beginRightDragIfNeeded(event) {
    if (!gesture.rightPress || event.pointerId !== gesture.rightPress.pointerId || gesture.rightDrag) return;
    const deltaX = event.clientX - gesture.rightPress.startX;
    const deltaY = event.clientY - gesture.rightPress.startY;
    const travel = Math.hypot(deltaX, deltaY);
    if (travel < DEFAULT_DRAG_THRESHOLD || performance.now() - gesture.rightPress.startedAt < DEFAULT_LONG_PRESS_MS) {
      return;
    }

    gesture.rightDrag = {
      pointerId: gesture.rightPress.pointerId,
      startX: gesture.rightPress.startX,
      startY: gesture.rightPress.startY,
      items: gesture.rightPress.itemIds
        .map((itemId) => api.getCanvasItemById?.(itemId))
        .filter(Boolean),
    };
  }

  function updateMoveDrag(event) {
    if (!gesture.leftDrag || event.pointerId !== gesture.leftDrag.pointerId) return false;
    const state = getState();
    if (!state) return false;
    const scale = getScale();
    const deltaX = (event.clientX - gesture.leftDrag.startX) / scale;
    const deltaY = (event.clientY - gesture.leftDrag.startY) / scale;

    for (const entry of gesture.leftDrag.items) {
      const item = api.getCanvasItemById?.(entry.id);
      if (!item) continue;
      item.x = entry.x + deltaX;
      item.y = entry.y + deltaY;
    }
    api.renderCanvasBoard?.();
    return true;
  }

  function updateResizeDrag(event) {
    if (!gesture.resize || event.pointerId !== gesture.resize.pointerId) return false;
    const item = api.getCanvasItemById?.(gesture.resize.itemId);
    if (!item || item.kind !== "image") return false;
    const scale = getScale();
    const geometry = getResizeGeometry(gesture.resize, event, scale);
    item.x = geometry.x;
    item.y = geometry.y;
    item.width = geometry.width;
    item.height = geometry.height;
    api.renderCanvasBoard?.();
    return true;
  }

  function updatePanDrag(event) {
    if (!gesture.pan || event.pointerId !== gesture.pan.pointerId) return false;
    api.updateCanvasView?.(
      {
        offsetX: gesture.pan.offsetX + (event.clientX - gesture.pan.startX),
        offsetY: gesture.pan.offsetY + (event.clientY - gesture.pan.startY),
      },
      { persist: false }
    );
    return true;
  }

  function handleExternalDrop(event) {
    if (!gesture.rightDrag || event.pointerId !== gesture.rightDrag.pointerId) return false;
    const items = gesture.rightDrag.items.slice();
    gesture.suppressContextMenu = true;
    const zone = resolveCanvasDropZone(event, refs);
    if (typeof api.onExternalDrop === "function") {
      api.onExternalDrop(items, zone, event);
    }
    gesture.rightDrag = null;
    gesture.rightPress = null;
    return true;
  }

  function getItemElement(target) {
    const itemId = getCanvasItemInteractionId(target);
    if (!itemId) return null;
    return {
      itemId,
      element: target?.closest?.("[data-canvas-item-id]") || null,
    };
  }

  return {
    handlePointerDown(event) {
      const target = getPointerTargetElement(event);
      if (!target || !refs.canvasViewportEl?.contains(target)) return;

      api.closeCanvasContextMenu?.();

      const resizeHandle = isResizeHandle(target);
      if (resizeHandle && event.button === 0) {
        event.preventDefault();
        event.stopPropagation();
        beginResizeGesture(event, resizeHandle);
        return;
      }

      const item = getItemElement(target);
      if (item && !(target instanceof HTMLInputElement) && !api.isEditableElement?.(target)) {
        event.preventDefault();
        event.stopPropagation();
        if (event.button === 2) {
          beginRightDrag(event, item.itemId);
          return;
        }
        if (event.button === 0) {
          beginMoveGesture(event, item.itemId);
        }
        return;
      }

      if (event.button !== 0) return;
      if (getSelectedIds().length) {
        api.clearCanvasSelection?.({ persist: true, statusText: "已取消素材卡选择" });
      }
      beginPanGesture(event);
    },

    handlePointerMove(event) {
      beginMoveDragIfNeeded(event);
      beginRightDragIfNeeded(event);
      if (updateResizeDrag(event)) return;
      if (updateMoveDrag(event)) return;
      if (gesture.rightDrag && event.pointerId === gesture.rightDrag.pointerId) return;
      updatePanDrag(event);
    },

    handlePointerUp(event) {
      if (gesture.resize && event.pointerId === gesture.resize.pointerId) {
        const item = api.getCanvasItemById?.(gesture.resize.itemId);
        const status = item?.kind === "image" ? "图片素材卡尺寸已更新" : "素材卡尺寸已更新";
        gesture.resize = null;
        api.saveCanvasBoardToStorage?.();
        if (status) api.setCanvasStatus?.(status);
      }

      if (gesture.leftPress && event.pointerId === gesture.leftPress.pointerId) {
        gesture.leftPress = null;
      }

      if (gesture.leftDrag && event.pointerId === gesture.leftDrag.pointerId) {
        const movedCount = gesture.leftDrag.items.length;
        gesture.leftDrag = null;
        api.saveCanvasBoardToStorage?.();
        api.setCanvasStatus?.(movedCount > 1 ? `已同步移动 ${movedCount} 个素材卡` : "素材卡位置已更新");
      }

      if (gesture.rightPress && event.pointerId === gesture.rightPress.pointerId && !gesture.rightDrag) {
        gesture.rightPress = null;
      }

      if (gesture.rightDrag && event.pointerId === gesture.rightDrag.pointerId) {
        handleExternalDrop(event);
      }

      if (gesture.pan && event.pointerId === gesture.pan.pointerId) {
        gesture.pan = null;
        api.saveCanvasBoardToStorage?.();
      }
    },

    handleClick(event) {
      const target = getPointerTargetElement(event);
      if (!target) return;
      if (target.closest?.("[data-canvas-item-id]") || api.isEditableElement?.(target) || target.closest?.("button")) {
        return;
      }
      api.clearCanvasSelection?.({ persist: true, statusText: "已取消素材卡选择" });
    },

    handleDoubleClick(event) {
      const target = getPointerTargetElement(event);
      if (!target) return;
      const itemEl = target.closest?.("[data-canvas-item-id]");
      if (itemEl) {
        event.preventDefault();
        const item = api.getCanvasItemById?.(String(itemEl.dataset.canvasItemId || "").trim());
        if (!item) return;
        if (item.kind === "image") {
          api.openCanvasImageLightbox?.(item);
          return;
        }
        if (item.kind === "textbox" || item.kind === "text") {
          api.startEditingCanvasTextbox?.(item.id);
          return;
        }
        api.openCanvasItem?.(item).catch((error) => {
          api.setCanvasStatus?.(`打开素材失败：${error.message}`);
        });
        return;
      }

      if (api.isEditableElement?.(target) || target.closest?.(".canvas-card") || target.closest?.("button")) {
        return;
      }
      event.preventDefault();
      api.createCanvasTextboxAt?.(event.clientX, event.clientY);
    },

    handleContextMenu(event) {
      const target = getPointerTargetElement(event);
      if (!target || !refs.canvasViewportEl?.contains(target)) return;
      if (gesture.suppressContextMenu) {
        event.preventDefault();
        gesture.suppressContextMenu = false;
        return;
      }
      if (api.isEditableElement?.(target)) return;

      event.preventDefault();
      api.setActiveClipboardZone?.("canvas");
      const itemEl = target.closest?.("[data-canvas-item-id]");
      if (itemEl) {
        const itemId = String(itemEl.dataset.canvasItemId || "").trim();
        if (!getSelectedIds().includes(itemId)) {
          api.setSelectionToCanvasItem?.(itemId);
          api.renderCanvasBoard?.();
          api.saveCanvasBoardToStorage?.();
        }
      } else if (getSelectedIds().length) {
        api.clearCanvasSelection?.({ persist: true });
      }
      api.openCanvasContextMenu?.(event.clientX, event.clientY);
    },
  };
}
