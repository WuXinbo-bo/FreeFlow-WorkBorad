import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createCanvas2DReactBridge } from "../reactBridge.js";
import {
  createCanvasTutorialBridge,
  createCanvasTutorialRuntime,
  CanvasTutorialOverlay,
} from "../tutorial-system/canvasTutorialIndex.js";
import { CanvasSearchOverlay } from "../search/canvasSearchOverlay.jsx";
import { buildCanvasSearchResults } from "../search/canvasSearchIndex.js";
import { getElementBounds } from "../elements/index.js";
import { dispatchTutorialUiEvent, subscribeTutorialUiEvent } from "../../../tutorial-core/tutorialEventBus.js";
import { TUTORIAL_EVENT_TYPES } from "../../../tutorial-core/tutorialTypes.js";

const DRAW_TOOLS = [
  { key: "rect", icon: "▢", label: "矩形", shortcut: "R" },
  { key: "ellipse", icon: "◯", label: "椭圆", shortcut: "E" },
  { key: "arrow", icon: "→", label: "箭头", shortcut: "A" },
  { key: "line", icon: "—", label: "直线", shortcut: "L" },
  { key: "highlight", icon: "▭", label: "高亮", shortcut: "H" },
];

function MouseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <path
        d="M6 3.8L18.6 12.2l-5.2 1.2 2.5 6-2.4 1-2.6-6-3.9 3.6V3.8z"
        fill="currentColor"
      />
    </svg>
  );
}

function DrawIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <rect x="4.2" y="6" width="15.6" height="12" rx="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="7" y="8.8" width="10" height="6.4" rx="2.4" fill="currentColor" opacity="0.14" />
    </svg>
  );
}

function TextIcon() {
  return <span className="canvas2d-engine-tool-icon-text">T</span>;
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <path
        d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
        fill="currentColor"
        opacity="0.16"
      />
      <path d="M13 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="7" y="11" width="10" height="1.6" fill="currentColor" />
      <rect x="7" y="15" width="8" height="1.6" fill="currentColor" />
    </svg>
  );
}

function NodeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <rect x="4.5" y="4.5" width="15" height="15" rx="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <circle cx="6.8" cy="12" r="1.2" fill="currentColor" opacity="0.55" />
      <circle cx="17.2" cy="12" r="1.2" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <path
        d="M14.8 6.4h3.8v3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.1 13.9 18.6 5.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 8.2H7.4a2.8 2.8 0 0 0-2.8 2.8v5.6a2.8 2.8 0 0 0 2.8 2.8H13a2.8 2.8 0 0 0 2.8-2.8v-.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <rect x="4" y="5" width="16" height="14" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" />
      <path d="M6.6 17l4.2-4.4 3.2 2.6 2.2-2.4 3.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <circle cx="6" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="18" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

function ExportHistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <path d="M12 4.6v8.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M8.8 10.8 12 13.9l3.2-3.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 15.6v1.2a2 2 0 0 0 2 2h7.6a2 2 0 0 0 2-2v-1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open = false }) {
  return <span className={`canvas2d-engine-menu-chevron${open ? " is-open" : ""}`} aria-hidden="true">⌄</span>;
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
  if (normalized === "capture") return "截图";
  return "导出";
}

const ABOUT_CANVAS_ITEMS = Object.freeze([
  { label: "画布名称", value: "FreeFlow" },
  { label: "版本号", value: "v1.0.1-rc" },
  { label: "开发作者", value: "Wu Xinbo" },
  { label: "邮箱", value: "1806598228@qq.com" },
  { label: "授权邮箱", value: "w1806598228@163.com" },
  {
    label: "GitHub",
    value: "https://github.com/WuXinbo-bo/FreeFlow-WorkBorad",
    href: "https://github.com/WuXinbo-bo/FreeFlow-WorkBorad",
  },
  { label: "版权声明", value: "Copyright © 2026 WuXinbo. All rights reserved." },
]);

