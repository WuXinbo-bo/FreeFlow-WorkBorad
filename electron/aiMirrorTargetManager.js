const { BrowserWindow, shell } = require("electron");

const OFFSCREEN_BOUNDS = Object.freeze({
  x: -32000,
  y: -32000,
  width: 1440,
  height: 960,
});

function bufferToUintPtr(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length <= 0) {
    return 0n;
  }

  if (buffer.length >= 8 && typeof buffer.readBigUInt64LE === "function") {
    return buffer.readBigUInt64LE(0);
  }

  if (buffer.length >= 4) {
    return BigInt(buffer.readUInt32LE(0));
  }

  let value = 0n;
  for (let index = 0; index < buffer.length; index += 1) {
    value |= BigInt(buffer[index]) << BigInt(index * 8);
  }
  return value;
}

const AI_MIRROR_TARGETS = Object.freeze([
  {
    id: "doubao",
    name: "豆包",
    label: "豆包",
    note: "全能对话，日常好用",
    webUrl: "https://www.doubao.com/chat/",
    windowTitle: "AI 镜像 · 豆包",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    label: "DeepSeek",
    note: "逻辑推理，理科强悍",
    webUrl: "https://chat.deepseek.com/",
    windowTitle: "AI 镜像 · DeepSeek",
  },
  {
    id: "qwen",
    name: "千问",
    label: "千问",
    note: "长文写作，结构清晰",
    webUrl: "https://www.qianwen.com/",
    windowTitle: "AI 镜像 · 千问",
  },
  {
    id: "wps-ai",
    name: "WPS AI",
    label: "WPS AI",
    note: "办公全能，文档高效",
    webUrl: "https://ai.wps.cn/",
    windowTitle: "AI 镜像 · WPS AI",
  },
  {
    id: "wenxin-yiyan",
    name: "文心一言",
    label: "文心一言",
    note: "多模态强，内容丰富",
    webUrl: "https://yiyan.baidu.com/",
    windowTitle: "AI 镜像 · 文心一言",
  },
  {
    id: "xiezuocat",
    name: "秘塔写作猫",
    label: "秘塔写作猫",
    note: "润色纠错，文笔优化",
    webUrl: "https://xiezuocat.com/",
    windowTitle: "AI 镜像 · 秘塔写作猫",
  },
  {
    id: "kimi",
    name: "Kimi月之暗面",
    label: "Kimi月之暗面",
    note: "精读文档，长文解析",
    webUrl: "https://www.kimi.com/",
    windowTitle: "AI 镜像 · Kimi月之暗面",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    label: "Perplexity",
    note: "联网问答，检索增强",
    webUrl: "https://www.perplexity.ai/",
    windowTitle: "AI 镜像 · Perplexity",
  },
]);

