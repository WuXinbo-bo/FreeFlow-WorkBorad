import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createCanvas2DReactBridge } from "../reactBridge.js";
import {
  createCanvasTutorialBridge,
  createCanvasTutorialRuntime,
  CanvasTutorialOverlay,
} from "../tutorial-system/canvasTutorialIndex.js";
import { CanvasSearchOverlay } from "../search/canvasSearchOverlay.jsx";
import { WordExportPreviewDialog } from "./WordExportPreviewDialog.jsx";
import { BoardWorkspaceDialog } from "./BoardWorkspaceDialog.jsx";
import { buildCanvasSearchResults } from "../search/canvasSearchIndex.js";
import { getElementBounds } from "../elements/index.js";
import { getFileCardPreviewBounds } from "../elements/fileCard.js";
import { loadVendorEsmModule } from "../vendor/loadVendorEsmModule.js";
import { dispatchTutorialUiEvent, subscribeTutorialUiEvent } from "../../../tutorial-core/tutorialEventBus.js";
import { TUTORIAL_EVENT_TYPES } from "../../../tutorial-core/tutorialTypes.js";

const DRAW_TOOLS = [
  { key: "rect", icon: "▢", label: "矩形", shortcut: "R" },
  { key: "ellipse", icon: "◯", label: "椭圆", shortcut: "E" },
  { key: "arrow", icon: "→", label: "箭头", shortcut: "A" },
  { key: "line", icon: "—", label: "直线", shortcut: "L" },
  { key: "highlight", icon: "▭", label: "高亮", shortcut: "H" },
];

