import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "../../../ui/icons/AppIcon.jsx";
import { createPortal } from "react-dom";
import { getFileCardPreviewBounds, fitFilePreviewBounds } from "../elements/fileCard.js";
import { timeAssetTask } from "../perf/canvasRuntimeStats.js";
import { loadVendorEsmModule } from "../vendor/loadVendorEsmModule.js";
import { createPdfVisiblePageRenderer } from "../documentPreview/pdfVisiblePageRenderer.js";
import { readFileReadingPreference, saveFileReadingPreference } from "../documentPreview/fileReadingPreferences.js";
import { findPreviewText } from "../documentPreview/findPreviewText.js";
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const FILE_CARD_PREVIEW_ZOOM_MIN = 0.34;
const FILE_CARD_PREVIEW_ZOOM_MAX = 1.9;
const FILE_CARD_PREVIEW_DEFAULT_ZOOM = 0.82;
const FILE_CARD_PREVIEW_DOCX_PAGE_WIDTH = 794;
const FILE_CARD_PREVIEW_PDF_PAGE_WIDTH = 794;
const DOCX_PREVIEW_HTML_ARTIFACT = "docx-html-v2";
const PDF_PREVIEW_FIRST_PAGE_ARTIFACT = "pdf-first-page-webp-v1";

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

function buildFilePreviewInteractionSkeletonMarkup({ kind = "docx" } = {}) {
  const pageCount = kind === "pdf" ? 2 : 1;
  return Array.from({ length: pageCount }, (_, index) => {
    const lineCount = kind === "pdf" ? 5 : 4;
    const lines = Array.from({ length: lineCount }, (__, lineIndex) => {
      const widths = kind === "pdf" ? [0.82, 0.74, 0.78, 0.7, 0.56] : [0.86, 0.78, 0.72, 0.58];
      const width = widths[lineIndex] || 0.6;
      return `<span class="canvas2d-file-preview-skeleton-line" style="width:${Math.round(width * 100)}%"></span>`;
    }).join("");
    return `
      <div class="canvas2d-file-preview-skeleton-page${index > 0 ? " is-secondary" : ""}">
        <div class="canvas2d-file-preview-skeleton-strip"></div>
        <div class="canvas2d-file-preview-skeleton-body">${lines}</div>
      </div>
    `;
  }).join("");
}

