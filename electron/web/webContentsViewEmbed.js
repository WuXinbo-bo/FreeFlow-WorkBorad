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
    getState: () => ({ active: false, targetId: "", visible: false }),
    attachTarget: error,
    syncBounds: error,
    setVisibility: () => ({ ok: true, active: false, visible: false }),
    focusTarget: () => ({ ok: true, active: false }),
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
  const notifyFocusChanged =
    typeof options?.onFocusChanged === "function"
      ? options.onFocusChanged
      : () => {};

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

  function detachActiveEntry() {
    if (!activeEntry?.view) {
      return;
    }

    try {
      const mainWindow = getMainWindow();
      if (typeof mainWindow.contentView.removeChildView === "function") {
        mainWindow.contentView.removeChildView(activeEntry.view);
      }
    } catch {
      // Ignore detach failures during shutdown or view replacement.
    }

    activeEntry.attached = false;
  }

  function destroyActiveEntry() {
    if (!activeEntry) {
      return;
    }

    detachActiveEntry();

    try {
      if (activeEntry.view?.webContents && !activeEntry.view.webContents.isDestroyed()) {
        activeEntry.view.webContents.close({ waitForBeforeUnload: false });
      }
    } catch {
      // Ignore close failures and continue cleanup.
    }

    try {
      if (activeEntry.view?.webContents && !activeEntry.view.webContents.isDestroyed()) {
        activeEntry.view.webContents.destroy();
      }
    } catch {
      // Ignore final destroy failures.
    }

    activeEntry = null;
  }

  function getState() {
    if (!activeEntry?.view?.webContents || activeEntry.view.webContents.isDestroyed()) {
      return {
        active: false,
        targetId: "",
        sourceId: "",
        visible: false,
      };
    }

    return {
      active: true,
      targetId: activeEntry.targetId,
      sourceId: activeEntry.sourceId,
      visible: !activeEntry.hidden,
      attached: Boolean(activeEntry.attached),
      bounds: { ...activeEntry.bounds },
      url: activeEntry.view.webContents.getURL(),
    };
  }

  async function ensureViewForTarget(meta) {
    if (
      activeEntry?.targetId === meta.id &&
      activeEntry?.view?.webContents &&
      !activeEntry.view.webContents.isDestroyed()
    ) {
      return activeEntry;
    }

    destroyActiveEntry();

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

    view.webContents.on("focus", () => {
      notifyFocusChanged({
        owner: "ai-mirror",
        targetId: meta.id,
        sourceId: `webcontentsview:${meta.id}`,
      });
    });

    view.webContents.on("blur", () => {
      notifyFocusChanged({
        owner: "",
        targetId: meta.id,
        sourceId: `webcontentsview:${meta.id}`,
      });
    });

    activeEntry = {
      targetId: meta.id,
      sourceId: `webcontentsview:${meta.id}`,
      view,
      hidden: false,
      attached: false,
      bounds: { x: 0, y: 0, width: 1, height: 1 },
    };

    const currentUrl = String(view.webContents.getURL() || "").trim();
    if (!currentUrl || !currentUrl.startsWith(meta.webUrl)) {
      await view.webContents.loadURL(meta.webUrl);
    }

    return activeEntry;
  }

  function attachEntry(entry, bounds) {
    const mainWindow = getMainWindow();
    const nextBounds = normalizeBounds(bounds);
    if (!entry.attached) {
      mainWindow.contentView.addChildView(entry.view);
      entry.attached = true;
    }
    entry.view.setBounds(nextBounds);
    entry.bounds = nextBounds;
    if (typeof entry.view.setVisible === "function") {
      entry.view.setVisible(true);
    }
    entry.hidden = false;
  }

  async function attachTarget({ targetId = "", bounds = null } = {}) {
    const meta = getTargetMeta(targetId);
    if (!meta) {
      throw new Error("不支持的 AI 镜像目标");
    }

    const entry = await ensureViewForTarget(meta);
    attachEntry(entry, bounds || {});

    return {
      ok: true,
      active: true,
      mode: "webcontentsview",
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

  function syncBounds({ bounds = null } = {}) {
    if (!activeEntry) {
      return {
        ok: true,
        active: false,
      };
    }

    const nextBounds = normalizeBounds(bounds || activeEntry.bounds);
    activeEntry.bounds = nextBounds;

    if (activeEntry.hidden) {
      if (activeEntry.attached && activeEntry.view) {
        activeEntry.view.setBounds(nextBounds);
      }
    } else {
      attachEntry(activeEntry, nextBounds);
    }

    return {
      ok: true,
      active: true,
      sourceId: activeEntry.sourceId,
      bounds: { ...activeEntry.bounds },
    };
  }

  function setVisibility(visible) {
    if (!activeEntry) {
      return {
        ok: true,
        active: false,
        visible: false,
      };
    }

    const nextVisible = Boolean(visible);
    if (nextVisible) {
      attachEntry(activeEntry, activeEntry.bounds);
    } else {
      if (typeof activeEntry.view.setVisible === "function") {
        activeEntry.view.setVisible(false);
      }
      detachActiveEntry();
      activeEntry.hidden = true;
    }

    return {
      ok: true,
      active: true,
      visible: nextVisible,
      sourceId: activeEntry.sourceId,
    };
  }

  function focusTarget() {
    if (!activeEntry?.view?.webContents || activeEntry.view.webContents.isDestroyed()) {
      return {
        ok: true,
        active: false,
      };
    }

    activeEntry.view.webContents.focus();

    return {
      ok: true,
      active: true,
      sourceId: activeEntry.sourceId,
    };
  }

  function blurTarget() {
    if (!activeEntry?.view?.webContents || activeEntry.view.webContents.isDestroyed()) {
      return {
        ok: true,
        active: false,
      };
    }

    if (typeof activeEntry.view.webContents.blur === "function") {
      activeEntry.view.webContents.blur();
    }

    notifyFocusChanged({
      owner: "",
      targetId: activeEntry.targetId,
      sourceId: activeEntry.sourceId,
    });

    return {
      ok: true,
      active: true,
      sourceId: activeEntry.sourceId,
    };
  }

  function clearTarget() {
    const previousSourceId = activeEntry?.sourceId || "";
    destroyActiveEntry();
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
