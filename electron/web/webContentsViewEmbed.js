let electron = require("electron");
if (typeof electron === "string") {
  electron = require("electron/main");
}

const { WebContentsView, shell } = electron;

function createUnsupportedManager() {
  const error = () => {
    throw new Error("当前环境不支持 WebContentsView 嵌入");
  };

  return {
    isSupported: () => false,
    getState: () => ({ active: false, targetId: "", visible: false, webContentsId: null, syncSessionId: "" }),
    attachTarget: error,
    syncBounds: error,
    setVisibility: () => ({ ok: true, active: false, visible: false }),
    focusTarget: () => ({ ok: true, active: false }),
    blurTarget: () => ({ ok: true, active: false }),
    clearTarget: () => ({ ok: true, active: false }),
  };
}

function normalizeBounds(bounds = {}) {
  return {
    x: Math.max(0, Math.floor(Number(bounds?.x) || 0)),
    y: Math.max(0, Math.floor(Number(bounds?.y) || 0)),
    width: Math.max(1, Math.ceil(Number(bounds?.width) || 0)),
    height: Math.max(1, Math.ceil(Number(bounds?.height) || 0)),
  };
}

function createWebContentsViewEmbedManager(mainWindowGetter, targets = [], options = {}) {
  if (typeof WebContentsView !== "function") {
    return createUnsupportedManager();
  }

  let activeEntry = null;
  let attachGeneration = 0;
  const notifyFocusChanged =
    typeof options?.onFocusChanged === "function"
      ? options.onFocusChanged
      : () => {};
  const notifyAttached =
    typeof options?.onAttached === "function" ? options.onAttached : () => {};

  function isCurrentEntry(entry) {
    return Boolean(entry && entry === activeEntry && entry.view?.webContents && !entry.view.webContents.isDestroyed());
  }

  function matchesIdentity(entry, { targetId = "", syncSessionId = "" } = {}) {
    const requestedTargetId = String(targetId || "").trim();
    const requestedSessionId = String(syncSessionId || "").trim();
    return (!requestedTargetId || requestedTargetId === entry.targetId) &&
      (!requestedSessionId || requestedSessionId === entry.syncSessionId);
  }

  function updateFocus(entry, focused) {
    if (!entry || entry !== activeEntry || entry.focused === focused) return;
    if (focused && (!isCurrentEntry(entry) || entry.hidden || !entry.attached || entry.loading)) return;
    entry.focused = focused;
    notifyFocusChanged({
      owner: focused ? "ai-mirror" : "",
      targetId: entry.targetId,
      sourceId: entry.sourceId,
      webContentsId: entry.webContentsId,
      syncSessionId: entry.syncSessionId,
    });
  }

  function getMainWindow() {
    const window = typeof mainWindowGetter === "function" ? mainWindowGetter() : null;
    if (!window || window.isDestroyed()) {
      throw new Error("主窗口不可用，无法执行 WebContentsView 嵌入");
    }
    if (!window.contentView || typeof window.contentView.addChildView !== "function") {
      throw new Error("当前 Electron 版本未暴露可用的 contentView 能力");
    }
    return window;
  }

  function getTargetMeta(targetId = "") {
    const cleanTargetId = String(targetId || "").trim();
    return targets.find((item) => item.id === cleanTargetId) || null;
  }

  function detachEntry(entry) {
    if (!entry?.view) {
      return;
    }

    try {
      const mainWindow = entry.parentWindow;
      if (mainWindow && !mainWindow.isDestroyed() && typeof mainWindow.contentView.removeChildView === "function") {
        mainWindow.contentView.removeChildView(entry.view);
      }
    } catch {
      // Ignore detach failures during shutdown or view replacement.
    }

    entry.attached = false;
    entry.parentWindow = null;
  }

  function destroyEntry(entry = activeEntry) {
    if (!entry) {
      return;
    }

    updateFocus(entry, false);
    if (activeEntry === entry) activeEntry = null;
    detachEntry(entry);

    try {
      if (entry.view?.webContents && !entry.view.webContents.isDestroyed()) {
        entry.view.webContents.close({ waitForBeforeUnload: false });
      }
    } catch {
      // Ignore close failures and continue cleanup.
    }

    try {
      if (entry.view?.webContents && !entry.view.webContents.isDestroyed()) {
        entry.view.webContents.destroy();
      }
    } catch {
      // Ignore final destroy failures.
    }
  }

  function getState() {
    if (!activeEntry?.view?.webContents || activeEntry.view.webContents.isDestroyed()) {
      return {
        active: false,
        targetId: "",
        sourceId: "",
        visible: false,
        attached: false,
        loading: false,
        webContentsId: null,
        syncSessionId: "",
      };
    }

    return {
      active: true,
      targetId: activeEntry.targetId,
      sourceId: activeEntry.sourceId,
      visible: !activeEntry.hidden && Boolean(activeEntry.attached),
      attached: Boolean(activeEntry.attached),
      loading: Boolean(activeEntry.loading),
      webContentsId: activeEntry.view.webContents.id,
      syncSessionId: activeEntry.syncSessionId,
      bounds: { ...activeEntry.bounds },
      url: activeEntry.view.webContents.getURL(),
    };
  }

  function ensureViewForTarget(meta) {
    if (
      activeEntry?.targetId === meta.id &&
      activeEntry?.view?.webContents &&
      !activeEntry.view.webContents.isDestroyed()
    ) {
      return activeEntry;
    }

    destroyEntry();

    const view = new WebContentsView({
      webPreferences: {
        partition: `persist:ai-worker-ai-mirror-${meta.id}`,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    view.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url).catch(() => {});
      return { action: "deny" };
    });

    view.webContents.on("page-title-updated", (event) => {
      event.preventDefault();
    });

    const entry = {
      targetId: meta.id,
      sourceId: `webcontentsview:${meta.id}`,
      view,
      webContentsId: view.webContents.id,
      hidden: false,
      attached: false,
      parentWindow: null,
      focused: false,
      loading: true,
      syncSessionId: "",
      lastSyncRevision: 0,
      bounds: { x: 0, y: 0, width: 1, height: 1 },
    };
    activeEntry = entry;
    view.webContents.on("focus", () => updateFocus(entry, true));
    view.webContents.on("blur", () => updateFocus(entry, false));
    view.webContents.once("destroyed", () => {
      if (activeEntry !== entry) return;
      attachGeneration += 1;
      destroyEntry(entry);
    });

    try {
      const currentUrl = String(view.webContents.getURL() || "").trim();
      const load = !currentUrl || !currentUrl.startsWith(meta.webUrl)
        ? view.webContents.loadURL(meta.webUrl)
        : Promise.resolve();
      entry.loadPromise = Promise.resolve(load).then(
        () => { entry.loading = false; },
        (error) => { entry.loading = false; throw error; }
      );
    } catch (error) {
      destroyEntry(entry);
      throw error;
    }

    return entry;
  }

  function attachEntry(entry, bounds) {
    if (!isCurrentEntry(entry) || entry.hidden || entry.loading) return;
    const mainWindow = getMainWindow();
    const nextBounds = normalizeBounds(bounds);
    if (entry.attached && entry.parentWindow !== mainWindow) detachEntry(entry);
    if (!entry.attached) {
      mainWindow.contentView.addChildView(entry.view);
      entry.attached = true;
      entry.parentWindow = mainWindow;
    }
    entry.view.setBounds(nextBounds);
    entry.bounds = nextBounds;
    entry.view.webContents.setBackgroundThrottling?.(false);
    if (typeof entry.view.setVisible === "function") {
      entry.view.setVisible(true);
    }
    notifyAttached(entry);
  }

  async function attachTarget({ targetId = "", bounds = null, syncSessionId = "" } = {}) {
    const meta = getTargetMeta(targetId);
    if (!meta) {
      throw new Error("不支持的 AI 镜像目标");
    }

    const generation = ++attachGeneration;
    let entry;
    try {
      getMainWindow();
      entry = ensureViewForTarget(meta);
      const requestedSessionId = String(syncSessionId || "").trim();
      if (requestedSessionId !== entry.syncSessionId) entry.lastSyncRevision = 0;
      entry.syncSessionId = requestedSessionId;
      entry.hidden = false;
      entry.bounds = normalizeBounds(bounds || entry.bounds);
      await entry.loadPromise;
      if (!isCurrentEntry(entry) || generation !== attachGeneration) {
        return { ok: true, active: false, stale: true };
      }
      attachEntry(entry, entry.bounds);
      if (!isCurrentEntry(entry) || generation !== attachGeneration) {
        return { ok: true, active: false, stale: true };
      }
    } catch (error) {
      if (generation !== attachGeneration || (entry && activeEntry !== entry)) {
        return { ok: true, active: false, stale: true };
      }
      destroyEntry(entry);
      throw error;
    }

    return {
      ok: true,
      active: true,
      mode: "webcontentsview",
      webContentsId: entry.view.webContents.id,
      syncSessionId: entry.syncSessionId,
      visible: !entry.hidden && entry.attached,
      target: {
        id: meta.id,
        label: meta.label,
        note: meta.note,
      },
      projection: {
        sourceId: entry.sourceId,
        label: `网页 · ${meta.label}`,
        kind: "webcontentsview",
      },
    };
  }

  function syncBounds({ bounds = null, targetId = "", syncSessionId = "", syncRevision = 0 } = {}) {
    if (!isCurrentEntry(activeEntry)) {
      return {
        ok: true,
        active: false,
      };
    }
    const entry = activeEntry;

    const requestedTargetId = String(targetId || "").trim();
    const requestedSessionId = String(syncSessionId || "").trim();
    const requestedRevision = Math.max(0, Number(syncRevision) || 0);
    if (
      (requestedTargetId && requestedTargetId !== entry.targetId) ||
      (requestedSessionId && entry.syncSessionId && requestedSessionId !== entry.syncSessionId) ||
      (requestedSessionId && requestedRevision <= Number(entry.lastSyncRevision || 0))
    ) {
      return { ok: true, active: true, stale: true, bounds: { ...entry.bounds } };
    }
    if (requestedSessionId) {
      entry.syncSessionId = requestedSessionId;
      entry.lastSyncRevision = requestedRevision;
    }

    const nextBounds = normalizeBounds(bounds || entry.bounds);
    entry.bounds = nextBounds;

    if (entry.hidden) {
      if (entry.attached && entry.view) {
        entry.view.setBounds(nextBounds);
      }
    } else if (!entry.loading) {
      attachEntry(entry, nextBounds);
    }

    return {
      ok: true,
      ...getState(),
    };
  }

  function setVisibility(visible, identity = {}) {
    if (!isCurrentEntry(activeEntry)) {
      return {
        ok: true,
        active: false,
        visible: false,
      };
    }
    if (!matchesIdentity(activeEntry, identity)) {
      return { ok: true, ...getState(), stale: true };
    }

    const entry = activeEntry;
    const nextVisible = Boolean(visible);
    entry.hidden = !nextVisible;
    entry.view.webContents.setBackgroundThrottling?.(!nextVisible);
    if (nextVisible) {
      attachEntry(entry, entry.bounds);
    } else {
      updateFocus(entry, false);
      if (typeof entry.view.setVisible === "function") {
        entry.view.setVisible(false);
      }
      detachEntry(entry);
    }

    return {
      ok: true,
      ...getState(),
    };
  }

  function focusTarget() {
    if (!isCurrentEntry(activeEntry)) {
      return {
        ok: true,
        active: false,
      };
    }
    const entry = activeEntry;
    if (entry.hidden || !entry.attached || entry.loading) {
      return { ok: true, active: true, focused: false, sourceId: entry.sourceId };
    }

    entry.view.webContents.focus();

    return {
      ok: true,
      ...getState(),
      focused: isCurrentEntry(entry) && !entry.hidden && entry.attached,
    };
  }

  function blurTarget() {
    if (!isCurrentEntry(activeEntry)) {
      return {
        ok: true,
        active: false,
      };
    }

    const entry = activeEntry;
    if (typeof entry.view.webContents.blur === "function") {
      entry.view.webContents.blur();
    }

    updateFocus(entry, false);

    return {
      ok: true,
      ...getState(),
    };
  }

  function clearTarget(identity = {}) {
    if (isCurrentEntry(activeEntry) && !matchesIdentity(activeEntry, identity)) {
      return { ok: true, ...getState(), stale: true };
    }
    const previousSourceId = activeEntry?.sourceId || "";
    attachGeneration += 1;
    destroyEntry();
    return {
      ok: true,
      active: false,
      sourceId: previousSourceId,
    };
  }

  return {
    isSupported: () => true,
    getState,
    attachTarget,
    syncBounds,
    setVisibility,
    focusTarget,
    blurTarget,
    clearTarget,
  };
}

module.exports = {
  createWebContentsViewEmbedManager,
};
