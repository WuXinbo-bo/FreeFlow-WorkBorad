"use strict";

const path = require("node:path");
let electron = require("electron");
if (typeof electron === "string") electron = require("electron/main");

const SURFACE_IDS = new Set(["settings", "shell-more", "desktop-more", "mirror-controls"]);
const SURFACE_KINDS = new Set(["settings", "menu"]);
const RENDERER_EVENTS = new Set(["closed", "action", "runtime-event", "close-blocked", "presented"]);

function createMirrorOverlayManager({ getWindow, getAppUrl, onRequest, onEvent, onFocusChanged } = {}) {
  let entry = null;
  let presentation = null;
  let generation = 0;
  let revision = 0;

  function getState() {
    return {
      visible: Boolean(presentation?.visible && entry?.attached),
      surfaceId: presentation?.surfaceId || "",
      kind: presentation?.kind || "",
      bounds: presentation ? { ...presentation.bounds } : null,
      webContentsId: entry?.view.webContents.id ?? null,
    };
  }

  function result(error, extra = {}) {
    return { ok: !error, ...getState(), ...extra, ...(error ? { error: String(error.message || error) } : {}) };
  }

  function currentWindow() {
    const window = getWindow?.();
    if (!window || window.isDestroyed() || !window.contentView?.addChildView) throw new Error("镜像浮层主窗口不可用");
    return window;
  }

  function overlayUrl() {
    const appUrl = new URL(getAppUrl?.());
    if (!["http:", "https:"].includes(appUrl.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(appUrl.hostname)) {
      throw new Error("镜像浮层只能加载本机应用页面");
    }
    return new URL("/mirror-overlay.html", appUrl).href;
  }

  function normalizeBounds(bounds) {
    if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) {
      throw new Error("镜像浮层尺寸无效");
    }
    const [width, height] = currentWindow().getContentSize();
    const x = Math.max(0, Math.min(Math.floor(bounds.x), Math.max(0, width - 1)));
    const y = Math.max(0, Math.min(Math.floor(bounds.y), Math.max(0, height - 1)));
    return { x, y, width: Math.max(1, Math.min(Math.ceil(bounds.width), width - x)), height: Math.max(1, Math.min(Math.ceil(bounds.height), height - y)) };
  }

  function notifyFocus(owner, target = presentation) {
    try { onFocusChanged?.({ owner, surfaceId: target?.surfaceId || "", kind: target?.kind || "" }); } catch { /* Focus reporting must not interrupt teardown. */ }
  }

  function detach(target) {
    target.view.setVisible(false);
    if (target.attached) target.window.contentView.removeChildView(target.view);
    target.attached = false;
  }

  function destroyEntry(target, error = new Error("镜像浮层已关闭")) {
    clearTimeout(target.timer);
    target.rejectReady(error);
    try { detach(target); } catch { /* The parent may already be closing. */ }
    try {
      if (!target.view.webContents.isDestroyed()) target.view.webContents.close({ waitForBeforeUnload: false });
      if (!target.view.webContents.isDestroyed()) target.view.webContents.destroy();
    } catch { /* Electron may destroy the view with its parent. */ }
  }

  function unavailable(target, error) {
    if (entry !== target) return;
    const previous = presentation;
    entry = null;
    presentation = null;
    generation += 1;
    revision += 1;
    destroyEntry(target, error);
    const context = { surfaceId: previous?.surfaceId || "", kind: previous?.kind || "" };
    Promise.resolve().then(() => onEvent?.("unavailable", { reason: String(error.message || error), ...context }, context)).catch(() => {});
  }

  function ensureEntry() {
    const url = overlayUrl();
    if (entry && !entry.view.webContents.isDestroyed() && entry.url === url) return entry;
    if (entry) {
      const previous = entry;
      entry = null;
      destroyEntry(previous);
    }
    if (typeof electron.WebContentsView !== "function") throw new Error("当前环境不支持镜像浮层");
    const window = currentWindow();
    const view = new electron.WebContentsView({ webPreferences: {
      preload: path.join(__dirname, "mirrorOverlayPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
    } });
    let resolveReady, rejectReady;
    const readyPromise = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    readyPromise.catch(() => {});
    const target = { view, window, url, generation: ++generation, attached: false, loaded: false, ready: false, readyPromise, resolveReady, rejectReady };
    entry = target;
    try {
      view.setBackgroundColor?.("#00000000");
      view.setVisible(false);
      const maybeReady = () => {
        if (entry === target && target.loaded && target.ready) {
          clearTimeout(target.timer);
          target.resolveReady();
        }
      };
      target.maybeReady = maybeReady;
      const guardNavigation = (event, destination) => {
        const details = event?.url ? event : typeof destination === "string" ? { url: destination } : destination;
        if (details?.url !== target.url || details?.isMainFrame === false) event.preventDefault();
      };
      view.webContents.on("will-navigate", guardNavigation);
      view.webContents.on("will-redirect", guardNavigation);
      view.webContents.on("will-frame-navigate", guardNavigation);
      view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      view.webContents.on("focus", () => { if (entry === target && presentation?.visible) notifyFocus("overlay"); });
      view.webContents.on("blur", () => {
        if (entry !== target) return;
        notifyFocus("");
        const blurredSurface = presentation;
        const blurredRevision = revision;
        if (!blurredSurface?.visible || blurredSurface.kind !== "menu") return;
        Promise.resolve().then(() => {
          if (entry !== target || presentation !== blurredSurface || revision !== blurredRevision || !presentation.visible || view.webContents.isDestroyed() || view.webContents.isFocused()) return;
          return onEvent?.("closed", { surfaceId: blurredSurface.surfaceId, reason: "blur" }, { surfaceId: blurredSurface.surfaceId, kind: blurredSurface.kind });
        }).catch(() => {});
      });
      view.webContents.on("destroyed", () => unavailable(target, new Error("镜像浮层页面已关闭")));
      view.webContents.on("render-process-gone", (_event, details) => unavailable(target, new Error(`镜像浮层页面进程退出：${details?.reason || "unknown"}`)));
      target.timer = setTimeout(() => unavailable(target, new Error("镜像浮层加载超时")), 15000);
      target.timer.unref?.();
      Promise.resolve().then(() => {
        if (entry !== target) throw new Error("镜像浮层已取消加载");
        return view.webContents.loadURL(url);
      }).then(() => {
        if (entry !== target) return;
        target.loaded = true;
        maybeReady();
      }).catch(error => unavailable(target, error));
      return target;
    } catch (error) {
      unavailable(target, error);
      throw error;
    }
  }

  function trusted(event) {
    if (!entry || entry.view.webContents.isDestroyed() || event?.sender !== entry.view.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame?.url !== entry.url || event.sender.getURL() !== entry.url || overlayUrl() !== entry.url) {
      throw new Error("镜像浮层请求来源无效");
    }
    return entry;
  }

  async function present(input = {}) {
    let target;
    let requestRevision;
    try {
      const surfaceId = String(input.surfaceId || "").trim();
      const kind = String(input.kind || "").trim();
      if (!SURFACE_IDS.has(surfaceId) || !SURFACE_KINDS.has(kind)) throw new Error("镜像浮层标识无效");
      const bounds = normalizeBounds(input.bounds);
      target = ensureEntry();
      requestRevision = ++revision;
      const sameSurface = presentation?.surfaceId === surfaceId && presentation?.kind === kind;
      const wasVisible = Boolean(sameSurface && presentation.visible && target.attached);
      presentation = { surfaceId, kind, bounds, payload: input.payload ?? null, visible: wasVisible };
      await target.readyPromise;
      if (entry !== target || target.generation !== generation || requestRevision !== revision || !presentation) return result(null, { stale: true });
      target.view.setBounds(presentation.bounds);
      target.view.webContents.send("mirror-overlay:present", { ...presentation, visible: true });
      target.window.contentView.addChildView(target.view);
      target.attached = true;
      target.view.setVisible(true);
      presentation.visible = true;
      target.view.webContents.setBackgroundThrottling?.(false);
      if (!wasVisible) target.view.webContents.focus();
      return result();
    } catch (error) {
      if (entry === target && requestRevision === revision) unavailable(target, error);
      return result(error);
    }
  }

  function dismiss({ surfaceId } = {}) {
    if (surfaceId && surfaceId !== presentation?.surfaceId) return result(null, { stale: true });
    revision += 1;
    try {
      if (entry) {
        if (entry.loaded && entry.ready && presentation) entry.view.webContents.send("mirror-overlay:present", { surfaceId: presentation.surfaceId, kind: presentation.kind, payload: null, visible: false });
        detach(entry);
        entry.view.webContents.setBackgroundThrottling?.(true);
      }
      presentation = null;
      return result();
    } catch (error) {
      if (entry) unavailable(entry, error);
      return result(error);
    }
  }

  function syncBounds({ surfaceId, bounds } = {}) {
    try {
      if (!presentation || (surfaceId && surfaceId !== presentation.surfaceId)) return result(null, { stale: true });
      presentation.bounds = normalizeBounds(bounds);
      if (entry?.attached) entry.view.setBounds(presentation.bounds);
      return result();
    } catch (error) { return result(error); }
  }

  function reorder() {
    try {
      if (entry?.attached && presentation?.visible) currentWindow().contentView.addChildView(entry.view);
      return result();
    } catch (error) { return result(error); }
  }

  function clear() {
    const previous = entry;
    entry = null;
    presentation = null;
    generation += 1;
    revision += 1;
    if (previous) destroyEntry(previous);
    return result();
  }

  function notify(payload) {
    try {
      if (!entry?.loaded || !entry.ready) return result(new Error("镜像浮层尚未就绪"));
      entry.view.webContents.send("mirror-overlay:present", payload);
      return result();
    } catch (error) { return result(error); }
  }

  async function handleRequest(event, method, args = []) {
    try {
      trusted(event);
      if (typeof method !== "string" || !method || !Array.isArray(args) || typeof onRequest !== "function") throw new Error("镜像浮层接口无效");
      return await onRequest(method, args, { event, surfaceId: presentation?.surfaceId || "", kind: presentation?.kind || "" });
    } catch (error) {
      const errorDetails = { message: String(error?.message || error) };
      for (const key of ["code", "status", "operationId", "conflicts", "state", "retryAfterMs", "artifacts", "localChanged", "filePath", "boardId", "merged"]) {
        if (error?.[key] !== undefined) errorDetails[key] = error[key];
      }
      return { ok: false, error: errorDetails.message, errorDetails };
    }
  }

  function handleEvent(event, eventName, payload) {
    try {
      trusted(event);
      if (!RENDERER_EVENTS.has(eventName)) throw new Error("镜像浮层事件无效");
      if (payload?.surfaceId !== undefined && payload.surfaceId !== presentation?.surfaceId) return result(null, { stale: true });
      Promise.resolve(onEvent?.(eventName, payload, { event, surfaceId: presentation?.surfaceId || "", kind: presentation?.kind || "" })).catch(() => {});
      return result();
    } catch (error) { return result(error); }
  }

  function ready(event) {
    try {
      const target = trusted(event);
      target.ready = true;
      target.maybeReady();
      return result();
    } catch (error) { return result(error); }
  }

  return { present, dismiss, syncBounds, reorder, clear, notify, getState, getWebContents: () => entry?.view.webContents || null, handleRequest, handleEvent, ready };
}

module.exports = { createMirrorOverlayManager };
