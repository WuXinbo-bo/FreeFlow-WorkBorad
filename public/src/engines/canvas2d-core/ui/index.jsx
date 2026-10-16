import { FileCardAttachedPreview } from "./FileCardAttachedPreview.jsx";
import { FileConversionDialog } from "./FileConversionDialog.jsx";
import { createWorkspaceSearchIndex } from "../search/workspaceSearchIndex.js";
import React, { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createCanvas2DReactBridge } from "../reactBridge.js";
import {
  createCanvasTutorialBridge,
  createCanvasTutorialRuntime,
  CanvasTutorialOverlay,
} from "../tutorial-system/canvasTutorialIndex.js";
import { CanvasSearchOverlay } from "../search/canvasSearchOverlay.jsx";
import { WordExportPreviewDialog } from "./WordExportPreviewDialog.jsx";
import { BoardWorkspacePanel } from "./BoardWorkspacePanel.jsx";
import { AppIcon } from "../../../ui/icons/AppIcon.jsx";
import { CanvasImageManagerDialog } from "./CanvasImageManagerDialog.jsx";
import { CanvasOptionsPanel } from "./CanvasOptionsPanel.jsx";
import {
  buildCanvasSearchIndex,
  buildCanvasSearchResults,
  collectCanvasSearchStats,
  getCanvasSearchScopeItems,
  CANVAS_SEARCH_FILTER_KEYS,
} from "../search/canvasSearchIndex.js";
import { getElementBounds } from "../elements/index.js";
import { computeAnchoredMenuPlacement } from "../menuPositioning.js";
import { dispatchTutorialUiEvent, subscribeTutorialUiEvent } from "../../../tutorial-core/tutorialEventBus.js";
import { TUTORIAL_EVENT_TYPES } from "../../../tutorial-core/tutorialTypes.js";

const DRAW_TOOLS = [
  { key: "rect", icon: "square", label: "矩形", shortcut: "R", group: "形状" },
  { key: "roundRect", icon: "rectangle-horizontal", label: "圆角矩形", shortcut: "Q", group: "形状" },
  { key: "ellipse", icon: "circle", label: "椭圆", shortcut: "E", group: "形状" },
  { key: "diamond", icon: "diamond", label: "菱形", shortcut: "D", group: "形状" },
  { key: "arrow", icon: "arrow-up-right", label: "箭头", shortcut: "A", group: "线条" },
  { key: "line", icon: "minus", label: "直线", shortcut: "L", group: "线条" },
  { key: "highlight", icon: "highlighter", label: "高亮", shortcut: "M", group: "标注" },
];

const INSERT_TOOLS = [
  {
    key: "table",
    icon: "table",
    label: "表格",
    meta: "3 × 3，可继续编辑",
    shortcut: "Table",
  },
  {
    key: "codeBlock",
    icon: "code",
    label: "代码块",
    meta: "支持语言与行号",
    shortcut: "Code",
  },
];

function isWorkspacePanelResizeActive() {
  return Boolean(document.body?.classList.contains("is-pane-resizing"));
}

function ChevronIcon({ open = false }) {
  return <AppIcon name="chevron-down" size={16} className={`canvas2d-engine-menu-chevron${open ? " is-open" : ""}`} />;
}

function FloatingToolbarMenu({
  open,
  anchorRef,
  boundaryRef,
  panelRef,
  align = "start",
  layoutKey = "",
  className = "",
  surfaceClassName = "canvas2d-engine-menu",
  preferredWidth = 0,
  role = "menu",
  ariaLabel,
  children,
}) {
  useLayoutEffect(() => {
    if (!open || !(panelRef.current instanceof HTMLElement) || !(anchorRef.current instanceof HTMLElement)) {
      return undefined;
    }
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    let frameId = 0;
    const updatePosition = () => {
      frameId = 0;
      if (!panel.isConnected || !anchor.isConnected) {
        return;
      }
      const viewportBoundary = {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const rootRect = boundaryRef.current?.getBoundingClientRect?.();
      const boundaryRect = rootRect?.width && rootRect?.height ? rootRect : viewportBoundary;
      panel.style.visibility = "hidden";
      panel.style.width = preferredWidth ? `${Math.min(preferredWidth, Math.max(0, boundaryRect.width - 24))}px` : "max-content";
      panel.style.maxWidth = `${Math.max(120, Math.round(boundaryRect.width - 24))}px`;
      panel.style.maxHeight = `${Math.max(120, Math.round(boundaryRect.height - 24))}px`;
      const panelRect = panel.getBoundingClientRect();
      const placement = computeAnchoredMenuPlacement({
        anchorRect: anchor.getBoundingClientRect(),
        panelRect,
        boundaryRect,
        align,
      });
      panel.style.width = `${Math.min(Math.ceil(panelRect.width), placement.maxWidth)}px`;
      panel.style.left = `${placement.left}px`;
      panel.style.top = `${placement.top}px`;
      panel.style.maxWidth = `${placement.maxWidth}px`;
      panel.style.maxHeight = `${placement.maxHeight}px`;
      panel.dataset.placementX = placement.placementX;
      panel.dataset.placementY = placement.placementY;
      panel.style.visibility = "visible";
    };
    const schedulePosition = () => {
      if (!frameId) {
        frameId = requestAnimationFrame(updatePosition);
      }
    };
    updatePosition();
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    window.addEventListener("freeflow:workspace-panel-resize-end", schedulePosition);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedulePosition) : null;
    observer?.observe(anchor);
    observer?.observe(panel);
    if (boundaryRef.current instanceof HTMLElement) {
      observer?.observe(boundaryRef.current);
    }
    const stage = boundaryRef.current?.closest(".desktop-clear-stage");
    const moveObserver = stage && typeof MutationObserver === "function" ? new MutationObserver(schedulePosition) : null;
    moveObserver?.observe(stage, { attributes: true, attributeFilter: ["style", "class"] });
    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      observer?.disconnect();
      moveObserver?.disconnect();
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
      window.removeEventListener("freeflow:workspace-panel-resize-end", schedulePosition);
    };
  }, [align, anchorRef, boundaryRef, layoutKey, open, panelRef, preferredWidth]);

  if (!open || typeof document === "undefined") {
    return null;
  }
  const portalHost = document.getElementById("global-overlay-layer") || document.body;
  return createPortal(
    <div
      ref={panelRef}
      className={`${surfaceClassName} canvas2d-engine-menu-portal${className ? ` ${className}` : ""}`.trim()}
      role={role}
      aria-label={ariaLabel}
      data-shape-include="true"
      data-shape-padding="0"
      style={{ visibility: "hidden" }}
    >
      {children}
    </div>,
    portalHost
  );
}

