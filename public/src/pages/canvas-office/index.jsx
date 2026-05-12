import React, { useEffect, useRef, useState } from "react";
import { createCanvas2DEngine } from "../../engines/canvas2d-core/createCanvas2DEngine.js";
import "../../engines/canvas2d-core/ui/index.js";

const CANVAS_MODE_CANVAS2D = "canvas2d";

function getBackgroundExportMode() {
  try {
    const search = new URLSearchParams(globalThis?.location?.search || "");
    return search.get("backgroundExport") === "1";
  } catch {
    return false;
  }
}

function CanvasOfficePage({ embedded = false } = {}) {
  const [engineMode] = useState(CANVAS_MODE_CANVAS2D);
  const canvas2dHostRef = useRef(null);
  const canvas2dHandleRef = useRef(null);
  const backgroundExportMode = getBackgroundExportMode();

  useEffect(() => {
    if (!embedded && !backgroundExportMode) {
      document.body.classList.add("canvas-office-page");
      document.body.classList.remove("app-booting");
    } else {
      document.documentElement.dataset.canvasOfficeEmbedded = "true";
    }
    document.body.dataset.canvasOfficeEmbedded = embedded ? "true" : "false";
    document.documentElement.dataset.canvasOfficeMode = engineMode;
    document.body.dataset.canvasOfficeMode = engineMode;

    return () => {
      document.body.dataset.canvasOfficeEmbedded = "false";
      document.body.dataset.canvasOfficeMode = CANVAS_MODE_CANVAS2D;
      if (embedded) {
        document.documentElement.dataset.canvasOfficeEmbedded = "false";
      }
    };
  }, [backgroundExportMode, embedded, engineMode]);

  useEffect(() => {
    document.documentElement.dataset.canvasOfficeMode = engineMode;
    document.body.dataset.canvasOfficeMode = engineMode;
  }, [engineMode]);

  useEffect(() => {
    const host = canvas2dHostRef.current;
    if (!(host instanceof HTMLElement)) {
      return undefined;
    }

    if (engineMode !== CANVAS_MODE_CANVAS2D) {
      canvas2dHandleRef.current?.destroy?.();
      canvas2dHandleRef.current?.unmount?.();
      canvas2dHandleRef.current = null;
      return undefined;
    }

    const engine = createCanvas2DEngine();
    globalThis.__canvas2dEngine = engine;
    canvas2dHandleRef.current = engine;
    try {
      engine.mount(host);
      if (backgroundExportMode) {
        const backgroundExportControllers = new Map();
        const unlisten = typeof globalThis?.desktopShell?.onBackgroundExportTask === "function"
          ? globalThis.desktopShell.onBackgroundExportTask(async ({ taskId, payload }) => {
              try {
                console.log(`[background-export-page] task start id=${taskId} kind=${String(payload?.kind || "")}`);
                engine.loadStructuredBoardForExport?.(payload?.board || {}, { resetView: true });
                const exportController = new AbortController();
                backgroundExportControllers.set(taskId, exportController);
                const exportOptions = payload?.options && typeof payload.options === "object"
                  ? { ...payload.options, signal: exportController.signal }
                  : { signal: exportController.signal };
                const kind = String(payload?.kind || "").trim().toLowerCase();
                const exportRuntime = engine.getStructuredExportRuntime?.();
                const currentBoard = engine.getSnapshotData?.() || payload?.board || {};
                let result = null;
                if (kind === "png") {
                  if (typeof exportRuntime?.exportBoardAsPng !== "function") {
                    throw new Error("后台 PNG 导出运行时不可用");
                  }
                  result = await exportRuntime.exportBoardAsPng(currentBoard, exportOptions);
                } else if (kind === "pdf") {
                  if (typeof exportRuntime?.exportBoardAsPdf !== "function") {
                    throw new Error("后台 PDF 导出运行时不可用");
                  }
                  result = await exportRuntime.exportBoardAsPdf(currentBoard, exportOptions);
                } else {
                  throw new Error("不支持的后台导出类型");
                }
                backgroundExportControllers.delete(taskId);
                console.log(`[background-export-page] task success id=${taskId} kind=${kind} ok=${Boolean(result?.ok)}`);
                await globalThis?.desktopShell?.submitBackgroundExportResult?.({ taskId, result });
              } catch (error) {
                backgroundExportControllers.delete(taskId);
                console.error(`[background-export-page] task error id=${taskId}: ${error?.message || error}`);
                await globalThis?.desktopShell?.submitBackgroundExportResult?.({
                  taskId,
                  error: error?.message || "后台导出失败",
                });
              }
            })
          : () => {};
        const unlistenCancel = typeof globalThis?.desktopShell?.onBackgroundExportCancel === "function"
          ? globalThis.desktopShell.onBackgroundExportCancel(({ taskId }) => {
              const controller = backgroundExportControllers.get(String(taskId || "").trim());
              if (controller) {
                controller.abort();
                backgroundExportControllers.delete(String(taskId || "").trim());
              }
            })
          : () => {};
        globalThis?.desktopShell?.notifyBackgroundExportReady?.();
        return () => {
          backgroundExportControllers.forEach((controller) => controller.abort());
          backgroundExportControllers.clear();
          unlistenCancel?.();
          unlisten?.();
          const current = canvas2dHandleRef.current;
          canvas2dHandleRef.current = null;
          if (current?.destroy) {
            current.destroy();
          } else {
            current?.unmount?.();
          }
          globalThis.__canvas2dEngine = null;
          host.innerHTML = "";
        };
      }
    } catch (error) {
      console.error("[canvas2d] mount failed", error);
    }

    return () => {
      const current = canvas2dHandleRef.current;
      canvas2dHandleRef.current = null;
      if (current?.destroy) {
        current.destroy();
      } else {
        current?.unmount?.();
      }
      globalThis.__canvas2dEngine = null;
      host.innerHTML = "";
    };
  }, [backgroundExportMode, engineMode]);

  return (
    <div className="canvas-office-root" data-canvas-office-mode={engineMode}>
      <div className="canvas-office-shell" data-canvas-office-mode={engineMode}>
        <main className="canvas-office-main">
          <div
            ref={canvas2dHostRef}
            className="canvas-office-surface"
            data-canvas-office-surface
            aria-label="工作白板画布容器"
          />
        </main>
      </div>
    </div>
  );
}

export default CanvasOfficePage;
