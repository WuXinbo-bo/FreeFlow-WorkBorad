import React, { useEffect, useRef, useState } from "react";

const ZOOM_MIN = 0.55;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 0.82;
const DEFAULT_COLLAPSED_HEIGHT = 520;

function clampZoom(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_ZOOM;
  }
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, numeric));
}

function formatZoomLabel(value) {
  return `${Math.round(clampZoom(value) * 100)}%`;
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

function FileCardWordPreviewFrame({ request }) {
  const iframeRef = useRef(null);
  const iframeReadyRef = useRef(false);
  const wheelCleanupRef = useRef(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const previewStatus = String(request?.previewStatus || "").trim();
  const previewMessage = String(request?.previewMessage || "").trim();
  const docxBase64 = String(request?.previewDocxBase64 || "").trim();
  const expanded = Boolean(request?.expanded);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [renderState, setRenderState] = useState({
    status: previewStatus === "ready" && docxBase64 ? "rendering" : previewStatus || "loading",
    message: previewMessage,
  });

  useEffect(() => {
    setZoom(DEFAULT_ZOOM);
  }, [request?.id]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return undefined;
    }
    if (previewStatus !== "ready" || !docxBase64) {
      iframeReadyRef.current = false;
      setRenderState({
        status: previewStatus || "loading",
        message: previewMessage,
      });
      return undefined;
    }
    let cancelled = false;
    setRenderState({
      status: "rendering",
      message: "正在渲染 Word 预览...",
    });
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      setRenderState({
        status: "failed",
        message: "预览窗口初始化失败",
      });
      return undefined;
    }
    const bootstrap = async () => {
      const bytes = decodeBase64ToByteArray(docxBase64);
      if (!bytes?.length) {
        throw new Error("预览文档为空");
      }
      const jszipUrl = new URL("../../../../assets/vendor/jszip/jszip.min.js", import.meta.url).toString();
      const previewUrl = new URL("../../../../assets/vendor/docx-preview/docx-preview.mjs", import.meta.url).toString();
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: auto; background: #e2e8f0; }
        body { font-family: system-ui, sans-serif; }
        .preview-root { min-height: 100%; padding: 18px 16px 26px; box-sizing: border-box; display: flex; justify-content: center; align-items: flex-start; }
        .preview-scale { flex: 0 0 auto; }
        .preview-host { width: 794px; min-height: 1123px; zoom: ${DEFAULT_ZOOM}; }
        .preview-host .docx-wrapper { background: transparent !important; padding: 0 !important; }
        .preview-host .docx { background: transparent !important; }
        .preview-host section.docx {
          box-sizing: border-box;
          width: 794px !important;
          min-height: 1123px !important;
          margin: 0 auto 20px !important;
          border: 1px solid rgba(203, 213, 225, 0.9);
          border-radius: 4px;
          background: #fff !important;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
          overflow: hidden;
        }
        .preview-host section.docx > article { background: #fff !important; }
        .preview-host header, .preview-host footer { background: transparent !important; border: 0 !important; box-shadow: none !important; }
        .preview-host section.docx:last-child { margin-bottom: 0 !important; }
      </style></head><body><div class="preview-root"><div class="preview-scale"><div id="preview-host" class="preview-host"></div></div></div></body></html>`);
      doc.close();
      const jszipScript = doc.createElement("script");
      jszipScript.src = jszipUrl;
      await new Promise((resolve, reject) => {
        jszipScript.onload = resolve;
        jszipScript.onerror = () => reject(new Error("JSZip 加载失败"));
        doc.head.appendChild(jszipScript);
      });
      const previewModule = await win.eval(`import("${previewUrl}")`);
      const renderAsync = previewModule?.renderAsync;
      if (typeof renderAsync !== "function") {
        throw new Error("docx-preview 未提供 renderAsync");
      }
      const host = doc.getElementById("preview-host");
      if (!host) {
        throw new Error("预览容器缺失");
      }
      const iframeBytes = new win.Uint8Array(bytes.length);
      iframeBytes.set(bytes);
      await renderAsync(iframeBytes.buffer, host, null, {
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
      const handleWheel = (event) => {
        if (!event.ctrlKey) {
          return;
        }
        event.preventDefault();
        const nextZoom = clampZoom(zoomRef.current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
      };
      doc.addEventListener("wheel", handleWheel, { passive: false });
      wheelCleanupRef.current = () => {
        doc.removeEventListener("wheel", handleWheel);
      };
      if (!cancelled) {
        iframeReadyRef.current = true;
        setRenderState({
          status: "ready",
          message: expanded ? "完整 Word 预览已生成" : "Word 预览已生成",
        });
      }
    };
    void bootstrap().catch((error) => {
      if (cancelled) {
        return;
      }
      setRenderState({
        status: "failed",
        message: String(error?.message || "Word 预览渲染失败").trim() || "Word 预览渲染失败",
      });
    });
    return () => {
      cancelled = true;
      iframeReadyRef.current = false;
      wheelCleanupRef.current?.();
      wheelCleanupRef.current = null;
      if (iframe?.contentDocument?.body) {
        iframe.contentDocument.body.innerHTML = "";
      }
    };
  }, [docxBase64, expanded, previewMessage, previewStatus]);

  useEffect(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframeReadyRef.current || !doc) {
      return;
    }
    const host = doc.getElementById("preview-host");
    if (host) {
      host.style.zoom = String(zoom);
    }
  }, [zoom]);

  return (
    <div className="canvas2d-file-card-preview-docx-workspace">
      <div className="canvas2d-file-card-preview-toolbar">
        <div className="canvas2d-file-card-preview-toolbar-group">
          <span className="canvas2d-file-card-preview-toolbar-label">文件预览</span>
          <span className="canvas2d-file-card-preview-toolbar-hint">Ctrl + 滚轮缩放，滚轮浏览长度</span>
        </div>
        <div className="canvas2d-file-card-preview-toolbar-group is-actions">
          <button
            type="button"
            className="canvas2d-word-export-zoom-btn"
            onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
            aria-label="缩小预览"
          >
            -
          </button>
          <button
            type="button"
            className="canvas2d-word-export-zoom-value"
            onClick={() => setZoom(DEFAULT_ZOOM)}
            aria-label="重置缩放"
          >
            {formatZoomLabel(zoom)}
          </button>
          <button
            type="button"
            className="canvas2d-word-export-zoom-btn"
            onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
            aria-label="放大预览"
          >
            +
          </button>
        </div>
      </div>
      <div
        className={`canvas2d-file-card-preview-frame-shell${expanded ? " is-expanded" : ""}`}
        style={{ maxHeight: expanded ? "78vh" : `${DEFAULT_COLLAPSED_HEIGHT}px` }}
      >
        <iframe
          ref={iframeRef}
          className="canvas2d-file-card-preview-iframe"
          title="文件卡 Word 预览"
          sandbox="allow-same-origin allow-scripts"
        />
        {renderState.status !== "ready" ? (
          <div className={`canvas2d-word-preview-empty is-${renderState.status || "loading"}`}>
            <strong>
              {renderState.status === "failed" || renderState.status === "unavailable"
                ? "Word 预览暂不可用"
                : "正在生成 Word 预览"}
            </strong>
            <span>{renderState.message || "正在加载 Word 预览..."}</span>
            {renderState.status === "loading" || renderState.status === "rendering" ? (
              <div className="canvas2d-word-preview-spinner" aria-hidden="true" />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function FileCardWordPreviewDialog({ request = null, onClose, onToggleExpand }) {
  if (!request?.open) {
    return null;
  }
  const fileName = String(request?.fileName || "未命名文件").trim() || "未命名文件";
  const expanded = Boolean(request?.expanded);
  return (
    <div className="canvas2d-file-card-preview-overlay" role="dialog" aria-modal="false" aria-label="文件卡 Word 预览">
      <div className={`canvas2d-file-card-preview-dialog${expanded ? " is-expanded" : ""}`}>
        <div className="canvas2d-file-card-preview-head">
          <div className="canvas2d-file-card-preview-title">
            <strong>{fileName}</strong>
            <span>嵌入式 Word 打印预览</span>
          </div>
          <div className="canvas2d-file-card-preview-head-actions">
            <button type="button" className="canvas2d-file-card-preview-head-btn" onClick={onToggleExpand}>
              {expanded ? "收起" : "全部展开"}
            </button>
            <button type="button" className="canvas2d-file-card-preview-head-btn is-close" onClick={onClose} aria-label="关闭预览">
              ×
            </button>
          </div>
        </div>
        <FileCardWordPreviewFrame request={request} />
      </div>
    </div>
  );
}

export default FileCardWordPreviewDialog;