function createAiMirrorTargetManager() {
  const managedWindows = new Map();
  let activeSession = null;
  let currentOwner = null;
  let generation = 0;

  function isCurrent(owner) {
    return currentOwner === owner && owner.generation === generation &&
      managedWindows.get(owner.targetId) === owner.window && !owner.window.isDestroyed();
  }

  function matchesOwner(owner, { targetId = "", syncSessionId = "" } = {}) {
    return (!targetId || String(targetId).trim() === owner.targetId) &&
      (!syncSessionId || String(syncSessionId).trim() === owner.syncSessionId);
  }

  function getTargetMeta(targetId = "") {
    return AI_MIRROR_TARGETS.find((item) => item.id === String(targetId || "").trim()) || null;
  }

  function createManagedTargetWindow(meta) {
    const window = new BrowserWindow({
      ...OFFSCREEN_BOUNDS,
      show: false,
      autoHideMenuBar: true,
      skipTaskbar: true,
      backgroundColor: "#111111",
      title: meta.windowTitle,
      webPreferences: {
        partition: `persist:ai-worker-ai-mirror-${meta.id}`,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    window.removeMenu();
    window.on("page-title-updated", (event) => {
      event.preventDefault();
      if (!window.isDestroyed()) {
        window.setTitle(meta.windowTitle);
      }
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url).catch(() => {});
      return { action: "deny" };
    });
    window.on("closed", () => {
      if (managedWindows.get(meta.id) === window) {
        managedWindows.delete(meta.id);
      }
      if (currentOwner?.window === window) {
        const previous = currentOwner;
        currentOwner = null;
        activeSession = null;
        generation += 1;
        previous.cancel();
      }
    });

    return window;
  }

  async function ensureManagedTargetWindow(meta, owner) {
    const targetWindow = owner.window;
    const currentUrl = targetWindow.webContents.getURL();
    if (!currentUrl || !currentUrl.startsWith(meta.webUrl)) {
      await Promise.race([targetWindow.loadURL(meta.webUrl), owner.cancelled]);
    }

    if (!isCurrent(owner)) throw new Error("镜像网页准备已取消");

    targetWindow.setTitle(meta.windowTitle);
    targetWindow.setBounds(OFFSCREEN_BOUNDS, false);
    if (!targetWindow.isVisible()) {
      targetWindow.show();
    }
    targetWindow.blur();

    return targetWindow;
  }

  function teardownManagedTargetWindow(targetWindow) {
    if (!targetWindow || targetWindow.isDestroyed()) {
      return;
    }

    try {
      targetWindow.setBounds(OFFSCREEN_BOUNDS, false);
    } catch {
      // Ignore offscreen relocation failures during teardown.
    }

    try {
      if (targetWindow.isVisible()) {
        targetWindow.hide();
      }
    } catch {
      // Ignore hide failures during teardown.
    }

    try {
      targetWindow.blur();
    } catch {
      // Ignore blur failures during teardown.
    }

    try {
      targetWindow.destroy();
    } catch {
      // Ignore forced destroy failures during teardown.
    }
  }

  function prepareTarget({ targetId = "", syncSessionId = "" } = {}) {
    const meta = getTargetMeta(targetId);
    if (!meta) {
      return Promise.resolve({
        ok: false,
        error: "不支持的 AI 镜像目标",
      });
    }

    const sessionId = String(syncSessionId || "").trim();
    if (currentOwner && isCurrent(currentOwner) && currentOwner.targetId === meta.id && currentOwner.syncSessionId === sessionId) return currentOwner.promise;
    const previous = currentOwner;
    const reuse = previous && !previous.loading && previous.targetId === meta.id && !previous.window.isDestroyed();
    currentOwner = null;
    activeSession = null;
    generation += 1;
    if (previous) {
      previous.cancel();
      if (!reuse) {
        if (managedWindows.get(previous.targetId) === previous.window) managedWindows.delete(previous.targetId);
        teardownManagedTargetWindow(previous.window);
      }
    }

    const targetWindow = reuse ? previous.window : createManagedTargetWindow(meta);
    const owner = { targetId: meta.id, syncSessionId: sessionId, generation, window: targetWindow, loading: true };
    owner.cancelled = new Promise(resolve => { owner.cancel = resolve; });
    managedWindows.set(meta.id, targetWindow);
    currentOwner = owner;
    owner.promise = ensureManagedTargetWindow(meta, owner).then(() => {
      if (!isCurrent(owner)) return { ok: true, active: false, stale: true };
      const hwnd = bufferToUintPtr(targetWindow.getNativeWindowHandle()).toString();
      owner.loading = false;
      activeSession = {
        targetId: meta.id,
        syncSessionId: sessionId,
        mode: "managed-web",
        browserWindowId: targetWindow.id,
        sourceId: `hwnd:${hwnd}`,
        sourceName: meta.windowTitle,
        label: meta.label,
      };
      return {
        ok: true,
        syncSessionId: sessionId,
        target: { id: meta.id, label: meta.label, note: meta.note },
        projection: { sourceId: `hwnd:${hwnd}`, label: `窗口 · ${meta.label}`, kind: "window" },
        mode: "managed-web",
      };
    }).catch(error => {
      if (!isCurrent(owner)) return { ok: true, active: false, stale: true };
      currentOwner = null;
      activeSession = null;
      managedWindows.delete(meta.id);
      teardownManagedTargetWindow(targetWindow);
      throw error;
    });
    return owner.promise;
  }

  async function stopTarget({ targetId = "", syncSessionId = "" } = {}) {
    const owner = currentOwner;
    if (!owner) {
      return {
        ok: true,
        active: false,
      };
    }
    if (!matchesOwner(owner, { targetId, syncSessionId })) return { ok: true, active: true, stale: true };
    currentOwner = null;
    activeSession = null;
    generation += 1;
    owner.cancel();
    if (managedWindows.get(owner.targetId) === owner.window) managedWindows.delete(owner.targetId);
    teardownManagedTargetWindow(owner.window);

    return {
      ok: true,
      active: false,
      closed: owner.targetId,
    };
  }

  function listTargets() {
    return {
      ok: true,
      targets: AI_MIRROR_TARGETS.map((item) => ({
        id: item.id,
        name: item.name,
        label: item.label,
        kind: "window",
        note: item.note,
      })),
    };
  }

  async function dispose() {
    const owner = currentOwner;
    currentOwner = null;
    activeSession = null;
    generation += 1;
    owner?.cancel();
    const windows = [...managedWindows.values()];
    managedWindows.clear();
    for (const window of windows) {
      teardownManagedTargetWindow(window);
    }
  }

  function getState() {
    return {
      activeSession: activeSession
        ? {
            ...activeSession,
          }
        : null,
      pendingSession: currentOwner?.loading ? { targetId: currentOwner.targetId, syncSessionId: currentOwner.syncSessionId, browserWindowId: currentOwner.window.id } : null,
    };
  }

  return {
    listTargets,
    prepareTarget,
    stopTarget,
    dispose,
    getState,
  };
}

module.exports = {
  AI_MIRROR_TARGETS,
  createAiMirrorTargetManager,
};
