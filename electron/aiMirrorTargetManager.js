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
]);

function createAiMirrorTargetManager() {
  const managedWindows = new Map();
  let activeSession = null;

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
    });

    return window;
  }

  async function ensureManagedTargetWindow(meta) {
    let targetWindow = managedWindows.get(meta.id);
    if (!targetWindow || targetWindow.isDestroyed()) {
      targetWindow = createManagedTargetWindow(meta);
      managedWindows.set(meta.id, targetWindow);
    }

    const currentUrl = targetWindow.webContents.getURL();
    if (!currentUrl || !currentUrl.startsWith(meta.webUrl)) {
      await targetWindow.loadURL(meta.webUrl);
    }

    if (targetWindow.isDestroyed()) {
      throw new Error("镜像网页窗口已关闭");
    }

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

  async function prepareTarget({ targetId = "" } = {}) {
    const meta = getTargetMeta(targetId);
    if (!meta) {
      return {
        ok: false,
        error: "不支持的 AI 镜像目标",
      };
    }

    const targetWindow = await ensureManagedTargetWindow(meta);
    const hwnd = bufferToUintPtr(targetWindow.getNativeWindowHandle()).toString();

    activeSession = {
      targetId: meta.id,
      mode: "managed-web",
      browserWindowId: targetWindow.id,
      sourceId: `hwnd:${hwnd}`,
      sourceName: meta.windowTitle,
      label: meta.label,
    };

    return {
      ok: true,
      target: {
        id: meta.id,
        label: meta.label,
        note: meta.note,
      },
      projection: {
        sourceId: `hwnd:${hwnd}`,
        label: `窗口 · ${meta.label}`,
        kind: "window",
      },
      mode: "managed-web",
    };
  }

  async function stopTarget({ targetId = "" } = {}) {
    const nextTargetId = String(targetId || activeSession?.targetId || "").trim();
    const session = activeSession && activeSession.targetId === nextTargetId ? activeSession : activeSession;

    if (!session) {
      return {
        ok: true,
        active: false,
      };
    }

    activeSession = null;

    const targetWindow = managedWindows.get(session.targetId);
    teardownManagedTargetWindow(targetWindow);
    managedWindows.delete(session.targetId);

    return {
      ok: true,
      active: false,
      closed: session.targetId,
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
    await stopTarget().catch(() => {});
    for (const window of managedWindows.values()) {
      teardownManagedTargetWindow(window);
    }
    managedWindows.clear();
  }

  function getState() {
    return {
      activeSession: activeSession
        ? {
            ...activeSession,
          }
        : null,
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