const ABOUT_CANVAS_INFO_ITEMS = Object.freeze(ABOUT_CANVAS_ITEMS.slice(0, 3));
const ABOUT_CANVAS_CONTACT_ITEMS = Object.freeze(ABOUT_CANVAS_ITEMS.slice(3));

const ALIGNMENT_SNAP_THRESHOLD_OPTIONS = Object.freeze([
  { value: 6, label: "紧凑" },
  { value: 8, label: "标准" },
  { value: 10, label: "宽松" },
  { value: 12, label: "更宽松" },
]);

const BOARD_BACKGROUND_OPTIONS = Object.freeze([
  { value: "none", label: "无背景" },
  { value: "dots", label: "点阵" },
  { value: "grid", label: "方格" },
  { value: "lines", label: "横线" },
  { value: "engineering", label: "工程网格" },
]);

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
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  const [capturePdfMenuOpen, setCapturePdfMenuOpen] = useState(false);
  const [capturePngMenuOpen, setCapturePngMenuOpen] = useState(false);
  const [captureIncludeBackground, setCaptureIncludeBackground] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(true);
  const [pathMenuOpen, setPathMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [alignmentSnapMenuOpen, setAlignmentSnapMenuOpen] = useState(false);
  const [backgroundMenuOpen, setBackgroundMenuOpen] = useState(false);
  const [aboutMenuOpen, setAboutMenuOpen] = useState(false);
  const [saveToast, setSaveToast] = useState("");
  const [saveToastVisible, setSaveToastVisible] = useState(false);
  const [pdfExportBusy, setPdfExportBusy] = useState(false);
  const [pdfExportHint, setPdfExportHint] = useState("正在生成 PDF...");
  const [pdfExportKind, setPdfExportKind] = useState("PDF");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [infoPanelCollapsed, setInfoPanelCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [exportHistoryOpen, setExportHistoryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [searchHighlight, setSearchHighlight] = useState(null);
  const [uiViewport, setUiViewport] = useState({ width: 1440, height: 900 });
  const rootRef = useRef(null);
  const toolbarRef = useRef(null);
  const drawMenuRef = useRef(null);
  const captureMenuRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const exportHistoryRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchHighlightTimerRef = useRef(null);
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
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => updateViewport());
      observer.observe(rootElement);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
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
      if (menuRef.current && menuRef.current.contains(event.target)) {
        return;
      }
      if (toolbarRef.current && toolbarRef.current.contains(event.target)) {
        return;
      }
      if (searchRef.current && searchRef.current.contains(event.target)) {
        return;
      }
      if (exportHistoryRef.current && exportHistoryRef.current.contains(event.target)) {
        return;
      }
      setDrawMenuOpen(false);
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
  const viewScale = Number(snapshot?.board?.view?.scale || 1);
  const zoomPercent = Math.round(viewScale * 100);
  const overlayScale = clamp((uiViewport.width - 72) / 940, 0.76, 1);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const activeDrawTool = DRAW_TOOLS.find((tool) => tool.key === activeTool) || DRAW_TOOLS[0];
  const drawActive = DRAW_TOOLS.some((tool) => tool.key === activeTool);
  const boardFileName = snapshot?.boardFileName || "未命名画布";
  const boardDisplayName = boardFileName.toLowerCase().endsWith(".json")
    ? boardFileName.slice(0, -5)
    : boardFileName;
  const boardDirty = Boolean(snapshot?.boardDirty);
  const boardFilePath = String(snapshot?.boardFilePath || "").trim();
  const canvasImageSavePath = String(snapshot?.canvasImageSavePath || "").trim();
  const autosaveEnabled = snapshot?.boardAutosaveEnabled !== false;
  const boardBackgroundPattern = String(snapshot?.board?.preferences?.backgroundPattern || "dots")
    .trim()
    .toLowerCase() || "dots";
  const alignmentSnapConfig = snapshot?.alignmentSnapConfig || null;
  const alignmentSnapEnabled = alignmentSnapConfig?.enabled !== false;
  const alignmentSnapShowGuides = alignmentSnapConfig?.showGuides !== false;
  const alignmentSnapThreshold = Number(alignmentSnapConfig?.thresholdPx || 8);
  const autosaveAt = snapshot?.boardAutosaveAt
    ? new Date(snapshot.boardAutosaveAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "";
  const boardTitle = boardDirty ? `${boardDisplayName} *` : boardDisplayName;
  const pdfExportProgress = useMemo(() => resolvePdfExportProgress(pdfExportHint), [pdfExportHint]);
  const processingStatusText = useMemo(() => {
    const text = String(snapshot?.statusText || "").trim();
    return text.includes("处理中") ? text : "";
  }, [snapshot?.statusText]);
  const searchResults = useMemo(
    () => buildCanvasSearchResults(snapshot?.board?.items || [], deferredSearchQuery, 10),
    [snapshot?.board?.items, deferredSearchQuery]
  );
  const exportHistory = useMemo(
    () => (Array.isArray(snapshot?.exportHistory) ? snapshot.exportHistory.slice(0, 10) : []),
    [snapshot?.exportHistory, snapshot?.exportHistoryUpdatedAt]
  );
  const searchHighlightStyle = useMemo(() => {
    if (!searchHighlight?.bounds) {
      return null;
    }
    const view = snapshot?.board?.view;
    if (!view) {
      return null;
    }
    const scale = Number(view.scale || 1);
    const left = Number(searchHighlight.bounds.left || 0) * scale + Number(view.offsetX || 0);
    const top = Number(searchHighlight.bounds.top || 0) * scale + Number(view.offsetY || 0);
    const width = Math.max(1, Number(searchHighlight.bounds.width || 0) * scale);
    const height = Math.max(1, Number(searchHighlight.bounds.height || 0) * scale);
    return {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(width)}px`,
      height: `${Math.round(height)}px`,
    };
  }, [searchHighlight, snapshot?.board?.view]);

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
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
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
    function onWindowKeyDown(event) {
      const key = String(event.key || "").toLowerCase();
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          Boolean(target.closest("input, textarea, [contenteditable='true']")));

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        if (!searchOpen && isTypingTarget) {
          return;
        }
        event.preventDefault();
        setSearchOpen((value) => !value);
        if (searchOpen) {
          setSearchQuery("");
          setSearchActiveIndex(0);
        }
      }
    }

    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [searchOpen]);

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

  const openSearch = () => {
    setSearchOpen(true);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchActiveIndex(0);
  };

  const handleOpenExportHistoryTarget = (target) => {
    const value = String(target || "").trim();
    if (!value) {
      return;
    }
    bridge.openExternalUrl?.(value);
  };

  const focusSearchResult = (result) => {
    if (!result?.id) {
      return;
    }
    const items = snapshot?.board?.items || [];
    const item = items.find((entry) => entry.id === result.id);
    if (!item) {
      return;
    }
    const bounds = getElementBounds(item);
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
    setFileMenuOpen(true);
    setPathMenuOpen(false);
    setExportMenuOpen(false);
    setAlignmentSnapMenuOpen(false);
    setBackgroundMenuOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="canvas2d-engine-ui"
      style={{
        "--canvas2d-overlay-scale": overlayScale,
      }}
    >
      <div
        className={`canvas2d-engine-topbar${searchOpen ? " is-search-open" : ""}${infoPanelCollapsed ? " is-info-collapsed" : ""}`}
      >
      <div className="canvas2d-engine-corner canvas2d-engine-corner-top-left" aria-label="工作白板模式信息">
        <div className={`canvas2d-floating-card canvas2d-floating-card-info is-compact${infoPanelCollapsed ? " is-collapsed" : ""}`}>
          <div className="canvas2d-brand-row" aria-label="FreeFlow 品牌">
            <span className="canvas2d-floating-eyebrow canvas2d-brand-label">FreeFlow</span>
            <img
              className="canvas2d-brand-logo"
              src="/assets/brand/FreeFlow_logo.svg"
              alt="FreeFlow logo"
            />
            <button
              type="button"
              className="canvas2d-info-collapse-toggle"
              onClick={() => setInfoPanelCollapsed((value) => !value)}
              title={infoPanelCollapsed ? "展开画布信息" : "收起画布信息"}
              aria-label={infoPanelCollapsed ? "展开画布信息" : "收起画布信息"}
              aria-pressed={infoPanelCollapsed}
            >
              <span aria-hidden="true">{infoPanelCollapsed ? "›" : "‹"}</span>
            </button>
          </div>
          <div className="canvas2d-info-detail">
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
            <div className="canvas2d-floating-meta">
              <span className={`canvas2d-badge${autosaveEnabled ? " is-on" : " is-off"}`}>
                自动保存 {autosaveEnabled ? "开" : "关"}
              </span>
              {autosaveEnabled && autosaveAt ? <span className="canvas2d-badge is-time">上次 {autosaveAt}</span> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="canvas2d-engine-topbar-stack">
      <div className="canvas2d-engine-toolbar-wrap" aria-label="工作白板工具栏">
        <div className="canvas2d-engine-toolbar" role="toolbar" ref={toolbarRef}>
          <button
            type="button"
            className={`canvas2d-engine-tool${activeTool === "select" ? " is-active" : ""}`}
            onClick={() => bridge.setTool("select")}
            aria-pressed={activeTool === "select"}
            title="框选 (V)"
          >
            <span className="canvas2d-engine-tool-icon" aria-hidden="true">
              <MouseIcon />
            </span>
            <span className="canvas2d-engine-tool-shortcut">V</span>
          </button>

          <div className="canvas2d-engine-tool-group" ref={drawMenuRef}>
            <button
              type="button"
              className={`canvas2d-engine-tool${drawActive ? " is-active" : ""}`}
              onClick={() => setDrawMenuOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={drawMenuOpen}
              title="画图工具"
            >
              <span className="canvas2d-engine-tool-icon" aria-hidden="true">
                <DrawIcon />
              </span>
              <span className="canvas2d-engine-tool-shortcut">{activeDrawTool.shortcut}</span>
            </button>
            {drawMenuOpen ? (
              <div className="canvas2d-engine-menu" role="menu">
                {DRAW_TOOLS.map((tool) => (
                  <button
                    key={tool.key}
                    type="button"
                    className={`canvas2d-engine-menu-item${activeTool === tool.key ? " is-active" : ""}`}
                    onClick={() => {
                      bridge.setTool(tool.key);
                      setDrawMenuOpen(false);
                    }}
                    role="menuitem"
                  >
                    <span className="canvas2d-engine-menu-icon" aria-hidden="true">{tool.icon}</span>
                    <span>{tool.label}</span>
                    <kbd>{tool.shortcut}</kbd>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className={`canvas2d-engine-tool${activeTool === "text" ? " is-active" : ""}`}
            onClick={() => bridge.setTool("text")}
            aria-pressed={activeTool === "text"}
            title="文本 (T)"
          >
            <span className="canvas2d-engine-tool-icon" aria-hidden="true">
              <TextIcon />
            </span>
            <span className="canvas2d-engine-tool-shortcut">T</span>
          </button>

          <button
            type="button"
            className="canvas2d-engine-tool"
            onClick={() => fileInputRef.current?.click()}
            title="文件工具"
          >
            <span className="canvas2d-engine-tool-icon" aria-hidden="true">
              <FileIcon />
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

          <button
            type="button"
            className="canvas2d-engine-tool"
            onClick={() => imageInputRef.current?.click()}
            title="图片工具"
          >
            <span className="canvas2d-engine-tool-icon" aria-hidden="true">
              <ImageIcon />
            </span>
            <span className="canvas2d-engine-tool-shortcut">I</span>
          </button>
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
            onClick={() => bridge.addFlowNode()}
            title="添加节点"
          >
            <span className="canvas2d-engine-tool-icon" aria-hidden="true">
              <NodeIcon />
            </span>
            <span className="canvas2d-engine-tool-shortcut">N</span>
          </button>

          <div className="canvas2d-engine-tool-group" ref={captureMenuRef}>
            <button
              type="button"
              className={`canvas2d-engine-tool${captureMenuOpen ? " is-active" : ""}`}
              onClick={() => {
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
              title="截图"
            >
              <span className="canvas2d-engine-tool-icon" aria-hidden="true">
                <ShareIcon />
              </span>
              <span className="canvas2d-engine-tool-shortcut">P</span>
            </button>
            {captureMenuOpen ? (
              <div className="canvas2d-engine-menu" role="menu">
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
                  className="canvas2d-engine-menu-item"
                  role="menuitem"
                  onClick={() => {
                    void bridge.startCanvasCapture();
                    setCaptureMenuOpen(false);
                    setCapturePdfMenuOpen(false);
                    setCapturePngMenuOpen(false);
                  }}
                >
                  <span>画布截图</span>
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
                  <span>导出 PDF</span>
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
                  <span>导出 PNG</span>
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
            ) : null}
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
                  return next;
                })
              }
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="菜单"
            >
              <span className="canvas2d-engine-tool-icon" aria-hidden="true">
                <MenuIcon />
              </span>
            </button>
            {menuOpen ? (
              <div className="canvas2d-engine-menu canvas2d-engine-menu-wide" role="menu">
                <div className="canvas2d-engine-menu-section">
                  <div className="canvas2d-engine-menu-title">画布管理</div>
                  <button
                    type="button"
                    className={`canvas2d-engine-menu-item canvas2d-engine-menu-item-toggle${fileMenuOpen ? " is-active" : ""}`}
                    role="menuitem"
                    aria-expanded={fileMenuOpen}
                    onClick={() => setFileMenuOpen((value) => !value)}
                  >
                    <span>画布文件</span>
                    <ChevronIcon open={fileMenuOpen} />
                  </button>
                  {fileMenuOpen ? (
                    <div className="canvas2d-engine-menu-group">
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item"
                        role="menuitem"
                        onClick={() => {
                          closeMenu();
                          void bridge.newBoard();
                        }}
                      >
                        <span>新建画布</span>
                      </button>
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item"
                        role="menuitem"
                        onClick={() => {
                          closeMenu();
                          void bridge.openBoard();
                        }}
                      >
                        <span>选择画布</span>
                      </button>
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item"
                        role="menuitem"
                        onClick={() => {
                          closeMenu();
                          void bridge.saveBoard();
                        }}
                      >
                        <span>保存画布</span>
                      </button>
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item"
                        role="menuitem"
                        onClick={() => {
                          closeMenu();
                          void bridge.saveBoardAs();
                        }}
                      >
                        <span>画布另存为</span>
                      </button>
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item"
                        role="menuitem"
                        onClick={() => {
                          closeMenu();
                          setEditingTitle(true);
                        }}
                      >
                        <span>画布重命名</span>
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={`canvas2d-engine-menu-item canvas2d-engine-menu-item-toggle${pathMenuOpen ? " is-active" : ""}`}
                    role="menuitem"
                    aria-expanded={pathMenuOpen}
                    onClick={() => setPathMenuOpen((value) => !value)}
                  >
                    <span>画布位置</span>
                    <ChevronIcon open={pathMenuOpen} />
                  </button>
                  {pathMenuOpen ? (
                    <div className="canvas2d-engine-menu-group">
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item canvas2d-engine-menu-item-path"
                        role="menuitem"
                        title={boardFilePath || "未设置画布位置"}
                        onClick={() => {
                          closeMenu();
                          void bridge.revealBoardInFolder();
                        }}
                      >
                        <span>打开画布位置</span>
                        <span className="canvas2d-engine-menu-meta">{formatPathLabel(boardFilePath, "未设置")}</span>
                      </button>
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item"
                        role="menuitem"
                        onClick={() => {
                          void bridge.pickCanvasBoardSavePath();
                        }}
                      >
                        <span>设置画布位置</span>
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={`canvas2d-engine-menu-item canvas2d-engine-menu-item-toggle${exportMenuOpen ? " is-active" : ""}`}
                    role="menuitem"
                    aria-expanded={exportMenuOpen}
                    onClick={() => setExportMenuOpen((value) => !value)}
                  >
                    <span>画布图片位置</span>
                    <ChevronIcon open={exportMenuOpen} />
                  </button>
                  {exportMenuOpen ? (
                    <div className="canvas2d-engine-menu-group">
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item canvas2d-engine-menu-item-path"
                        role="menuitem"
                        title={canvasImageSavePath || "未设置画布图片位置"}
                        onClick={() => {
                          void bridge.revealCanvasImageSavePath();
                        }}
                      >
                        <span>打开图片位置</span>
                        <span className="canvas2d-engine-menu-meta">{formatPathLabel(canvasImageSavePath, "未设置")}</span>
                      </button>
                      <button
                        type="button"
                        className="canvas2d-engine-menu-item"
                        role="menuitem"
                        onClick={() => {
                          void bridge.pickCanvasImageSavePath();
                        }}
                      >
                        <span>设置图片位置</span>
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={`canvas2d-engine-menu-item${autosaveEnabled ? " is-active" : ""}`}
                    role="menuitemcheckbox"
                    aria-checked={autosaveEnabled}
                    onClick={() => {
                      void bridge.toggleAutosave();
                    }}
                  >
                    <span>自动保存 (30s)</span>
                    <span className="canvas2d-engine-menu-meta">{autosaveEnabled ? "开" : "关"}</span>
                  </button>
                  <button
                    type="button"
                    className={`canvas2d-engine-menu-item canvas2d-engine-menu-item-toggle${alignmentSnapMenuOpen ? " is-active" : ""}`}
                    role="menuitem"
                    aria-expanded={alignmentSnapMenuOpen}
                    onClick={() => setAlignmentSnapMenuOpen((value) => !value)}
                  >
                    <span>自动对齐吸附</span>
                    <ChevronIcon open={alignmentSnapMenuOpen} />
                  </button>
                  {alignmentSnapMenuOpen ? (
                    <div className="canvas2d-engine-menu-group">
                      <button
                        type="button"
                        className={`canvas2d-engine-menu-item${alignmentSnapEnabled ? " is-active" : ""}`}
                        role="menuitemcheckbox"
                        aria-checked={alignmentSnapEnabled}
                        onClick={() => {
                          void bridge.setAlignmentSnapEnabled(!alignmentSnapEnabled);
                        }}
                      >
                        <span>启用自动吸附</span>
                        <span className="canvas2d-engine-menu-meta">{alignmentSnapEnabled ? "开" : "关"}</span>
                      </button>
                      <button
                        type="button"
                        className={`canvas2d-engine-menu-item${alignmentSnapShowGuides ? " is-active" : ""}${alignmentSnapEnabled ? "" : " is-disabled"}`}
                        role="menuitemcheckbox"
                        aria-checked={alignmentSnapShowGuides}
                        disabled={!alignmentSnapEnabled}
                        onClick={() => {
                          if (!alignmentSnapEnabled) {
                            return;
                          }
                          void bridge.setAlignmentSnapConfig({
                            showGuides: !alignmentSnapShowGuides,
                          });
                        }}
                      >
                        <span>显示参考线</span>
                        <span className="canvas2d-engine-menu-meta">{alignmentSnapShowGuides ? "开" : "关"}</span>
                      </button>
                      {ALIGNMENT_SNAP_THRESHOLD_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`canvas2d-engine-menu-item${alignmentSnapThreshold === option.value ? " is-active" : ""}${alignmentSnapEnabled ? "" : " is-disabled"}`}
                          role="menuitemradio"
                          aria-checked={alignmentSnapThreshold === option.value}
                          disabled={!alignmentSnapEnabled}
                          onClick={() => {
                            if (!alignmentSnapEnabled) {
                              return;
                            }
                            void bridge.setAlignmentSnapConfig({
                              thresholdPx: option.value,
                            });
                          }}
                        >
                          <span>吸附阈值 {option.label}</span>
                          <span className="canvas2d-engine-menu-meta">{option.value}px</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={`canvas2d-engine-menu-item canvas2d-engine-menu-item-toggle${backgroundMenuOpen ? " is-active" : ""}`}
                    role="menuitem"
                    aria-expanded={backgroundMenuOpen}
                    onClick={() => setBackgroundMenuOpen((value) => !value)}
                  >
                    <span>画布背景</span>
                    <ChevronIcon open={backgroundMenuOpen} />
                  </button>
                  {backgroundMenuOpen ? (
                    <div className="canvas2d-engine-menu-group">
                      {BOARD_BACKGROUND_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`canvas2d-engine-menu-item${boardBackgroundPattern === option.value ? " is-active" : ""}`}
                          role="menuitemradio"
                          aria-checked={boardBackgroundPattern === option.value}
                          onClick={() => {
                            void bridge.setBoardBackgroundPattern(option.value);
                          }}
                        >
                          <span>{option.label}</span>
                          <span className="canvas2d-engine-menu-meta">
                            {boardBackgroundPattern === option.value ? "当前" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="canvas2d-engine-menu-item"
                    role="menuitem"
                    onClick={() => {
                      closeMenu();
                      dispatchTutorialUiEvent({
                        type: TUTORIAL_EVENT_TYPES.OPEN_GLOBAL_TUTORIAL_INTRO,
                      });
                    }}
                  >
                    <span>使用说明</span>
                  </button>
                  <button
                    type="button"
                    className="canvas2d-engine-menu-item"
                    data-tutorial-target="tutorial-entry"
                    role="menuitem"
                    onClick={() => {
                      closeMenu();
                      dispatchTutorialUiEvent({
                        type: TUTORIAL_EVENT_TYPES.OPEN_GLOBAL_TUTORIAL_CENTER,
                      });
                    }}
                  >
                    <span>画布教程</span>
                  </button>
                  <button
                    type="button"
                    className={`canvas2d-engine-menu-item canvas2d-engine-menu-item-toggle${aboutMenuOpen ? " is-active" : ""}`}
                    role="menuitem"
                    aria-expanded={aboutMenuOpen}
                    onClick={() => setAboutMenuOpen((value) => !value)}
                  >
                    <span>关于画布</span>
                    <ChevronIcon open={aboutMenuOpen} />
                  </button>
                  {aboutMenuOpen ? (
                    <div className="canvas2d-engine-menu-group canvas2d-engine-menu-group-about">
                      <div className="canvas2d-engine-menu-about-block">
                        <div className="canvas2d-engine-menu-subtitle">画布信息</div>
                        <div className="canvas2d-engine-menu-about-list">
                          {ABOUT_CANVAS_INFO_ITEMS.map((item) => (
                            <div key={item.label} className="canvas2d-engine-menu-about-row">
                              <span className="canvas2d-engine-menu-about-label">{item.label}：</span>
                              <span className="canvas2d-engine-menu-about-value">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="canvas2d-engine-menu-about-block">
                        <div className="canvas2d-engine-menu-subtitle">联系方式</div>
                        <div className="canvas2d-engine-menu-about-list">
                          {ABOUT_CANVAS_CONTACT_ITEMS.map((item) => (
                            <div key={item.label} className="canvas2d-engine-menu-about-row">
                              <span className="canvas2d-engine-menu-about-label">{item.label}：</span>
                              {item.href ? (
                                <a
                                  className="canvas2d-engine-menu-about-link"
                                  href={item.href}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {item.value}
                                </a>
                              ) : (
                                <span className="canvas2d-engine-menu-about-value">{item.value}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="canvas2d-engine-search-stack">
        <div className="canvas2d-engine-search-row">
          <div ref={searchRef} className="canvas2d-engine-search-wrap" aria-label="画布内容搜索入口">
            <CanvasSearchOverlay
              isOpen={searchOpen}
              query={searchQuery}
              results={searchResults}
              activeIndex={searchActiveIndex}
              highlightQuery={searchQuery}
              onOpen={openSearch}
              onClose={closeSearch}
              onQueryChange={(value) => {
                setSearchQuery(value);
                setSearchActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              onHoverResult={setSearchActiveIndex}
              onSelectResult={handleSearchSelect}
              inputRef={searchInputRef}
            />
          </div>
          <div ref={exportHistoryRef} className="canvas2d-engine-export-history-wrap" aria-label="导出历史入口">
            <button
              type="button"
              className={`canvas2d-engine-export-history-trigger${exportHistoryOpen ? " is-active" : ""}`}
              onClick={() => setExportHistoryOpen((value) => !value)}
              title="查看最近导出记录"
              aria-label="查看最近导出记录"
            >
              <span className="canvas2d-engine-export-history-icon" aria-hidden="true">
                <ExportHistoryIcon />
              </span>
            </button>
            {exportHistory.length ? (
              <span className="canvas2d-engine-export-history-badge" aria-hidden="true">
                {Math.min(10, exportHistory.length)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="canvas2d-engine-export-history-layer">
          {exportHistoryOpen ? (
            <div className="canvas2d-engine-export-history-panel">
              <div className="canvas2d-engine-export-history-panel-head">
                <strong>导出记录</strong>
                <span>当前画布最近 10 次</span>
              </div>
              <div className="canvas2d-engine-export-history-list">
                {exportHistory.length ? (
                  exportHistory.map((entry) => {
                    const jumpTarget = String(entry?.jumpTarget || entry?.filePath || "").trim();
                    const pathLabel = String(entry?.filePath || entry?.fileName || "").trim();
                    const interactive = Boolean(jumpTarget);
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
                        <span className="canvas2d-engine-export-history-item-main">
                          <strong>{entry.title || "导出记录"}</strong>
                          <span>{pathLabel || "浏览器下载未返回本地路径"}</span>
                        </span>
                        <span className="canvas2d-engine-export-history-item-meta">
                          <span>{getExportScopeLabel(entry.scope)}</span>
                          <span>{getExportKindLabel(entry.kind)}</span>
                          <span>{formatExportRecordTime(entry.exportedAt)}</span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="canvas2d-engine-export-history-empty">
                    <strong>还没有导出记录</strong>
                    <span>导出 Word、PDF、PNG 后会出现在这里。</span>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      </div>
      </div>

      {searchHighlightStyle ? (
        <div className="canvas2d-engine-search-highlight" style={searchHighlightStyle} />
      ) : null}

      <div className="canvas2d-engine-corner canvas2d-engine-corner-bottom-right" aria-label="工作白板缩放区">
        <div className="canvas2d-floating-card canvas2d-floating-card-zoom">
          <div className="canvas2d-zoom-display">
            <span className="canvas2d-zoom-label">缩放</span>
            <strong>{zoomPercent}%</strong>
          </div>
          <div className="canvas2d-zoom-actions">
            <button type="button" className="canvas2d-zoom-btn" onClick={() => bridge.zoomOut()} title="缩小">
              -
            </button>
            <button type="button" className="canvas2d-zoom-btn is-wide" onClick={() => bridge.resetView()} title="恢复默认">
              恢复默认
            </button>
            <button type="button" className="canvas2d-zoom-btn is-wide" onClick={() => bridge.zoomToFit()} title="定位">
              定位
            </button>
            <button type="button" className="canvas2d-zoom-btn" onClick={() => bridge.zoomIn()} title="放大">
              +
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