function formatPathLabel(pathValue = "", emptyText = "未设置") {
  const value = String(pathValue || "").trim();
  if (!value) {
    return emptyText;
  }
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 2) {
    return value;
  }
  return `.../${segments.slice(-2).join("/")}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getNavigatorTypeLabel(type = "") {
  const labels = {
    text: "文本",
    flowNode: "节点",
    mindNode: "导图",
    mindSummary: "摘要",
    fileCard: "文件",
    codeBlock: "代码",
    table: "表格",
    image: "图片",
    shape: "图形",
  };
  return labels[String(type || "")] || "元素";
}

function toChineseSectionNumber(value = 0) {
  const number = Math.max(1, Math.floor(Number(value) || 0));
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (number <= 10) {
    return number === 10 ? "十" : digits[number];
  }
  if (number < 20) {
    return `十${digits[number % 10]}`;
  }
  if (number < 100) {
    const tens = Math.floor(number / 10);
    const units = number % 10;
    return `${digits[tens]}十${units ? digits[units] : ""}`;
  }
  return String(number);
}

function getNavigatorEntryOrderLabel(depth = 0, index = 0) {
  const order = Math.max(1, Number(index) + 1);
  if (depth <= 0) {
    return `${toChineseSectionNumber(order)}、`;
  }
  if (depth === 1) {
    return `${order}.`;
  }
  if (depth === 2) {
    return `(${order})`;
  }
  return `${order})`;
}

function buildLocalNavigatorTree(entries = []) {
  const cloned = (Array.isArray(entries) ? entries : []).map((entry) => ({
    ...entry,
    children: [],
  }));
  const byId = new Map(cloned.map((entry) => [entry.id, entry]));
  const roots = [];
  cloned.forEach((entry) => {
    const parent = entry.parentId ? byId.get(entry.parentId) : null;
    if (!parent || parent.id === entry.id) {
      roots.push(entry);
      return;
    }
    parent.children.push(entry);
  });
  function sortChildren(nodes = []) {
    nodes.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    nodes.forEach((node) => sortChildren(node.children));
  }
  sortChildren(roots);
  return roots;
}

function flattenNavigatorEntries(entries = [], includeCollapsedChildren = false, result = []) {
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry) {
      return;
    }
    result.push(entry);
    if (includeCollapsedChildren || entry.collapsed !== true) {
      flattenNavigatorEntries(entry.children, includeCollapsedChildren, result);
    }
  });
  return result;
}

function CanvasNavigatorPanel({
  navigator,
  onOpenWorkspace,
  onCollapse,
  onFocusEntry,
  onPreviewEntry,
  onRenameEntry,
  onRemoveEntry,
  onSetParent,
  onToggleEntry,
  onAddFolder,
  onPickFolderTarget,
  onCancelPickFolderTarget,
  pendingTargetFolderId = "",
}) {
  const [editingId, setEditingId] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [orderVisible, setOrderVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [menuState, setMenuState] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [selectedEntryIds, setSelectedEntryIds] = useState([]);
  const rowRefs = useRef(new Map());
  const rowMetaRef = useRef(new Map());
  const panelRef = useRef(null);
  const dragRuntimeRef = useRef(null);
  const suppressNavigatorClickRef = useRef(false);
  const selectionAnchorRef = useRef("");
  const entries = Array.isArray(navigator?.entries) ? navigator.entries : [];
  const localCollapsedRef = useRef(new Map());
  entries.forEach((entry) => {
    if (localCollapsedRef.current.get(entry.id) === entry.collapsed) {
      localCollapsedRef.current.delete(entry.id);
    }
  });
  const entriesWithLocalCollapse = entries.map((entry) => {
    if (!localCollapsedRef.current.has(entry.id)) {
      return entry;
    }
    return {
      ...entry,
      collapsed: localCollapsedRef.current.get(entry.id) === true,
    };
  });
  const rootEntries = buildLocalNavigatorTree(
    Array.isArray(navigator?.rootEntries) ? entriesWithLocalCollapse : entriesWithLocalCollapse.filter((entry) => !entry.parentId)
  );
  const collapsed = navigator?.collapsed === true;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRoots = normalizedQuery
    ? entriesWithLocalCollapse.filter((entry) =>
        `${entry.title || ""} ${entry.targetTitle || ""} ${entry.type || ""} ${entry.kind || ""}`.toLowerCase().includes(normalizedQuery)
      )
    : rootEntries;
  const entryById = new Map(entriesWithLocalCollapse.map((entry) => [entry.id, entry]));
  const visibleEntryOrder = normalizedQuery ? visibleRoots : flattenNavigatorEntries(visibleRoots);
  const visibleEntryIds = visibleEntryOrder.map((entry) => entry.id);
  const selectedEntryIdSet = new Set(selectedEntryIds.filter((entryId) => entryById.has(entryId)));

  const isEntryDescendantOfAny = (entryId, ancestorIdSet) => {
    let current = entryById.get(entryId);
    while (current?.parentId) {
      const parentId = String(current.parentId || "").trim();
      if (!parentId) {
        return false;
      }
      if (ancestorIdSet.has(parentId)) {
        return true;
      }
      current = entryById.get(parentId);
    }
    return false;
  };

  const getRootSelectionIds = (ids = []) => {
    const cleanIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((entryId) => String(entryId || "").trim()).filter(Boolean)));
    const idSet = new Set(cleanIds);
    return cleanIds.filter((entryId) => !isEntryDescendantOfAny(entryId, idSet));
  };

  const updateSelectionFromEntry = (entryId, options = {}) => {
    const id = String(entryId || "").trim();
    if (!id || !entryById.has(id)) {
      return;
    }
    const extendRange = options.extendRange === true;
    const toggle = options.toggle === true;
    if (extendRange) {
      const anchorId = selectionAnchorRef.current && visibleEntryIds.includes(selectionAnchorRef.current) ? selectionAnchorRef.current : id;
      const anchorIndex = visibleEntryIds.indexOf(anchorId);
      const targetIndex = visibleEntryIds.indexOf(id);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const [start, end] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        setSelectedEntryIds(visibleEntryIds.slice(start, end + 1));
        return;
      }
    }
    if (toggle) {
      setSelectedEntryIds((current) => {
        const set = new Set(current);
        if (set.has(id)) {
          set.delete(id);
        } else {
          set.add(id);
        }
        return Array.from(set);
      });
      selectionAnchorRef.current = id;
      return;
    }
    selectionAnchorRef.current = id;
    setSelectedEntryIds([id]);
  };

  const removeNavigatorEntries = (entryIds = []) => {
    const orderedIds = Array.from(new Set((Array.isArray(entryIds) ? entryIds : []).map((entryId) => String(entryId || "").trim()).filter(Boolean)))
      .map((entryId) => entryById.get(entryId))
      .filter(Boolean)
      .sort((a, b) => (Number(b.depth || 0) || 0) - (Number(a.depth || 0) || 0))
      .map((entry) => entry.id);
    if (!orderedIds.length) {
      return;
    }
    orderedIds.forEach((entryId) => onRemoveEntry?.(entryId));
    setSelectedEntryIds((current) => current.filter((entryId) => !orderedIds.includes(entryId)));
    if (selectionAnchorRef.current && orderedIds.includes(selectionAnchorRef.current)) {
      selectionAnchorRef.current = "";
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        className="canvas2d-navigator-tab"
        onClick={() => onCollapse?.(false)}
        aria-label="展开画布目录"
        title="展开画布目录"
      >
        <span className="canvas2d-navigator-tab-icon" aria-hidden="true">
          <AppIcon name="list-ordered" size={18} />
        </span>
        <span className="canvas2d-navigator-tab-label">画布目录</span>
      </button>
    );
  }

  const commitRename = () => {
    if (!editingId) {
      return;
    }
    const clean = titleDraft.trim();
    if (clean) {
      onRenameEntry?.(editingId, clean);
    }
    setEditingId("");
    setTitleDraft("");
  };
  const closeEntryMenu = () => setMenuState(null);
  const openEntryMenu = (event, entry, isFolder) => {
    event.preventDefault();
    event.stopPropagation();
    const panelRect = panelRef.current?.getBoundingClientRect();
    if (!panelRect) {
      return;
    }
    const menuWidth = 128;
    const isContextMenu = event.type === "contextmenu";
    const anchorRect = event.currentTarget.getBoundingClientRect();
    const rawLeft = isContextMenu
      ? Number(event.clientX || 0) - panelRect.left
      : anchorRect.right - panelRect.left - menuWidth;
    const rawTop = isContextMenu
      ? Number(event.clientY || 0) - panelRect.top
      : anchorRect.bottom - panelRect.top + 6;
    const left = Math.min(Math.max(8, rawLeft), Math.max(8, panelRect.width - menuWidth - 8));
    const top = Math.min(Math.max(8, rawTop), Math.max(8, panelRect.height - 116));
    setMenuState({
      entryId: entry.id,
      isFolder,
      x: left,
      y: top,
    });
  };
  const getDropTargetFromPoint = (clientX, clientY, draggingId) => {
    const draggingIds = new Set(
      Array.isArray(dragRuntimeRef.current?.entryIds) && dragRuntimeRef.current.entryIds.length
        ? dragRuntimeRef.current.entryIds
        : [draggingId]
    );
    let best = null;
    rowRefs.current.forEach((node, id) => {
      if (!node || draggingIds.has(id) || isEntryDescendantOfAny(id, draggingIds)) {
        return;
      }
      const rect = node.getBoundingClientRect();
      if (clientY < rect.top || clientY > rect.bottom) {
        return;
      }
      best = { id, rect };
    });
    if (!best) {
      return null;
    }
    const meta = rowMetaRef.current.get(best.id);
    if (!meta?.entry) {
      return null;
    }
    const insideFolder = meta.entry.kind === "folder" && clientX > best.rect.left + 42;
    if (insideFolder) {
      const childMetas = [];
      rowMetaRef.current.forEach((candidateMeta, candidateId) => {
        const candidateNode = rowRefs.current.get(candidateId);
        if (
          !candidateNode ||
          !candidateMeta?.entry ||
          candidateMeta.parentId !== meta.entry.id ||
          draggingIds.has(candidateId) ||
          isEntryDescendantOfAny(candidateId, draggingIds)
        ) {
          return;
        }
        childMetas.push({
          rect: candidateNode.getBoundingClientRect(),
          order: Number(candidateMeta.entry.order) || 0,
        });
      });
      childMetas.sort((a, b) => a.order - b.order);
      let insertIndex = childMetas.length;
      for (let index = 0; index < childMetas.length; index += 1) {
        const childMeta = childMetas[index];
        const midpoint = childMeta.rect.top + childMeta.rect.height / 2;
        if (clientY <= midpoint) {
          insertIndex = index;
          break;
        }
      }
      return {
        overId: meta.entry.id,
        parentId: meta.entry.id,
        index: insertIndex,
        mode: "inside",
      };
    }
    const after = clientY > best.rect.top + best.rect.height / 2;
    return {
      overId: meta.entry.id,
      parentId: meta.parentId || "",
      index: meta.index + (after ? 1 : 0),
      mode: after ? "after" : "before",
    };
  };
  const clearNavigatorDrag = () => {
    const runtime = dragRuntimeRef.current;
    if (runtime?.timer) {
      clearTimeout(runtime.timer);
    }
    dragRuntimeRef.current = null;
    setDragState(null);
  };
  const beginNavigatorDrag = (event, entry) => {
    const target = event.target instanceof Element ? event.target : null;
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (
      event.button !== 0 ||
      editingId ||
      target?.closest("input, .canvas2d-navigator-tree-toggle, .canvas2d-navigator-entry-actions button")
    ) {
      return;
    }
    event.stopPropagation();
    const pointerId = event.pointerId;
    const selectedIds = selectedEntryIdSet.has(entry.id) ? getRootSelectionIds(selectedEntryIds) : [entry.id];
    dragRuntimeRef.current = {
      entryId: entry.id,
      entryIds: selectedIds,
      pointerId,
      timer: window.setTimeout(() => {
        event.preventDefault();
        suppressNavigatorClickRef.current = true;
        setDragState({
          active: true,
          entryId: entry.id,
          entryIds: selectedIds,
          x: event.clientX,
          y: event.clientY,
          drop: null,
        });
      }, 220),
    };
    event.currentTarget.setPointerCapture?.(pointerId);
  };
  const updateNavigatorDrag = (event) => {
    const runtime = dragRuntimeRef.current;
    if (!runtime || runtime.pointerId !== event.pointerId) {
      return;
    }
    event.stopPropagation();
    if (!dragState?.active) {
      return;
    }
    event.preventDefault();
    const drop = getDropTargetFromPoint(event.clientX, event.clientY, runtime.entryId);
    setDragState({
      active: true,
      entryId: runtime.entryId,
      entryIds: runtime.entryIds,
      x: event.clientX,
      y: event.clientY,
      drop,
    });
  };
  const finishNavigatorDrag = (event) => {
    const runtime = dragRuntimeRef.current;
    if (!runtime || runtime.pointerId !== event.pointerId) {
      return;
    }
    event.stopPropagation();
    if (!dragState?.active) {
      clearNavigatorDrag();
      return;
    }
    event.preventDefault();
    if (dragState?.active && dragState.drop) {
      const movingIds = Array.isArray(runtime.entryIds) && runtime.entryIds.length ? runtime.entryIds : [runtime.entryId];
      movingIds.forEach((entryId, index) => {
        onSetParent?.(entryId, dragState.drop.parentId, Number(dragState.drop.index) + index);
      });
    }
    clearNavigatorDrag();
    window.setTimeout(() => {
      suppressNavigatorClickRef.current = false;
    }, 0);
  };
  const handleNavigatorEntryClick = (event, entry, canFocus) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      suppressNavigatorClickRef.current ||
      target?.closest("input, .canvas2d-navigator-tree-toggle, .canvas2d-navigator-entry-actions button")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      updateSelectionFromEntry(entry.id, { extendRange: true });
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      updateSelectionFromEntry(entry.id, { toggle: true });
      return;
    }
    updateSelectionFromEntry(entry.id);
    if (!canFocus) {
      return;
    }
    onFocusEntry?.(entry.targetId || entry.id);
  };
  const handleNavigatorKeyDown = (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest("input, textarea, [contenteditable='true']")) {
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedEntryIdSet.size) {
      event.preventDefault();
      removeNavigatorEntries(Array.from(selectedEntryIdSet));
    }
  };
  const renderEntry = (entry, index, siblings = []) => {
    const children = Array.isArray(entry.children) ? entry.children : [];
    const hasChildren = children.length > 0;
    const depth = Math.max(0, Number(entry.depth || 0) || 0);
    const isFolder = entry.kind === "folder";
    const canFocus = Boolean(entry.targetId) && !entry.missing;
    const isDragging = dragState?.active && dragState.entryId === entry.id;
    const isDropTarget = dragState?.active && dragState.drop?.overId === entry.id;
    const isPickingTarget = pendingTargetFolderId && pendingTargetFolderId === entry.id;
    const isNavigatorSelected = selectedEntryIdSet.has(entry.id);
    const orderLabel = orderVisible ? getNavigatorEntryOrderLabel(depth, index) : isFolder ? "" : "•";
    return (
      <div key={entry.id} className={`canvas2d-navigator-tree-row${depth >= 4 ? " is-deep" : ""}`}>
        <div
          ref={(node) => {
            if (node) {
              rowRefs.current.set(entry.id, node);
              rowMetaRef.current.set(entry.id, {
                entry,
                index,
                parentId: entry.parentId || "",
                childrenCount: children.length,
              });
            } else {
              rowRefs.current.delete(entry.id);
              rowMetaRef.current.delete(entry.id);
            }
          }}
          className={`canvas2d-navigator-entry${entry.selected || (depth === 0 && hasChildren) ? " is-selected" : ""}${
            entry.missing ? " is-missing" : ""
          }${hasChildren ? " has-children" : " is-leaf"}${isFolder ? " is-folder" : " is-canvas-item"}${
            isPickingTarget ? " is-picking-target" : ""
          }${isNavigatorSelected ? " is-nav-selected" : ""}${
            dragState?.active && Array.isArray(dragState.entryIds) && dragState.entryIds.includes(entry.id) ? " is-drag-group" : ""
          }${isDragging ? " is-dragging" : ""}${
            isDropTarget ? ` is-drop-target is-drop-${dragState.drop.mode}` : ""
          }`}
          data-navigator-entry-id={entry.id}
          style={{ "--navigator-depth": depth }}
          onMouseEnter={() => onPreviewEntry?.(entry.id)}
          onMouseLeave={() => onPreviewEntry?.("")}
          onPointerDown={(event) => beginNavigatorDrag(event, entry)}
          onPointerMove={updateNavigatorDrag}
          onPointerUp={finishNavigatorDrag}
          onPointerCancel={clearNavigatorDrag}
          onClick={(event) => handleNavigatorEntryClick(event, entry, canFocus)}
          onContextMenu={(event) => openEntryMenu(event, entry, isFolder)}
        >
          <button
            type="button"
            className={`canvas2d-navigator-tree-toggle${isFolder ? "" : " is-empty"}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!isFolder) {
                return;
              }
              localCollapsedRef.current.set(entry.id, !entry.collapsed);
              onToggleEntry?.(entry.id);
            }}
            aria-label={entry.collapsed ? "展开子目录" : "收起子目录"}
            title={isFolder ? (entry.collapsed ? "展开" : "收起") : "无子目录"}
          >
            {isFolder ? (entry.collapsed ? <AppIcon name="chevron-right" size={16} /> : <AppIcon name="chevron-down" size={16} />) : null}
          </button>
          <button
            type="button"
            className="canvas2d-navigator-entry-main"
            aria-disabled={!canFocus && !isFolder && editingId !== entry.id}
            title={canFocus ? "定位到画布元素" : isFolder ? "独立目录文件夹" : "目标元素已不存在"}
          >
            <span className="canvas2d-navigator-entry-index" aria-hidden="true">
              {orderLabel}
            </span>
            <span className="canvas2d-navigator-entry-copy">
              {editingId === entry.id ? (
                <input
                  className="canvas2d-navigator-title-input"
                  value={titleDraft}
                  autoFocus
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={commitRename}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitRename();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingId("");
                      setTitleDraft("");
                    }
                  }}
                />
              ) : (
                <strong title={entry.title || entry.targetTitle || "未命名笔记"}>{entry.title || entry.targetTitle || "未命名笔记"}</strong>
              )}
              {entry.missing ? <small>目标已丢失</small> : null}
              {!entry.missing && isFolder && entry.targetId ? <small>已映射画布元素</small> : null}
            </span>
          </button>
          {hasChildren ? <span className="canvas2d-navigator-entry-count">{children.length}</span> : null}
          <div className="canvas2d-navigator-entry-actions">
            <button
              type="button"
              className="canvas2d-navigator-more-btn"
              onClick={(event) => openEntryMenu(event, entry, isFolder)}
              aria-label="更多操作"
              title="更多操作"
            >
              <AppIcon name="ellipsis" size={16} />
            </button>
          </div>
        </div>
        {!normalizedQuery && hasChildren && !entry.collapsed ? (
          <div className="canvas2d-navigator-children">
            {children.map((child, childIndex) => renderEntry(child, childIndex, children))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section
      ref={panelRef}
      className="canvas2d-navigator-panel"
      aria-label="画布目录"
      tabIndex={0}
      onKeyDown={handleNavigatorKeyDown}
      onClick={(event) => {
        closeEntryMenu();
        const target = event.target instanceof Element ? event.target : null;
        if (!target?.closest(".canvas2d-navigator-entry, .canvas2d-navigator-context-menu, .canvas2d-navigator-head, .canvas2d-navigator-search")) {
          setSelectedEntryIds([]);
        }
      }}
    >
      <header className="canvas2d-navigator-head">
        <strong>{navigator?.title || "画布目录"}</strong>
        <div className="canvas2d-navigator-head-actions">
          {onOpenWorkspace ? <button type="button" className="canvas2d-workspace-icon canvas2d-navigator-workspace-open" onClick={onOpenWorkspace} aria-label="打开画布工作区" title="打开画布工作区 · ⌘/Ctrl P"><AppIcon name="folder-open" size={16} /></button> : null}
          <button type="button" className="canvas2d-workspace-icon" onClick={() => onAddFolder?.()} aria-label="新建文件夹" title="新建文件夹"><AppIcon name="plus" size={16} /></button>
          <button type="button" className={`canvas2d-workspace-icon${searchOpen ? " is-active" : ""}`} onClick={() => { setSearchOpen((value) => !value); setQuery(""); }} aria-label="搜索目录" title="搜索目录" aria-expanded={searchOpen}><AppIcon name="search" size={16} /></button>
          <details className="canvas2d-navigator-options" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
            <summary className="canvas2d-workspace-icon" aria-label="目录显示选项" title="目录显示选项"><AppIcon name="ellipsis" size={16} /></summary>
            <div className="canvas-chrome-surface"><button type="button" aria-label={orderVisible ? "隐藏目录序号" : "显示目录序号"} aria-pressed={orderVisible} onClick={(event) => { setOrderVisible((value) => !value); const details = event.currentTarget.closest("details"); details.open = false; details.querySelector("summary")?.focus(); }}><AppIcon name="list-ordered" size={16} />{orderVisible ? "隐藏目录序号" : "显示目录序号"}</button></div>
          </details>
          <button type="button" className="canvas2d-workspace-icon" onClick={() => { setSearchOpen(false); setQuery(""); setMenuState(null); clearNavigatorDrag(); onPreviewEntry?.(""); onCollapse?.(true); }} aria-label="收起画布目录" title="收起画布目录"><AppIcon name="chevron-left" size={16} /></button>
        </div>
      </header>
      {searchOpen ? (
        <div className="canvas2d-navigator-search">
          <input
            value={query}
            autoFocus
            placeholder="搜索目录..."
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                setSearchOpen(false);
              }
            }}
          />
        </div>
      ) : null}
      {pendingTargetFolderId ? (
        <div className="canvas2d-navigator-pick-hint">
          <span>选择画布元素加入文件夹</span>
          <button type="button" onClick={() => onCancelPickFolderTarget?.()}>
            取消
          </button>
        </div>
      ) : null}
      <div className="canvas2d-navigator-list">
        {visibleRoots.length ? (
          visibleRoots.map((entry, index) => renderEntry(entry, index, visibleRoots))
        ) : (
          <div className="canvas2d-navigator-empty">
            <strong>{normalizedQuery ? "没有匹配的目录项" : "尚无目录项"}</strong>
            {normalizedQuery ? <button type="button" onClick={() => setQuery("")}>清除搜索</button> : <button type="button" onClick={() => onAddFolder?.()}>新建文件夹</button>}
          </div>
        )}
      </div>
      {menuState ? (
        <div
          className="canvas2d-navigator-context-menu canvas-chrome-surface"
          style={{ left: menuState.x, top: menuState.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {menuState.isFolder ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onPickFolderTarget?.(menuState.entryId);
                  closeEntryMenu();
                }}
              >
                添加元素
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddFolder?.({ parentId: menuState.entryId });
                  closeEntryMenu();
                }}
              >
                新建子文件夹
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const entry = entriesWithLocalCollapse.find((item) => item.id === menuState.entryId);
              setEditingId(menuState.entryId);
              setTitleDraft(entry?.title || "");
              selectionAnchorRef.current = menuState.entryId;
              setSelectedEntryIds([menuState.entryId]);
              closeEntryMenu();
            }}
          >
            重命名
          </button>
          <button
            type="button"
            onClick={() => {
              removeNavigatorEntries(selectedEntryIdSet.has(menuState.entryId) ? Array.from(selectedEntryIdSet) : [menuState.entryId]);
              closeEntryMenu();
            }}
          >
            删除
          </button>
        </div>
      ) : null}
    </section>
  );
}


