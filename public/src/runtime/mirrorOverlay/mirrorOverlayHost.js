import { runGithubSyncOperation } from "../githubSyncRecovery.js";

// The desktop broker hosts existing settings and explicit menu actions above native mirrors.
// It never serializes arbitrary DOM, scripts, input events, or credentials into HTML.
export function createMirrorOverlayHost({ shell, settingsOptions, drawer, menus, onClosed, onChanged, onUnavailable }) {
  const supported = typeof shell?.presentMirrorOverlay === "function";
  let active = null;
  let pendingKey = "";
  let generation = 0;
  let settingsOwned = false;
  let settingsUnavailable = false;
  let section = "appearance";
  let sectionRevision = 0;
  let failedSurface = "";
  let fingerprint = "";
  const leases = new Map();
  const fileRequests = new Set();
  let leaseSequence = 0;
  const desktopMethods = new Set(["getShortcutSettings", "setShortcutSettings", "setShortcutRecording", "pickDirectory", "revealPath", "pickCanvasBoardPath", "openExternal"]);
  const githubMethods = new Set(["getStatus", "getWorkspace", "listBoards", "getBoardState", "getOperations", "getOperation", "startDeviceFlow", "connectToken", "pollDeviceFlow", "listRepositories", "setRepository", "createRepository", "sync", "planWorkspace", "syncWorkspace", "pullWorkspace", "pull", "download", "reconcile", "disconnect"]);
  const agentMethods = new Set(["getRuntime", "listBackups", "restartRuntime", "discoverProvider", "bindProviderRuntime", "saveProviderConnection", "refreshProviderModels", "selectProviderModel", "testProviderConnection", "createBackup", "restoreBackup"]);

  function releaseLeases() {
    const held = [...leases.values()];
    // A crashed settings renderer must not release autosave while a pull is still writing.
    void Promise.allSettled([...fileRequests]).then(() => { for (const lease of held) lease.release(); });
  }

  async function request(method, args) {
    if (!Array.isArray(args)) throw new Error("无效的浮层参数");
    const callbacks = {
      "settings.prepareBoard": settingsOptions.prepareGitHubSyncBoard,
      "settings.prepareWorkspace": settingsOptions.prepareGitHubSyncWorkspace,
      "settings.workspaceContext": settingsOptions.getGitHubSyncWorkspaceContext,
      "settings.applySnapshot": settingsOptions.onApplySnapshot,
      "settings.themePreview": settingsOptions.onThemePreview,
      "settings.checkUpdate": settingsOptions.onCheckUpdate,
      "settings.pluginStatus": settingsOptions.onPluginStatus,
      "settings.status": settingsOptions.onStatus,
    };
    if (Object.hasOwn(callbacks, method) && typeof callbacks[method] === "function") return callbacks[method](...args);
    if (method === "settings.fileOperationBegin") {
      const id = String(++leaseSequence);
      let release;
      const released = new Promise(resolve => { release = resolve; });
      let acquired;
      let failed;
      const ready = new Promise((resolve, reject) => { acquired = resolve; failed = reject; });
      const lease = { release, done: null };
      leases.set(id, lease);
      lease.done = settingsOptions.runGitHubBoardFileOperation(async () => {
        acquired({ leaseId: id });
        await released;
      }).catch(error => { failed(error); throw error; }).finally(() => leases.delete(id));
      // A renderer can disappear during acquisition. Release then wait for the engine's finally.
      lease.done.catch(() => {});
      return ready;
    }
    if (method === "settings.fileOperationEnd") {
      const lease = leases.get(String(args[0]));
      if (lease) { lease.release(); await lease.done; }
      return { ok: true };
    }
    const parts = String(method).split(".");
    let owner = null;
    let key = "";
    if (parts.length === 2 && parts[0] === "desktop" && desktopMethods.has(parts[1])) { owner = shell; key = parts[1]; }
    if (parts.length === 3 && parts[0] === "desktop" && parts[1] === "githubSync" && githubMethods.has(parts[2])) { owner = shell.githubSync; key = parts[2]; }
    if (parts.length === 2 && parts[0] === "agent" && agentMethods.has(parts[1])) { owner = settingsOptions.agentClient; key = parts[1]; }
    if (typeof owner?.[key] !== "function") throw new Error("不允许的浮层操作");
    if (owner === shell.githubSync && ["sync", "planWorkspace", "syncWorkspace", "pullWorkspace", "pull", "download", "reconcile"].includes(key)) {
      const task = runGithubSyncOperation(() => owner[key](...args), { client: shell.githubSync });
      fileRequests.add(task);
      try { return await task; }
      finally { fileRequests.delete(task); }
    }
    return owner[key](...args);
  }

  function theme() {
    const style = getComputedStyle(document.documentElement);
    const variables = {};
    for (let i = 0; i < style.length; i++) {
      const key = style[i];
      if (key.startsWith("--")) variables[key] = style.getPropertyValue(key);
    }
    const attributes = {};
    for (const attr of document.documentElement.attributes) if (attr.name.startsWith("data-")) attributes[attr.name] = attr.value;
    return { variables, attributes };
  }

  function boundsForSettings() {
    const style = getComputedStyle(drawer);
    const width = Math.min(innerWidth - 16, parseFloat(style.width) || 560);
    return { x: Math.max(0, innerWidth - width - 8), y: 8, width, height: Math.max(1, innerHeight - 16) };
  }

  function boundsForMenu(menu, items) {
    const anchor = menu.trigger.getBoundingClientRect();
    const width = Math.min(320, innerWidth - 16);
    const height = Math.min(innerHeight - 16, items.length * 38 + 50);
    return { x: Math.max(8, Math.min(innerWidth - width - 8, anchor.right - width)), y: Math.max(8, Math.min(anchor.bottom + 6, innerHeight - height - 8)), width, height };
  }

  function setNative(element, enabled) {
    if (enabled) element?.setAttribute("data-native-overlay", "true");
    else element?.removeAttribute("data-native-overlay");
  }

  function restoreDom() {
    setNative(drawer, false);
    for (const menu of menus) setNative(menu.element, false);
  }

  async function dismiss() {
    ++generation;
    pendingKey = "";
    fingerprint = "";
    const previous = active;
    active = null;
    restoreDom();
    if (supported) await shell.dismissMirrorOverlay(previous ? { surfaceId: previous.id } : {}).catch(() => {});
  }

  async function present(id, kind, bounds, payload, element) {
    const key = JSON.stringify({ id, kind, bounds, payload });
    if (key === fingerprint || key === pendingKey) return;
    const revision = ++generation;
    pendingKey = key;
    const response = await shell.presentMirrorOverlay({ surfaceId: id, kind, bounds, payload }).catch(error => ({ ok: false, error: error.message }));
    if (revision !== generation) return;
    pendingKey = "";
    if (!response?.ok || response.stale) {
      fingerprint = "";
      active = null;
      failedSurface = id;
      if (id === "settings") { settingsOwned = false; settingsUnavailable = true; }
      restoreDom();
      onUnavailable?.(response?.error || "原生浮层不可用");
    } else {
      fingerprint = key;
      active = { id, kind, bounds };
      restoreDom();
      setNative(element, true);
    }
    onChanged?.();
  }

  function sync({ settingsOpen, mirrorActive, blocked }) {
    if (!supported || blocked) {
      if (active || pendingKey) void dismiss();
      return;
    }
    if (settingsOpen && settingsOwned) {
      if (failedSurface === "settings") return;
      void present("settings", "settings", boundsForSettings(), { section, sectionRevision, platform: shell.platform, theme: theme() }, drawer);
      return;
    }
    const menu = mirrorActive ? menus.find(item => item.isOpen()) : null;
    if (menu) {
      if (failedSurface === menu.id) return;
      const items = menu.items();
      void present(menu.id, "menu", boundsForMenu(menu, items), { title: menu.title, items, theme: theme() }, menu.element);
    } else {
      failedSurface = "";
      if (active || pendingKey) void dismiss().then(() => onChanged?.());
    }
  }

  const disposeRequest = shell?.onMirrorOverlayRequest?.(request);
  const disposeEvent = shell?.onMirrorOverlayEvent?.(({ name, payload, surfaceId }) => {
    if (name === "unavailable") {
      ++generation; active = null; pendingKey = ""; fingerprint = "";
      failedSurface = surfaceId || (settingsOwned ? "settings" : "");
      if (settingsOwned) { settingsOwned = false; settingsUnavailable = true; }
      restoreDom(); releaseLeases(); onUnavailable?.(payload?.reason); onChanged?.(); return;
    }
    if (name === "runtime-event") {
      if (["freeflow:github-sync-status", "freeflow:workspace-files-changed", "freeflow:agent-data-restored"].includes(payload?.type)) {
        window.dispatchEvent(new CustomEvent(payload.type, { detail: payload.detail }));
      }
      return;
    }
    if (surfaceId !== active?.id) return;
    if (name === "closed") {
      const id = active.id;
      void dismiss();
      // DOM state must close before observers can sync while native IPC settles.
      if (id === "settings") onClosed?.();
      else menus.find(item => item.id === id)?.close();
      onChanged?.();
    }
    if (name === "action" && active.kind === "menu") {
      const menu = menus.find(item => item.id === active.id);
      menu?.activate(String(payload?.id || ""));
    }
  });
  const disposeOperations = shell?.githubSync?.onOperation?.(detail => shell.notifyMirrorOverlay({ kind: "event", payload: { type: "github-operation", detail } }).catch(() => {}));
  const onRemoteUpdate = event => shell?.notifyMirrorOverlay?.({ kind: "event", payload: { type: "freeflow:github-remote-update", detail: event.detail } }).catch(() => {});
  window.addEventListener("freeflow:github-remote-update", onRemoteUpdate);
  window.addEventListener("pagehide", () => {
    ++generation; releaseLeases(); restoreDom(); disposeRequest?.(); disposeEvent?.(); disposeOperations?.();
    window.removeEventListener("freeflow:github-remote-update", onRemoteUpdate);
  }, { once: true });

  return {
    sync,
    get active() { return active; },
    ownsSettings: () => settingsOwned,
    enableSettings() { if (supported && !settingsUnavailable) settingsOwned = true; failedSurface = ""; return settingsOwned; },
    openSection(value) { section = value; sectionRevision++; failedSurface = ""; fingerprint = ""; },
    requestClose() {
      if (!active || active.id !== "settings") return false;
      void shell.presentMirrorOverlay({ surfaceId: "settings", kind: "settings", bounds: boundsForSettings(), payload: { command: "request-close" } });
      return true;
    },
    dismiss,
    getShapeRects: () => active ? [active.bounds] : [],
  };
}