const INSERT_TOOLS = [
  {
    key: "table",
    icon: "▦",
    label: "表格",
    meta: "3 × 3，可继续编辑",
    shortcut: "Table",
  },
  {
    key: "codeBlock",
    icon: "</>",
    label: "代码块",
    meta: "支持语言与行号",
    shortcut: "Code",
  },
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

function InsertIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
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

const FILE_CARD_PREVIEW_ZOOM_MIN = 0.34;
const FILE_CARD_PREVIEW_ZOOM_MAX = 1.9;
const FILE_CARD_PREVIEW_DEFAULT_ZOOM = 0.82;
const FILE_CARD_PREVIEW_DOCX_PAGE_WIDTH = 794;
const FILE_CARD_PREVIEW_PDF_PAGE_WIDTH = 794;

function buildFallbackFileCardPreviewItem(request = null) {
  const anchor = request?.anchor && typeof request.anchor === "object" ? request.anchor : null;
  if (!anchor) {
    return null;
  }
  return {
    id: String(request?.itemId || ""),
    type: "fileCard",
    x: Number(anchor.x || 0) || 0,
    y: Number(anchor.y || 0) || 0,
    width: Math.max(1, Number(anchor.width || 0) || 0),
    height: Math.max(1, Number(anchor.height || 0) || 0),
    fileName: String(request?.fileName || "文件预览"),
    name: String(request?.fileName || "文件预览"),
  };
}

function decodeBase64ToByteArray(base64 = "") {
  const normalized = String(base64 || "").trim();
  if (!normalized) {
    return null;
  }
  const binary = globalThis.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getFileCardPreviewRuntimeLabel(status = "", renderState = "") {
  const normalizedRender = String(renderState || "").trim();
  const normalizedStatus = String(status || "").trim();
  if (normalizedRender === "failed" || normalizedStatus === "failed" || normalizedStatus === "unavailable") {
    return "渲染失败";
  }
  if (normalizedRender === "suppressed") return "已省略";
  if (normalizedRender === "deferred") return "恢复中";
  if (normalizedRender === "ready") return "已恢复";
  if (normalizedRender === "rendering") return "解析中";
  return "加载中";
}

function getPreviewDisplayLabel(request = null) {
  const kind = String(request?.previewKind || "").trim().toLowerCase();
  if (kind === "pdf") {
    return {
      badge: "PDF",
      noun: "PDF",
      loadingText: "正在加载 PDF 预览...",
      preparingText: "正在准备 PDF 预览...",
      suppressedText: "当前视图过小，已省略实时 PDF 预览。放大后自动恢复。",
      renderingText: "正在解析 PDF 文档...",
      readyText: "PDF 预览已生成",
      failedText: "PDF 预览渲染失败",
      unavailableText: "PDF 预览暂不可用",
      generatingText: "正在生成 PDF 预览",
      scrollAriaLabel: "PDF 预览滚动区域",
    };
  }
  return {
    badge: "DOCX",
    noun: "Word",
    loadingText: "正在加载 Word 预览...",
    preparingText: "正在准备 Word 预览...",
    suppressedText: "当前视图过小，已省略实时 Word 预览。放大后自动恢复。",
    renderingText: "正在解析 Word 文档...",
    readyText: "Word 预览已生成",
    failedText: "Word 预览渲染失败",
    unavailableText: "Word 预览暂不可用",
    generatingText: "正在生成 Word 预览",
    scrollAriaLabel: "Word 预览滚动区域",
  };
}

function FileCardAttachedPreview({ request = null, board = null, bridge = null }) {
  const hostRef = useRef(null);
  const styleRef = useRef(null);
  const scrollRef = useRef(null);
  const frameRef = useRef(null);
  const zoomRef = useRef(FILE_CARD_PREVIEW_DEFAULT_ZOOM);
  const previewLabel = useMemo(() => getPreviewDisplayLabel(request), [request]);
  const [fitScale, setFitScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(1123);
  const [renderState, setRenderState] = useState({
    status: String(request?.previewRenderState || request?.previewStatus || "loading"),
    message: String(request?.previewRenderMessage || request?.previewMessage || previewLabel.loadingText),
    loadState: "待开始",
    parseState: "待开始",
    pageCount: 0,
    contentNodeCount: 0,
    runtimeLabel: "加载中",
  });

  const item = useMemo(() => {
    if (!request?.itemId || !Array.isArray(board?.items)) {
      return buildFallbackFileCardPreviewItem(request);
    }
    return board.items.find((entry) => String(entry?.id || "") === String(request.itemId || "")) || buildFallbackFileCardPreviewItem(request);
  }, [board?.items, request?.itemId]);

  const placement = useMemo(() => {
    if (!request?.open || !board?.view) {
      return null;
    }
    const bounds = item
      ? getFileCardPreviewBounds(item, { expanded: Boolean(request.expanded) })
      : {
          left: Number(request?.anchor?.x || 0) || 0,
          top: (Number(request?.anchor?.y || 0) || 0) + (Number(request?.anchor?.height || 128) || 128) - 20,
          width: 360,
          height: request?.expanded ? 920 : 468,
        };
    const scale = Math.max(0.1, Number(board.view.scale || 1));
    return {
      screenWidth: bounds.width * scale,
      screenHeight: bounds.height * scale,
      style: {
        left: `${Math.round(bounds.left * scale + Number(board.view.offsetX || 0))}px`,
        top: `${Math.round(bounds.top * scale + Number(board.view.offsetY || 0))}px`,
        width: `${Math.round(bounds.width)}px`,
        height: `${Math.round(bounds.height)}px`,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      },
    };
  }, [board?.view, item, request?.expanded, request?.open]);
  const style = placement?.style || null;
  const livePreviewSuppressed = Boolean(placement && (placement.screenWidth < 260 || placement.screenHeight < 220));

  const previewKind = String(request?.previewKind || "docx").trim().toLowerCase();
  const previewMime = String(request?.previewMime || "").trim().toLowerCase();
  const fileBase64 = String(request?.previewFileBase64 || "").trim();
  const previewStatus = String(request?.previewStatus || "").trim();
  const previewBaseWidth = previewKind === "pdf" ? FILE_CARD_PREVIEW_PDF_PAGE_WIDTH : FILE_CARD_PREVIEW_DOCX_PAGE_WIDTH;
  const previewZoom = clamp(
    Number(request?.previewZoom || FILE_CARD_PREVIEW_DEFAULT_ZOOM) || FILE_CARD_PREVIEW_DEFAULT_ZOOM,
    FILE_CARD_PREVIEW_ZOOM_MIN,
    FILE_CARD_PREVIEW_ZOOM_MAX
  );

  useEffect(() => {
    zoomRef.current = previewZoom;
  }, [previewZoom]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!(scroll instanceof HTMLElement) || !request?.open) {
      return undefined;
    }
    const updateFitScale = () => {
      const availableWidth = Math.max(160, Number(scroll.clientWidth || 0) - 36);
      const nextFitScale = clamp(availableWidth / previewBaseWidth, 0.22, 1);
      setFitScale((current) => (Math.abs(current - nextFitScale) > 0.01 ? nextFitScale : current));
    };
    updateFitScale();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateFitScale) : null;
    observer?.observe(scroll);
    window.addEventListener("resize", updateFitScale);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateFitScale);
    };
  }, [previewBaseWidth, request?.expanded, request?.id, request?.open, style?.width]);

  useEffect(() => {
    const host = hostRef.current;
    const styleHost = styleRef.current;
    if (!(host instanceof HTMLElement) || !(styleHost instanceof HTMLElement)) {
      return undefined;
    }
    if (!request?.open) {
      return undefined;
    }
    const diagnostics = request?.previewDiagnostics && typeof request.previewDiagnostics === "object"
      ? request.previewDiagnostics
      : {};
    if (livePreviewSuppressed) {
      host.innerHTML = "";
      styleHost.innerHTML = "";
      setRenderState({
        status: "suppressed",
        message: previewLabel.suppressedText,
        loadState: String(diagnostics.loadState || "文档已加载"),
        parseState: String(diagnostics.parseState || "已暂停"),
        pageCount: Number(diagnostics.pageCount || 0) || 0,
        contentNodeCount: Number(diagnostics.contentNodeCount || 0) || 0,
        runtimeLabel: "已省略",
      });
      setContentHeight(1123);
      return undefined;
    }
    if (previewStatus !== "ready" || !fileBase64) {
      host.innerHTML = "";
      styleHost.innerHTML = "";
      setContentHeight(1123);
      setRenderState({
        status: previewStatus || "loading",
        message: String(request?.previewMessage || previewLabel.loadingText),
        loadState: String(diagnostics.loadState || (previewStatus === "failed" ? "加载失败" : "加载中")),
        parseState: String(diagnostics.parseState || "待开始"),
        pageCount: Number(diagnostics.pageCount || 0) || 0,
        contentNodeCount: Number(diagnostics.contentNodeCount || 0) || 0,
        runtimeLabel: getFileCardPreviewRuntimeLabel(previewStatus, request?.previewRenderState),
      });
      return undefined;
    }

    let cancelled = false;
    setRenderState({
      status: "rendering",
      message: previewLabel.renderingText,
      loadState: "文档已加载",
      parseState: "解析中",
      pageCount: 0,
      contentNodeCount: 0,
      runtimeLabel: "解析中",
    });

    const render = async () => {
      const bytes = decodeBase64ToByteArray(fileBase64);
      if (!bytes?.length) {
        throw new Error("预览文档为空");
      }
      host.innerHTML = "";
      styleHost.innerHTML = "";
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      let pages = 0;
      let nodes = 0;
      if (previewKind === "pdf") {
        const module = await loadVendorEsmModule("pdfjs-dist");
        const { getDocument, GlobalWorkerOptions } = module || {};
        if (typeof getDocument !== "function" || !GlobalWorkerOptions) {
          throw new Error("pdfjs-dist 未提供 PDF 渲染能力");
        }
        if (!GlobalWorkerOptions.workerSrc) {
          GlobalWorkerOptions.workerSrc = new URL("../../../../assets/vendor/pdfjs-dist/pdf.worker.mjs", import.meta.url).toString();
        }
        const loadingTask = getDocument({
          data: bytes,
          useWorkerFetch: false,
          isEvalSupported: false,
          cMapUrl: new URL("../../../../assets/vendor/pdfjs-dist/cmaps/", import.meta.url).toString(),
          standardFontDataUrl: new URL("../../../../assets/vendor/pdfjs-dist/standard_fonts/", import.meta.url).toString(),
          wasmUrl: new URL("../../../../assets/vendor/pdfjs-dist/wasm/", import.meta.url).toString(),
        });
        const pdfDocument = await loadingTask.promise;
        pages = Number(pdfDocument.numPages || 0) || 0;
        for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
          if (cancelled) {
            break;
          }
          const page = await pdfDocument.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          const pageShell = document.createElement("div");
          pageShell.className = "canvas2d-file-preview-react-pdf-page";
          pageShell.style.width = `${Math.round(viewport.width)}px`;
          pageShell.style.height = `${Math.round(viewport.height)}px`;
          const canvas = document.createElement("canvas");
          canvas.className = "canvas2d-file-preview-react-pdf-canvas";
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          canvas.style.width = `${Math.round(viewport.width)}px`;
          canvas.style.height = `${Math.round(viewport.height)}px`;
          pageShell.appendChild(canvas);
          host.appendChild(pageShell);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) {
            throw new Error("PDF 预览画布上下文不可用");
          }
          await page.render({
            canvasContext: context,
            viewport,
          }).promise;
          nodes += 1;
        }
        setContentHeight(Math.max(1123, Number(host.scrollHeight || host.offsetHeight || 0) || 1123));
      } else {
        const module = await loadVendorEsmModule("docx-preview");
        const renderAsync = module?.renderAsync;
        if (typeof renderAsync !== "function") {
          throw new Error("docx-preview 未提供 renderAsync");
        }
        await renderAsync(buffer, host, styleHost, {
          className: "canvas2d-file-card-docx-preview-document",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          useBase64URL: true,
        });
        setContentHeight(Math.max(1123, Number(host.scrollHeight || host.offsetHeight || 0) || 1123));
        pages = host.querySelectorAll(
          "section.docx, section.canvas2d-file-card-docx-preview-document, .docx-wrapper section.docx, .canvas2d-file-card-docx-preview-document-wrapper section.canvas2d-file-card-docx-preview-document"
        ).length;
        nodes = host.querySelectorAll(
          "article, p, table, ul, ol, li, img, svg, canvas, .docx-wrapper *, section.docx *, .canvas2d-file-card-docx-preview-document-wrapper *, section.canvas2d-file-card-docx-preview-document *"
        ).length;
      }
      if (!pages || !nodes) {
        throw new Error(`${previewLabel.noun} 页面未成功生成：页面 ${pages}，正文节点 ${nodes}`);
      }
      if (!cancelled) {
        setRenderState({
          status: "ready",
          message: previewLabel.readyText,
          loadState: "文档已加载",
          parseState: "是",
          pageCount: pages,
          contentNodeCount: nodes,
          runtimeLabel: "已恢复",
        });
      }
    };

    void render().catch((error) => {
      if (cancelled) {
        return;
      }
      const pages =
        previewKind === "pdf"
          ? host.querySelectorAll(".canvas2d-file-preview-react-pdf-page").length
          : host.querySelectorAll(
              "section.docx, section.canvas2d-file-card-docx-preview-document, .docx-wrapper section.docx, .canvas2d-file-card-docx-preview-document-wrapper section.canvas2d-file-card-docx-preview-document"
            ).length;
      const nodes =
        previewKind === "pdf"
          ? host.querySelectorAll(".canvas2d-file-preview-react-pdf-canvas").length
          : host.querySelectorAll(
              "article, p, table, ul, ol, li, img, svg, canvas, .docx-wrapper *, section.docx *, .canvas2d-file-card-docx-preview-document-wrapper *, section.canvas2d-file-card-docx-preview-document *"
            ).length;
      setRenderState({
        status: "failed",
        message: String(error?.message || previewLabel.failedText).trim() || previewLabel.failedText,
        loadState: "文档已加载",
        parseState: "否",
        pageCount: pages,
        contentNodeCount: nodes,
        runtimeLabel: "渲染失败",
      });
    });

    return () => {
      cancelled = true;
    };
  }, [fileBase64, livePreviewSuppressed, previewKind, previewLabel, previewMime, previewStatus, request?.id, request?.open, request?.previewDiagnostics, request?.previewMessage, request?.previewRenderState]);

  useEffect(() => {
    const host = hostRef.current;
    const frame = frameRef.current;
    if (host instanceof HTMLElement && frame instanceof HTMLElement) {
      const effectiveZoom = String(clamp(previewZoom * fitScale, 0.18, FILE_CARD_PREVIEW_ZOOM_MAX));
      const normalizedHeight = `${Math.max(1123, Number(contentHeight || 1123) || 1123)}px`;
      frame.style.setProperty("--file-card-preview-zoom", effectiveZoom);
      frame.style.setProperty("--file-card-preview-content-height", normalizedHeight);
      frame.style.setProperty("--file-card-preview-base-width", `${previewBaseWidth}px`);
      host.style.setProperty("--file-card-preview-zoom", effectiveZoom);
      host.style.setProperty("--file-card-preview-content-height", normalizedHeight);
      host.style.setProperty("--file-card-preview-base-width", `${previewBaseWidth}px`);
    }
  }, [contentHeight, fitScale, previewBaseWidth, previewZoom]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!(scroll instanceof HTMLElement) || !request?.open) {
      return undefined;
    }
    const handleWheel = (event) => {
      event.stopPropagation();
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const nextZoom = clamp(zoomRef.current + direction * 0.1, FILE_CARD_PREVIEW_ZOOM_MIN, FILE_CARD_PREVIEW_ZOOM_MAX);
      bridge?.setFileCardPreviewZoom?.(request.id, nextZoom);
    };
    scroll.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      scroll.removeEventListener("wheel", handleWheel);
    };
  }, [bridge, request?.id, request?.open]);

  if (!request?.open) {
    return null;
  }

  const diagnosticStyle = style || {
    left: "24px",
    top: "24px",
    width: "360px",
    height: "468px",
    transform: "scale(1)",
    transformOrigin: "top left",
  };
  const missingAnchor = !item || !style;
  const statusLabel = getFileCardPreviewRuntimeLabel(previewStatus, renderState.status);
  const showPlaceholder = renderState.status !== "ready" || missingAnchor;

  return (
    <div
      className="canvas2d-file-preview-react"
      style={diagnosticStyle}
      data-render-state={missingAnchor ? "failed" : renderState.status}
      data-preview-kernel={previewKind === "pdf" ? "react-pdfjs-v1" : "react-docx-v2"}
    >
      <div className="canvas2d-file-preview-react-head">
        <div className="canvas2d-file-preview-react-kicker">
          <span>{String(request?.previewBadgeLabel || previewLabel.badge)}</span>
          <span>文档预览</span>
        </div>
        <button type="button" className="canvas2d-file-preview-react-close" onClick={() => bridge?.closeFileCardPreview?.(request.id)} aria-label="关闭预览">
          ×
        </button>
      </div>
      <div className="canvas2d-file-preview-react-actions">
        <button type="button" onClick={() => bridge?.setFileCardPreviewZoom?.(request.id, previewZoom - 0.1)}>-</button>
        <button type="button" onClick={() => bridge?.setFileCardPreviewZoom?.(request.id, FILE_CARD_PREVIEW_DEFAULT_ZOOM)}>
          {Math.round(previewZoom * 100)}%
        </button>
        <button type="button" onClick={() => bridge?.setFileCardPreviewZoom?.(request.id, previewZoom + 0.1)}>+</button>
        <button type="button" onClick={() => bridge?.toggleFileCardPreviewExpanded?.(request.id)}>
          {request.expanded ? "收起" : "全部展开"}
        </button>
      </div>
      <div className="canvas2d-file-preview-react-shell">
        <div className="canvas2d-file-preview-react-diagnostics">
          <span>加载文档 <strong>{renderState.loadState}</strong></span>
          <span>解析成功 <strong>{renderState.parseState}</strong></span>
          <span>正文节点数 <strong>{renderState.contentNodeCount}</strong></span>
          <span>当前状态 <strong>{statusLabel}</strong></span>
        </div>
        <div ref={styleRef} className="canvas2d-file-preview-react-style-root" />
        <div ref={scrollRef} className="canvas2d-file-preview-react-scroll" tabIndex={0} aria-label={previewLabel.scrollAriaLabel}>
          <div ref={frameRef} className={`canvas2d-file-preview-react-frame${previewKind === "pdf" ? " is-pdf" : " is-docx"}`}>
            <div ref={hostRef} className={`canvas2d-file-preview-react-content${previewKind === "pdf" ? " is-pdf" : " is-docx"}`} />
          </div>
        </div>
        {showPlaceholder ? (
          <div className="canvas2d-file-preview-react-placeholder">
            <strong>{renderState.status === "failed" ? previewLabel.unavailableText : previewLabel.generatingText}</strong>
            <span>{missingAnchor ? "预览锚点缺失：当前文件卡位置数据不可用，已显示诊断壳。" : renderState.message}</span>
          </div>
        ) : null}
      </div>
    </div>
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

const ABOUT_CANVAS_ITEMS = Object.freeze([
  { label: "画布名称", value: "FreeFlow" },
  { label: "版本号", value: "v1.0.9-rc" },
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
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [boardWorkspaceOpen, setBoardWorkspaceOpen] = useState(false);
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
  const [infoPanelAutoHidden, setInfoPanelAutoHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [exportHistoryOpen, setExportHistoryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [searchHighlight, setSearchHighlight] = useState(null);
  const [uiViewport, setUiViewport] = useState({ width: 1440, height: 900 });
  const rootRef = useRef(null);
  const toolbarRef = useRef(null);
  const infoPanelRef = useRef(null);
  const drawMenuRef = useRef(null);
  const insertMenuRef = useRef(null);
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
      if (insertMenuRef.current && insertMenuRef.current.contains(event.target)) {
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
  const boardSearchStats = useMemo(() => {
    const items = Array.isArray(snapshot?.board?.items) ? snapshot.board.items : [];
    return {
      total: items.length,
      text: items.filter((item) => item?.type === "text").length,
      flowNode: items.filter((item) => item?.type === "flowNode").length,
      fileCard: items.filter((item) => item?.type === "fileCard").length,
      image: items.filter((item) => item?.type === "image").length,
    };
  }, [snapshot?.board?.items]);
  const exportHistory = useMemo(
    () => (Array.isArray(snapshot?.exportHistory) ? snapshot.exportHistory.slice(0, 10) : []),
    [snapshot?.exportHistory, snapshot?.exportHistoryUpdatedAt]
  );
  const wordExportPreviewRequest = snapshot?.wordExportPreviewRequest || null;
  const fileCardPreviewRequests = useMemo(
    () => (Array.isArray(snapshot?.fileCardPreviewRequests) ? snapshot.fileCardPreviewRequests : []),
    [snapshot?.fileCardPreviewRequests]
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
    const rootElement = rootRef.current;
    const infoElement = infoPanelRef.current;
    if (!(rootElement instanceof HTMLElement) || !(infoElement instanceof HTMLElement)) {
      return undefined;
    }

    let frameId = 0;
    const scheduleUpdate = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        const infoRect = infoElement.getBoundingClientRect();
        const topbarStackRect =
          rootElement.querySelector(".canvas2d-engine-topbar-stack") instanceof HTMLElement
            ? rootElement.querySelector(".canvas2d-engine-topbar-stack").getBoundingClientRect()
            : null;
        const toolbarWrapRect =
          rootElement.querySelector(".canvas2d-engine-toolbar-wrap") instanceof HTMLElement
            ? rootElement.querySelector(".canvas2d-engine-toolbar-wrap").getBoundingClientRect()
            : null;
        const searchRect = searchRef.current instanceof HTMLElement ? searchRef.current.getBoundingClientRect() : null;
        const exportRect =
          exportHistoryRef.current instanceof HTMLElement ? exportHistoryRef.current.getBoundingClientRect() : null;
        const overlapSafetyGap = 28;
        const occupiedLeft = Math.min(
          topbarStackRect ? topbarStackRect.left : Number.POSITIVE_INFINITY,
          toolbarWrapRect ? toolbarWrapRect.left : Number.POSITIVE_INFINITY,
          searchRect ? searchRect.left : Number.POSITIVE_INFINITY,
          exportRect ? exportRect.left : Number.POSITIVE_INFINITY
        );
        const nextHidden = Number.isFinite(occupiedLeft) && occupiedLeft <= infoRect.right + overlapSafetyGap;
        setInfoPanelAutoHidden((current) => (current === nextHidden ? current : nextHidden));
      });
    };

    scheduleUpdate();
    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            scheduleUpdate();
          })
        : null;
    resizeObserver?.observe(rootElement);
    resizeObserver?.observe(infoElement);
    if (searchRef.current instanceof HTMLElement) {
      resizeObserver?.observe(searchRef.current);
    }
    if (exportHistoryRef.current instanceof HTMLElement) {
      resizeObserver?.observe(exportHistoryRef.current);
    }
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [searchOpen, exportHistoryOpen, uiViewport.width, uiViewport.height]);

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
    setDrawMenuOpen(false);
    setInsertMenuOpen(false);
    setCaptureMenuOpen(false);
    setCapturePdfMenuOpen(false);
    setCapturePngMenuOpen(false);
    setMenuOpen(false);
    setExportMenuOpen(false);
    setAlignmentSnapMenuOpen(false);
    setBackgroundMenuOpen(false);
    setAboutMenuOpen(false);
    setExportHistoryOpen(false);
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
    setExportMenuOpen(false);
    setAlignmentSnapMenuOpen(false);
    setBackgroundMenuOpen(false);
    setAboutMenuOpen(false);
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
        className={`canvas2d-engine-topbar${searchOpen ? " is-search-open" : ""}${infoPanelCollapsed ? " is-info-collapsed" : ""}${infoPanelAutoHidden ? " is-info-auto-hidden" : ""}`}
      >
      <div
        ref={infoPanelRef}
        className="canvas2d-engine-corner canvas2d-engine-corner-top-left"
        aria-label="工作白板模式信息"
      >
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
      <div
        className={`canvas2d-engine-toolbar-wrap${
          drawMenuOpen || insertMenuOpen || captureMenuOpen || menuOpen ? " is-overlay-active" : ""
        }`}
        aria-label="工作白板工具栏"
      >
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
              onClick={() =>
                setDrawMenuOpen((value) => {
                  const next = !value;
                  setInsertMenuOpen(false);
                  setCaptureMenuOpen(false);
                  setCapturePdfMenuOpen(false);
                  setCapturePngMenuOpen(false);
                  setMenuOpen(false);
                  setExportMenuOpen(false);
                  setAlignmentSnapMenuOpen(false);
                  setBackgroundMenuOpen(false);
                  setAboutMenuOpen(false);
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

          <div className="canvas2d-engine-tool-group" ref={insertMenuRef}>
            <button
              type="button"
              className={`canvas2d-engine-tool${insertMenuOpen ? " is-active" : ""}`}
              onClick={() =>
                setInsertMenuOpen((value) => {
                  const next = !value;
                  setDrawMenuOpen(false);
                  setCaptureMenuOpen(false);
                  setCapturePdfMenuOpen(false);
                  setCapturePngMenuOpen(false);
                  setMenuOpen(false);
                  setExportMenuOpen(false);
                  setAlignmentSnapMenuOpen(false);
                  setBackgroundMenuOpen(false);
                  setAboutMenuOpen(false);
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
                <InsertIcon />
              </span>
              <span className="canvas2d-engine-tool-shortcut">+</span>
            </button>
            {insertMenuOpen ? (
              <div className="canvas2d-engine-menu canvas2d-engine-insert-menu" role="menu">
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
                    <span className="canvas2d-engine-menu-icon" aria-hidden="true">{tool.icon}</span>
                    <span className="canvas2d-engine-insert-copy">
                      <strong>{tool.label}</strong>
                      <small>{tool.meta}</small>
                    </span>
                    <kbd>{tool.shortcut}</kbd>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="canvas2d-engine-tool-group" ref={captureMenuRef}>
            <button
              type="button"
              className={`canvas2d-engine-tool${captureMenuOpen ? " is-active" : ""}`}
              onClick={() => {
                setDrawMenuOpen(false);
                setInsertMenuOpen(false);
                setMenuOpen(false);
                setExportMenuOpen(false);
                setAlignmentSnapMenuOpen(false);
                setBackgroundMenuOpen(false);
                setAboutMenuOpen(false);
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
                  setDrawMenuOpen(false);
                  setInsertMenuOpen(false);
                  setCaptureMenuOpen(false);
                  setCapturePdfMenuOpen(false);
                  setCapturePngMenuOpen(false);
                  setSearchOpen(false);
                  setExportHistoryOpen(false);
                  if (!next) {
                    setExportMenuOpen(false);
                    setAlignmentSnapMenuOpen(false);
                    setBackgroundMenuOpen(false);
                    setAboutMenuOpen(false);
                  }
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
                    className="canvas2d-engine-menu-item canvas2d-engine-menu-item-primary canvas2d-engine-menu-item-path"
                    role="menuitem"
                    title={boardFilePath || "未设置画布工作区"}
                    onClick={() => {
                      closeMenu();
                      setBoardWorkspaceOpen(true);
                    }}
                  >
                    <span>画布工作区</span>
                    <span className="canvas2d-engine-menu-meta">{formatPathLabel(boardFilePath, "未设置")}</span>
                  </button>
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
      <div className={`canvas2d-engine-search-stack${searchOpen || exportHistoryOpen ? " is-overlay-active" : ""}`}>
        <div className="canvas2d-engine-search-row">
          <div ref={searchRef} className="canvas2d-engine-search-wrap" aria-label="画布内容搜索入口">
            <CanvasSearchOverlay
              isOpen={searchOpen}
              query={searchQuery}
              results={searchResults}
              stats={boardSearchStats}
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
              onClick={() =>
                setExportHistoryOpen((value) => {
                  const next = !value;
                  setDrawMenuOpen(false);
                  setInsertMenuOpen(false);
                  setCaptureMenuOpen(false);
                  setCapturePdfMenuOpen(false);
                  setCapturePngMenuOpen(false);
                  setMenuOpen(false);
                  setExportMenuOpen(false);
                  setAlignmentSnapMenuOpen(false);
                  setBackgroundMenuOpen(false);
                  setAboutMenuOpen(false);
                  setSearchOpen(false);
                  return next;
                })
              }
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
                <strong>最近导出</strong>
                <span className="canvas2d-engine-export-history-count">{exportHistory.length || 0}</span>
              </div>
              <div className="canvas2d-engine-export-history-panel-meta">
                <span>保留最近 10 条</span>
                <span>点击可直接打开本地结果</span>
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
                    <span>导出 Word、PDF 或 PNG 后，会在这里出现最近记录。</span>
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

      {fileCardPreviewRequests.map((request) => (
        <FileCardAttachedPreview
          key={request?.id || `file-card-preview-${request?.itemId || Math.random()}`}
          request={request}
          board={snapshot?.board}
          bridge={bridge}
        />
      ))}

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

      <WordExportPreviewDialog
        request={wordExportPreviewRequest}
        exporting={Boolean(wordExportPreviewRequest?.exporting)}
        onClose={() => bridge.closeWordExportPreview(wordExportPreviewRequest?.id)}
        onConfirm={() => {
          void bridge.confirmWordExportPreview(wordExportPreviewRequest?.id);
        }}
      />

      <BoardWorkspaceDialog
        open={boardWorkspaceOpen}
        bridge={bridge}
        snapshot={snapshot}
        onClose={() => setBoardWorkspaceOpen(false)}
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