function formatExportRecordTime(value) {
  const numeric = Number(value || 0);
  if (!numeric) {
    return "";
  }
  try {
    return new Date(numeric).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function getExportKindLabel(kind = "") {
  const normalized = String(kind || "").trim().toLowerCase();
  if (normalized === "pdf") return "PDF";
  if (normalized === "png") return "PNG";
  if (normalized === "word") return "Word";
  if (normalized === "txt") return "TXT";
  return normalized ? normalized.toUpperCase() : "导出";
}

function getExportScopeLabel(scope = "") {
  const normalized = String(scope || "").trim().toLowerCase();
  if (normalized === "board") return "画布";
  if (normalized === "selection") return "选区";
  if (normalized === "rich-text") return "富文本";
  if (normalized === "capture") return "分享";
  return "导出";
}

function getExportHistoryActionLabel(entry = null) {
  const jumpTarget = String(entry?.jumpTarget || entry?.filePath || "").trim();
  return jumpTarget ? "打开" : "记录";
}

function resolvePdfExportProgress(statusText = "") {
  const text = String(statusText || "").trim();
  if (!text) {
    return 8;
  }
  if (text.includes("准备画布资源")) {
    return 16;
  }
  if (text.includes("预加载图片资源")) {
    return 34;
  }
  if (text.includes("渲染离屏画布")) {
    return 58;
  }
  if (text.includes("生成 PDF")) {
    return 74;
  }
  if (text.includes("保存") || text.includes("文件路径") || text.includes("导出 PDF")) {
    return 90;
  }
  if (text.includes("已导出")) {
    return 100;
  }
  return 24;
}

function Canvas2DControls({ engine }) {
  const bridge = useMemo(() => createCanvas2DReactBridge(engine), [engine]);
  const tutorialRuntime = useMemo(
    () =>
      createCanvasTutorialRuntime({
        engine,
        bridge: createCanvasTutorialBridge(engine),
      }),
    [engine]
  );
  const [snapshot, setSnapshot] = useState(() => bridge.getSnapshot());
  const [tutorialSnapshot, setTutorialSnapshot] = useState(() => tutorialRuntime.getSnapshot());
  const [drawMenuOpen, setDrawMenuOpen] = useState(false);
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  const [capturePdfMenuOpen, setCapturePdfMenuOpen] = useState(false);
  const [capturePngMenuOpen, setCapturePngMenuOpen] = useState(false);
  const [captureIncludeBackground, setCaptureIncludeBackground] = useState(true);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [canvasImageManagerOpen, setCanvasImageManagerOpen] = useState(false);
  const [saveToast, setSaveToast] = useState("");
  const [saveToastVisible, setSaveToastVisible] = useState(false);
  const [pdfExportBusy, setPdfExportBusy] = useState(false);
  const [pdfExportHint, setPdfExportHint] = useState("正在生成 PDF...");
  const [pdfExportKind, setPdfExportKind] = useState("PDF");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [infoPanelCollapsed, setInfoPanelCollapsed] = useState(false);
  const [infoPanelAutoCollapsed, setInfoPanelAutoCollapsed] = useState(false);
  const [infoPanelPopoverOpen, setInfoPanelPopoverOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchRange, setSearchRange] = useState("current");
  const [workspaceSearch, setWorkspaceSearch] = useState({ results: [], warnings: [], loading: false });
  const [workspaceSearchEpoch, setWorkspaceSearchEpoch] = useState(0);
  const workspaceIndex = useMemo(() => createWorkspaceSearchIndex({ listBoards: (root) => engine.listCanvasBoards(root), readBoard: (path) => globalThis.desktopShell.readFile(path) }), [engine]);
  useEffect(() => {
    const changed = () => { workspaceIndex.invalidate(); setWorkspaceSearchEpoch((value) => value + 1); };
    const stop = globalThis.desktopShell?.onCanvasWorkspaceChanged?.(changed);
    window.addEventListener("freeflow:workspace-files-changed", changed);
    return () => { stop?.(); window.removeEventListener("freeflow:workspace-files-changed", changed); workspaceIndex.dispose(); };
  }, [workspaceIndex]);

  const [exportHistoryOpen, setExportHistoryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [searchFilterKey, setSearchFilterKey] = useState(CANVAS_SEARCH_FILTER_KEYS.ALL);
  const [searchHighlight, setSearchHighlight] = useState(null);
  const [uiViewport, setUiViewport] = useState({ width: 1440, height: 900 });
  const [workspaceWidth, setWorkspaceWidth] = useState(() => {
    try { return Math.min(360, Math.max(260, Number(localStorage.getItem("freeflow.canvas.chrome.workspaceWidth")) || 288)); } catch { return 288; }
  });
  const [workspaceOpenRequest, setWorkspaceOpenRequest] = useState(0);
  const rootRef = useRef(null);
  const toolbarRef = useRef(null);
  const infoPanelRef = useRef(null);
  const topbarStackRef = useRef(null);
  const drawMenuRef = useRef(null);
  const imageMenuRef = useRef(null);
  const insertMenuRef = useRef(null);
  const captureMenuRef = useRef(null);
  const menuRef = useRef(null);
  const drawMenuPanelRef = useRef(null);
  const imageMenuPanelRef = useRef(null);
  const insertMenuPanelRef = useRef(null);
  const captureMenuPanelRef = useRef(null);
  const mainMenuPanelRef = useRef(null);
  const searchRef = useRef(null);
  const exportHistoryRef = useRef(null);
  const searchPanelRef = useRef(null);
  const exportHistoryPanelRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchHighlightTimerRef = useRef(null);
  const infoPanelAutoCollapseLockUntilRef = useRef(0);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const titleInputRef = useRef(null);

  useEffect(() => bridge.subscribe((next) => setSnapshot(next)), [bridge]);
  useEffect(() => tutorialRuntime.subscribe((next) => setTutorialSnapshot(next)), [tutorialRuntime]);
  useEffect(() => {
    if (menuOpen) {
      tutorialRuntime.reportUiEvent({ type: TUTORIAL_EVENT_TYPES.MENU_OPENED, menuId: "main-menu" });
    }
  }, [menuOpen, tutorialRuntime]);
  useEffect(() => {
    if (drawMenuOpen) {
      tutorialRuntime.reportUiEvent({ type: TUTORIAL_EVENT_TYPES.MENU_OPENED, menuId: "draw-menu" });
    }
  }, [drawMenuOpen, tutorialRuntime]);
  useEffect(() => {
    return subscribeTutorialUiEvent((detail) => {
      if (!detail || typeof detail !== "object") {
        return;
      }
      if (detail.type === TUTORIAL_EVENT_TYPES.START_CANVAS_TUTORIAL) {
        if (detail.action === "open-board") {
          void tutorialRuntime.handleEntryAction("open-board");
          return;
        }
        tutorialRuntime.startCanvasTutorial();
        return;
      }
      tutorialRuntime.reportUiEvent(detail);
    });
  }, [tutorialRuntime]);

  useEffect(() => {
    const rootElement = rootRef.current;
    if (!(rootElement instanceof HTMLElement)) {
      return undefined;
    }
    const updateViewport = () => {
      if (isWorkspacePanelResizeActive()) {
        return;
      }
      const nextWidth = Math.round(rootElement.clientWidth || rootElement.offsetWidth || 0);
      const nextHeight = Math.round(rootElement.clientHeight || rootElement.offsetHeight || 0);
      setUiViewport((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };
    updateViewport();
    const handleWorkspacePanelResizeEnd = (event) => {
      if (!event?.detail?.side || event.detail.side === "left") {
        updateViewport();
      }
    };
    window.addEventListener("freeflow:workspace-panel-resize-end", handleWorkspacePanelResizeEnd);
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => updateViewport());
      observer.observe(rootElement);
      return () => {
        observer.disconnect();
        window.removeEventListener("freeflow:workspace-panel-resize-end", handleWorkspacePanelResizeEnd);
      };
    }
    window.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("freeflow:workspace-panel-resize-end", handleWorkspacePanelResizeEnd);
    };
  }, []);

  useEffect(() => {
    function onPointerDown(event) {
      if (!(event.target instanceof Element)) {
        return;
      }
      if (drawMenuRef.current && drawMenuRef.current.contains(event.target)) {
        return;
      }
      if (captureMenuRef.current && captureMenuRef.current.contains(event.target)) {
        return;
      }
      if (imageMenuRef.current && imageMenuRef.current.contains(event.target)) {
        return;
      }
      if (insertMenuRef.current && insertMenuRef.current.contains(event.target)) {
        return;
      }
      if (menuRef.current && menuRef.current.contains(event.target)) {
        return;
      }
      if (
        [drawMenuPanelRef, imageMenuPanelRef, insertMenuPanelRef, captureMenuPanelRef, mainMenuPanelRef, searchPanelRef, exportHistoryPanelRef].some(
          (ref) => ref.current?.contains?.(event.target)
        )
      ) {
        return;
      }
      if (searchRef.current && searchRef.current.contains(event.target)) {
        return;
      }
      if (exportHistoryRef.current && exportHistoryRef.current.contains(event.target)) {
        return;
      }
      setDrawMenuOpen(false);
      setImageMenuOpen(false);
      setInsertMenuOpen(false);
      setCaptureMenuOpen(false);
      setCapturePdfMenuOpen(false);
      setCapturePngMenuOpen(false);
      setMenuOpen(false);
      setSearchOpen(false);
      setExportHistoryOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.isComposing) return;
      if ((searchOpen || exportHistoryOpen) && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k" &&
          [searchPanelRef, exportHistoryPanelRef].some((ref) => ref.current?.contains(event.target))) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (searchOpen) closeSearch();
        else openSearch();
        return;
      }
      if (event.key !== "Escape" || !(drawMenuOpen || imageMenuOpen || insertMenuOpen || captureMenuOpen || menuOpen || searchOpen || exportHistoryOpen)) {
        return;
      }
      const trigger = searchOpen ? searchRef.current?.querySelector("button") : exportHistoryOpen ? exportHistoryRef.current?.querySelector("button") : toolbarRef.current?.querySelector?.('[aria-expanded="true"]');
      event.preventDefault();
      event.stopPropagation();
      setDrawMenuOpen(false);
      setImageMenuOpen(false);
      setInsertMenuOpen(false);
      setCaptureMenuOpen(false);
      setCapturePdfMenuOpen(false);
      setCapturePngMenuOpen(false);
      setMenuOpen(false);
      if (searchOpen) closeSearch();
      setExportHistoryOpen(false);
      trigger?.focus?.({ preventScroll: true });
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [captureMenuOpen, drawMenuOpen, imageMenuOpen, insertMenuOpen, menuOpen, searchOpen, exportHistoryOpen]);

  useEffect(() => {
    const message = String(snapshot?.boardSaveToastMessage || "").trim();
    if (!snapshot?.boardSaveToastAt || !message) {
      return;
    }
    setSaveToast(message);
    setSaveToastVisible(true);
    const timer = setTimeout(() => setSaveToastVisible(false), 1600);
    return () => clearTimeout(timer);
  }, [snapshot?.boardSaveToastAt, snapshot?.boardSaveToastMessage]);

  useEffect(() => {
    if (!pdfExportBusy) {
      return;
    }
    const nextHint = String(snapshot?.statusText || "").trim();
    if (nextHint) {
      setPdfExportHint(nextHint);
    }
  }, [pdfExportBusy, snapshot?.statusText]);

  const activeTool = snapshot?.tool || "select";
  const captureModeActive = Boolean(snapshot?.captureModeActive);
  const captureModeDragging = Boolean(snapshot?.captureModeDragging);
  const viewScale = Number(snapshot?.board?.view?.scale || 1);
  const zoomPercent = Math.round(viewScale * 100);
  const overlayScale = clamp((uiViewport.width - 72) / 940, 0.76, 1);
  const overlayCompact = overlayScale <= 0.9;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const activeDrawTool = DRAW_TOOLS.find((tool) => tool.key === activeTool) || DRAW_TOOLS[0];
  const drawActive = DRAW_TOOLS.some((tool) => tool.key === activeTool);
  const selectedShapeItems = useMemo(() => {
    const selectedIds = snapshot?.board?.selectedIds || [];
    if (!selectedIds.length) return [];
    const ids = new Set(selectedIds);
    const selected = (snapshot?.board?.items || []).filter((item) => ids.has(item.id));
    return selected.length && selected.every((item) => item.type === "shape" && !item.locked) ? selected : [];
  }, [snapshot?.board?.items, snapshot?.board?.selectedIds]);
  const shapeStylePosition = useMemo(() => {
    if (!selectedShapeItems.length) return null;
    const canvas = document.querySelector("#canvas-office-canvas");
    const rect = canvas?.getBoundingClientRect?.();
    if (!rect) return null;
    const bounds = selectedShapeItems.map((item) => getElementBounds(item));
    const left = Math.min(...bounds.map((entry) => entry.left));
    const right = Math.max(...bounds.map((entry) => entry.right));
    const top = Math.min(...bounds.map((entry) => entry.top));
    const view = snapshot?.board?.view || {};
    const scale = Number(view.scale || 1);
    return {
      left: Math.max(180, Math.min(window.innerWidth - 180, rect.left + (left + right) / 2 * scale + Number(view.offsetX || 0))),
      top: Math.max(54, Math.min(window.innerHeight - 54, rect.top + top * scale + Number(view.offsetY || 0) - 14)),
    };
  }, [selectedShapeItems, snapshot?.board?.view]);
  const boardFileName = snapshot?.boardFileName || "未命名画布";
  const boardDisplayName = boardFileName.toLowerCase().endsWith(".json")
    ? boardFileName.slice(0, -5)
    : boardFileName;
  const boardDirty = Boolean(snapshot?.boardDirty);
  const boardFilePath = String(snapshot?.boardFilePath || "").trim();
  const canvasImageSavePath = String(snapshot?.canvasImageSavePath || "").trim();
  const autosaveEnabled = snapshot?.boardAutosaveEnabled !== false;
  const autosaveAt = snapshot?.boardAutosaveAt
    ? new Date(snapshot.boardAutosaveAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "";
  const boardTitle = boardDirty ? `${boardDisplayName} *` : boardDisplayName;
  const pdfExportProgress = useMemo(() => resolvePdfExportProgress(pdfExportHint), [pdfExportHint]);
  const processingStatusText = useMemo(() => {
    const text = String(snapshot?.statusText || "").trim();
    return text.includes("处理中") ? text : "";
  }, [snapshot?.statusText]);
  const searchIndexEntries = useMemo(
    () => buildCanvasSearchIndex(snapshot?.board?.items || []),
    [snapshot?.board?.items]
  );
  const currentSearchResults = useMemo(
    () =>
      buildCanvasSearchResults(searchIndexEntries, deferredSearchQuery, {
        limit: 12,
        filterKey: searchFilterKey,
      }),
    [searchIndexEntries, deferredSearchQuery, searchFilterKey]
  );
  useEffect(() => {
    if (!searchOpen || searchRange !== "workspace" || !deferredSearchQuery.trim()) { setWorkspaceSearch({ results: [], warnings: [], loading: false }); return; }
    const controller = new AbortController();
    setWorkspaceSearch((previous) => ({ ...previous, results: [], loading: true }));
    const timer = setTimeout(async () => {
      try {
        const root = await engine.getCanvasBoardWorkspace();
        if (controller.signal.aborted) return;
        const result = await workspaceIndex.search(root, deferredSearchQuery, { currentPath: boardFilePath, currentItems: snapshot.board.items, filterKey: searchFilterKey, limit: 80, signal: controller.signal });
        if (!controller.signal.aborted && !result.canceled) setWorkspaceSearch({ ...result, loading: false });
      } catch (error) { if (!controller.signal.aborted) setWorkspaceSearch({ results: [], warnings: [error.message], loading: false }); }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [engine, workspaceIndex, searchOpen, searchRange, deferredSearchQuery, searchFilterKey, boardFilePath, snapshot?.board?.items, workspaceSearchEpoch]);
  const searchResults = searchRange === "workspace" ? workspaceSearch.results : currentSearchResults;
  const boardSearchStats = useMemo(() => {
    const items = Array.isArray(snapshot?.board?.items) ? snapshot.board.items : [];
    return collectCanvasSearchStats(items);
  }, [snapshot?.board?.items]);
  const searchScopeItems = useMemo(() => getCanvasSearchScopeItems(boardSearchStats), [boardSearchStats]);
  const exportHistory = useMemo(
    () => (Array.isArray(snapshot?.exportHistory) ? snapshot.exportHistory.slice(0, 10) : []),
    [snapshot?.exportHistory, snapshot?.exportHistoryUpdatedAt]
  );
  const wordExportPreviewRequest = snapshot?.wordExportPreviewRequest || null;
  const fileCardPreviewRequests = useMemo(
    () => (Array.isArray(snapshot?.fileCardPreviewRequests) ? snapshot.fileCardPreviewRequests : []),
    [snapshot?.fileCardPreviewRequests]
  );
  const navigatorView = useMemo(
    () => bridge.getCanvasNavigatorViewModel?.() || snapshot?.board?.navigator || { entries: [], collapsed: false },
    [bridge, snapshot]
  );
  const navigatorPendingTargetFolderId = useMemo(
    () => bridge.getCanvasNavigatorPendingTargetFolderId?.() || "",
    [bridge, snapshot]
  );
  const searchHighlightStyle = useMemo(() => {
    if (!searchHighlight?.bounds) {
      return null;
    }
    const left = Number(searchHighlight.bounds.left || 0);
    const top = Number(searchHighlight.bounds.top || 0);
    const width = Math.max(1, Number(searchHighlight.bounds.width || 0));
    const height = Math.max(1, Number(searchHighlight.bounds.height || 0));
    return {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(width)}px`,
      height: `${Math.round(height)}px`,
    };
  }, [searchHighlight]);

  useEffect(() => {
    if (!editingTitle) {
      return;
    }
    const next = boardDisplayName || "未命名画布";
    setTitleDraft(next);
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, [editingTitle, boardDisplayName]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    const frameId = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frameId);
  }, [searchOpen]);

  useEffect(() => {
    return () => {
      if (searchHighlightTimerRef.current) {
        clearTimeout(searchHighlightTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSearchActiveIndex((current) => clamp(current, 0, Math.max(0, searchResults.length - 1)));
  }, [searchResults.length]);

  useEffect(() => {
    const rootElement = rootRef.current;
    const infoElement = infoPanelRef.current;
    if (!(rootElement instanceof HTMLElement) || !(infoElement instanceof HTMLElement)) {
      return undefined;
    }

    let frameId = 0;
    let autoCollapseRecheckTimer = 0;
    const scheduleAutoCollapseRecheck = (delayMs) => {
      if (autoCollapseRecheckTimer) {
        clearTimeout(autoCollapseRecheckTimer);
      }
      autoCollapseRecheckTimer = window.setTimeout(() => {
        autoCollapseRecheckTimer = 0;
        scheduleUpdate();
      }, Math.max(1, Math.ceil(delayMs)));
    };
    const scheduleUpdate = () => {
      if (isWorkspacePanelResizeActive()) {
        return;
      }
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
        frameId = requestAnimationFrame(() => {
          frameId = 0;
          const rootRect = rootElement.getBoundingClientRect();
          const controls = rootElement.closest(".desktop-clear-stage")?.querySelector('[data-stage-panel-controls="left"]');
          const controlsRect = controls?.getBoundingClientRect();
          rootElement.style.setProperty("--canvas-info-inline-start", `${controlsRect?.width ? controlsRect.right - rootRect.left + 8 : 16}px`);
          const topbarRect = infoElement.parentElement.getBoundingClientRect();
          const toolbarWidth = toolbarRef.current?.scrollWidth || 0;
          const availableWidth = topbarRect.width - 244 - 12;
          const now = performance.now();
          setInfoPanelAutoCollapsed((current) => {
            if (!toolbarWidth) return false;
            if (current && now < infoPanelAutoCollapseLockUntilRef.current) {
              scheduleAutoCollapseRecheck(infoPanelAutoCollapseLockUntilRef.current - now + 1);
              return true;
            }
            if (current) {
              return availableWidth < toolbarWidth + 16;
            }
            const shouldCollapse = availableWidth < toolbarWidth;
            if (shouldCollapse) {
              infoPanelAutoCollapseLockUntilRef.current = now + 220;
              scheduleAutoCollapseRecheck(221);
            }
            return shouldCollapse;
          });
      });
    };

    scheduleUpdate();
    const handleWorkspacePanelResizeEnd = (event) => {
      if (!event?.detail?.side || event.detail.side === "left") {
        scheduleUpdate();
      }
    };
    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            scheduleUpdate();
          })
        : null;
    resizeObserver?.observe(rootElement);
    resizeObserver?.observe(infoElement);
    const controls = rootElement.closest(".desktop-clear-stage")?.querySelector('[data-stage-panel-controls="left"]');
    if (controls) resizeObserver?.observe(controls);
    if (searchRef.current instanceof HTMLElement) {
      resizeObserver?.observe(searchRef.current);
    }
    if (exportHistoryRef.current instanceof HTMLElement) {
      resizeObserver?.observe(exportHistoryRef.current);
    }
    if (topbarStackRef.current instanceof HTMLElement) {
      resizeObserver?.observe(topbarStackRef.current);
    }
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("freeflow:workspace-panel-resize-end", handleWorkspacePanelResizeEnd);
    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      if (autoCollapseRecheckTimer) {
        clearTimeout(autoCollapseRecheckTimer);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("freeflow:workspace-panel-resize-end", handleWorkspacePanelResizeEnd);
    };
  }, [searchOpen, exportHistoryOpen, uiViewport.width, uiViewport.height]);

  useEffect(() => bridge.registerCommand?.({
    id: "ui.search",
    label: "搜索画布",
    category: "ui",
    scope: "global",
    shortcuts: ["Ctrl+K"],
    execute: () => {
      if (searchOpen) closeSearch();
      else openSearch();
      return true;
    },
  }), [bridge, searchOpen]);

  const commitTitleRename = async () => {
    const nextName = String(titleDraft || "").trim();
    setEditingTitle(false);
    if (!nextName || nextName === boardDisplayName) {
      return;
    }
    await bridge.renameBoard(nextName);
  };

  const showToast = (message) => {
    setSaveToast(String(message || "").trim());
    setSaveToastVisible(true);
    window.setTimeout(() => setSaveToastVisible(false), 1600);
  };


  useEffect(() => {
    const details = infoPanelRef.current?.querySelector("details");
    if (details) details.open = false;
    setInfoPanelPopoverOpen(false);
  }, [infoPanelCollapsed, infoPanelAutoCollapsed, boardFilePath]);

  useEffect(() => {
    if (!infoPanelPopoverOpen) return undefined;
    const closeOutside = (event) => { if (!infoPanelRef.current?.contains(event.target)) setInfoPanelPopoverOpen(false); };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape" || editingTitle || infoPanelRef.current?.querySelector("details[open]")) return;
      event.preventDefault(); event.stopImmediatePropagation(); setInfoPanelPopoverOpen(false);
      infoPanelRef.current?.querySelector(".canvas2d-info-collapse-toggle")?.focus();
    };
    window.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => { window.removeEventListener("pointerdown", closeOutside, true); window.removeEventListener("keydown", closeOnEscape, true); };
  }, [infoPanelPopoverOpen, editingTitle]);

  const openSearch = () => {
    setDrawMenuOpen(false);
    setImageMenuOpen(false);
    setInsertMenuOpen(false);
    setCaptureMenuOpen(false);
    setCapturePdfMenuOpen(false);
    setCapturePngMenuOpen(false);
    setMenuOpen(false);
    setExportHistoryOpen(false);
    setSearchFilterKey(CANVAS_SEARCH_FILTER_KEYS.ALL);
    setSearchOpen(true);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchActiveIndex(0);
    setSearchFilterKey(CANVAS_SEARCH_FILTER_KEYS.ALL);
    setSearchQuery("");
    searchRef.current?.querySelector("button")?.focus({ preventScroll: true });
  };

  const handleSearchFilterChange = (nextKey) => {
    setSearchFilterKey((current) => {
      const normalized = String(nextKey || "").trim() || CANVAS_SEARCH_FILTER_KEYS.ALL;
      return current === normalized ? CANVAS_SEARCH_FILTER_KEYS.ALL : normalized;
    });
    setSearchActiveIndex(0);
  };

  const handleOpenExportHistoryTarget = (target) => {
    const value = String(target || "").trim();
    if (!value) {
      return;
    }
    bridge.openExternalUrl?.(value);
  };

  const focusSearchResult = async (result) => {
    if (!result?.id) {
      return;
    }
    if (result.boardPath && result.boardPath !== engine.getSnapshot().boardFilePath) {
      const opened = await engine.openBoardAtPath(result.boardPath);
      if (!opened) { showToast("未能切换画布；当前修改已保留，请检查保存或文件状态"); return; }
    }
    const item = engine.getSnapshot()?.board?.items?.find((entry) => entry.id === result.id);
    if (!item) { showToast("搜索目标已删除，请重新搜索"); workspaceIndex.invalidate([result.boardPath]); setWorkspaceSearchEpoch((value) => value + 1); return; }
    engine.revealSearchItem?.(item.id);
    const revealed = engine.getSnapshot()?.board?.items?.find((entry) => entry.id === item.id) || item;
    const bounds = getElementBounds(revealed);
    if (!bounds) {
      return;
    }
    bridge.focusOnBounds(bounds, {
      animate: true,
      padding: 120,
      duration: 260,
      maxScale: 1.4,
      minScale: 0.2,
    });
    setSearchHighlight({ id: item.id, bounds });
    if (searchHighlightTimerRef.current) {
      clearTimeout(searchHighlightTimerRef.current);
    }
    searchHighlightTimerRef.current = setTimeout(() => {
      setSearchHighlight(null);
    }, 1200);
  };

  const handleSearchKeyDown = (event) => {
    if (event.isComposing || event.nativeEvent?.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
      return;
    }
    if (event.key === "ArrowDown") {
      if (!searchResults.length) {
        return;
      }
      event.preventDefault();
      setSearchActiveIndex((current) => Math.min(current + 1, searchResults.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      if (!searchResults.length) {
        return;
      }
      event.preventDefault();
      setSearchActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && searchResults[searchActiveIndex]) {
      event.preventDefault();
      focusSearchResult(searchResults[searchActiveIndex]);
    }
  };

  const handleSearchSelect = (result, index) => {
    setSearchActiveIndex(index);
    focusSearchResult(result);
  };

  const handleTutorialAction = async (action) => {
    const result = await tutorialRuntime.handleEntryAction(action);
    if (String(action || "").trim().toLowerCase() === "open-board" && !result?.usingTutorialBoard) {
      showToast("教程画布打开失败");
    }
  };

  const handlePdfExport = async (scale = 2) => {
    setCaptureMenuOpen(false);
    setCapturePdfMenuOpen(false);
    setCapturePngMenuOpen(false);
    setPdfExportKind("PDF");
    setPdfExportHint("正在生成 PDF...");
    setPdfExportBusy(true);
    try {
      const result = await bridge.exportBoardAsPdf({
        scale,
        background: "white",
        includeGrid: false,
        includeBackground: captureIncludeBackground,
      });
      if (result?.canceled) {
        showToast("PDF 导出已取消");
      } else if (result?.ok === false && result?.message) {
        showToast(result.message);
      }
    } finally {
      setPdfExportBusy(false);
    }
  };

  const handlePngExport = async (scale = 2) => {
    setCaptureMenuOpen(false);
    setCapturePdfMenuOpen(false);
    setCapturePngMenuOpen(false);
    setPdfExportKind("PNG");
    setPdfExportHint("正在生成 PNG...");
    setPdfExportBusy(true);
    try {
      const result = await bridge.exportBoardAsPng({
        scale,
        background: "white",
        includeGrid: false,
        includeBackground: captureIncludeBackground,
      });
      if (result?.canceled) {
        showToast("PNG 导出已取消");
      } else if (result?.ok === false && result?.message) {
        showToast(result.message);
      }
    } finally {
      setPdfExportBusy(false);
    }
  };

  const closeMenu = () => {
    setMenuOpen(false);
    menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={rootRef}
      className={`canvas2d-engine-ui${overlayCompact ? " is-overlay-compact" : ""}`}
      style={{
        "--canvas2d-overlay-scale": overlayScale,
        "--canvas2d-topbar-left-reserved-width": infoPanelCollapsed || infoPanelAutoCollapsed ? "64px" : "244px",
      }}
    >
      <div className="canvas2d-navigation-panels"><div className="canvas2d-navigation-docks canvas-chrome-surface" style={{ "--workspace-width": `${workspaceWidth}px` }}>
      <BoardWorkspacePanel bridge={bridge} snapshot={snapshot} openRequest={workspaceOpenRequest} width={workspaceWidth} onWidthChange={setWorkspaceWidth} />
      <CanvasNavigatorPanel
        key={snapshot.boardFilePath}
        navigator={navigatorView}
        onOpenWorkspace={typeof globalThis.desktopShell?.listCanvasBoards === "function" ? () => setWorkspaceOpenRequest((value) => value + 1) : undefined}
        onCollapse={(collapsed) => bridge.setCanvasNavigatorCollapsed?.(collapsed)}
        onFocusEntry={(entryId) => bridge.focusCanvasNavigatorEntry?.(entryId)}
        onPreviewEntry={(entryId) => bridge.previewCanvasNavigatorEntry?.(entryId)}
        onRenameEntry={(entryId, title) => bridge.renameCanvasNavigatorEntry?.(entryId, title)}
        onRemoveEntry={(entryId) => bridge.removeCanvasNavigatorEntry?.(entryId)}
        onSetParent={(entryId, parentId, index) => bridge.setCanvasNavigatorEntryParent?.(entryId, parentId, index)}
        onToggleEntry={(entryId) => bridge.toggleCanvasNavigatorEntryCollapsed?.(entryId)}
        onAddFolder={(options) => bridge.addCanvasNavigatorFolder?.(options)}
        onPickFolderTarget={(entryId) => bridge.beginCanvasNavigatorFolderTargetPick?.(entryId)}
        onCancelPickFolderTarget={() => bridge.cancelCanvasNavigatorFolderTargetPick?.()}
        pendingTargetFolderId={navigatorPendingTargetFolderId}
      />
      </div></div>
      <div
        className={`canvas2d-engine-topbar${searchOpen ? " is-search-open" : ""}${infoPanelCollapsed || infoPanelAutoCollapsed ? " is-info-collapsed" : ""}`}
      >
      <div
        ref={infoPanelRef}
        className="canvas2d-engine-corner canvas2d-engine-corner-top-left"
        aria-label="工作白板模式信息"
      >
        <div className={`canvas2d-floating-card canvas2d-floating-card-info is-compact canvas-chrome-surface canvas-chrome-info-dock${infoPanelCollapsed || infoPanelAutoCollapsed ? " is-collapsed" : ""}${infoPanelPopoverOpen ? " is-popover-open" : ""}`}>
          <img className="canvas2d-brand-logo" src="/assets/brand/FreeFlow_app_icon.png" alt="FreeFlow" title={boardTitle} />
          <div className={`canvas2d-info-detail${infoPanelPopoverOpen ? " canvas-chrome-surface" : ""}`}>
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="canvas2d-board-title-input"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => {
                  void commitTitleRename();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void commitTitleRename();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setEditingTitle(false);
                  }
                }}
              />
            ) : (
              <div
                className="canvas2d-floating-title canvas2d-board-title"
                title={boardTitle}
                onDoubleClick={() => setEditingTitle(true)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  bridge.revealBoardInFolder();
                }}
              >
                {boardTitle}
              </div>
            )}
            <span className={`canvas2d-info-save-state${snapshot.boardSaveError ? " is-error" : ""}`} title={snapshot.boardSaveError || (snapshot.boardDirty || snapshot.editingId ? "修改尚未保存到本机" : "已保存到本机")}>{snapshot.boardSaveError ? "保存失败" : snapshot.boardDirty || snapshot.editingId ? "未保存" : "已保存"}</span>
            <details className="canvas2d-info-options" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
              <summary aria-label="画布信息详情" title="画布信息详情"><AppIcon name="info" size={16} /></summary>
              <div className="canvas-chrome-surface">
                <strong>FreeFlow</strong>
                <span>自动保存{autosaveEnabled ? "已开启" : "已关闭"}</span>
                {autosaveEnabled && autosaveAt ? <span>上次自动保存 {autosaveAt}</span> : null}
                <button type="button" onClick={(event) => { event.currentTarget.closest("details").open = false; setEditingTitle(true); }}>重命名画布</button>
                <button type="button" onClick={() => bridge.revealBoardInFolder()}>显示文件位置</button>
              </div>
            </details>
          </div>
          <button type="button" className="canvas2d-info-collapse-toggle" onClick={() => infoPanelAutoCollapsed ? setInfoPanelPopoverOpen((value) => !value) : setInfoPanelCollapsed((value) => !value)} title={infoPanelCollapsed || infoPanelAutoCollapsed ? "展开画布信息" : "收起画布信息"} aria-label={infoPanelCollapsed || infoPanelAutoCollapsed ? "展开画布信息" : "收起画布信息"} aria-expanded={infoPanelPopoverOpen || !(infoPanelCollapsed || infoPanelAutoCollapsed)}><AppIcon name="chevron-left" size={16} /></button>
        </div>
      </div>

      <div className="canvas2d-engine-topbar-stack" ref={topbarStackRef}>
      <div
        className={`canvas2d-engine-toolbar-wrap${
          drawMenuOpen || imageMenuOpen || insertMenuOpen || captureMenuOpen || menuOpen ? " is-overlay-active" : ""
        }`}
        aria-label="工作白板工具栏"
      >
        <div className="canvas2d-engine-toolbar canvas-chrome-surface canvas-chrome-toolbar" role="toolbar" ref={toolbarRef}>
          <button
            type="button"
            className={`canvas2d-engine-tool${activeTool === "pan" ? " is-active" : ""}`}
            onClick={() => bridge.setTool("pan")}
            aria-pressed={activeTool === "pan"}
            title="拖拽视图 (H，按住 Space 临时平移)"
          >
            <span className="canvas2d-engine-tool-icon" aria-hidden="true">
              <AppIcon name="hand" size={18} />
            </span>
            <span className="canvas2d-engine-tool-shortcut">H</span>
          </button>
          <button
            type="button"
            className={`canvas2d-engine-tool${activeTool === "select" ? " is-active" : ""}`}
            onClick={() => bridge.setTool("select")}
            aria-pressed={activeTool === "select"}
            title="框选 (V)"
          >
            <span className="canvas2d-engine-tool-icon" aria-hidden="true">
              <AppIcon name="mouse-pointer-2" size={18} />
            </span>
            <span className="canvas2d-engine-tool-shortcut">V</span>
          </button>

          <div className="canvas2d-engine-tool-group" ref={drawMenuRef}>
            <button
              type="button"
              className={`canvas2d-engine-tool${drawActive ? " is-active" : ""}`}
              onClick={() =>
                setDrawMenuOpen((value) => {
                  const next = !value;
                  setInsertMenuOpen(false);
                  setCaptureMenuOpen(false);
                  setCapturePdfMenuOpen(false);
                  setCapturePngMenuOpen(false);
                  setMenuOpen(false);
                  setSearchOpen(false);
                  setExportHistoryOpen(false);
                  return next;
                })
              }
              aria-haspopup="menu"
              aria-expanded={drawMenuOpen}
              title="画图工具"
            >
              <span className="canvas2d-engine-tool-icon" aria-hidden="true">
                {drawActive ? <AppIcon name={activeDrawTool.icon} size={18} /> : <AppIcon name="shapes" size={18} />}
              </span>
              <span className="canvas2d-engine-tool-shortcut">{activeDrawTool.shortcut}</span>
            </button>
            <FloatingToolbarMenu
              open={drawMenuOpen}
              anchorRef={drawMenuRef}
              boundaryRef={rootRef}
              panelRef={drawMenuPanelRef}
            >
                {DRAW_TOOLS.map((tool, index) => (
                  <React.Fragment key={tool.key}>
                    {(index === 0 || DRAW_TOOLS[index - 1].group !== tool.group) ? (
                      <div className="canvas2d-engine-menu-section-label">{tool.group}</div>
                    ) : null}
                    <button
                      type="button"
                      className={`canvas2d-engine-menu-item${activeTool === tool.key ? " is-active" : ""}`}
                      onClick={() => {
                        bridge.setTool(tool.key);
                        setDrawMenuOpen(false);
                      }}
                      role="menuitem"
                    >
                      <span className="canvas2d-engine-menu-icon" aria-hidden="true"><AppIcon name={tool.icon} size={16} /></span>
                      <span>{tool.label}</span>
                      <kbd>{tool.shortcut}</kbd>
                    </button>
                  </React.Fragment>
                ))}
            </FloatingToolbarMenu>
          </div>

          <button
            type="button"
            className={`canvas2d-engine-tool${activeTool === "text" ? " is-active" : ""}`}
            onClick={() => bridge.setTool("text")}
            aria-pressed={activeTool === "text"}
            title="文本 (T)"
          >
            <span className="canvas2d-engine-tool-icon" aria-hidden="true">
              <AppIcon name="type" size={18} />
            </span>
            <span className="canvas2d-engine-tool-shortcut">T</span>
          </button>

          <button
            type="button"
            className="canvas2d-engine-tool"
            onClick={() => fileInputRef.current?.click()}
            title="添加文件"
            aria-label="添加文件"
          >
            <span className="canvas2d-engine-tool-icon" aria-hidden="true">
              <AppIcon name="file-text" size={18} />
            </span>
            <span className="canvas2d-engine-tool-shortcut">F</span>
          </button>
          <input
            ref={fileInputRef}
            className="canvas2d-file-input"
            type="file"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              if (files.length) {
                void bridge.importFiles(files);
              }
              event.target.value = "";
            }}
          />

          <div className="canvas2d-engine-tool-group" ref={imageMenuRef}>
            <button
              type="button"
              className={`canvas2d-engine-tool${imageMenuOpen ? " is-active" : ""}`}
              onClick={() =>
                setImageMenuOpen((value) => {
                  const next = !value;
                  setDrawMenuOpen(false);
                  setInsertMenuOpen(false);
                  setCaptureMenuOpen(false);
                  setCapturePdfMenuOpen(false);
                  setCapturePngMenuOpen(false);
                  setMenuOpen(false);
                  setSearchOpen(false);
                  setExportHistoryOpen(false);
                  return next;
                })
              }
              aria-haspopup="menu"
              aria-expanded={imageMenuOpen}
              title="图片工具"
            >
              <span className="canvas2d-engine-tool-icon" aria-hidden="true">
                <AppIcon name="image" size={18} />
              </span>
              <span className="canvas2d-engine-tool-shortcut">I</span>
            </button>
            <FloatingToolbarMenu
              open={imageMenuOpen}
              anchorRef={imageMenuRef}
              boundaryRef={rootRef}
              panelRef={imageMenuPanelRef}
              className="canvas2d-engine-menu-image"
            >
                <div className="canvas2d-engine-menu-section">
                  <div className="canvas2d-engine-menu-title">图片</div>
                  <button
                    type="button"
                    className="canvas2d-engine-menu-item canvas2d-engine-menu-item-primary"
                    role="menuitem"
                    onClick={() => {
                      imageInputRef.current?.click();
                      setImageMenuOpen(false);
                    }}
                  >
                    <span>从文件中导入</span>
                  </button>
                  <button
                    type="button"
                    className="canvas2d-engine-menu-item canvas2d-engine-menu-item-primary"
                    role="menuitem"
                    onClick={() => {
                      void bridge.captureCanvasImageToManager();
                      setImageMenuOpen(false);
                    }}
                  >
                    <span>系统截屏</span>
                  </button>
                </div>
            </FloatingToolbarMenu>
          </div>
          <input
            ref={imageInputRef}
            className="canvas2d-file-input"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              if (files.length) {
                void bridge.importFiles(files);
              }
              event.target.value = "";
            }}
          />

          <button
            type="button"
            className="canvas2d-engine-tool"
            data-tutorial-target="node-button"
            onClick={() => bridge.addMindMapRoot()}
            title="添加思维导图"
          >
            <span className="canvas2d-engine-tool-icon" aria-hidden="true">
              <AppIcon name="git-fork" size={18} />
            </span>
            <span className="canvas2d-engine-tool-shortcut">N</span>
          </button>

          <div className="canvas2d-engine-tool-group" ref={insertMenuRef}>
            <button
              type="button"
              className={`canvas2d-engine-tool${insertMenuOpen ? " is-active" : ""}`}
              onClick={() =>
                setInsertMenuOpen((value) => {
                  const next = !value;
                  setDrawMenuOpen(false);
                  setImageMenuOpen(false);
                  setCaptureMenuOpen(false);
                  setCapturePdfMenuOpen(false);
                  setCapturePngMenuOpen(false);
                  setMenuOpen(false);
                  setSearchOpen(false);
                  setExportHistoryOpen(false);
                  return next;
                })
              }
              aria-haspopup="menu"
              aria-expanded={insertMenuOpen}
              title="插入内容"
            >
              <span className="canvas2d-engine-tool-icon" aria-hidden="true">
                <AppIcon name="plus" size={18} />
              </span>
              <span className="canvas2d-engine-tool-shortcut">+</span>
            </button>
            <FloatingToolbarMenu
              open={insertMenuOpen}
              anchorRef={insertMenuRef}
              boundaryRef={rootRef}
              panelRef={insertMenuPanelRef}
              align="center"
              className="canvas2d-engine-insert-menu"
            >
                <div className="canvas2d-engine-menu-title">插入</div>
                {INSERT_TOOLS.map((tool) => (
                  <button
                    key={tool.key}
                    type="button"
                    className="canvas2d-engine-menu-item canvas2d-engine-insert-item"
                    onClick={() => {
                      if (tool.key === "table") {
                        bridge.addTable?.({ columns: 3, rows: 3 });
                      }
                      if (tool.key === "codeBlock") {
                        bridge.addCodeBlock?.({ language: "javascript" });
                      }
                      setInsertMenuOpen(false);
                    }}
                    role="menuitem"
                  >
                    <span className="canvas2d-engine-menu-icon" aria-hidden="true"><AppIcon name={tool.icon} size={16} /></span>
                    <span className="canvas2d-engine-insert-copy">
                      <strong>{tool.label}</strong>
                      <small>{tool.meta}</small>
                    </span>
                    <kbd>{tool.shortcut}</kbd>
                  </button>
                ))}
            </FloatingToolbarMenu>
          </div>

          <div className="canvas2d-engine-tool-group" ref={captureMenuRef}>
            <button
              type="button"
              className={`canvas2d-engine-tool${captureMenuOpen ? " is-active" : ""}`}
              onClick={() => {
                setDrawMenuOpen(false);
                setImageMenuOpen(false);
                setInsertMenuOpen(false);
                setMenuOpen(false);
                setSearchOpen(false);
                setExportHistoryOpen(false);
                setCaptureMenuOpen((value) => {
                  const next = !value;
                  if (!next) {
                    setCapturePdfMenuOpen(false);
                    setCapturePngMenuOpen(false);
                  }
                  return next;
                });
              }}
              aria-haspopup="menu"
              aria-expanded={captureMenuOpen}
              title="分享"
            >
              <span className="canvas2d-engine-tool-icon" aria-hidden="true">
                <AppIcon name="share-2" size={18} />
              </span>
              <span className="canvas2d-engine-tool-shortcut">P</span>
            </button>
            <FloatingToolbarMenu
              open={captureMenuOpen}
              anchorRef={captureMenuRef}
              boundaryRef={rootRef}
              panelRef={captureMenuPanelRef}
              align="end"
              layoutKey={`${capturePdfMenuOpen}:${capturePngMenuOpen}`}
              className="canvas2d-engine-menu-share"
            >
                <div className="canvas2d-engine-menu-section">
                  <div className="canvas2d-engine-menu-title">分享</div>
                  <button
                    type="button"
                    className={`canvas2d-engine-menu-item${captureIncludeBackground ? " is-active" : ""}`}
                    role="menuitemcheckbox"
                    aria-checked={captureIncludeBackground}
                    onClick={() => setCaptureIncludeBackground((value) => !value)}
                  >
                    <span>导出时带背景</span>
                    <span className="canvas2d-engine-menu-meta">{captureIncludeBackground ? "开" : "关"}</span>
                  </button>
                  <button
                    type="button"
                    className="canvas2d-engine-menu-item canvas2d-engine-menu-item-primary"
                    role="menuitem"
                    onClick={() => {
                      void bridge.startCanvasCapture();
                      setCaptureMenuOpen(false);
                      setCapturePdfMenuOpen(false);
                      setCapturePngMenuOpen(false);
                    }}
                  >
                    <span>分享当前画布</span>
                  </button>
                  <button
                    type="button"
                    className={`canvas2d-engine-menu-item canvas2d-engine-menu-item-toggle${capturePdfMenuOpen ? " is-active" : ""}`}
                    role="menuitem"
                    onClick={() => {
                      setCapturePngMenuOpen(false);
                      setCapturePdfMenuOpen((value) => !value);
                    }}
                  >
                    <span>导出为 PDF</span>
                    <ChevronIcon open={capturePdfMenuOpen} />
                  </button>
                  {capturePdfMenuOpen ? (
                    <div className="canvas2d-engine-menu-group">
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item"
                        role="menuitem"
                        onClick={() => {
                          void handlePdfExport(2);
                        }}
                      >
                        <span>标准</span>
                      </button>
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item"
                        role="menuitem"
                        onClick={() => {
                          void handlePdfExport(3);
                        }}
                      >
                        <span>高清</span>
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={`canvas2d-engine-menu-item canvas2d-engine-menu-item-toggle${capturePngMenuOpen ? " is-active" : ""}`}
                    role="menuitem"
                    onClick={() => {
                      setCapturePdfMenuOpen(false);
                      setCapturePngMenuOpen((value) => !value);
                    }}
                  >
                    <span>导出为图片（PNG）</span>
                    <ChevronIcon open={capturePngMenuOpen} />
                  </button>
                  {capturePngMenuOpen ? (
                    <div className="canvas2d-engine-menu-group">
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item"
                        role="menuitem"
                        onClick={() => {
                          void handlePngExport(2);
                        }}
                      >
                        <span>标准</span>
                      </button>
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item"
                        role="menuitem"
                        onClick={() => {
                          void handlePngExport(3);
                        }}
                      >
                        <span>高清</span>
                      </button>
                    </div>
                  ) : null}
                </div>
            </FloatingToolbarMenu>
          </div>

          <span className="canvas2d-engine-tool-spacer" aria-hidden="true" />

          <div className="canvas2d-engine-tool-group" ref={menuRef}>
            <button
              type="button"
              className="canvas2d-engine-tool"
              data-tutorial-target="menu-button"
              onClick={() =>
                setMenuOpen((value) => {
                  const next = !value;
                  setDrawMenuOpen(false);
                  setImageMenuOpen(false);
                  setInsertMenuOpen(false);
                  setCaptureMenuOpen(false);
                  setCapturePdfMenuOpen(false);
                  setCapturePngMenuOpen(false);
                  setCanvasImageManagerOpen(false);
                  setSearchOpen(false);
                  setExportHistoryOpen(false);
                  return next;
                })
              }
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              title="画布选项与帮助"
            >
              <span className="canvas2d-engine-tool-icon" aria-hidden="true">
                <AppIcon name="ellipsis" size={18} />
              </span>
            </button>
            <FloatingToolbarMenu
              open={menuOpen}
              anchorRef={menuRef}
              boundaryRef={rootRef}
              panelRef={mainMenuPanelRef}
              align="end"
              preferredWidth={368}
              surfaceClassName="canvas-options-panel"
              role="dialog"
              ariaLabel="画布选项与帮助"
            >
              <CanvasOptionsPanel
                bridge={bridge}
                snapshot={snapshot}
                onClose={closeMenu}
                onOpenImages={() => {
                  closeMenu();
                  setCanvasImageManagerOpen(true);
                }}
                onOpenTutorial={() => {
                  closeMenu();
                  dispatchTutorialUiEvent({ type: TUTORIAL_EVENT_TYPES.OPEN_GLOBAL_TUTORIAL_CENTER });
                }}
                onOpenUpdates={document.getElementById("settings-center-host") ? () => {
                  closeMenu();
                  window.dispatchEvent(new CustomEvent("freeflow:open-settings", { detail: { section: "updates" } }));
                } : undefined}
              />
            </FloatingToolbarMenu>
          </div>
        </div>
      </div>
      <div className={`canvas2d-engine-search-stack${searchOpen || exportHistoryOpen ? " is-overlay-active" : ""}`}>
        <div className="canvas2d-engine-search-row canvas-chrome-surface canvas-chrome-utility-dock">
          <div ref={searchRef} className="canvas2d-engine-search-wrap" aria-label="画布内容搜索入口">
            <CanvasSearchOverlay
              isOpen={searchOpen}
              query={searchQuery}
              results={searchResults}
              stats={boardSearchStats}
              scopeItems={searchScopeItems}
              range={searchRange}
              onRangeChange={(value) => { setSearchRange(value); setSearchActiveIndex(0); }}
              workspaceSupported={typeof globalThis.desktopShell?.listCanvasBoards === "function"}
              loading={workspaceSearch.loading}
              warnings={workspaceSearch.warnings}
              activeFilterKey={searchFilterKey}
              activeIndex={searchActiveIndex}
              highlightQuery={searchQuery}
              onOpen={openSearch}
              onClose={closeSearch}
              onQueryChange={(value) => {
                setSearchQuery(value);
                setSearchActiveIndex(0);
              }}
              onFilterChange={handleSearchFilterChange}
              onKeyDown={handleSearchKeyDown}
              onHoverResult={setSearchActiveIndex}
              onSelectResult={handleSearchSelect}
              inputRef={searchInputRef}
              renderPanel={(panel) => (
                <FloatingToolbarMenu open={searchOpen} anchorRef={searchRef} boundaryRef={rootRef} panelRef={searchPanelRef} align="end" preferredWidth={430} surfaceClassName="" className="canvas2d-engine-utility-popover" role="dialog" ariaLabel="画布搜索">
                  {panel}
                </FloatingToolbarMenu>
              )}
            />
          </div>
          <div ref={exportHistoryRef} className="canvas2d-engine-export-history-wrap" aria-label="导出历史入口">
            <button
              type="button"
              className={`canvas2d-engine-export-history-trigger${exportHistoryOpen ? " is-active" : ""}`}
              onClick={() =>
                setExportHistoryOpen((value) => {
                  const next = !value;
                  setDrawMenuOpen(false);
                  setImageMenuOpen(false);
                  setInsertMenuOpen(false);
                  setCaptureMenuOpen(false);
                  setCapturePdfMenuOpen(false);
                  setCapturePngMenuOpen(false);
                  setMenuOpen(false);
                  setSearchOpen(false);
                  return next;
                })
              }
              title="查看最近导出记录"
              aria-label="查看最近导出记录"
              aria-expanded={exportHistoryOpen}
              aria-controls={exportHistoryOpen ? "canvas2d-export-history-panel" : undefined}
            >
              <span className="canvas2d-engine-export-history-icon" aria-hidden="true">
                <AppIcon name="history" size={18} />
              </span>
            </button>
          </div>
        </div>
        <FloatingToolbarMenu open={exportHistoryOpen} anchorRef={exportHistoryRef} boundaryRef={rootRef} panelRef={exportHistoryPanelRef} align="end" preferredWidth={430} surfaceClassName="" className="canvas2d-engine-utility-popover" role="dialog" ariaLabel="最近导出">
            <div id="canvas2d-export-history-panel" className="canvas2d-engine-export-history-panel">
              <div className="canvas2d-engine-export-history-panel-head">
                <strong>最近导出</strong>
                <button type="button" className="canvas2d-engine-search-close" aria-label="关闭最近导出" onClick={() => { setExportHistoryOpen(false); exportHistoryRef.current?.querySelector("button")?.focus({ preventScroll: true }); }}><AppIcon name="x" size={16} /></button>
              </div>
              <div className="canvas2d-engine-export-history-panel-meta">
                <span>最近 {exportHistory.length || 0} 条 · 点击打开文件</span>
              </div>
              <div className="canvas2d-engine-export-history-list">
                {exportHistory.length ? (
                  exportHistory.map((entry, index) => {
                    const jumpTarget = String(entry?.jumpTarget || entry?.filePath || "").trim();
                    const pathLabel = String(entry?.filePath || entry?.fileName || "").trim();
                    const interactive = Boolean(jumpTarget);
                    const kindLabel = getExportKindLabel(entry.kind);
                    const scopeLabel = getExportScopeLabel(entry.scope);
                    const timeLabel = formatExportRecordTime(entry.exportedAt);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={`canvas2d-engine-export-history-item${interactive ? "" : " is-disabled"}`}
                        onClick={() => {
                          if (interactive) {
                            handleOpenExportHistoryTarget(jumpTarget);
                          }
                        }}
                        disabled={!interactive}
                        title={interactive ? pathLabel || jumpTarget : "当前记录未保存本地路径"}
                      >
                        <span className="canvas2d-engine-export-history-kind" aria-hidden="true">
                          {kindLabel}
                        </span>
                        <span className="canvas2d-engine-export-history-item-main">
                          <strong>{entry.title || "导出记录"}</strong>
                          <span>{timeLabel || "刚刚导出"}</span>
                        </span>
                        <span className="canvas2d-engine-export-history-item-meta">
                          <span>{scopeLabel}</span>
                          <span>{getExportHistoryActionLabel(entry)}</span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="canvas2d-engine-export-history-empty">
                    <strong>还没有导出记录</strong>
                    <span>导出的文件会显示在这里。</span>
                  </div>
                )}
              </div>
            </div>
        </FloatingToolbarMenu>
      </div>
      </div>
      </div>

      {activeTool === "select" && !captureModeActive && shapeStylePosition ? createPortal(
        <div
          className="canvas2d-shape-style-popover"
          role="toolbar"
          aria-label="图形样式"
          data-canvas-ui-focus-scope="shape-style"
          style={{ left: shapeStylePosition.left, top: shapeStylePosition.top }}
        >
          <div className="canvas2d-shape-style-group" aria-label="边框颜色">
            {[["#334155", "深灰"], ["#dc2626", "红色"], ["#2563eb", "蓝色"], ["#16835d", "绿色"], ["#7c3aed", "紫色"]].map(([color, label]) => (
              <button
                key={color}
                type="button"
                className={`canvas2d-shape-color-swatch${selectedShapeItems.every(item => item.strokeColor === color) ? " is-active" : ""}`}
                style={{ "--shape-swatch-color": color }}
                onClick={() => bridge.setSelectedShapeStyle({ strokeColor: color })}
                aria-label={`边框颜色：${label}`}
                aria-pressed={selectedShapeItems.every(item => item.strokeColor === color)}
                title={`边框：${label}`}
              />
            ))}
          </div>
          <span className="canvas2d-shape-style-divider" aria-hidden="true" />
          {!selectedShapeItems.every((item) => ["line", "arrow"].includes(item.shapeType)) ? <div className="canvas2d-shape-style-group" aria-label="填充">
            {[["transparent", "无填充"], ["#dbeafe", "浅蓝"], ["#dcfce7", "浅绿"], ["#fef3c7", "浅黄"]].map(([color, label]) => (
              <button
                key={color}
                type="button"
                className={`canvas2d-shape-fill-swatch${selectedShapeItems.every(item => item.fillColor === color) ? " is-active" : ""}${color === "transparent" ? " is-clear" : ""}`}
                style={color === "transparent" ? undefined : { "--shape-swatch-color": color }}
                onClick={() => bridge.setSelectedShapeStyle({ fillColor: color })}
                aria-label={`填充：${label}`}
                aria-pressed={selectedShapeItems.every(item => item.fillColor === color)}
                title={`填充：${label}`}
              >
                {color === "transparent" ? "∅" : null}
              </button>
            ))}
          </div> : null}
          {!selectedShapeItems.every((item) => ["line", "arrow"].includes(item.shapeType)) ? <span className="canvas2d-shape-style-divider" aria-hidden="true" /> : null}
          <div className="canvas2d-shape-style-group" aria-label="线宽">
            {[1, 2, 4].map((width) => (
              <button
                key={width}
                type="button"
                className={`canvas2d-shape-width-option${selectedShapeItems.every(item => Number(item.strokeWidth || 2) === width) ? " is-active" : ""}`}
                onClick={() => bridge.setSelectedShapeStyle({ strokeWidth: width })}
                aria-label={`线宽 ${width}`}
                aria-pressed={selectedShapeItems.every(item => Number(item.strokeWidth || 2) === width)}
                title={`线宽 ${width}`}
              >
                <span style={{ height: `${width}px` }} />
              </button>
            ))}
          </div>
          {selectedShapeItems.every((item) => ["line", "arrow"].includes(item.shapeType)) ? (
            <>
              <span className="canvas2d-shape-style-divider" aria-hidden="true" />
              <button
                type="button"
                className={`canvas2d-shape-dash-toggle${selectedShapeItems.every((item) => item.lineDash) ? " is-active" : ""}`}
                onClick={() => bridge.setSelectedShapeStyle({ lineDash: !selectedShapeItems.every((item) => item.lineDash) })}
                aria-label="切换虚线"
                aria-pressed={selectedShapeItems.every((item) => item.lineDash)}
                title="切换实线或虚线"
              ><span aria-hidden="true" /></button>
            </>
          ) : null}
        </div>,
        document.body
      ) : null}

      {searchHighlightStyle && bridge.getSceneFeedbackPortalHost() ? createPortal(
        <div className="canvas2d-engine-search-highlight" style={searchHighlightStyle} />, bridge.getSceneFeedbackPortalHost()
      ) : null}

      <FileConversionDialog request={snapshot?.fileConversionRequest} engine={engine} />
      {fileCardPreviewRequests.map((request) => (
        <FileCardAttachedPreview
          key={request?.id || `file-card-preview-${request?.itemId || Math.random()}`}
          request={request}
          board={snapshot?.board}
          bridge={bridge}
        />
      ))}

      <div className="canvas2d-engine-corner canvas2d-engine-corner-bottom-right" aria-label="工作白板缩放区">
        <div className="canvas2d-floating-card canvas2d-floating-card-zoom canvas-chrome-surface canvas-chrome-viewport-dock">
          <div className="canvas2d-zoom-display">
            <span className="canvas2d-zoom-label">缩放</span>
            <strong>{zoomPercent}%</strong>
          </div>
          <div className="canvas2d-zoom-actions">
            <button type="button" className="canvas2d-zoom-btn" onClick={() => bridge.zoomOut()} title="缩小" aria-label="缩小">
              <AppIcon name="minus" size={16} />
            </button>
            <button type="button" className="canvas2d-zoom-btn" onClick={() => bridge.resetView()} title="重置视图" aria-label="重置视图">
              <AppIcon name="rotate-ccw" size={16} />
            </button>
            <button type="button" className="canvas2d-zoom-btn" onClick={() => bridge.zoomToFit()} title="适配全部内容" aria-label="适配全部内容">
              <AppIcon name="scan" size={16} />
            </button>
            <button type="button" className="canvas2d-zoom-btn" onClick={() => bridge.zoomIn()} title="放大" aria-label="放大">
              <AppIcon name="plus" size={16} />
            </button>
          </div>
        </div>
      </div>

      <CanvasTutorialOverlay
        snapshot={tutorialSnapshot}
        onAction={handleTutorialAction}
        onClose={() => tutorialRuntime.closeTutorial()}
        onNext={() => tutorialRuntime.goToNextStep()}
        onPrevious={() => tutorialRuntime.goToPreviousStep()}
        onSkip={() => tutorialRuntime.skipCurrentStep()}
      />

      <WordExportPreviewDialog
        request={wordExportPreviewRequest}
        exporting={Boolean(wordExportPreviewRequest?.exporting)}
        onReorder={(id, direction) => engine.reorderWordExportPreview(wordExportPreviewRequest?.id, id, direction)}
        onClose={() => bridge.closeWordExportPreview(wordExportPreviewRequest?.id)}
        onConfirm={() => {
          void bridge.confirmWordExportPreview(wordExportPreviewRequest?.id);
        }}
      />

      <CanvasImageManagerDialog
        open={canvasImageManagerOpen}
        bridge={bridge}
        snapshot={snapshot}
        onClose={() => setCanvasImageManagerOpen(false)}
      />

      {pdfExportBusy ? (
        <div className="canvas2d-pdf-export-overlay" role="status" aria-live="polite" aria-label="PDF 导出中">
          <div
            className="canvas2d-pdf-export-dialog"
            style={{
              width: "min(420px, calc(100vw - 48px))",
              padding: "24px 24px 20px",
              borderRadius: "28px",
              background: "rgba(255, 255, 255, 0.94)",
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.18)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              backdropFilter: "blur(20px)",
            }}
          >
            <div className="canvas2d-pdf-export-spinner" aria-hidden="true" />
            <div className="canvas2d-pdf-export-title">正在准备导出 {pdfExportKind}</div>
            <div className="canvas2d-pdf-export-text">{pdfExportHint || `正在生成 ${pdfExportKind}...`}</div>
            <div
              className="canvas2d-pdf-export-progress"
              aria-label={`${pdfExportKind} 导出进度 ${pdfExportProgress}%`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pdfExportProgress}
              role="progressbar"
              style={{
                marginTop: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                  fontSize: "13px",
                  color: "#475569",
                  fontWeight: 600,
                }}
              >
                <span>导出进度</span>
                <span>{pdfExportProgress}%</span>
              </div>
              <div
                style={{
                  position: "relative",
                  overflow: "hidden",
                  height: "10px",
                  borderRadius: "999px",
                  background: "rgba(148, 163, 184, 0.22)",
                  boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.08)",
                }}
              >
                <div
                  style={{
                    width: `${pdfExportProgress}%`,
                    height: "100%",
                    borderRadius: "999px",
                    background: "linear-gradient(90deg, #2563eb 0%, #06b6d4 55%, #22c55e 100%)",
                    boxShadow: "0 0 18px rgba(37, 99, 235, 0.28)",
                    transition: "width 220ms ease",
                  }}
                />
              </div>
            </div>
            <div className="canvas2d-pdf-export-meta">完成后将继续进入文件保存界面</div>
            <div
              style={{
                marginTop: "18px",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                className="canvas2d-engine-menu-item canvas2d-engine-menu-item-primary"
                onClick={() => {
                  bridge.cancelActiveExport?.();
                  setPdfExportBusy(false);
                }}
                style={{
                  minWidth: "136px",
                  justifyContent: "center",
                }}
              >
                <span>中断导出</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {captureModeActive ? (
        <div className="canvas2d-capture-hint-overlay" role="status" aria-live="polite" aria-label="正在分享画布">
          <div className="canvas2d-capture-hint-dialog">
            <div className="canvas2d-capture-hint-dot" aria-hidden="true" />
            <div className="canvas2d-capture-hint-copy">
              <div className="canvas2d-capture-hint-title">正在分享画布</div>
              <div className="canvas2d-capture-hint-text">
                {captureModeDragging ? "松开鼠标后生成选区截图" : "按住左键拖动选择截图区域"}
                <span>Esc 取消</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {processingStatusText ? (
        <div className="canvas2d-save-toast" role="status">
          {processingStatusText}
        </div>
      ) : null}

      <div className={`canvas2d-save-toast${saveToastVisible ? "" : " is-hidden"}`} role="status">
        {saveToast}
      </div>
    </div>
  );
}

export default Canvas2DControls;

