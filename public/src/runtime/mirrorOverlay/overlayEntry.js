import { mountSettingsCenter } from "../../components/settings/settingsCenter.js";
import { API_ROUTES, readJsonResponse } from "../../api/http.js";
import { applyThemeCssVariables } from "../../theme/themeCssVariables.js";
import { renderAppIcon } from "../../ui/icons/appIcons.mjs";

const bridge = window.mirrorOverlay;
const settingsPanel = document.querySelector("#insight-drawer");
const settingsHost = document.querySelector("#settings-center-host");
const menu = document.querySelector("#overlay-menu");
const errorLabel = document.querySelector("#overlay-error");
const operationListeners = new Set();
let settingsCenter = null;
let activeSurface = null;
let presentSequence = 0;
let menuFingerprint = "";
let settingsSectionRevision = null;
let platform = "";
let forwardingHostEvent = false;
const appliedThemeAttributes = new Set();
const appliedThemeVariables = new Set();

applyThemeCssVariables(document.documentElement);

function emit(event, payload = {}) {
  bridge?.emit(event, { surfaceId: activeSurface?.surfaceId || "", ...payload });
}

function reportError(error) {
  errorLabel.textContent = error?.message || "暂时无法完成操作，请重试";
  errorLabel.hidden = false;
}

async function request(method, args = []) {
  if (!bridge?.request) throw new Error("设置通信尚未就绪");
  const result = await bridge.request(method, args);
  if (result?.ok === false) {
    const details = result.errorDetails && typeof result.errorDetails === "object" ? result.errorDetails : {};
    throw Object.assign(new Error(result.error || "暂时无法完成操作，请重试"), details);
  }
  return result;
}

function notify(method, args = []) {
  void request(method, args).catch(reportError);
}

function createProxy(prefix, methods) {
  return Object.fromEntries(methods.map(method => [method, (...args) => request(`${prefix}.${method}`, args)]));
}

const desktopShell = {
  ...createProxy("desktop", ["getShortcutSettings", "setShortcutSettings", "setShortcutRecording", "pickDirectory", "revealPath", "pickCanvasBoardPath", "openExternal"]),
  get platform() { return platform; },
  githubSync: {
    ...createProxy("desktop.githubSync", ["getStatus", "getWorkspace", "listBoards", "getBoardState", "getOperations", "getOperation", "startDeviceFlow", "connectToken", "pollDeviceFlow", "listRepositories", "setRepository", "createRepository", "sync", "planWorkspace", "syncWorkspace", "pullWorkspace", "pull", "download", "reconcile", "disconnect"]),
    onOperation(listener) {
      operationListeners.add(listener);
      return () => operationListeners.delete(listener);
    },
  },
};
const agentClient = createProxy("agent", ["getRuntime", "listBackups", "restartRuntime", "discoverProvider", "bindProviderRuntime", "saveProviderConnection", "refreshProviderModels", "selectProviderModel", "testProviderConnection", "createBackup", "restoreBackup"]);

// Authorization links still pass the desktop application's safe URL validation.
window.open = (url) => {
  void desktopShell.openExternal(String(url || "")).catch(reportError);
  return null;
};

function applyPresentationTheme(payload) {
  const theme = payload?.theme;
  if (!theme || typeof theme !== "object") return;
  const root = document.documentElement;
  for (const name of appliedThemeAttributes) root.removeAttribute(name);
  appliedThemeAttributes.clear();
  for (const [name, value] of Object.entries(theme.attributes || {})) {
    if (!/^(data-[a-z0-9-]+|dir|lang)$/i.test(name) || typeof value !== "string") continue;
    root.setAttribute(name, value);
    appliedThemeAttributes.add(name);
  }
  for (const name of appliedThemeVariables) root.style.removeProperty(name);
  appliedThemeVariables.clear();
  for (const [name, value] of Object.entries(theme.variables || {})) {
    if (!/^--[a-z0-9-]+$/i.test(name) || typeof value !== "string") continue;
    root.style.setProperty(name, value);
    appliedThemeVariables.add(name);
  }
}