function getFileCardPreviewRuntimeLabel(status = "", renderState = "") {
  const normalizedRender = String(renderState || "").trim();
  const normalizedStatus = String(status || "").trim();
  if (normalizedRender === "failed" || normalizedStatus === "failed" || normalizedStatus === "unavailable") {
    return "渲染失败";
  }
  if (normalizedRender === "suppressed") return "已省略";
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
  if (["text", "table", "image"].includes(kind)) {
    const noun = { text: "文本", table: "表格", image: "图片" }[kind];
    return { noun, loadingText: `正在读取${noun}`, preparingText: `正在准备${noun}`, suppressedText: "放大画布后恢复预览", renderingText: `正在解析${noun}`, readyText: "预览已就绪", failedText: "预览失败", unavailableText: "预览暂不可用", generatingText: "正在准备预览", scrollAriaLabel: `${noun}预览滚动区域` };
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

export function FileCardAttachedPreview({ request = null, board = null, bridge = null }) {
  const hostRef = useRef(null);
  const pdfRef = useRef(null);
  const rendererRef = useRef(null);
  const searchGeneration = useRef(0);
  const selectionRef = useRef("");
  const searchOffsetRef = useRef(0);
  const pendingSearchNavigationRef = useRef(null);
  const [reading, setReading] = useState(false);
  const [regionMode, setRegionMode] = useState(false);
  const regionRef = useRef(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const interactionRef = useRef(null);
  interactionRef.current = { toolsOpen, regionMode };
  const [query, setQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [sheetNumber, setSheetNumber] = useState(0);
  const [sheets, setSheets] = useState([]);
  const sourcePath = String(request?.sourcePath || "");
  const initialReading = useRef(readFileReadingPreference(sourcePath));
  const readingPosition = useRef(initialReading.current.scrollOffset || 0);
  const scrollRef = useRef(null);
  const frameRef = useRef(null);
  const docxFrameRef = useRef(null);
  const zoomRef = useRef(FILE_CARD_PREVIEW_DEFAULT_ZOOM);
  const previewLabel = useMemo(() => getPreviewDisplayLabel(request), [request?.previewKind]);
  const portalHost = useMemo(() => bridge?.getDocumentPreviewPortalHost?.() || null, [bridge]);
  const [fitScale, setFitScale] = useState(1);
  const resizeRef = useRef(null);
  const [resizeHeight, setResizeHeight] = useState(null);
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

  useEffect(() => {
    if (item?.sourcePath && item.sourcePath !== sourcePath) bridge?.closeFileCardPreview?.(request.id);
  }, [item?.sourcePath, sourcePath, bridge, request?.id]);

  const placement = useMemo(() => {
    if (!request?.open) {
      return null;
    }
    const anchorBounds = item
      ? getFileCardPreviewBounds(item, { expanded: Boolean(request.expanded) })
      : {
          left: Number(request?.anchor?.x || 0) || 0,
          top: (Number(request?.anchor?.y || 0) || 0) + (Number(request?.anchor?.height || 128) || 128) + 8,
          width: 360,
          height: request?.expanded ? 920 : 468,
        };
    const bounds = fitFilePreviewBounds({ ...anchorBounds, height: resizeHeight ?? anchorBounds.height });
    const scale = Math.max(0.1, Number(board?.view?.scale || 1));
    return {
      screenWidth: bounds.width * scale,
      screenHeight: bounds.height * scale,
      style: {
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      },
    };
  }, [board?.view, item, request?.expanded, request?.open, resizeHeight]);
  const style = placement?.style || null;
  const livePreviewSuppressed = Boolean(!reading && placement && (placement.screenWidth < 260 || placement.screenHeight < 220));

  const previewKind = String(request?.previewKind || "docx").trim().toLowerCase();
  const previewMime = String(request?.previewMime || "").trim().toLowerCase();
  const previewStatus = String(request?.previewStatus || "").trim();
  const previewSessionData = useMemo(() => {
    if (previewStatus !== "ready") return null;
    return bridge?.getDocumentPreviewSessionData?.(
      String(request?.previewSessionId || request?.id || "").trim(),
      Number(request?.previewGeneration || 0) || 0,
      { copy: false }
    ) || null;
  }, [bridge, previewStatus, request?.id, request?.previewGeneration, request?.previewSessionId]);
  const fileBytes = previewSessionData?.bytes instanceof Uint8Array ? previewSessionData.bytes : null;
  const [pageWidth, setPageWidth] = useState(FILE_CARD_PREVIEW_DOCX_PAGE_WIDTH);
  const previewBaseWidth = pageWidth;
  const previewZoom = clamp(
    Number(request?.previewZoom || FILE_CARD_PREVIEW_DEFAULT_ZOOM) || FILE_CARD_PREVIEW_DEFAULT_ZOOM,
    FILE_CARD_PREVIEW_ZOOM_MIN,
    FILE_CARD_PREVIEW_ZOOM_MAX
  );
  useEffect(() => {
    const navigation = pendingSearchNavigationRef.current;
    const searchNavigated = navigation?.requestId === request?.id && navigation?.previewGeneration === request?.previewGeneration && navigation?.pageNumber === pageNumber;
    pendingSearchNavigationRef.current = null;
    selectionRef.current = "";
    searchOffsetRef.current = 0;
    searchGeneration.current += 1;
    if (!searchNavigated) setSearchStatus("");
  }, [request?.id, request?.previewGeneration, pageNumber, sheetNumber]);

  useEffect(() => {
    zoomRef.current = previewZoom;
  }, [previewZoom]);

  useEffect(() => {
    if (previewKind === 'pdf') rendererRef.current?.refresh?.();
  }, [previewKind, board?.view, style?.left, style?.top, style?.height]);

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
  }, [previewBaseWidth, request?.expanded, request?.id, request?.open, style?.width, reading]);

  useEffect(() => {
    const host = previewKind === "docx" ? docxFrameRef.current : hostRef.current;
    if (!(host instanceof HTMLElement)) {
      return undefined;
    }
    if (!request?.open) {
      return undefined;
    }
    const diagnostics = request?.previewDiagnostics && typeof request.previewDiagnostics === "object"
      ? request.previewDiagnostics
      : {};
    if (livePreviewSuppressed) {
      if (previewKind === "docx") {
        if (host.contentDocument?.body) host.contentDocument.body.innerHTML = "";
      } else {
        host.innerHTML = "";
      }
      setRenderState({
        status: "suppressed",
        message: previewLabel.suppressedText,
        loadState: String(diagnostics.loadState || "文档已加载"),
        parseState: String(diagnostics.parseState || "已省略"),
        pageCount: Number(diagnostics.pageCount || 0) || 0,
        contentNodeCount: Number(diagnostics.contentNodeCount || 0) || 0,
        runtimeLabel: "已省略",
      });
      setContentHeight(1123);
      return undefined;
    }
    if (previewStatus !== "ready" || !fileBytes?.byteLength) {
      if (previewKind === "docx") {
        if (host.contentDocument?.body) host.contentDocument.body.innerHTML = "";
      } else {
        host.innerHTML = "";
      }
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
    let pdfLoadingTask = null;
    let pdfPageRenderer = null;
    let imageUrl = "";
    setRenderState({
      status: "rendering",
      message: previewLabel.renderingText,
      loadState: "文档已加载",
      parseState: "解析中",
      pageCount: 0,
      contentNodeCount: 0,
      runtimeLabel: "解析中",
    });

    const render = async () => timeAssetTask("file-preview-render", async () => {
      // PDF.js may transfer its typed array to a worker. Keep the session copy attached
      // so React state updates cannot accidentally switch the preview back to placeholder mode.
      const bytes = fileBytes.slice();
      if (!bytes?.length) {
        throw new Error("预览文档为空");
      }
      if (previewKind !== "docx") host.innerHTML = "";
      let pages = 0;
      let nodes = 0;
      if (["text", "table", "image"].includes(previewKind)) {
        if (previewKind === "image") {
          imageUrl = URL.createObjectURL(new Blob([bytes], { type: previewMime }));
          const image = document.createElement("img"); image.src = imageUrl; image.alt = request.fileName;
          await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("图片读取失败")); });
          if (cancelled) return;
          setPageWidth(Math.max(1, image.naturalWidth)); setContentHeight(Math.max(1, image.naturalHeight));
          image.style.width = "100%"; host.replaceChildren(image); nodes = 1;
        } else if (previewKind === "text") {
          const pre = document.createElement("pre"); pre.className = "file-workstation-text";
          if (bytes.subarray(0, 800000).includes(0)) throw new Error("此文件不是 UTF-8 文本，请使用系统应用打开");
          const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, 800000), { stream: bytes.length > 800000 });
          pre.textContent = decoded.slice(0, 200000);
          if (bytes.length > 800000 || decoded.length > 200000) setSearchStatus("预览仅显示前 20 万字符；完整内容可在系统中打开");
          if (bytes.length > 800000) { const note = document.createElement("p"); note.textContent = "预览仅显示前 20 万字；原文件完整保留。"; host.appendChild(note); }
          host.appendChild(pre); nodes = 1; setPageWidth(794); setContentHeight(Math.max(600, host.scrollHeight));
        } else {
          const result = JSON.parse(new TextDecoder().decode(bytes));
          if (!result.ok || !Array.isArray(result.sheets)) throw new Error(result.error || "表格读取失败");
          setSheets(result.sheets); nodes = 1; setPageWidth(1000);
        }
        pages = 1;
      } else if (previewKind === "pdf") {
        const cachedFirstPage = bridge?.getDocumentPreviewArtifact?.(
          String(request?.previewSessionId || request?.id || "").trim(),
          Number(request?.previewGeneration || 0) || 0,
          PDF_PREVIEW_FIRST_PAGE_ARTIFACT
        );
        if (typeof cachedFirstPage === "string" && cachedFirstPage.startsWith("data:image/")) {
          const cachedShell = document.createElement("div");
          cachedShell.className = "canvas2d-file-preview-react-pdf-page is-cached";
          const cachedImage = document.createElement("img");
          cachedImage.className = "canvas2d-file-preview-react-pdf-canvas";
          cachedImage.src = cachedFirstPage;
          cachedImage.alt = "PDF 首屏缓存";
          cachedShell.appendChild(cachedImage);
          host.replaceChildren(cachedShell);
        }
        const module = await loadVendorEsmModule("pdfjs-dist");
        if (cancelled) return;
        const { getDocument, GlobalWorkerOptions, TextLayer } = module || {};
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
        pdfLoadingTask = loadingTask;
        const pdfDocument = await loadingTask.promise;
        if (cancelled) { await loadingTask.destroy(); return; }
        pdfRef.current = pdfDocument;
        pages = Number(pdfDocument.numPages || 0) || 0;
        const firstPage = await pdfDocument.getPage(1);
        if (cancelled) return;
        setPageWidth(firstPage.getViewport({ scale: 1 }).width);
        pdfPageRenderer = await createPdfVisiblePageRenderer({
          pdfDocument,
          firstPage,
          isCancelled: () => cancelled,
          host,
          scrollRoot: scrollRef.current,
          preloadRadius: 1,
          retentionRadius: 3,
          TextLayer,
          onError: (error) => { if (!cancelled) setSearchStatus(`页面渲染失败：${error.message}；可刷新或系统打开`); },
          onStats: (stats) => {
            if (cancelled) return;
            setPageNumber(stats.visibleCenter);
            setRenderState((current) => ({
              ...current,
              pageCount: stats.pageCount,
              contentNodeCount: stats.renderedCount,
            }));
          },
        });
        if (cancelled) { pdfPageRenderer.dispose(); return; }
        rendererRef.current = pdfPageRenderer;
        nodes = pdfPageRenderer.getStats().renderedCount;
        const firstCanvas = host.querySelector(".canvas2d-file-preview-react-pdf-canvas");
        if (firstCanvas instanceof HTMLCanvasElement) {
          try {
            bridge?.setDocumentPreviewArtifact?.(
              String(request?.previewSessionId || request?.id || "").trim(),
              Number(request?.previewGeneration || 0) || 0,
              PDF_PREVIEW_FIRST_PAGE_ARTIFACT,
              firstCanvas.toDataURL("image/webp", 0.84)
            );
          } catch {
            // The live first page remains available when snapshot encoding is unavailable.
          }
        }
        setContentHeight(Math.max(1123, Number(host.scrollHeight || host.offsetHeight || 0) || 1123));
      } else {
        const iframe = host;
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;
        if (!doc || !win) {
          throw new Error("Word 预览窗口初始化失败");
        }
        const cachedHtml = bridge?.getDocumentPreviewArtifact?.(
          String(request?.previewSessionId || request?.id || "").trim(),
          Number(request?.previewGeneration || 0) || 0,
          DOCX_PREVIEW_HTML_ARTIFACT
        );
        doc.open();
        if (typeof cachedHtml === "string" && cachedHtml.includes("id=\"preview-host\"")) {
          doc.write(cachedHtml);
        } else {
          doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          html,body{margin:0;padding:0;min-width:1px;overflow:hidden;background:transparent}
          .preview-host{width:max-content;min-height:1px}
          .preview-host .docx-wrapper,.preview-host .canvas2d-file-card-docx-preview-document-wrapper{background:transparent!important;padding:0!important}
          .preview-host section.docx,.preview-host section.canvas2d-file-card-docx-preview-document{box-sizing:border-box;margin:0 auto 14px!important;border:1px solid rgba(203,213,225,.9)!important;border-radius:4px!important;background:#fff!important;box-shadow:0 12px 28px rgba(15,23,42,.12)!important;overflow:hidden}
          .preview-host section.docx>article,.preview-host section.canvas2d-file-card-docx-preview-document>article{background:#fff!important}
          .preview-host header,.preview-host footer{background:transparent!important;border:0!important;box-shadow:none!important}
          .preview-host section.docx:last-child,.preview-host section.canvas2d-file-card-docx-preview-document:last-child{margin-bottom:0!important}
          </style></head><body><div id="preview-host" class="preview-host"></div></body></html>`);
        }
        doc.close();
        doc.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && reading) { event.preventDefault(); event.stopPropagation(); setReading(false); }
        }, true);
        doc.addEventListener("wheel", (event) => {
          event.preventDefault(); event.stopPropagation();
          if (event.ctrlKey || event.metaKey) bridge?.setFileCardPreviewZoom?.(request.id, clamp(zoomRef.current - event.deltaY * .004, FILE_CARD_PREVIEW_ZOOM_MIN, FILE_CARD_PREVIEW_ZOOM_MAX));
          else scrollRef.current?.scrollBy({ top: event.deltaY, left: event.deltaX });
        }, { passive: false });
        const docxHost = doc.getElementById("preview-host");
        if (!docxHost) {
          throw new Error("Word 预览容器缺失");
        }
        if (!(typeof cachedHtml === "string" && cachedHtml.includes("id=\"preview-host\""))) {
          const jszipUrl = new URL("../../../../assets/vendor/jszip/jszip.min.js", import.meta.url).toString();
          const previewUrl = new URL("../../../../assets/vendor/docx-preview/docx-preview.mjs", import.meta.url).toString();
          const jszipScript = doc.createElement("script");
          jszipScript.src = jszipUrl;
          await new Promise((resolve, reject) => {
            jszipScript.onload = resolve;
            jszipScript.onerror = () => reject(new Error("Word 预览依赖加载失败"));
            doc.head.appendChild(jszipScript);
          });
          if (cancelled) return;
          const module = await win.eval(`import("${previewUrl}")`);
          if (cancelled) return;
          const renderAsync = module?.renderAsync;
          if (typeof renderAsync !== "function") {
            throw new Error("docx-preview 未提供 renderAsync");
          }
          const iframeBytes = new win.Uint8Array(bytes.length);
          iframeBytes.set(bytes);
          await renderAsync(iframeBytes.buffer, docxHost, null, {
            className: "canvas2d-file-card-docx-preview-document",
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            breakPages: true,
            renderHeaders: true,
            renderFooters: true,
            renderFootnotes: true,
            useBase64URL: true,
            renderAltChunks: false,
          });
          if (cancelled) return;
          docxHost.querySelectorAll("a[href]").forEach((node) => { if (!/^(https?:|mailto:|#)/i.test(node.getAttribute("href") || "")) node.removeAttribute("href"); });
          const snapshotRoot = doc.documentElement.cloneNode(true);
          snapshotRoot.querySelectorAll("script").forEach((node) => node.remove());
          bridge?.setDocumentPreviewArtifact?.(
            String(request?.previewSessionId || request?.id || "").trim(),
            Number(request?.previewGeneration || 0) || 0,
            DOCX_PREVIEW_HTML_ARTIFACT,
            `<!DOCTYPE html>${snapshotRoot.outerHTML}`
          );
        }
        if (cancelled) return;
        const paperWidth = Math.max(1, ...Array.from(docxHost.querySelectorAll("section")).map((node) => node.getBoundingClientRect().width));
        setPageWidth(paperWidth); iframe.style.width = `${paperWidth}px`;
        const docxHeight = Math.max(1, Number(doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 0) || 1123);
        iframe.style.height = `${docxHeight}px`;
        setContentHeight(docxHeight);
        pages = docxHost.querySelectorAll(
          "section.docx, section.canvas2d-file-card-docx-preview-document, .docx-wrapper section.docx, .canvas2d-file-card-docx-preview-document-wrapper section.canvas2d-file-card-docx-preview-document"
        ).length;
        nodes = docxHost.querySelectorAll(
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
    });

    void render().catch((error) => {
      if (cancelled) {
        return;
      }
      const pages =
        previewKind === "pdf"
          ? host.querySelectorAll(".canvas2d-file-preview-react-pdf-page").length
          : host.contentDocument?.querySelectorAll(
              "section.docx, section.canvas2d-file-card-docx-preview-document, .docx-wrapper section.docx, .canvas2d-file-card-docx-preview-document-wrapper section.canvas2d-file-card-docx-preview-document"
            ).length || 0;
      const nodes =
        previewKind === "pdf"
          ? host.querySelectorAll(".canvas2d-file-preview-react-pdf-canvas").length
          : host.contentDocument?.querySelectorAll(
              "article, p, table, ul, ol, li, img, svg, canvas, .docx-wrapper *, section.docx *, .canvas2d-file-card-docx-preview-document-wrapper *, section.canvas2d-file-card-docx-preview-document *"
            ).length || 0;
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
      cancelled = true; searchGeneration.current += 1;
      pdfRef.current = null; rendererRef.current = null;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      pdfPageRenderer?.dispose?.();
      try {
        pdfLoadingTask?.destroy?.();
      } catch {
        // Ignore pdf.js cleanup failures.
      }
      if (previewKind === "docx" && host.contentDocument?.body) {
        host.contentDocument.body.innerHTML = "";
      }
    };
  }, [bridge, fileBytes, livePreviewSuppressed, previewKind, previewLabel, previewMime, previewStatus, request?.id, request?.open, reading]);

  useEffect(() => {
    const host = hostRef.current;
    const frame = frameRef.current;
    if (frame instanceof HTMLElement) {
      const effectiveZoom = String(clamp(previewZoom * (["text", "table"].includes(previewKind) ? 1 : fitScale), 0.18, FILE_CARD_PREVIEW_ZOOM_MAX));
      const normalizedHeight = `${Math.max(1, Number(contentHeight || 1123) || 1123)}px`;
      frame.style.setProperty("--file-card-preview-zoom", effectiveZoom);
      frame.style.setProperty("--file-card-preview-content-height", normalizedHeight);
      frame.style.setProperty("--file-card-preview-base-width", `${previewBaseWidth}px`);
      host?.style.setProperty("--file-card-preview-zoom", effectiveZoom);
      host?.style.setProperty("--file-card-preview-content-height", normalizedHeight);
      host?.style.setProperty("--file-card-preview-base-width", `${previewBaseWidth}px`);
    }
  }, [contentHeight, fitScale, previewBaseWidth, previewZoom, reading]);

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
  }, [bridge, request?.id, request?.open, reading]);

  useEffect(() => {
    if (!reading) return undefined;
    const previous = document.activeElement;
    const handleKey = (event) => {
      if (document.querySelector(".file-conversion-dialog")) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        if (interactionRef.current.toolsOpen) { setToolsOpen(false); document.querySelector(".file-workstation-reader [aria-label=\"文件操作\"]")?.focus(); }
        else if (interactionRef.current.regionMode) { regionRef.current?.marker.remove(); regionRef.current = null; setRegionMode(false); }
        else setReading(false);
      }
      if (event.key === "Tab") {
        const focusable = Array.from(document.querySelector(".file-workstation-reader")?.querySelectorAll("button, input, select, summary, [tabindex='0']") || []).filter((node) => !node.disabled && node.getClientRects().length);
        const index = focusable.indexOf(document.activeElement);
        if (focusable.length && (event.shiftKey ? index <= 0 : index < 0 || index === focusable.length - 1)) { event.preventDefault(); focusable[event.shiftKey ? focusable.length - 1 : 0].focus(); }
      }
    };
    document.addEventListener("keydown", handleKey, true);
    scrollRef.current?.focus();
    return () => { document.removeEventListener("keydown", handleKey, true); if (previous?.isConnected) previous.focus?.(); };
  }, [reading]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return undefined;
    let timer;
    const scale = ["text", "table"].includes(previewKind) ? 1 : previewZoom * fitScale;
    const onScroll = () => {
      if (renderState.status !== "ready") return;
      readingPosition.current = scroll.scrollTop / scale;
      clearTimeout(timer);
      timer = setTimeout(() => saveFileReadingPreference(sourcePath, { scrollOffset: readingPosition.current }), 350);
    };
    scroll.addEventListener("scroll", onScroll, { passive: true });
    return () => { clearTimeout(timer); scroll.removeEventListener("scroll", onScroll); saveFileReadingPreference(sourcePath, { scrollOffset: readingPosition.current }); };
  }, [sourcePath, reading, previewZoom, fitScale, previewKind, renderState.status]);

  useEffect(() => { saveFileReadingPreference(sourcePath, { zoom: previewZoom }); }, [sourcePath, previewZoom]);
  useEffect(() => {
    if (renderState.status !== "ready") return;
    const frame = requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = readingPosition.current * (["text", "table"].includes(previewKind) ? 1 : previewZoom * fitScale); rendererRef.current?.refresh(); });
    return () => cancelAnimationFrame(frame);
  }, [renderState.status, reading, previewZoom, fitScale, previewKind]);

  useEffect(() => {
    if (previewKind !== "table" || !sheets.length || !hostRef.current) return;
    const host = hostRef.current; host.replaceChildren();
    const sheet = sheets[sheetNumber] || sheets[0];
    if (sheet.truncated) { const note = document.createElement("p"); note.textContent = "预览限 500 行 × 40 列，原文件完整保留。"; host.appendChild(note); }
    const table = document.createElement("table"); table.className = "file-workstation-table";
    for (const row of sheet.rows) { const tr = document.createElement("tr"); for (const cell of row) { const td = document.createElement("td"); td.textContent = cell; tr.appendChild(td); } table.appendChild(tr); }
    host.appendChild(table); setContentHeight(Math.max(600, host.scrollHeight));
  }, [sheets, sheetNumber]);

  function captureSelection() {
    const selection = previewKind === "docx" ? docxFrameRef.current?.contentWindow?.getSelection() : window.getSelection();
    const root = previewKind === "docx" ? docxFrameRef.current?.contentDocument?.body : hostRef.current;
    if (root?.contains(selection?.anchorNode)) selectionRef.current = selection.toString().slice(0, 50000);
    else if (!selection?.rangeCount || selection.isCollapsed) selectionRef.current = "";
  }
  async function search() {
    const keyword = query.trim().normalize("NFKC").toLowerCase(); if (!keyword) return;
    const generation = ++searchGeneration.current;
    setSearchStatus("正在搜索…");
    try {
      if (previewKind === "pdf" && pdfRef.current) {
        const pdf = pdfRef.current; const limit = Math.min(pdf.numPages, 1000);
        const first = pageNumber < limit ? pageNumber + 1 : 1;
        for (let step = 0; step < limit; step++) {
          if (generation !== searchGeneration.current || !pdfRef.current) return;
          const page = (first - 1 + step) % limit + 1;
          const content = await (await pdf.getPage(page)).getTextContent();
          if (generation !== searchGeneration.current) return;
          const text = content.items.map((item) => item.str || "").join(" ");
          if (text.normalize("NFKC").toLowerCase().includes(keyword)) {
            pendingSearchNavigationRef.current = { requestId: request?.id, previewGeneration: request?.previewGeneration, pageNumber: page };
            rendererRef.current?.goToPage(page);
            setSearchStatus(`找到：第 ${page} 页（再次搜索查找下一页）`);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        setSearchStatus(pdf.numPages > limit ? "前 1000 页未找到" : "未找到；扫描件需先用外部 OCR 识别");
      } else {
        const root = previewKind === "docx" ? docxFrameRef.current?.contentDocument?.body : hostRef.current;
        const match = findPreviewText(root, keyword, searchOffsetRef.current);
        if (match) {
          searchOffsetRef.current = match.nextOffset;
          const selection = root.ownerDocument.defaultView.getSelection();
          selection.removeAllRanges(); selection.addRange(match.range);
          selectionRef.current = match.range.toString();
          const parent = match.range.startContainer.parentElement;
          if (previewKind === "docx") {
            const bounds = match.range.getBoundingClientRect();
            scrollRef.current.scrollTop += bounds.top * previewZoom * fitScale;
          } else parent?.scrollIntoView({ block: "center" });
          setSearchStatus("已定位；再次查找可跳到下一处"); return;
        }
        setSearchStatus("未找到");
      }
    } catch (error) { if (generation === searchGeneration.current) setSearchStatus(error.message || "搜索失败"); }
  }
  async function extractPage() {
    captureSelection();
    const generation = searchGeneration.current;
    let text = selectionRef.current;
    if (!text && pdfRef.current) { const content = await (await pdfRef.current.getPage(pageNumber)).getTextContent(); text = content.items.map((item) => `${item.str || ""}${item.hasEOL ? "\n" : " "}`).join(""); }
    if (generation !== searchGeneration.current) return;
    if (!text) { setSearchStatus("请先选择文字；扫描页可以转图片"); return; }
    if (bridge?.insertFileExcerpt?.(request.id, text, previewKind === "pdf" ? pageNumber : 0)) setSearchStatus("摘取已插入画布，可撤销");
  }

  async function insertPageImage(rect = null, shell = null) {
    shell ||= hostRef.current?.querySelector(`[data-page-number="${pageNumber}"]`);
    const source = shell?.querySelector("canvas");
    if (!source) { setSearchStatus("当前页尚未渲染，请滚动到该页再试"); return; }
    const bounds = shell.getBoundingClientRect();
    const crop = rect || { x: 0, y: 0, width: bounds.width, height: bounds.height };
    const canvas = document.createElement("canvas");
    const scaleX = source.width / bounds.width; const scaleY = source.height / bounds.height;
    canvas.width = Math.max(1, Math.round(crop.width * scaleX)); canvas.height = Math.max(1, Math.round(crop.height * scaleY));
    canvas.getContext("2d").drawImage(source, crop.x * scaleX, crop.y * scaleY, crop.width * scaleX, crop.height * scaleY, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png"); canvas.width = 1; canvas.height = 1;
    try { if (await bridge?.insertFilePageImage?.(request.id, data, Number(shell.dataset.pageNumber))) setSearchStatus("图片已摘取到画布，可撤销"); } catch (error) { setSearchStatus(error.message || "摘取失败"); }
  }
  function beginRegion(event) {
    if (!regionMode) { event.stopPropagation(); return; }
    const shell = event.target.closest?.(".canvas2d-file-preview-react-pdf-page"); if (!shell?.querySelector("canvas")) return;
    event.preventDefault(); event.stopPropagation();
    const bounds = shell.getBoundingClientRect();
    const marker = document.createElement("div"); marker.className = "file-workstation-region"; shell.appendChild(marker);
    regionRef.current = { shell, bounds, marker, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveRegion(event) {
    const region = regionRef.current; if (!region) return;
    const x = clamp(Math.min(event.clientX, region.x) - region.bounds.left, 0, region.bounds.width);
    const y = clamp(Math.min(event.clientY, region.y) - region.bounds.top, 0, region.bounds.height);
    const right = clamp(Math.max(event.clientX, region.x) - region.bounds.left, 0, region.bounds.width);
    const bottom = clamp(Math.max(event.clientY, region.y) - region.bounds.top, 0, region.bounds.height);
    region.rect = { x, y, width: right - x, height: bottom - y };
    const scale = region.shell.offsetWidth / region.bounds.width;
    Object.assign(region.marker.style, { left: `${x * scale}px`, top: `${y * scale}px`, width: `${region.rect.width * scale}px`, height: `${region.rect.height * scale}px` });
  }
  function endRegion(event) {
    const region = regionRef.current; if (!region) return;
    regionRef.current = null; region.marker.remove();
    event.currentTarget.releasePointerCapture?.(region.pointerId); setRegionMode(false);
    if (region.rect?.width > 4 && region.rect?.height > 4) void insertPageImage(region.rect, region.shell);
  }
  useEffect(() => () => { regionRef.current?.marker.remove(); regionRef.current = null; }, [reading, regionMode]);

  function finishResize(commit = false) {
    const resize = resizeRef.current;
    if (!resize) return;
    resizeRef.current = null;
    if (resize.node.hasPointerCapture?.(resize.pointerId)) resize.node.releasePointerCapture(resize.pointerId);
    if (commit) bridge?.setFileCardPreviewHeight?.(request.id, resize.height);
    setResizeHeight(null);
  }
  function beginResize(event) {
    if (event.button !== 0 || item?.locked) return;
    event.preventDefault(); event.stopPropagation();
    const node = event.currentTarget;
    node.setPointerCapture(event.pointerId);
    resizeRef.current = { node, pointerId: event.pointerId, y: event.clientY, startHeight: Number.parseFloat(style.height), height: Number.parseFloat(style.height), scale: Math.max(.1, Number(board?.view?.scale) || 1) };
  }
  function moveResize(event) {
    const resize = resizeRef.current;
    if (!resize) return;
    event.preventDefault(); event.stopPropagation();
    resize.height = clamp(resize.startHeight + (event.clientY - resize.y) / resize.scale, 260, 5000);
    setResizeHeight(resize.height);
  }
  useEffect(() => {
    setResizeHeight(null);
    const cancel = (event) => {
      if (event.key === "Escape" && resizeRef.current) {
        event.preventDefault(); event.stopImmediatePropagation(); finishResize(false);
      }
    };
    document.addEventListener("keydown", cancel, true);
    const blur = () => finishResize(false);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("keydown", cancel, true);
      window.removeEventListener("blur", blur);
      const resize = resizeRef.current;
      resizeRef.current = null;
      if (resize?.node.hasPointerCapture?.(resize.pointerId)) resize.node.releasePointerCapture(resize.pointerId);
    };
  }, [request?.id, reading]);

  if (!request?.open) {
    return null;
  }

  const diagnosticStyle = style || {
    left: "24px",
    top: "24px",
    width: "360px",
    height: "468px",
  };
  const missingAnchor = !item || !style;
  const showPlaceholder = missingAnchor || livePreviewSuppressed || previewStatus !== "ready" || !fileBytes?.byteLength || renderState.status !== "ready";
  const previewFailed = previewStatus === "failed" || renderState.status === "failed";
  const fileName = String(request?.fileName || item?.fileName || item?.name || "未命名文件").trim() || "未命名文件";

  const previewElement = (
    <div
      className={`canvas2d-file-preview-react${reading ? " file-workstation-reader" : ""}`}
      role={reading ? "dialog" : undefined}
      aria-modal={reading || undefined}
      aria-label={reading ? `阅读 ${fileName}` : undefined}
      onPointerDown={beginRegion}
      onPointerMove={moveRegion}
      onPointerUp={endRegion}
      onPointerCancel={() => { regionRef.current?.marker.remove(); regionRef.current = null; setRegionMode(false); }}
      data-region-mode={String(regionMode)}
      onKeyDown={(event) => event.stopPropagation()}
      onMouseUp={captureSelection}
      style={reading ? undefined : diagnosticStyle}
      data-render-state={missingAnchor ? "failed" : renderState.status}
      data-preview-kernel={previewKind === "pdf" ? "react-pdfjs-v1" : "react-docx-v2"}
      data-document-preview-anchor="true"
      data-item-id={String(request?.itemId || "")}
      data-expanded={request?.expanded ? "true" : "false"}
      data-resize-height-ratio={resizeHeight != null ? resizeHeight / Number.parseFloat(style.width) : undefined}
    >
      <div className="canvas2d-file-preview-react-head">
        <div className="canvas2d-file-preview-react-title">
          <strong title={fileName}>{fileName}</strong>
          <span>{previewLabel.noun} 预览</span>
        </div>
        <div className="canvas2d-file-preview-react-actions" role="toolbar" aria-label="预览控制">
          <button type="button" onClick={() => { setToolsOpen(true); }} aria-label="搜索文件内容" title="搜索文件内容"><AppIcon name="search" size={16} /></button>
          <button type="button" onClick={() => { setToolsOpen(false); setReading(!reading); }} aria-label={reading ? "返回画布预览" : "专注阅读"} title={reading ? "返回画布（Esc）" : "专注阅读"}>{reading ? "返回" : "阅读"}</button>
          <button type="button" onClick={() => { captureSelection(); setToolsOpen(!toolsOpen); }} aria-label="文件操作" aria-expanded={toolsOpen} title="提取内容、转换与文件操作"><AppIcon name="ellipsis" size={16} /></button>
          <button type="button" className="canvas2d-file-preview-react-close" onClick={() => bridge?.closeFileCardPreview?.(request.id)} aria-label="关闭预览" title="关闭预览"><AppIcon name="x" size={16} /></button>
        </div>
      </div>
      <div className="file-workstation-reading-bar" role="toolbar" aria-label="阅读控制">
        <div><button type="button" onClick={() => bridge?.setFileCardPreviewZoom?.(request.id, previewZoom - 0.1)} aria-label="缩小预览"><AppIcon name="minus" size={16} /></button><button type="button" onClick={() => bridge?.setFileCardPreviewZoom?.(request.id, FILE_CARD_PREVIEW_DEFAULT_ZOOM)} aria-label="重置预览缩放">{Math.round(previewZoom * 100)}%</button><button type="button" onClick={() => bridge?.setFileCardPreviewZoom?.(request.id, previewZoom + 0.1)} aria-label="放大预览"><AppIcon name="plus" size={16} /></button></div>
        {previewKind === "pdf" ? <div><input aria-label="跳转页码" type="number" min="1" max={renderState.pageCount || 1} value={pageNumber} onChange={(event) => setPageNumber(Number(event.target.value) || 1)} onKeyDown={(event) => { if (event.key === "Enter") rendererRef.current?.goToPage(pageNumber); }} /><span>/ {renderState.pageCount}</span><button onClick={() => rendererRef.current?.goToPage(pageNumber)}>跳转</button></div> : null}
        {sheets.length ? <select aria-label="工作表" value={sheetNumber} onChange={(event) => setSheetNumber(Number(event.target.value))}>{sheets.map((sheet, index) => <option key={index} value={index}>{sheet.name}</option>)}</select> : null}
      </div>
      <div className="canvas2d-file-preview-react-shell">
        {toolsOpen ? <div className="file-workstation-tools" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (!reading && event.key === "Escape") { event.preventDefault(); setToolsOpen(false); } }}>
          <div><input aria-label="搜索文件内容" placeholder="搜索文字" value={query} onChange={(event) => { searchGeneration.current += 1; searchOffsetRef.current = 0; setQuery(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} /><button onClick={() => void search()}>查找</button></div>
          <div className="file-workstation-tool-group"><span>添加到画布</span><button onPointerDown={captureSelection} onClick={() => void extractPage()}>添加文字到画布</button>{previewKind === "pdf" ? <><button onClick={() => void insertPageImage()}>添加当前页图片到画布</button><button onClick={() => { setRegionMode(true); setToolsOpen(false); setSearchStatus("拖选页面区域以添加到画布"); }}>截取页面区域</button></> : null}</div>
          <div className="file-workstation-tool-group"><button onClick={() => bridge?.openFileConversion?.([item])}>转换文件</button><button type="button" onClick={() => bridge?.toggleFileCardPreviewExpanded?.(request.id)} aria-label={request.expanded ? "收起预览" : "展开预览"}>{request.expanded ? "收起卡片预览" : "展开卡片预览"}</button></div>
          <details className="file-workstation-file-maintenance"><summary className="app-icon-disclosure"><AppIcon name="chevron-right" size={14} className="app-disclosure-chevron" />源文件操作</summary><div><button onClick={() => bridge?.retryFileCardPreview?.(request.id)}>刷新源文件</button><button onClick={() => void bridge?.relinkFileCard?.(request.itemId)}>重新关联文件</button><button onClick={() => void globalThis.desktopShell?.openPath?.(sourcePath)}>使用系统应用打开</button></div></details>
          <span role="status">{searchStatus || "选中文字可添加到画布；PDF 未选中时使用当前页文字。"}</span>
        </div> : null}
        <div ref={scrollRef} className="canvas2d-file-preview-react-scroll" tabIndex={0} aria-label={previewLabel.scrollAriaLabel}>
          <div ref={frameRef} className={`canvas2d-file-preview-react-frame is-${previewKind}`}>
            {previewKind !== "docx" ? (
              <div ref={hostRef} className={`canvas2d-file-preview-react-content is-${previewKind}`} />
            ) : (
              <iframe
                ref={docxFrameRef}
                className="canvas2d-file-preview-react-content is-docx"
                title={`${fileName} Word 预览`}
                sandbox="allow-same-origin allow-scripts"
              />
            )}
          </div>
        </div>
        {showPlaceholder ? (
          <div className="canvas2d-file-preview-react-placeholder">
            {!previewFailed ? (
              <div
                className="canvas2d-file-preview-react-skeleton"
                dangerouslySetInnerHTML={{ __html: buildFilePreviewInteractionSkeletonMarkup({ kind: previewKind }) }}
              />
            ) : null}
            <strong>{previewFailed ? previewLabel.unavailableText : previewLabel.generatingText}</strong>
            <span>{missingAnchor ? "文件卡位置不可用" : renderState.message}</span>
            {previewFailed ? <div><button type="button" onClick={() => bridge?.retryFileCardPreview?.(request.id)}>重试</button><button type="button" onClick={() => void bridge?.relinkFileCard?.(request.itemId)}>重新关联文件</button><button type="button" onClick={() => void globalThis.desktopShell?.openPath?.(sourcePath)}>系统打开</button></div> : null}
          </div>
        ) : null}
      </div>
      {!reading ? <button type="button" disabled={Boolean(item?.locked)} className="file-preview-height-handle" aria-label="调整预览高度" title="拖动调整高度；方向键微调，Esc 取消" onPointerDown={beginResize} onPointerMove={moveResize} onPointerUp={(event) => { event.stopPropagation(); finishResize(true); }} onPointerCancel={() => finishResize(false)} onLostPointerCapture={() => finishResize(false)} onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); bridge?.setFileCardPreviewHeight?.(request.id, (event.key === "ArrowDown" ? 1 : -1) * (event.shiftKey ? 100 : 20), true); }
      }}><span /></button> : null}
    </div>
  );
  return reading ? createPortal(<div className="file-workstation-backdrop" data-shape-include="true" onClick={() => setReading(false)}>{React.cloneElement(previewElement, { onClick: (event) => event.stopPropagation() })}</div>, document.getElementById("global-overlay-layer") || document.body) : portalHost instanceof HTMLElement ? createPortal(previewElement, portalHost) : previewElement;
}

