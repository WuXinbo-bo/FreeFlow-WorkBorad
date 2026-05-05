import React, { useEffect, useRef, useState } from "react";
import { loadVendorEsmModule } from "../vendor/loadVendorEsmModule.js";
import { resolveVendorAssetUrl } from "../vendor/resolveVendorAssetUrl.js";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 0.8;

function TypeSummary({ summary = {} }) {
  const entries = Object.entries(summary || {}).filter(([, count]) => Number(count || 0) > 0);
  if (!entries.length) {
    return null;
  }
  return (
    <div className="canvas2d-word-export-type-list" aria-label="可导出元素类型">
      {entries.map(([label, count]) => (
        <span key={label}>
          {label} × {count}
        </span>
      ))}
    </div>
  );
}

function getSkippedReasonLabel(reason = "") {
  const normalized = String(reason || "").trim();
  if (normalized === "unsupported-type") return "暂未支持导出";
  if (normalized === "empty-content") return "内容为空";
  if (normalized === "missing-id") return "缺少元素 ID";
  return normalized || "已跳过";
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

function WordDocxPreviewPane({ request }) {
  const iframeRef = useRef(null);
  const iframeReadyRef = useRef(false);
  const wheelCleanupRef = useRef(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const previewStatus = String(request?.previewStatus || "").trim();
  const previewMessage = String(request?.previewMessage || "").trim();
  const docxBase64 = String(request?.previewDocxBase64 || "").trim();
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
      const jszipUrl = resolveVendorAssetUrl("assets/vendor/jszip/jszip.min.js");
      const previewUrl = resolveVendorAssetUrl("assets/vendor/docx-preview/docx-preview.mjs");
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: auto; background:
          radial-gradient(circle at top, rgba(255,255,255,0.16), transparent 28%),
          linear-gradient(180deg, #cfd8e3 0%, #b8c5d5 100%); }
        body { font-family: system-ui, sans-serif; }
        .preview-root { min-height: 100%; padding: 28px 24px 40px; box-sizing: border-box; display: flex; justify-content: center; align-items: flex-start; }
        .preview-scale { flex: 0 0 auto; }
        .preview-host { width: 794px; min-height: 1123px; zoom: ${DEFAULT_ZOOM}; }
        .preview-host .docx-wrapper { background: transparent !important; padding: 0 !important; }
        .preview-host .docx { background: transparent !important; }
        .preview-host section.docx {
          box-sizing: border-box;
          width: 794px !important;
          min-height: 1123px !important;
          margin: 0 auto 26px !important;
          border: 1px solid rgba(203, 213, 225, 0.9);
          border-radius: 6px;
          background: #fff !important;
          box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18), 0 8px 22px rgba(15, 23, 42, 0.08);
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
      const module = await win.eval(`import("${previewUrl}")`);
      const renderAsync = module?.renderAsync;
      if (typeof renderAsync !== "function") {
        throw new Error("docx-preview 未提供 renderAsync");
      }
        const bytes = decodeBase64ToByteArray(docxBase64);
        if (!bytes?.length) {
          throw new Error("预览文档为空");
        }
        const iframeBytes = new win.Uint8Array(bytes.length);
        iframeBytes.set(bytes);
        const host = doc.getElementById("preview-host");
        if (!host) {
          throw new Error("预览容器缺失");
        }
      await renderAsync(iframeBytes.buffer, host, null, {
        className: "canvas2d-word-docx-preview-document",
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
          message: "Word 预览已生成",
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
      if (iframe?.contentDocument) {
        iframe.contentDocument.body.innerHTML = "";
      }
    };
  }, [docxBase64, previewMessage, previewStatus]);

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
    <div className="canvas2d-word-export-docx-workspace">
      <div className="canvas2d-word-export-preview-toolbar">
        <div className="canvas2d-word-export-preview-toolbar-group">
          <span className="canvas2d-word-export-preview-toolbar-label">打印布局</span>
          <span className="canvas2d-word-export-preview-toolbar-hint">A4 纸张预览</span>
        </div>
        <div className="canvas2d-word-export-preview-toolbar-group is-actions">
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

      <div className="canvas2d-word-export-docx-preview-shell">
        <iframe
          ref={iframeRef}
          className="canvas2d-word-export-docx-iframe"
          title="Word 预览窗口"
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

      <div className="canvas2d-word-export-preview-footer">
        <span>Ctrl + 滚轮可缩放页面</span>
      </div>
    </div>
  );
}

export function WordExportPreviewDialog({
  request = null,
  exporting = false,
  onClose,
  onConfirm,
}) {
  if (!request?.open) {
    return null;
  }
  const model = request.preview || {};
  const skippedItems = Array.isArray(model.skippedItems) ? model.skippedItems : [];
  const canExport = Number(model.exportableCount || 0) > 0 && !exporting;
  return (
    <div className="canvas2d-word-export-overlay" role="dialog" aria-modal="true" aria-label="Word 导出预览">
      <div className="canvas2d-word-export-dialog">
        <div className="canvas2d-word-export-head">
          <div className="canvas2d-word-export-head-copy">
            <strong>Word 导出预览</strong>
            <span>排版顺序：从上到下，同一行从左到右</span>
          </div>
          <button type="button" className="canvas2d-word-export-head-close" onClick={onClose} aria-label="关闭 Word 导出预览">
            ×
          </button>
        </div>

        <div className="canvas2d-word-export-meta">
          <span>选择 {model.itemCount || 0}</span>
          <span>可导出 {model.exportableCount || 0}</span>
          <span>跳过 {model.skippedCount || 0}</span>
        </div>

        <TypeSummary summary={model.typeSummary || {}} />

        <div className="canvas2d-word-export-body" aria-label="Word 预览">
          <WordDocxPreviewPane request={request} />
        </div>

        {skippedItems.length ? (
          <div className="canvas2d-word-export-note">
            <strong>已自动跳过</strong>
            <span>
              {skippedItems
                .slice(0, 3)
                .map((item) => `${item.label || item.type}: ${getSkippedReasonLabel(item.reason)}`)
                .join(" / ")}
              {skippedItems.length > 3 ? `，另有 ${skippedItems.length - 3} 个元素` : ""}
            </span>
          </div>
        ) : null}

        <div className="canvas2d-word-export-actions">
          <button type="button" className="canvas2d-word-export-secondary" onClick={onClose} disabled={exporting}>
            取消
          </button>
          <button
            type="button"
            className="canvas2d-word-export-primary"
            onClick={onConfirm}
            disabled={!canExport}
          >
            {exporting ? "正在导出..." : "导出 Word"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WordExportPreviewDialog;