function ensureSettingsCenter() {
  if (settingsCenter) return settingsCenter;
  settingsCenter = mountSettingsCenter(settingsHost, {
    apiRoutes: API_ROUTES,
    readJsonResponse,
    desktopShell,
    isDesktop: true,
    agentClient,
    onThemePreview: theme => {
      applyThemeCssVariables(document.documentElement, theme);
      notify("settings.themePreview", [theme]);
    },
    onApplySnapshot: (...args) => request("settings.applySnapshot", args),
    onStatus: (...args) => notify("settings.status", args),
    onRequestClose: () => closeSurface(),
    onCheckUpdate: () => request("settings.checkUpdate"),
    onPluginStatus: status => notify("settings.pluginStatus", [status]),
    prepareGitHubSyncBoard: () => request("settings.prepareBoard"),
    prepareGitHubSyncWorkspace: () => request("settings.prepareWorkspace"),
    getGitHubSyncWorkspaceContext: () => request("settings.workspaceContext"),
    runGitHubBoardFileOperation: async task => {
      const lease = await request("settings.fileOperationBegin");
      if (!lease?.leaseId) throw new Error("未能锁定画布文件操作，请重试");
      try { return await task(); }
      finally { await request("settings.fileOperationEnd", [lease.leaseId]); }
    },
  });
  return settingsCenter;
}

function closeSurface(surfaceId = activeSurface?.surfaceId) {
  if (!activeSurface || activeSurface.surfaceId !== surfaceId) return false;
  if (activeSurface.kind === "settings" && settingsCenter?.close() === false) {
    emit("close-blocked");
    return false;
  }
  ++presentSequence;
  settingsPanel.hidden = true;
  menu.hidden = true;
  errorLabel.hidden = true;
  emit("closed");
  activeSurface = null;
  return true;
}

function menuButtons() {
  return [...menu.querySelectorAll("button:not(:disabled)")];
}

function renderMenu(payload, sameSurface) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const fingerprint = JSON.stringify([items, Boolean(payload.disabled), payload.label]);
  if (sameSurface && menuFingerprint === fingerprint) return;
  const focusedId = sameSurface ? document.activeElement?.dataset?.actionId : "";
  menuFingerprint = fingerprint;
  menu.replaceChildren();
  menu.setAttribute("aria-label", String(payload.label || "更多操作"));
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "separator" || item.type === "divider" || item.divider === true || item.separator === true) {
      const divider = document.createElement("div");
      divider.className = "mirror-overlay-menu-divider";
      divider.setAttribute("role", "separator");
      menu.appendChild(divider);
      continue;
    }
    if (typeof item.id !== "string" || !item.id || seen.has(item.id) || typeof item.label !== "string") continue;
    seen.add(item.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mirror-overlay-menu-item";
    button.dataset.actionId = item.id;
    button.disabled = payload.disabled === true || item.disabled === true;
    button.classList.toggle("is-active", item.active === true);
    button.setAttribute("role", item.active !== undefined ? "menuitemcheckbox" : "menuitem");
    if (item.active !== undefined) button.setAttribute("aria-checked", String(item.active === true));
    const icon = document.createElement("span");
    icon.className = "mirror-overlay-menu-icon";
    if (typeof item.icon === "string" && item.icon) icon.innerHTML = renderAppIcon(item.icon, { size: 16 });
    const label = document.createElement("span");
    label.className = "mirror-overlay-menu-label";
    label.textContent = item.label;
    button.append(icon, label);
    if (typeof item.shortcut === "string" && item.shortcut) {
      const shortcut = document.createElement("span");
      shortcut.className = "mirror-overlay-menu-shortcut";
      shortcut.textContent = item.shortcut;
      button.appendChild(shortcut);
    }
    button.addEventListener("click", () => emit("action", { id: item.id }));
    button.addEventListener("pointerenter", () => { if (!button.disabled) button.focus({ preventScroll: true }); });
    menu.appendChild(button);
  }
  const buttons = menuButtons();
  const previous = buttons.find(button => button.dataset.actionId === focusedId);
  (previous || (!sameSurface ? buttons[0] : null))?.focus({ preventScroll: true });
}

function receiveHostEvent(payload) {
  if (payload?.type === "github-operation") {
    for (const listener of operationListeners) listener(payload.detail);
    return;
  }
  if (!["freeflow:github-remote-update", "freeflow:github-sync-status", "freeflow:workspace-files-changed", "freeflow:agent-data-restored"].includes(payload?.type)) return;
  forwardingHostEvent = true;
  try { window.dispatchEvent(new CustomEvent(payload.type, { detail: payload.detail })); }
  finally { forwardingHostEvent = false; }
}

async function present(message = {}) {
  if (message.kind === "event") { receiveHostEvent(message.payload); return; }
  if (!["settings", "menu"].includes(message.kind) || typeof message.surfaceId !== "string" || !message.surfaceId) return;
  const payload = message.payload && typeof message.payload === "object" ? message.payload : {};
  if (message.visible === false || payload.command === "request-close") { closeSurface(message.surfaceId); return; }
  const sameSurface = activeSurface?.surfaceId === message.surfaceId && activeSurface?.kind === message.kind;
  if (activeSurface?.kind === "settings" && !sameSurface && !closeSurface()) return;
  const sequence = ++presentSequence;
  activeSurface = { surfaceId: message.surfaceId, kind: message.kind };
  applyPresentationTheme(payload);
  platform = typeof payload.platform === "string" ? payload.platform : payload.startupContext?.platform || platform;
  if (payload.startupContext && typeof payload.startupContext === "object") globalThis.__FREEFLOW_STARTUP_CONTEXT = payload.startupContext;
  errorLabel.hidden = true;
  settingsPanel.hidden = message.kind !== "settings";
  menu.hidden = message.kind !== "menu";
  if (message.kind === "settings") {
    settingsPanel.inert = payload.disabled === true;
    const center = ensureSettingsCenter();
    const sectionRevision = Number.isFinite(payload.sectionRevision) ? payload.sectionRevision : 0;
    if (typeof payload.section === "string" && settingsSectionRevision !== sectionRevision) {
      center.openSection(payload.section);
      settingsSectionRevision = sectionRevision;
    }
    if (!sameSurface) await center.open();
  } else {
    renderMenu(payload, sameSurface);
  }
  if (sequence === presentSequence && activeSurface?.surfaceId === message.surfaceId) emit("presented");
}

document.querySelector("#overlay-close").addEventListener("click", () => closeSurface());
document.addEventListener("keydown", event => {
  if (!activeSurface || event.defaultPrevented || event.isComposing) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeSurface();
    return;
  }
  if (activeSurface.kind !== "menu") return;
  const buttons = menuButtons();
  const index = buttons.indexOf(document.activeElement);
  let next;
  if (event.key === "ArrowDown") next = buttons[(index + 1) % buttons.length];
  else if (event.key === "ArrowUp") next = buttons[index < 0 ? buttons.length - 1 : (index - 1 + buttons.length) % buttons.length];
  else if (event.key === "Home") next = buttons[0];
  else if (event.key === "End") next = buttons.at(-1);
  else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); document.activeElement?.click(); return; }
  else return;
  event.preventDefault();
  next?.focus({ preventScroll: true });
});

for (const type of ["freeflow:github-sync-status", "freeflow:github-sync-changed", "freeflow:github-remote-update", "freeflow:workspace-files-changed", "freeflow:agent-data-restored"]) {
  window.addEventListener(type, event => {
    if (!forwardingHostEvent) emit("runtime-event", { type, detail: event.detail });
  });
}

if (bridge?.onPresent && bridge?.ready) {
  bridge.onPresent(message => { void present(message).catch(reportError); });
  bridge.ready();
} else {
  reportError(new Error("此设置面板需要从 FreeFlow 桌面应用打开"));
}
