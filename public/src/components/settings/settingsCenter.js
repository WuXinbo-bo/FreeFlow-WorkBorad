import { PERMISSION_META, THEME_PRESET_DEFS } from "../../config/ui-meta.js";
import {
  DEFAULT_THEME_SETTINGS,
  deriveCustomThemeSettings,
  normalizeThemeSettings,
} from "../../theme/themeSettings.js";

const SECTION_DEFS = Object.freeze([
  { key: "general", label: "通用", icon: "sliders" },
  { key: "ai", label: "AI 模型", icon: "bot" },
  { key: "appearance", label: "外观", icon: "palette" },
  { key: "workbench", label: "工作台", icon: "panels" },
  { key: "canvas", label: "画布", icon: "pen-tool" },
  { key: "permissions", label: "权限", icon: "shield" },
  { key: "github", label: "GitHub 同步", icon: "github" },
  { key: "diagnostics", label: "诊断", icon: "activity" },
]);

const SECTION_ICON_PATHS = Object.freeze({
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  bot: '<rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 22a10 10 0 1 1 10-10c0 5.5-4.5 2-5.5 4-.8 1.6 1.5 2.5.5 4.1-1 1.5-3 1.9-5 1.9Z"/>',
  panels: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M9 9h12"/>',
  "pen-tool": '<path d="m12 19 7-7 3 3-7 7-3-3Z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18"/><path d="m2 2 7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z"/><path d="m9 12 2 2 4-4"/>',
  activity: '<path d="M3 12h4l3-9 4 18 3-9h4"/>',
  github: '<path d="M9 19c-4 1.3-4-2-5.5-2m11 4v-3.9c0-1.1.1-1.4-.5-2.1 1.7-.2 3.5-.8 3.5-3.8 0-.8-.3-1.5-.8-2 .1-.2.3-1-.1-2 0 0-.7-.2-2.2.8a7.6 7.6 0 0 0-4 0C9.9 8 9.2 8.2 9.2 8.2c-.4 1-.2 1.8-.1 2-.5.5-.8 1.2-.8 2 0 3 1.8 3.6 3.5 3.8-.4.4-.5 1-.5 2.1V21"/>',
});

function renderSectionIcon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${SECTION_ICON_PATHS[name] || SECTION_ICON_PATHS.sliders}</svg>`;
}

const COLOR_FIELDS = Object.freeze([
  ["backgroundColor", "应用背景"],
  ["shellPanelColor", "主面板"],
  ["controlColor", "控件表面"],
  ["buttonColor", "强调色"],
  ["shellPanelTextColor", "主文字"],
  ["messageColor", "消息区域"],
]);

const HIGH_RISK_PERMISSIONS = new Set(["appControl", "inputControl", "scriptExecution", "selfRepair"]);
const DEFAULT_SHORTCUT = Object.freeze({
  clickThroughAccelerator: "CommandOrControl+Shift+X",
  clickThroughDisplay: "Ctrl+Shift+X",
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getPathValue(source, path) {
  return String(path || "").split(".").reduce((value, key) => value?.[key], source);
}

function setPathValue(source, path, value) {
  const keys = String(path || "").split(".");
  let target = source;
  keys.slice(0, -1).forEach((key) => {
    if (!target[key] || typeof target[key] !== "object") target[key] = {};
    target = target[key];
  });
  target[keys[keys.length - 1]] = value;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value) {
  if (!Number(value)) return "时间未知";
  return new Date(Number(value)).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function renderToggle(path, label, checked, description = "") {
  return `
    <label class="settings-center-toggle">
      <span class="settings-center-toggle-copy">
        <strong>${escapeHtml(label)}</strong>
        ${description ? `<small>${escapeHtml(description)}</small>` : ""}
      </span>
      <input type="checkbox" data-settings-path="${escapeHtml(path)}"${checked ? " checked" : ""} />
      <span class="settings-center-switch" aria-hidden="true"></span>
    </label>
  `;
}

function renderField({ path, label, value, type = "text", maxlength = 400, placeholder = "", note = "" }) {
  return `
    <label class="settings-center-field">
      <span>${escapeHtml(label)}</span>
      <input
        type="${escapeHtml(type)}"
        data-settings-path="${escapeHtml(path)}"
        value="${escapeHtml(value)}"
        maxlength="${maxlength}"
        placeholder="${escapeHtml(placeholder)}"
      />
      ${note ? `<small>${escapeHtml(note)}</small>` : ""}
      <em data-field-error="${escapeHtml(path)}"></em>
    </label>
  `;
}

export function mountSettingsCenter(host, options = {}) {
  if (!(host instanceof HTMLElement)) {
    return { open() {}, close: () => true, reload() {}, isDirty: () => false, isSaving: () => false };
  }

  const {
    apiRoutes,
    readJsonResponse,
    desktopShell = null,
    isDesktop = false,
    onThemePreview = () => {},
    onApplySnapshot = () => {},
    onStatus = () => {},
    onRequestClose = () => {},
    agentClient = null,
    prepareGitHubSyncBoard = null,
  } = options;
  let snapshot = null;
  let draft = null;
  let shortcutSnapshot = clone(DEFAULT_SHORTCUT);
  let shortcutDraft = clone(DEFAULT_SHORTCUT);
  let activeSection = "general";
  let phase = "idle";
  let message = "";
  let messageTone = "";
  let fieldErrors = {};
  let requestSequence = 0;
  let themePreviewActive = false;
  let riskConfirmationPending = false;
  let conflictPending = false;
  let agentRuntime = null;
  let agentAction = "";
  let agentConnectionDrafts = { codex: { baseUrl: "", apiKey: "" }, claude: { baseUrl: "", apiKey: "" } };
  let agentSetupSteps = { codex: 1, claude: 1 };
  let agentBackups = [];
  let agentBackupError = "";
  let backupAction = "";
  let restoreCandidate = "";
  let githubSyncStatus = null;
  let githubSyncAction = "";
  let githubDeviceFlow = null;
  let githubSyncError = "";
  let githubRepositories = [];
  let githubWorkspace = null;
  let githubRemoteBoards = [];
  let githubConflictResolutions = {};
  let githubConflictDetails = {};
  let githubClientId = "";
  let githubAppType = "github-app";
  let githubAuthMethod = "token";

  function getGithubSyncClient() {
    return isDesktop && desktopShell?.githubSync ? desktopShell.githubSync : null;
  }

  const GITHUB_SYNC_STATE_LABELS = Object.freeze({
    "up-to-date": "已是最新",
    synced: "已同步",
    "local-changed": "本机有修改",
    "remote-changed": "远端有更新",
    "both-changed": "双方都有修改",
    "remote-only": "仅远端存在",
    deleted: "远端已删除",
    conflict: "存在冲突",
    missing: "本地未找到",
    partial: "部分完成",
    error: "需要重试",
  });

  function githubSyncStateLabel(state) {
    const key = String(state || "").trim();
    return GITHUB_SYNC_STATE_LABELS[key] || key || "未检查";
  }

  function shouldResetGithubDeviceFlow(error) {
    const code = String(error?.code || "").trim().toLowerCase();
    if (["expired_token", "access_denied", "invalid_grant"].includes(code)) return true;
    return /过期|失效|取消|拒绝|无效/.test(String(error?.message || ""));
  }

  function normalizeGithubBoards(result) {
    const source = result?.boards ?? result?.workspace?.boards ?? result;
    if (result?.error || source?.error) return [];
    if (Array.isArray(source)) {
      return source.map((board) => ({
        ...board,
        boardId: String(board?.boardId || board?.id || "").trim(),
      })).filter((board) => board.boardId);
    }
    if (!source || typeof source !== "object") return [];
    return Object.entries(source).map(([boardId, board]) => ({
      ...(board && typeof board === "object" ? board : {}),
      boardId: String(board?.boardId || board?.id || boardId).trim(),
    })).filter((board) => board.boardId);
  }

  async function refreshGithubWorkspace() {
    const client = getGithubSyncClient();
    if (!client || typeof client.getWorkspace !== "function" && typeof client.listBoards !== "function") {
      githubWorkspace = null;
      githubRemoteBoards = [];
      githubConflictResolutions = {};
      githubConflictDetails = {};
      return { boards: [] };
    }
    const [workspaceResult, boardsResult] = await Promise.all([
      typeof client.getWorkspace === "function" ? client.getWorkspace({ includeDeleted: true }).catch((error) => ({ error: error.message })) : Promise.resolve(null),
      typeof client.listBoards === "function" ? client.listBoards({ includeDeleted: true }).catch((error) => ({ error: error.message })) : Promise.resolve(null),
    ]);
    if (workspaceResult?.error && boardsResult?.error) throw new Error(workspaceResult.error || boardsResult.error);
    const workspace = workspaceResult?.workspace || workspaceResult;
    const boards = normalizeGithubBoards(boardsResult?.boards ? boardsResult : (boardsResult || workspaceResult));
    const ledgerBoards = githubSyncStatus?.ledger?.boards || {};
    githubWorkspace = workspace && typeof workspace === "object" && !workspace.error ? workspace : null;
    githubRemoteBoards = boards.map((board) => {
      const local = ledgerBoards[board.boardId] || {};
      return {
        ...board,
        localPath: board.localPath || local.localPath || "",
        syncState: board.deletedAt ? "deleted" : board.syncState || board.state || local.syncState || "",
        boardHash: board.boardHash || board.contentHash || board.hash || "",
      };
    });
    if (typeof client.getBoardState === "function" && githubRemoteBoards.length) {
      const states = await Promise.all(githubRemoteBoards.map(async (board) => {
        if (board.syncState) return null;
        try {
          return await client.getBoardState({ boardId: board.boardId, boardPath: board.localPath });
        } catch {
          return null;
        }
      }));
      githubRemoteBoards = githubRemoteBoards.map((board, index) => {
        const state = states[index];
        if (!state) return board;
        return { ...board, ...state, syncState: state.state || board.syncState || "" };
      });
    }
    return { workspace: githubWorkspace, boards: githubRemoteBoards, workspaceResult, boardsResult };
  }

  function isDirty() {
    if (!snapshot || !draft) return false;
    return stableStringify(snapshot.sections) !== stableStringify(draft) ||
      shortcutSnapshot.clickThroughAccelerator !== shortcutDraft.clickThroughAccelerator;
  }

  function hasTransientAgentDraft() {
    if (!draft?.ai?.agent) return false;
    return ["codex", "claude"].some((provider) => {
      const connection = agentConnectionDrafts[provider] || {};
      const savedBaseUrl = draft.ai.agent.providers?.[provider]?.baseUrl || "";
      return Boolean(connection.apiKey) || String(connection.baseUrl || "") !== String(savedBaseUrl);
    });
  }

  function hasDiscardableChanges() {
    return isDirty() || hasTransientAgentDraft();
  }

  function resolveAgentSetupStep(provider, providerRuntime = {}) {
    if (providerRuntime.ready && provider.baseUrl && provider.apiKeyConfigured && provider.selectedModel && providerRuntime.modelValidated) return 0;
    if (!providerRuntime.available) return 1;
    if (!provider.baseUrl || !provider.apiKeyConfigured) return 3;
    if (!provider.selectedModel) return 4;
    return 5;
  }

  function renderNavigation() {
    return SECTION_DEFS.map((section) => `
      <button
        class="settings-center-nav-item${activeSection === section.key ? " is-active" : ""}"
        type="button"
        data-settings-section="${section.key}"
        aria-current="${activeSection === section.key ? "page" : "false"}"
        title="${escapeHtml(section.label)}"
      >
        <span class="settings-center-nav-icon">${renderSectionIcon(section.icon)}</span>
        <span class="settings-center-nav-label">${escapeHtml(section.label)}</span>
      </button>
    `).join("");
  }

  function renderGeneral() {
    const general = draft.general;
    return `
      <div class="settings-center-section-heading">
        <div><p>General</p><h4>通用设置</h4></div>
        <span>名称与更新策略</span>
      </div>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>产品与工作区</h5><p>产品品牌固定，工作区与助手名称分别管理。</p></div>
        <div class="settings-center-form-grid">
          ${renderField({ path: "general.productName", label: "产品名称", value: general.productName, note: "产品品牌由应用版本提供，不可修改。" }).replace("data-settings-path=", "disabled data-settings-path=")}
          ${renderField({ path: "general.workspaceName", label: "工作区名称", value: general.workspaceName, maxlength: 40, placeholder: "例如 我的创作工作台" })}
          ${renderField({ path: "general.workspaceSubtitle", label: "工作区副标题", value: general.workspaceSubtitle, maxlength: 80, placeholder: "例如 自由画布与 AI 工作台" })}
          ${renderField({ path: "general.assistantName", label: "AI 助手名称", value: general.assistantName, maxlength: 40, placeholder: "例如 FreeFlow" })}
        </div>
      </section>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>应用更新</h5><p>启动后在后台检查新版本，不阻塞工作区。</p></div>
        ${renderToggle("general.updateCheckEnabled", "自动检查更新", general.updateCheckEnabled, "关闭后仍可从更多菜单手动检查。")}
      </section>
    `;
  }

  function renderAi() {
    const agent = draft.ai.agent || {};
    const runtime = agentRuntime || {};
    const providerId = agent.activeProvider === "claude" ? "claude" : "codex";
    const provider = agent.providers?.[providerId] || {};
    const providerRuntime = runtime.providers?.[providerId] || {};
    const connectionDraft = agentConnectionDrafts[providerId] || { baseUrl: provider.baseUrl || "", apiKey: "" };
    const models = Array.isArray(provider.models) ? provider.models : [];
    const candidates = Array.isArray(providerRuntime.candidates) ? providerRuntime.candidates : [];
    const providerName = providerId === "claude" ? "Claude Code" : "Codex CLI";
    const selectedCli = provider.cliPath || providerRuntime.path || "";
    const busy = Boolean(agentAction);
    const configured = Boolean(provider.baseUrl && provider.apiKeyConfigured);
    const setupComplete = Boolean(providerRuntime.ready && configured && provider.selectedModel && providerRuntime.modelValidated);
    const currentStep = setupComplete && agentSetupSteps[providerId] === 0
      ? 0
      : Math.min(5, Math.max(1, Number(agentSetupSteps[providerId]) || 1));
    const setupLabels = ["选择服务", "绑定 CLI", "配置连接", "选择模型", "验证连接"];
    const renderProgress = () => currentStep > 0 ? `<div class="settings-center-setup-progress" role="progressbar" aria-label="AI 配置进度" aria-valuemin="1" aria-valuemax="5" aria-valuenow="${currentStep}">
      <div><span>设置进度</span><strong>${escapeHtml(setupLabels[currentStep - 1])}</strong></div>
      <b>${currentStep} / 5</b>
      <i aria-hidden="true"><span style="width:${currentStep * 20}%"></span></i>
    </div>` : "";
    let setupContent = "";
    if (currentStep === 0) {
      setupContent = `
        <section class="settings-center-agent-summary">
          <div class="settings-center-agent-summary-head"><h5>${providerName}</h5></div>
          <dl>
            <div><dt>CLI</dt><dd>${escapeHtml(provider.cliVersion || providerRuntime.version || "已绑定")}</dd></div>
            <div><dt>连接</dt><dd>${escapeHtml(provider.baseUrl || "已保存")}</dd></div>
            <div><dt>模型</dt><dd>${escapeHtml(provider.selectedModel)}</dd></div>
            <div><dt>工作空间</dt><dd>FreeFlow 独立空间</dd></div>
          </dl>
          <div class="settings-center-inline-actions"><button type="button" data-settings-action="agent-edit-setup">重新配置</button><button type="button" data-settings-action="agent-test-connection"${busy ? " disabled" : ""}>${agentAction === "test" ? "正在验证" : "重新测试"}</button></div>
        </section>`;
    } else if (currentStep === 1) {
      setupContent = `
        <section class="settings-center-setup-stage">
          <div class="settings-center-group-heading"><h5>选择 AI 服务</h5><p>每个会话会固定所选 Provider 与模型，已有历史不会被后续设置改写。</p></div>
          <div class="settings-center-provider-tabs" role="tablist" aria-label="AI Provider">
            ${[["codex", "Codex", "OpenAI 官方 CLI"], ["claude", "Claude", "Anthropic 官方 CLI"]].map(([id, label, description]) => `<button type="button" role="tab" data-agent-provider="${id}" aria-selected="${providerId === id}" class="${providerId === id ? "is-active" : ""}"><strong>${label}</strong><small>${description}</small></button>`).join("")}
          </div>
          <div class="settings-center-setup-actions"><span>当前选择：${providerName}</span><button class="is-primary" type="button" data-settings-action="agent-setup-continue">下一步</button></div>
        </section>`;
    } else if (currentStep === 2) {
      setupContent = `
        <section class="settings-center-setup-stage">
          <div class="settings-center-group-heading settings-center-group-heading-inline"><div><h5>检测并绑定 ${providerName}</h5><p>仅使用本机已有的官方 CLI；检测到多个版本时由你选择。</p></div><span class="settings-center-agent-state${providerRuntime.available ? " is-ready" : ""}">${providerRuntime.available ? "已绑定" : candidates.length ? "等待选择" : "尚未检测"}</span></div>
          <label class="settings-center-field settings-center-field-wide"><span>检测结果</span><select data-agent-cli-path${busy ? " disabled" : ""}>
            <option value=""${selectedCli ? "" : " selected"}>${candidates.length ? "请选择检测到的 CLI" : "尚未检测到 CLI"}</option>
            ${candidates.map((item) => `<option value="${escapeHtml(item.path)}"${item.path === selectedCli ? " selected" : ""}>${escapeHtml(item.label || "本机")} · ${escapeHtml(item.version || item.path)}</option>`).join("")}
            ${selectedCli && !candidates.some((item) => item.path === selectedCli) ? `<option value="${escapeHtml(selectedCli)}" selected>${escapeHtml(provider.cliVersion || selectedCli)}</option>` : ""}
          </select><small>${providerRuntime.error ? escapeHtml(providerRuntime.error) : selectedCli ? `已选择 ${escapeHtml(provider.cliVersion || providerRuntime.version || providerName)}` : "点击检测后选择运行版本。"}</small></label>
          <div class="settings-center-inline-actions"><button type="button" data-settings-action="agent-discover"${busy ? " disabled" : ""}>${agentAction === "discover" ? "正在检测" : "检测 CLI"}</button><button class="is-primary" type="button" data-settings-action="agent-bind"${(!candidates.length && !selectedCli) || busy ? " disabled" : ""}>绑定并继续</button></div>
        </section>`;
    } else if (currentStep === 3) {
      setupContent = `
        <section class="settings-center-setup-stage">
          <div class="settings-center-group-heading settings-center-group-heading-inline"><div><h5>配置模型连接</h5><p>凭据写入系统安全存储，不进入设置文件、会话数据库或前端快照。</p></div><span class="settings-center-credential-state${provider.apiKeyConfigured ? " is-ready" : ""}">${provider.apiKeyConfigured ? "凭据已保存" : "等待配置"}</span></div>
          <div class="settings-center-form-grid">
            <label class="settings-center-field"><span>Base URL</span><input type="url" data-agent-connection-field="baseUrl" value="${escapeHtml(connectionDraft.baseUrl || provider.baseUrl || "")}" placeholder="${providerId === "claude" ? "https://api.anthropic.com" : "https://api.openai.com"}" /></label>
            <label class="settings-center-field"><span>API Key</span><input type="password" data-agent-connection-field="apiKey" value="${escapeHtml(connectionDraft.apiKey || "")}" placeholder="${provider.apiKeyConfigured ? "留空则保留已保存凭据" : "输入服务提供方的 API Key"}" autocomplete="new-password" /></label>
          </div>
          <div class="settings-center-inline-actions"><button type="button" data-settings-action="agent-clear-connection"${!provider.apiKeyConfigured || busy ? " disabled" : ""}>清除凭据</button><button class="is-primary" type="button" data-settings-action="agent-save-connection"${busy ? " disabled" : ""}>保存并继续</button></div>
        </section>`;
    } else if (currentStep === 4) {
      setupContent = `
        <section class="settings-center-setup-stage">
          <div class="settings-center-group-heading"><h5>刷新并选择模型</h5><p>FreeFlow 不会自动替你选择模型；连接变化后需重新刷新。</p></div>
          <label class="settings-center-field settings-center-field-wide"><span>可用模型</span><select data-agent-model-select${!models.length ? " disabled" : ""}>
            <option value=""${provider.selectedModel ? "" : " selected"}>请选择模型</option>
            ${models.map((model) => `<option value="${escapeHtml(model.id)}"${model.id === provider.selectedModel ? " selected" : ""}>${escapeHtml(model.displayName || model.id)}</option>`).join("")}
          </select><small>${models.length ? `已刷新 ${models.length} 个模型，请明确选择一个。` : "先刷新模型目录。"}</small></label>
          <div class="settings-center-inline-actions"><button type="button" data-settings-action="agent-refresh-models"${!configured || busy ? " disabled" : ""}>${agentAction === "refresh-models" ? "正在刷新" : "刷新模型"}</button><button class="is-primary" type="button" data-settings-action="agent-select-model"${!models.length || busy ? " disabled" : ""}>使用所选模型</button></div>
        </section>`;
    } else {
      setupContent = `
        <section class="settings-center-setup-stage settings-center-test-stage">
          <div class="settings-center-group-heading"><h5>验证连接</h5><p>将使用 ${escapeHtml(provider.selectedModel || "所选模型")} 完成一次最小请求，确认 CLI、连接和模型均可用。</p></div>
          <div class="settings-center-test-summary"><span>${providerName}</span><strong>${escapeHtml(provider.selectedModel || "尚未选择模型")}</strong><small>新会话将自动使用 FreeFlow 独立空间，无需填写目录。</small></div>
          <div class="settings-center-inline-actions"><button class="is-primary" type="button" data-settings-action="agent-test-connection"${!provider.selectedModel || busy ? " disabled" : ""}>${agentAction === "test" ? "正在验证" : "测试并完成"}</button></div>
        </section>`;
    }
    return `
      <div class="settings-center-section-heading">
        <div><h4>AI 模型</h4></div>
        ${setupComplete ? '<span class="settings-center-status-dot is-ready" role="status" aria-label="配置已就绪" title="配置已就绪"><i aria-hidden="true"></i></span>' : `<span>第 ${currentStep} 步，共 5 步</span>`}
      </div>
      ${renderProgress()}
      ${setupContent}
      ${setupComplete ? `<details class="settings-center-disclosure settings-center-agent-policy">
        <summary><span><strong>高级会话设置</strong><small>推理、审批与执行边界</small></span><span>展开</span></summary>
        <div class="settings-center-form-grid">
          <label class="settings-center-field"><span>推理等级</span><select data-settings-path="ai.agent.providers.${providerId}.reasoningEffort">
            ${(providerId === "claude" ? [["low","低"],["medium","中"],["high","高"],["xhigh","极高"],["max","最大"]] : [["minimal","最小"],["low","低"],["medium","中"],["high","高"],["xhigh","极高"]]).map(([value, label]) => `<option value="${value}"${provider.reasoningEffort === value ? " selected" : ""}>${label}</option>`).join("")}
          </select></label>
          <label class="settings-center-field"><span>审批策略</span><select data-settings-path="ai.agent.providers.${providerId}.approvalPolicy">
            <option value="untrusted"${provider.approvalPolicy === "untrusted" ? " selected" : ""}>仅信任操作免审批</option>
            <option value="on-request"${provider.approvalPolicy === "on-request" ? " selected" : ""}>按需审批</option>
            ${providerId === "claude" ? `<option value="on-failure"${provider.approvalPolicy === "on-failure" ? " selected" : ""}>失败时询问</option>` : ""}
            <option value="never"${provider.approvalPolicy === "never" ? " selected" : ""}>从不询问</option>
          </select><small>“从不询问”不会扩大沙箱权限，只会拒绝无法自动执行的操作。</small></label>
          <label class="settings-center-field"><span>沙箱范围</span><select data-settings-path="ai.agent.providers.${providerId}.sandboxMode">
            <option value="read-only"${provider.sandboxMode === "read-only" ? " selected" : ""}>只读</option>
            <option value="workspace-write"${provider.sandboxMode === "workspace-write" ? " selected" : ""}>允许写入工作区</option>
            <option value="danger-full-access"${provider.sandboxMode === "danger-full-access" ? " selected" : ""}>完全访问</option>
          </select></label>
        </div>
        <div class="settings-center-toggle-stack">
          ${renderToggle("ai.agent.queueWhileRunning", "运行时允许排队", agent.queueWhileRunning !== false, "任务执行期间发送普通消息时进入队列，完成后自动继续。")}
          ${renderToggle("ai.agent.showReasoning", "显示推理活动", agent.showReasoning !== false, "只展示 CLI 提供的摘要与活动，不展示内部隐藏推理。")}
        </div>
      </details>` : ""}
    `;
  }

  function renderAppearance() {
    const theme = draft.appearance;
    const presets = Object.values(THEME_PRESET_DEFS).filter((preset) => preset.key !== "custom");
    return `
      <div class="settings-center-section-heading">
        <div><p>Appearance</p><h4>外观</h4></div>
        <span>实时预览 · 取消恢复</span>
      </div>
      <section class="settings-center-group settings-center-appearance-presets">
        <div class="settings-center-group-heading"><h5>主题</h5><p>选择一套完整的界面配色，画布始终保持白色。</p></div>
        <div class="settings-center-theme-presets">
          ${presets.map((preset) => {
            const colors = preset.settings || DEFAULT_THEME_SETTINGS;
            return `<button type="button" data-theme-preset="${preset.key}" class="${theme.themePreset === preset.key ? "is-active" : ""}" aria-pressed="${theme.themePreset === preset.key ? "true" : "false"}">
              <span class="settings-center-theme-preview" style="--preview-bg:${escapeHtml(colors.backgroundColor)};--preview-panel:${escapeHtml(colors.shellPanelColor)};--preview-control:${escapeHtml(colors.controlColor)};--preview-accent:${escapeHtml(colors.buttonColor)};--preview-text:${escapeHtml(colors.shellPanelTextColor)};--preview-message:${escapeHtml(colors.messageColor)}">
                <i class="settings-center-theme-preview-rail"><b></b><b></b><b></b></i>
                <i class="settings-center-theme-preview-canvas"></i>
                <i class="settings-center-theme-preview-workbench"><b></b><em></em></i>
              </span>
              <span class="settings-center-theme-preset-copy"><strong>${escapeHtml(preset.label)}</strong><small>${escapeHtml(preset.description)}</small></span>
              <i class="settings-center-theme-selected" aria-hidden="true">✓</i>
            </button>`;
          }).join("")}
        </div>
      </section>
      <section class="settings-center-group settings-center-appearance-colors">
        <div class="settings-center-group-heading"><h5>自定义颜色</h5><p>只调整核心颜色，其余状态色由系统自动生成。</p></div>
        <div class="settings-center-color-grid">
          ${COLOR_FIELDS.map(([key, label]) => `<label><span>${escapeHtml(label)}</span><div><input type="color" data-theme-color="${key}" value="${escapeHtml(theme[key] || DEFAULT_THEME_SETTINGS[key] || "#ffffff")}" /><code>${escapeHtml(theme[key] || "")}</code></div></label>`).join("")}
        </div>
        <div class="settings-center-canvas-lock"><span aria-hidden="true">✓</span><div><strong>白色画布已锁定</strong><small>主题只改变界面，不影响画布、截图和导出背景。</small></div></div>
      </section>
    `;
  }

  function renderWorkbench() {
    const workbench = draft.workbench;
    return `
      <div class="settings-center-section-heading">
        <div><p>Workbench</p><h4>工作台习惯</h4></div>
        <span>下一次启动与当前应用</span>
      </div>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>默认布局</h5><p>保存后立即应用，并作为后续启动布局。</p></div>
        <div class="settings-center-segmented" role="radiogroup" aria-label="画布默认位置">
          <label><input type="radio" name="default-canvas-side" data-settings-path="workbench.defaultCanvasPanelSide" value="left"${workbench.defaultCanvasPanelSide !== "right" ? " checked" : ""} /><span>画布在左</span></label>
          <label><input type="radio" name="default-canvas-side" data-settings-path="workbench.defaultCanvasPanelSide" value="right"${workbench.defaultCanvasPanelSide === "right" ? " checked" : ""} /><span>画布在右</span></label>
        </div>
        <div class="settings-center-toggle-stack">
          ${renderToggle("workbench.defaultCanvasPanelVisible", "启动时展开画布", workbench.defaultCanvasPanelVisible !== false)}
          ${renderToggle("workbench.defaultChatPanelVisible", "启动时展开对话区", workbench.defaultChatPanelVisible !== false)}
          ${renderToggle("workbench.defaultLaunchFullscreen", "启动时进入全屏", workbench.defaultLaunchFullscreen === true)}
        </div>
      </section>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>完全穿透快捷键</h5><p>${isDesktop ? "在桌面模式中全局生效。" : "网页版仅保存展示值，桌面模式中生效。"}</p></div>
        <label class="settings-center-field"><span>快捷键组合</span><input type="text" data-settings-shortcut value="${escapeHtml(shortcutDraft.clickThroughDisplay || shortcutDraft.clickThroughAccelerator)}" maxlength="60" placeholder="Ctrl+Shift+X" /><small>至少包含一个按键；支持 Ctrl、Shift、Alt、Cmd 与字母数字。</small><em data-field-error="workbench.clickThroughShortcut"></em></label>
      </section>
    `;
  }

  function renderPathField(path, label, value, note) {
    return `
      <div class="settings-center-path-row">
        ${renderField({ path, label, value, placeholder: "选择或输入目录", note })}
        <div><button type="button" data-settings-action="pick-directory" data-path-target="${path}"${!desktopShell?.pickDirectory ? " disabled" : ""}>选择</button><button type="button" data-settings-action="reveal-directory" data-path-target="${path}"${!desktopShell?.revealPath || !value ? " disabled" : ""}>打开</button></div>
      </div>
    `;
  }

  function renderCanvas() {
    const canvas = draft.canvas;
    return `
      <div class="settings-center-section-heading">
        <div><p>Canvas</p><h4>画布设置</h4></div>
        <span>目录与编辑行为</span>
      </div>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>内容目录</h5><p>所有字段都是目录，不再混用文件与文件夹语义。</p></div>
        ${renderPathField("canvas.defaultBoardDirectory", "默认画布目录", canvas.defaultBoardDirectory, "新建和保存画布时优先使用。")}
        ${renderPathField("canvas.workspaceDirectory", "工作区目录", canvas.workspaceDirectory, "画布列表与导航的根目录。")}
        ${renderPathField("canvas.exportImageDirectory", "图片导出目录", canvas.exportImageDirectory, "留空时使用当前画布目录下的 importImage。")}
      </section>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>编辑行为</h5><p>保存后同步到当前画布引擎。</p></div>
        <div class="settings-center-toggle-stack">
          ${renderToggle("canvas.autosaveEnabled", "自动保存画布", canvas.autosaveEnabled !== false, "仅在内容变更后按间隔保存。")}
          ${renderToggle("canvas.linkSemanticsEnabled", "识别文本链接", canvas.linkSemanticsEnabled !== false, "关闭后新插入的链接按纯文本处理。")}
        </div>
      </section>
    `;
  }

  function renderPermissions() {
    const permissions = draft.permissions;
    return `
      <div class="settings-center-section-heading">
        <div><p>Permissions</p><h4>权限与目录</h4></div>
        <span>默认关闭，按需授权</span>
      </div>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>本地能力</h5><p>高风险能力开启时，保存前会再次确认。</p></div>
        <div class="settings-center-permission-grid">
          ${PERMISSION_META.map((item) => `
            <label class="settings-center-permission${HIGH_RISK_PERMISSIONS.has(item.key) ? " is-sensitive" : ""}">
              <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description)}</small></span>
              ${HIGH_RISK_PERMISSIONS.has(item.key) ? "<b>高风险</b>" : ""}
              <input type="checkbox" data-permission-key="${item.key}"${permissions.permissions?.[item.key] ? " checked" : ""} />
              <i aria-hidden="true"></i>
            </label>
          `).join("")}
        </div>
      </section>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>授权目录</h5><p>文件读写只允许访问这些目录及其子目录。</p></div>
        <div class="settings-center-root-list">
          ${(permissions.allowedRoots || []).length ? permissions.allowedRoots.map((root, index) => `<div><span>${escapeHtml(root)}</span><button type="button" data-remove-root="${index}" aria-label="移除授权目录" title="移除授权目录">×</button></div>`).join("") : `<div class="settings-center-empty-inline">尚未授权目录</div>`}
        </div>
        <div class="settings-center-root-add"><input type="text" data-new-root placeholder="输入目录路径" /><button type="button" data-settings-action="pick-root"${!desktopShell?.pickDirectory ? " disabled" : ""}>选择目录</button><button type="button" data-settings-action="add-root">添加</button></div>
      </section>
      ${riskConfirmationPending ? `<section class="settings-center-risk-confirm" role="alert"><strong>确认开启高风险能力</strong><p>这些权限允许应用控制软件、输入设备或运行脚本。请确认目录范围与实际用途。</p><div><button type="button" data-settings-action="cancel-risk">返回检查</button><button type="button" data-settings-action="confirm-risk">确认并保存</button></div></section>` : ""}
    `;
  }

  function renderDiagnostics() {
    const runtime = agentRuntime || {};
    const enabledPermissions = Object.values(draft.permissions.permissions || {}).filter(Boolean).length;
    const codex = runtime.providers?.codex || {};
    const claude = runtime.providers?.claude || {};
    return `
      <div class="settings-center-section-heading">
        <div><p>Diagnostics</p><h4>设置诊断</h4></div>
        <span>只读运行状态</span>
      </div>
      <section class="settings-center-group">
        <div class="settings-center-diagnostic-grid">
          <div><span>设置协议</span><strong>v${Number(snapshot.schemaVersion) || 1}</strong></div>
          <div><span>草稿状态</span><strong>${isDirty() ? "有未保存修改" : "已同步"}</strong></div>
          <div><span>Codex CLI</span><strong>${codex.available ? codex.version || "已绑定" : codex.candidates?.length ? "待选择" : "未检测到"}</strong></div>
          <div><span>Claude Code</span><strong>${claude.available ? claude.version || "已绑定" : claude.candidates?.length ? "待选择" : "未检测到"}</strong></div>
          <div><span>活动 Provider</span><strong>${runtime.activeProvider === "claude" ? "Claude" : "Codex"}</strong></div>
          <div><span>已启用权限</span><strong>${enabledPermissions} / ${PERMISSION_META.length}</strong></div>
        </div>
        <div class="settings-center-revision"><span>配置版本</span><code>${escapeHtml(snapshot.revision || "-")}</code></div>
        <div class="settings-center-inline-actions"><button type="button" data-settings-action="reload">重新载入设置</button><button type="button" data-settings-action="agent-refresh">刷新 Agent 状态</button></div>
      </section>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>状态说明</h5><p>CLI、连接和模型状态独立检测；重新载入会丢弃未保存修改并恢复主题预览。</p></div>
      </section>
      <section class="settings-center-group">
        <div class="settings-center-group-heading settings-center-group-heading-inline"><div><h5>AI 会话备份</h5><p>备份只包含新版 AI 会话数据。恢复前必须停止全部任务，当前数据会自动再留一份备份。</p></div><button type="button" data-settings-action="agent-create-backup"${backupAction ? " disabled" : ""}>${backupAction === "create" ? "正在备份" : "立即备份"}</button></div>
        ${agentBackupError ? `<div class="settings-center-runtime-error">${escapeHtml(agentBackupError)}</div>` : ""}
        <div class="settings-center-backup-list">
          ${agentBackups.length ? agentBackups.map((backup) => `<div class="settings-center-backup-row"><div><strong>${escapeHtml(formatDateTime(backup.createdAt))}</strong><small>${escapeHtml(formatBytes(backup.sizeBytes))}</small></div><button type="button" data-agent-restore-backup="${escapeHtml(backup.name)}"${backupAction ? " disabled" : ""}>恢复</button></div>`).join("") : `<div class="settings-center-empty-inline">还没有可恢复的会话备份</div>`}
        </div>
      </section>
      ${restoreCandidate ? `<section class="settings-center-risk-confirm" role="alert"><strong>恢复 AI 会话备份？</strong><p>当前会话数据会先自动备份，然后替换为 ${escapeHtml(formatDateTime(agentBackups.find((item) => item.name === restoreCandidate)?.createdAt))} 的版本。运行中的任务不会被强制中断。</p><div><button type="button" data-settings-action="agent-cancel-restore"${backupAction ? " disabled" : ""}>取消</button><button type="button" data-settings-action="agent-confirm-restore"${backupAction ? " disabled" : ""}>${backupAction === "restore" ? "正在恢复" : "确认恢复"}</button></div></section>` : ""}
    `;
  }

  function renderGithubSyncPanel() {
    const client = getGithubSyncClient();
    const status = githubSyncStatus || {};
    const repository = status.repository || {};
    const connected = Boolean(status.connected);
    const flow = githubDeviceFlow || {};
    const hasRepository = Boolean(repository.owner && repository.repo);
    const workspaceBoards = githubRemoteBoards.map((board) => {
      const title = board.name || board.title || board.boardId;
      const state = board.syncState || board.state || "";
      const boardPath = board.localPath || "";
      const canPull = Boolean(client && hasRepository && board.boardId);
      const isDeleted = Boolean(board.deletedAt) || state === "deleted";
      const canReconcile = ["both-changed", "conflict"].includes(state);
      const resolutions = Array.isArray(githubConflictResolutions[board.boardId]) ? githubConflictResolutions[board.boardId] : [];
      const conflict = githubConflictDetails[board.boardId] || null;
      const conflictPaths = Array.isArray(conflict?.conflicts)
        ? conflict.conflicts.map((item) => String(item?.path || "").trim()).filter(Boolean).slice(0, 8)
        : [];
      const conflictDirectory = String(conflict?.artifacts?.directory || "").trim();
      const reconcileActions = canReconcile
        ? (resolutions.length
          ? resolutions.filter((resolution) => ["local", "remote", "auto"].includes(resolution)).map((resolution) => `<button type="button" data-settings-action="github-reconcile" data-github-board-id="${escapeHtml(board.boardId)}" data-github-resolution="${escapeHtml(resolution)}"${!canPull || githubSyncAction ? " disabled" : ""}>${resolution === "local" ? "保留本地" : resolution === "remote" ? "使用远端" : "自动合并"}</button>`).join("")
          : `<button type="button" data-settings-action="github-reconcile" data-github-board-id="${escapeHtml(board.boardId)}"${!canPull || githubSyncAction ? " disabled" : ""}>查看冲突处理</button>`)
        : "";
      const restoreAction = isDeleted
        ? `<button type="button" data-settings-action="github-reconcile" data-github-board-id="${escapeHtml(board.boardId)}" data-github-resolution="local"${!canPull || !boardPath || githubSyncAction ? " disabled" : ""}>恢复本地版本</button>`
        : "";
      const conflictDetails = conflict && (conflictPaths.length || conflictDirectory) ? `<details class="settings-center-github-conflict-details"><summary>冲突详情${conflictPaths.length ? ` · ${conflictPaths.length} 个字段` : ""}</summary>${conflictPaths.length ? `<ul>${conflictPaths.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}</ul>` : ""}${conflictDirectory ? `<div><small>三方副本</small><code>${escapeHtml(conflictDirectory)}</code><button type="button" data-settings-action="github-reveal-conflict" data-github-board-id="${escapeHtml(board.boardId)}">打开所在目录</button></div>` : ""}</details>` : "";
      return `<article class="settings-center-github-board" data-github-board-id="${escapeHtml(board.boardId)}">
        <div class="settings-center-github-board-copy"><strong>${escapeHtml(title)}</strong><small><code>${escapeHtml(board.boardId)}</code>${board.updatedAt ? ` · ${escapeHtml(formatDateTime(board.updatedAt))}` : ""}</small>${boardPath ? `<small class="settings-center-github-board-path">${escapeHtml(boardPath)}</small>` : ""}</div>
        <span class="settings-center-github-board-state${isDeleted || state === "conflict" || state === "both-changed" ? " is-warning" : state === "up-to-date" || state === "synced" ? " is-ready" : ""}">${escapeHtml(githubSyncStateLabel(state))}</span>
        <div class="settings-center-inline-actions">${isDeleted ? restoreAction : canReconcile ? reconcileActions : `<button type="button" data-settings-action="github-pull" data-github-board-id="${escapeHtml(board.boardId)}"${!canPull || githubSyncAction ? " disabled" : ""}>拉取</button>`}</div>
        ${conflictDetails}
      </article>`;
    }).join("");
    return `
      <div class="settings-center-section-heading">
        <div><p>GitHub</p><h4>GitHub 画布同步</h4></div>
        <span>自己的私有仓库 · 本机加密凭据</span>
      </div>
      <section class="settings-center-group">
      <div class="settings-center-group-heading"><h5>连接到你自己的 GitHub</h5><p>同步只写入你授权的私有仓库。大图片、视频和超限附件只保存为占位框。</p></div>
      ${!client ? `<div class="settings-center-empty-inline">仅桌面版支持 GitHub 同步。</div>` : `
        <div class="settings-center-diagnostic-grid">
          <div><span>授权</span><strong>${connected ? `已连接${status.auth?.user?.login ? ` · ${escapeHtml(status.auth.user.login)}` : ""}` : "未连接"}</strong></div>
          <div><span>仓库</span><strong>${escapeHtml(repository.owner && repository.repo ? `${repository.owner}/${repository.repo}` : "尚未选择")}</strong></div>
          <div><span>画布状态</span><strong>${escapeHtml(Object.values(status.ledger?.boards || {}).map((item) => item.syncState).filter(Boolean)[0] || "未同步")}</strong></div>
        </div>
        ${githubSyncError ? `<div class="settings-center-runtime-error">${escapeHtml(githubSyncError)}</div>` : ""}
        ${!connected ? `<div class="settings-center-auth-methods" role="radiogroup" aria-label="GitHub 连接方式">
          <label class="settings-center-auth-method${githubAuthMethod === "token" ? " is-active" : ""}"><input type="radio" name="github-auth-method" data-github-auth-method="token" value="token"${githubAuthMethod === "token" ? " checked" : ""} /><span><strong>个人访问令牌</strong><small>直接验证你的 GitHub 账号。只需要令牌，不需要下面的应用类型和 Client ID。</small></span><i aria-hidden="true"></i></label>
          <label class="settings-center-auth-method${githubAuthMethod === "device-flow" ? " is-active" : ""}"><input type="radio" name="github-auth-method" data-github-auth-method="device-flow" value="device-flow"${githubAuthMethod === "device-flow" ? " checked" : ""} /><span><strong>设备授权</strong><small>通过授权应用登录。需要选择应用类型并填写公开 Client ID，不需要令牌。</small></span><i aria-hidden="true"></i></label>
        </div>
        ${githubAuthMethod === "token" ? `<div class="settings-center-auth-panel"><label class="settings-center-field"><span>个人访问令牌</span><input type="password" data-github-token autocomplete="off" spellcheck="false" maxlength="512" placeholder="粘贴 GitHub Fine-grained token" /><small>建议只选择自己的同步仓库，并授予 Contents Read and write。令牌验证成功后仅在本机加密保存。</small></label><div class="settings-center-inline-actions"><button type="button" data-settings-action="github-open-token">创建个人访问令牌</button><button class="is-primary" type="button" data-settings-action="github-token-connect"${githubSyncAction ? " disabled" : ""}>验证并连接</button></div></div>` : `<div class="settings-center-auth-panel"><div class="settings-center-form-grid"><label class="settings-center-field"><span>授权应用类型</span><select data-github-app-type><option value="github-app"${githubAppType === "github-app" ? " selected" : ""}>GitHub App</option><option value="oauth-app"${githubAppType === "oauth-app" ? " selected" : ""}>OAuth App</option></select><small>GitHub App 需要安装到同步仓库并授予 Contents 读写；OAuth App 使用 repo 授权范围。</small></label><label class="settings-center-field"><span>公开 Client ID</span><input type="text" data-github-client-id value="${escapeHtml(githubClientId)}" maxlength="128" placeholder="启用了 Device Flow 的授权应用 Client ID" /><small>Client ID 不是密码，不要填写 Client Secret。</small></label></div><div class="settings-center-inline-actions"><button class="is-primary" type="button" data-settings-action="github-connect"${githubSyncAction ? " disabled" : ""}>开始设备授权</button></div></div>`}` : ""}
        ${flow.user_code ? `<div class="settings-center-inline-actions"><code>${escapeHtml(flow.user_code)}</code><button type="button" data-settings-action="github-open-device">打开 GitHub 授权页</button><button type="button" data-settings-action="github-poll"${githubSyncAction ? " disabled" : ""}>检查授权结果</button></div>` : ""}
        ${connected ? `<div class="settings-center-form-grid"><label class="settings-center-field"><span>私有仓库</span><select data-github-repository><option value="">请选择仓库</option>${githubRepositories.map((repo) => `<option value="${escapeHtml(`${repo.owner?.login || repo.owner?.name || ""}/${repo.name || ""}`)}"${repo.owner?.login === repository.owner && repo.name === repository.repo ? " selected" : ""}>${escapeHtml(`${repo.owner?.login || ""}/${repo.name || ""}`)}</option>`).join("")}</select></label><div class="settings-center-inline-actions"><button type="button" data-settings-action="github-repositories">加载仓库</button><button type="button" data-settings-action="github-repository-create">创建私有仓库</button><button type="button" data-settings-action="github-repository-save">使用所选仓库</button></div></div>` : ""}
        <div class="settings-center-inline-actions">
          ${connected ? `<button type="button" data-settings-action="github-refresh"${githubSyncAction ? " disabled" : ""}>刷新状态</button><button type="button" data-settings-action="github-workspace"${!hasRepository || githubSyncAction ? " disabled" : ""}>发现远程画布</button><button type="button" data-settings-action="github-sync"${githubSyncAction ? " disabled" : ""}>立即同步当前画布</button><button type="button" data-settings-action="github-disconnect"${githubSyncAction ? " disabled" : ""}>断开 GitHub</button>` : ""}
        </div>
        ${connected && hasRepository ? `<div class="settings-center-github-remote" aria-live="polite">
          <div class="settings-center-group-heading settings-center-group-heading-inline"><div><h5>远程画布</h5><p>${githubWorkspace?.lastCommitSha ? `远端版本 ${escapeHtml(String(githubWorkspace.lastCommitSha).slice(0, 12))}` : "发现后列出此仓库中的画布；新设备无需提前知道 boardId。"}</p></div><span>${githubSyncAction === "workspace" ? "正在读取" : githubRemoteBoards.length ? `${githubRemoteBoards.length} 个画布` : "尚未读取"}</span></div>
          ${workspaceBoards || (githubSyncAction === "workspace" ? `<div class="settings-center-loading"><span></span><strong>正在读取远程画布</strong></div>` : `<div class="settings-center-empty-inline">点击“发现远程画布”读取远端 workspace。</div>`)}
        </div>` : ""}
      `}
      </section>`;
  }

  function renderActiveSection() {
    if (!draft) return "";
    switch (activeSection) {
      case "ai": return renderAi();
      case "appearance": return renderAppearance();
      case "workbench": return renderWorkbench();
      case "canvas": return renderCanvas();
      case "permissions": return renderPermissions();
      case "github": return renderGithubSyncPanel();
      case "diagnostics": return renderDiagnostics();
      default: return renderGeneral();
    }
  }

  function render() {
    if (phase === "load-error") {
      host.innerHTML = `<div class="settings-center-load-error"><strong>设置读取失败</strong><p>${escapeHtml(message)}</p><button type="button" data-settings-action="reload">重新载入</button></div>`;
      return;
    }
    if (phase === "loading" || !draft) {
      host.innerHTML = `<div class="settings-center-loading"><span></span><strong>正在读取设置</strong></div>`;
      return;
    }
    host.innerHTML = `
      <div class="settings-center-layout">
        <nav class="settings-center-nav" aria-label="设置分类">${renderNavigation()}</nav>
        <main class="settings-center-content" tabindex="-1">${renderActiveSection()}</main>
      </div>
      <footer class="settings-center-footer">
        <div class="settings-center-save-state ${messageTone ? `is-${messageTone}` : ""}" aria-live="polite"><span>${message ? escapeHtml(message) : isDirty() ? "有未保存修改" : "所有设置已同步"}</span></div>
        <div class="settings-center-footer-actions">
          ${conflictPending ? `<button type="button" data-settings-action="reload"${githubSyncAction ? " disabled" : ""}>重新载入最新设置</button>` : ""}
          <button type="button" data-settings-action="reset-section"${phase === "saving" || githubSyncAction ? " disabled" : ""}>恢复本页</button>
          <button type="button" data-settings-action="cancel"${!hasDiscardableChanges() || phase === "saving" || githubSyncAction || Boolean(agentAction) ? " disabled" : ""}>放弃修改</button>
          <button class="is-primary" type="button" data-settings-action="save"${!isDirty() || phase === "saving" || githubSyncAction ? " disabled" : ""}>${phase === "saving" ? "保存中" : "保存设置"}</button>
        </div>
      </footer>
    `;
    Object.entries(fieldErrors).forEach(([path, error]) => {
      const errorEl = host.querySelector(`[data-field-error="${CSS.escape(path)}"]`);
      if (errorEl) errorEl.textContent = error;
    });
  }

  function setMessage(nextMessage = "", tone = "") {
    message = nextMessage;
    messageTone = tone;
  }

  function markDraftChanged() {
    fieldErrors = {};
    riskConfirmationPending = false;
    setMessage("", "");
    const stateEl = host.querySelector(".settings-center-save-state");
    if (stateEl) {
      stateEl.className = "settings-center-save-state";
      stateEl.textContent = isDirty() ? "有未保存修改" : "所有设置已同步";
    }
    const cancelButton = host.querySelector('[data-settings-action="cancel"]');
    if (cancelButton) cancelButton.disabled = !hasDiscardableChanges() || phase === "saving" || githubSyncAction || Boolean(agentAction);
    const saveButton = host.querySelector('[data-settings-action="save"]');
    if (saveButton) saveButton.disabled = !isDirty() || phase === "saving" || githubSyncAction;
  }

  function restoreThemePreview() {
    if (!snapshot?.sections?.appearance) return;
    onThemePreview(clone(snapshot.sections.appearance));
    themePreviewActive = false;
  }

  function previewTheme() {
    onThemePreview(clone(draft.appearance));
    themePreviewActive = true;
  }

  function validateDraft() {
    const errors = {};
    const general = draft.general;
    if (!String(general.workspaceName || "").trim()) errors["general.workspaceName"] = "请输入工作区名称";
    if (!String(general.workspaceSubtitle || "").trim()) errors["general.workspaceSubtitle"] = "请输入工作区副标题";
    if (!String(general.assistantName || "").trim()) errors["general.assistantName"] = "请输入 AI 助手名称";
    if (!String(shortcutDraft.clickThroughAccelerator || shortcutDraft.clickThroughDisplay || "").trim()) errors["workbench.clickThroughShortcut"] = "请输入快捷键";
    return errors;
  }

  function getNewHighRiskPermissions() {
    return [...HIGH_RISK_PERMISSIONS].filter((key) =>
      draft.permissions.permissions?.[key] === true && snapshot.sections.permissions.permissions?.[key] !== true
    );
  }

  async function load() {
    const sequence = ++requestSequence;
    restoreThemePreview();
    phase = "loading";
    setMessage("", "");
    render();
    try {
      const [response, shortcutResult, runtimeResult, backupsResult, githubResult] = await Promise.all([
        fetch(apiRoutes.settingsCenter, { cache: "no-store" }),
        isDesktop && desktopShell?.getShortcutSettings
          ? desktopShell.getShortcutSettings().catch(() => null)
          : Promise.resolve(null),
        agentClient?.getRuntime
          ? agentClient.getRuntime({ start: true }).catch((error) => ({ runtime: { available: false, state: "error", error: error.message } }))
          : Promise.resolve({ runtime: { available: false, state: "unavailable", error: "Agent API 不可用" } }),
        agentClient?.listBackups
          ? agentClient.listBackups().catch((error) => ({ backups: [], error: error.message }))
          : Promise.resolve({ backups: [], error: "Agent API 不可用" }),
        getGithubSyncClient()?.getStatus
          ? getGithubSyncClient().getStatus().catch((error) => ({ connected: false, error: error.message }))
          : Promise.resolve(null),
      ]);
      const data = await readJsonResponse(response, "系统设置");
      if (!response.ok || !data.ok) throw new Error(data.error || "无法读取系统设置");
      if (sequence !== requestSequence) return;
      data.sections.appearance = normalizeThemeSettings(data.sections.appearance);
      snapshot = clone(data);
      draft = clone(data.sections);
      agentConnectionDrafts = Object.fromEntries(["codex", "claude"].map((provider) => [provider, {
        baseUrl: String(data.sections.ai?.agent?.providers?.[provider]?.baseUrl || ""),
        apiKey: "",
      }]));
      shortcutSnapshot = clone(shortcutResult?.settings || DEFAULT_SHORTCUT);
      shortcutDraft = clone(shortcutSnapshot);
      agentRuntime = runtimeResult?.runtime || null;
      agentSetupSteps = Object.fromEntries(["codex", "claude"].map((provider) => [
        provider,
        resolveAgentSetupStep(data.sections.ai?.agent?.providers?.[provider] || {}, agentRuntime?.providers?.[provider] || {}),
      ]));
      agentBackups = Array.isArray(backupsResult?.backups) ? backupsResult.backups : [];
      agentBackupError = String(backupsResult?.error || "");
      githubSyncStatus = githubResult;
      githubClientId = String(githubResult?.auth?.clientId || "");
      githubAppType = githubResult?.auth?.appType === "oauth-app" ? "oauth-app" : "github-app";
      githubAuthMethod = githubResult?.auth?.method === "device-flow" ? "device-flow" : "token";
      githubSyncError = String(githubResult?.error || "");
      githubDeviceFlow = null;
      githubRepositories = [];
      githubWorkspace = null;
      githubRemoteBoards = [];
      githubConflictResolutions = {};
      githubConflictDetails = {};
      backupAction = "";
      restoreCandidate = "";
      phase = "idle";
      fieldErrors = {};
      riskConfirmationPending = false;
      conflictPending = false;
      render();
    } catch (error) {
      if (sequence !== requestSequence) return;
      phase = "load-error";
      setMessage(error.message || "无法读取系统设置", "error");
      render();
    }
  }

  async function save({ confirmedRisk = false } = {}) {
    if (!snapshot || !draft || phase === "saving") return;
    fieldErrors = validateDraft();
    if (Object.keys(fieldErrors).length) {
      setMessage("请先修正标记的设置", "error");
      render();
      return;
    }
    if (!confirmedRisk && getNewHighRiskPermissions().length) {
      activeSection = "permissions";
      riskConfirmationPending = true;
      setMessage("需要确认新开启的高风险权限", "warning");
      render();
      return;
    }

    const sequence = ++requestSequence;
    const previousShortcut = clone(shortcutSnapshot);
    const shortcutChanged = shortcutSnapshot.clickThroughAccelerator !== shortcutDraft.clickThroughAccelerator;
    phase = "saving";
    riskConfirmationPending = false;
    setMessage("正在校验并保存设置", "");
    render();

    try {
      if (shortcutChanged && isDesktop && desktopShell?.setShortcutSettings) {
        const shortcutResponse = await desktopShell.setShortcutSettings({
          clickThroughAccelerator: shortcutDraft.clickThroughAccelerator || shortcutDraft.clickThroughDisplay,
        });
        if (!shortcutResponse?.ok) throw new Error(shortcutResponse?.error || "快捷键保存失败");
        shortcutDraft = clone(shortcutResponse.settings || shortcutDraft);
      }
      const response = await fetch(apiRoutes.settingsCenter, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: snapshot.revision, sections: draft }),
      });
      const data = await readJsonResponse(response, "系统设置");
      if (!response.ok || !data.ok) {
        const error = new Error(data.error || "系统设置保存失败");
        error.code = data.code;
        error.fieldErrors = data.fieldErrors || {};
        throw error;
      }
      if (sequence !== requestSequence) return;
      data.sections.appearance = normalizeThemeSettings(data.sections.appearance);
      snapshot = clone(data);
      draft = clone(data.sections);
      shortcutSnapshot = clone(shortcutDraft);
      phase = "idle";
      themePreviewActive = false;
      fieldErrors = {};
      conflictPending = false;
      try {
        await Promise.resolve(onApplySnapshot(clone(data), clone(shortcutDraft)));
        if (agentClient?.getRuntime) {
          agentRuntime = (await agentClient.getRuntime({ start: true })).runtime;
        }
        setMessage("设置已保存并应用", "success");
        onStatus("系统设置已保存并应用", "success");
      } catch (applyError) {
        setMessage("设置已保存，部分内容将在刷新后应用", "warning");
        onStatus(`设置已保存，运行态应用失败：${applyError.message}`, "warning");
      }
      render();
    } catch (error) {
      if (shortcutChanged && isDesktop && desktopShell?.setShortcutSettings) {
        await desktopShell.setShortcutSettings(previousShortcut).catch(() => {});
      }
      if (sequence !== requestSequence) return;
      phase = "idle";
      restoreThemePreview();
      fieldErrors = error.fieldErrors || fieldErrors;
      conflictPending = error.code === "SETTINGS_REVISION_CONFLICT";
      setMessage(
        error.code === "SETTINGS_REVISION_CONFLICT"
          ? "设置已在其他位置更新，请重新载入后再保存"
          : error.message || "系统设置保存失败",
        "error"
      );
      onStatus(`系统设置保存失败：${error.message}`, "warning");
      render();
    }
  }

  function resetActiveSection() {
    if (!snapshot || !draft || activeSection === "diagnostics") return;
    if (activeSection === "workbench") shortcutDraft = clone(shortcutSnapshot);
    draft[activeSection] = clone(snapshot.sections[activeSection]);
    if (activeSection === "ai") {
      agentConnectionDrafts = Object.fromEntries(["codex", "claude"].map((provider) => [provider, {
        baseUrl: String(snapshot.sections.ai?.agent?.providers?.[provider]?.baseUrl || ""),
        apiKey: "",
      }]));
      agentSetupSteps = Object.fromEntries(["codex", "claude"].map((provider) => [
        provider,
        resolveAgentSetupStep(draft.ai?.agent?.providers?.[provider] || {}, agentRuntime?.providers?.[provider] || {}),
      ]));
    }
    if (activeSection === "appearance") restoreThemePreview();
    fieldErrors = {};
    riskConfirmationPending = false;
    setMessage("已恢复本页到打开时的设置", "");
    render();
  }

  async function refreshAgentSnapshotPreservingDraft({ resetConnectionProvider = "" } = {}) {
    const previous = clone(draft);
    const previousConnectionDrafts = clone(agentConnectionDrafts);
    const response = await fetch(apiRoutes.settingsCenter, { cache: "no-store" });
    const data = await readJsonResponse(response, "系统设置");
    if (!response.ok || !data.ok) throw new Error(data.error || "无法刷新 AI 设置");
    const freshAgent = data.sections.ai.agent;
    const previousAgent = previous.ai.agent;
    data.sections.appearance = normalizeThemeSettings(data.sections.appearance);
    snapshot = clone(data);
    draft = previous;
    draft.ai.agent = {
      ...clone(freshAgent),
      activeProvider: previousAgent.activeProvider,
      workspaceRoot: previousAgent.workspaceRoot,
      queueWhileRunning: previousAgent.queueWhileRunning,
      showReasoning: previousAgent.showReasoning,
      providers: Object.fromEntries(["codex", "claude"].map((provider) => [provider, {
        ...clone(freshAgent.providers[provider]),
        reasoningEffort: previousAgent.providers[provider].reasoningEffort,
        approvalPolicy: previousAgent.providers[provider].approvalPolicy,
        sandboxMode: previousAgent.providers[provider].sandboxMode,
      }])),
    };
    for (const provider of ["codex", "claude"]) {
      agentConnectionDrafts[provider] = provider === resetConnectionProvider
        ? { baseUrl: freshAgent.providers[provider].baseUrl || "", apiKey: "" }
        : previousConnectionDrafts[provider] || { baseUrl: freshAgent.providers[provider].baseUrl || "", apiKey: "" };
    }
  }

  async function runAgentAction(action, payload = {}) {
    if (!agentClient || agentAction) return;
    agentAction = action;
    setMessage("", "");
    render();
    try {
      const provider = payload.provider === "claude" ? "claude" : "codex";
      if (action === "refresh") {
        agentRuntime = (await agentClient.getRuntime({ start: true, refresh: true })).runtime;
      } else if (action === "restart") {
        agentRuntime = (await agentClient.restartRuntime()).runtime;
      } else if (action === "discover") {
        await agentClient.discoverProvider(provider);
        agentRuntime = (await agentClient.getRuntime({ refresh: true })).runtime;
        setMessage("CLI 检测完成，请选择并绑定运行文件", "success");
      } else if (action === "bind") {
        agentRuntime = (await agentClient.bindProviderRuntime(provider, payload.path)).runtime;
        await refreshAgentSnapshotPreservingDraft();
        agentSetupSteps[provider] = 3;
        setMessage("CLI 已绑定", "success");
      } else if (action === "save-connection" || action === "clear-connection") {
        await agentClient.saveProviderConnection(provider, {
          baseUrl: payload.baseUrl,
          apiKey: payload.apiKey || "",
          apiKeyAction: action === "clear-connection" ? "clear" : payload.apiKey ? "replace" : "keep",
        });
        await refreshAgentSnapshotPreservingDraft({ resetConnectionProvider: provider });
        agentRuntime = (await agentClient.getRuntime({ refresh: true })).runtime;
        agentSetupSteps[provider] = action === "clear-connection" ? 3 : 4;
        setMessage(action === "clear-connection" ? "连接凭据已清除" : "连接已保存，请刷新模型", "success");
      } else if (action === "refresh-models") {
        await agentClient.refreshProviderModels(provider);
        await refreshAgentSnapshotPreservingDraft();
        agentRuntime = (await agentClient.getRuntime({ refresh: true })).runtime;
        setMessage("模型目录已刷新，请手动选择模型", "success");
      } else if (action === "select-model") {
        await agentClient.selectProviderModel(provider, payload.model);
        await refreshAgentSnapshotPreservingDraft();
        agentRuntime = (await agentClient.getRuntime({ refresh: true })).runtime;
        agentSetupSteps[provider] = 5;
        setMessage("模型已选择，请执行连接测试", "success");
      } else if (action === "test") {
        await agentClient.testProviderConnection(provider);
        await refreshAgentSnapshotPreservingDraft();
        agentRuntime = (await agentClient.getRuntime({ start: true, refresh: true })).runtime;
        agentSetupSteps[provider] = 0;
        setMessage("连接验证通过，可以开始新会话", "success");
      }
    } catch (error) {
      setMessage(error.message || "Agent 操作失败", "error");
    } finally {
      agentAction = "";
      render();
    }
  }

  async function runBackupAction(nextAction, name = "") {
    if (!agentClient || backupAction) return;
    backupAction = nextAction;
    agentBackupError = "";
    setMessage("", "");
    render();
    try {
      if (nextAction === "create") {
        await agentClient.createBackup();
        agentBackups = (await agentClient.listBackups()).backups || [];
        setMessage("AI 会话备份已创建", "success");
      } else if (nextAction === "restore") {
        const result = await agentClient.restoreBackup(name);
        agentBackups = result.backups || [];
        restoreCandidate = "";
        window.dispatchEvent(new CustomEvent("freeflow:agent-data-restored"));
        setMessage("AI 会话已恢复", "success");
      }
    } catch (error) {
      agentBackupError = error.message || "AI 会话备份操作失败";
      setMessage(agentBackupError, "error");
    } finally {
      backupAction = "";
      render();
    }
  }

  function addRoot(value) {
    const root = String(value || "").trim();
    if (!root) return;
    draft.permissions.allowedRoots = [...new Set([...(draft.permissions.allowedRoots || []), root])].slice(0, 100);
    markDraftChanged();
    render();
  }

  async function runGithubAction(action, actionPayload = {}) {
    const client = getGithubSyncClient();
    if (!client || githubSyncAction) return;
    const token = action === "token-connect" ? String(host.querySelector("[data-github-token]")?.value || "").trim() : "";
    const repositoryValue = action === "repository-save" ? host.querySelector("[data-github-repository]")?.value || "" : "";
    const boardId = String(actionPayload.boardId || "").trim();
    const resolution = String(actionPayload.resolution || "").trim();
    const tokenInput = host.querySelector("[data-github-token]");
    if (tokenInput) tokenInput.value = "";
    if (action === "token-connect") githubDeviceFlow = null;
    githubSyncAction = action;
    githubSyncError = "";
    render();
    try {
      if (action === "connect") {
        githubDeviceFlow = null;
        githubDeviceFlow = await client.startDeviceFlow({ clientId: githubClientId, appType: githubAppType });
        setMessage("请在 GitHub 页面完成授权，然后点击检查授权结果", "warning");
      } else if (action === "token-connect") {
        await client.connectToken({ token });
        githubDeviceFlow = null;
        githubRepositories = [];
        githubSyncStatus = await client.getStatus();
        setMessage("GitHub 已连接，请加载并选择你自己的私有仓库", "success");
      } else if (action === "poll") {
        const result = await client.pollDeviceFlow({ deviceCode: githubDeviceFlow?.device_code, interval: githubDeviceFlow?.interval });
        if (result.pending) {
          githubDeviceFlow = { ...githubDeviceFlow, interval: result.interval };
          setMessage(`GitHub 仍在等待授权，请至少等待 ${result.interval || 5} 秒后再检查`, "warning");
        }
        else { githubDeviceFlow = null; githubRepositories = []; githubSyncStatus = await client.getStatus(); setMessage("GitHub 已连接", "success"); }
      } else if (action === "refresh") {
        githubSyncStatus = await client.getStatus();
        if (githubSyncStatus?.repository?.owner && githubSyncStatus?.repository?.repo) await refreshGithubWorkspace();
        setMessage("GitHub 同步状态已刷新", "success");
      } else if (action === "workspace") {
        githubSyncStatus = await client.getStatus();
        if (!githubSyncStatus?.repository?.owner || !githubSyncStatus?.repository?.repo) {
          throw new Error("请先绑定一个 GitHub 私有仓库");
        }
        const workspaceResult = await refreshGithubWorkspace();
        const count = workspaceResult.boards?.length || 0;
        setMessage(count ? `已发现 ${count} 个远程画布` : "远端仓库中还没有 FreeFlow 画布", count ? "success" : "warning");
      } else if (action === "repositories") {
        const result = await client.listRepositories();
        githubRepositories = (Array.isArray(result) ? result : (Array.isArray(result?.repositories) ? result.repositories : []))
          .filter((repository) => repository.private === true && repository.owner?.login === (result?.user?.login || githubSyncStatus?.auth?.user?.login));
        setMessage(githubRepositories.length ? `已读取 ${githubRepositories.length} 个私有仓库` : "没有可用的私有仓库，请检查仓库授权；GitHub App 还需安装到该仓库", githubRepositories.length ? "success" : "warning");
      } else if (action === "repository-save") {
        const value = repositoryValue;
        const separator = value.indexOf("/");
        if (separator <= 0) throw new Error("请选择一个 GitHub 仓库");
        const selected = githubRepositories.find((repository) => `${repository.owner?.login}/${repository.name}` === value);
        await client.setRepository({ owner: value.slice(0, separator), repo: value.slice(separator + 1), branch: selected?.default_branch || "main" });
        githubSyncStatus = await client.getStatus();
        githubWorkspace = null;
        githubRemoteBoards = [];
        githubConflictResolutions = {};
        githubConflictDetails = {};
        setMessage("GitHub 仓库已绑定", "success");
      } else if (action === "repository-create") {
        const created = await client.createRepository({ name: "freeflow-workspace", description: "FreeFlow personal workspace" });
        const repositoryResult = await client.listRepositories();
        githubRepositories = (Array.isArray(repositoryResult) ? repositoryResult : (Array.isArray(repositoryResult?.repositories) ? repositoryResult.repositories : []))
          .filter((repository) => repository.private === true && repository.owner?.login === (repositoryResult?.user?.login || githubSyncStatus?.auth?.user?.login));
        const owner = created?.repository?.owner?.login || "";
        if (owner && created?.repository?.name) await client.setRepository({ owner, repo: created.repository.name, branch: created.repository.default_branch || "main" });
        githubSyncStatus = await client.getStatus();
        githubWorkspace = null;
        githubRemoteBoards = [];
        githubConflictResolutions = {};
        githubConflictDetails = {};
        setMessage("已创建并绑定私有仓库", "success");
      } else if (action === "sync") {
        if (!prepareGitHubSyncBoard) throw new Error("当前画布尚未就绪，请稍后重试");
        const boardPath = await prepareGitHubSyncBoard();
        await client.sync({ boardPath });
        githubSyncStatus = await client.getStatus();
        setMessage("当前画布已同步到 GitHub", "success");
        await refreshGithubWorkspace();
      } else if (action === "pull" || action === "reconcile") {
        if (!boardId) throw new Error("未选择远程画布");
        const board = githubRemoteBoards.find((item) => item.boardId === boardId) || {};
        let boardPath = board.syncState === "remote-only"
          ? ""
          : String(board.localPath || githubSyncStatus?.ledger?.boards?.[boardId]?.localPath || "").trim();
        if (!boardPath && desktopShell?.pickCanvasBoardPath) {
          const defaultName = String(board.name || board.title || `freeflow-${boardId}`).replace(/[\\/:*?"<>|]/g, "-");
          const picked = await desktopShell.pickCanvasBoardPath({ defaultPath: defaultName.endsWith(".freeflow") ? defaultName : `${defaultName}.freeflow` });
          if (picked?.canceled || !picked?.filePath) {
            setMessage("已取消选择本地画布路径", "warning");
            return;
          }
          boardPath = picked.filePath;
        }
        if (!boardPath) throw new Error("此远程画布还没有本地路径，请选择保存位置");
        const payload = { boardId, boardPath };
        let result;
        if (action === "pull") {
          result = typeof client.pull === "function" ? await client.pull(payload) : await client.download(payload);
        } else {
          if (typeof client.reconcile !== "function") throw new Error("当前版本暂不支持远程冲突合并，请更新桌面应用");
          result = await client.reconcile({ ...payload, resolution });
        }
        githubSyncStatus = await client.getStatus();
        await refreshGithubWorkspace();
        if (action === "reconcile" && !resolution && Array.isArray(result?.resolutions)) {
          githubConflictResolutions[boardId] = result.resolutions;
          setMessage("请选择自动合并、保留本地版本或使用远端版本", "warning");
        } else {
          delete githubConflictResolutions[boardId];
          delete githubConflictDetails[boardId];
          const pullMessage = result?.requiresPush
            ? "本机有未上传修改，请先同步后再拉取"
            : result?.pulled === false
              ? "本机画布已经是最新版本"
              : "远程画布已拉取到本机";
          setMessage(action === "pull" ? pullMessage : resolution === "auto" ? "远程画布已自动合并" : "已处理远程画布冲突", result?.requiresPush ? "warning" : "success");
        }
      } else if (action === "disconnect") {
        await client.disconnect();
        githubDeviceFlow = null;
        githubRepositories = [];
        githubWorkspace = null;
        githubRemoteBoards = [];
        githubConflictResolutions = {};
        githubConflictDetails = {};
        githubSyncStatus = await client.getStatus();
        setMessage("已断开 GitHub，画布仍保留在本机", "success");
      }
    } catch (error) {
      if (action === "poll" && shouldResetGithubDeviceFlow(error)) githubDeviceFlow = null;
      if (boardId && (error?.code === "SYNC_CONFLICT" || error?.conflicts || error?.artifacts || error?.state)) {
        githubConflictDetails[boardId] = {
          conflicts: Array.isArray(error.conflicts) ? error.conflicts : [],
          artifacts: error.artifacts && typeof error.artifacts === "object" ? error.artifacts : null,
          state: error.state && typeof error.state === "object" ? error.state : null,
        };
        if (["pull", "reconcile"].includes(action)) {
          githubConflictResolutions[boardId] = ["local", "remote", "auto"];
        }
      }
      githubSyncError = error?.message || "GitHub 同步失败";
      setMessage(githubSyncError, "error");
      if (["refresh", "workspace", "sync", "pull", "reconcile"].includes(action)) {
        try {
          githubSyncStatus = await client.getStatus();
          if (githubSyncStatus?.repository?.owner && githubSyncStatus?.repository?.repo) await refreshGithubWorkspace();
        } catch {
          // Preserve the original operation error when the recovery refresh also fails.
        }
      }
    } finally {
      githubSyncAction = "";
      render();
    }
  }

  host.addEventListener("click", async (event) => {
    if (phase === "saving") return;
    const target = event.target instanceof Element ? event.target : null;
    const sectionButton = target?.closest("[data-settings-section]");
    if (sectionButton) {
      if (githubSyncAction) return;
      activeSection = sectionButton.dataset.settingsSection;
      riskConfirmationPending = false;
      setMessage("", "");
      render();
      host.querySelector(".settings-center-content")?.focus({ preventScroll: true });
      return;
    }
    const providerButton = target?.closest("[data-agent-provider]");
    if (providerButton) {
      draft.ai.agent.activeProvider = providerButton.dataset.agentProvider === "claude" ? "claude" : "codex";
      const provider = draft.ai.agent.activeProvider;
      agentSetupSteps[provider] = resolveAgentSetupStep(draft.ai.agent.providers?.[provider] || {}, agentRuntime?.providers?.[provider] || {});
      markDraftChanged();
      render();
      return;
    }
    const presetButton = target?.closest("[data-theme-preset]");
    if (presetButton) {
      const preset = THEME_PRESET_DEFS[presetButton.dataset.themePreset];
      if (preset?.settings) {
        draft.appearance = { ...draft.appearance, ...clone(preset.settings), themePreset: preset.key };
        previewTheme();
        markDraftChanged();
        render();
      }
      return;
    }
    const removeRootButton = target?.closest("[data-remove-root]");
    if (removeRootButton) {
      draft.permissions.allowedRoots.splice(Number(removeRootButton.dataset.removeRoot), 1);
      markDraftChanged();
      render();
      return;
    }
    const restoreButton = target?.closest("[data-agent-restore-backup]");
    if (restoreButton) {
      restoreCandidate = restoreButton.dataset.agentRestoreBackup || "";
      setMessage("请确认恢复的会话备份", "warning");
      render();
      return;
    }
    const actionButton = target?.closest("[data-settings-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.settingsAction;
    if (githubSyncAction && ["reload", "save", "confirm-risk", "reset-section", "cancel"].includes(action)) return;
    if (action === "github-connect") { await runGithubAction("connect"); return; }
    if (action === "github-token-connect") { await runGithubAction("token-connect"); return; }
    if (action === "github-open-token") {
      window.open("https://github.com/settings/personal-access-tokens/new", "_blank", "noopener,noreferrer");
      return;
    }
    if (action === "github-poll") { await runGithubAction("poll"); return; }
    if (action === "github-refresh") { await runGithubAction("refresh"); return; }
    if (action === "github-workspace") { await runGithubAction("workspace"); return; }
    if (action === "github-repositories") { await runGithubAction("repositories"); return; }
    if (action === "github-repository-create") { await runGithubAction("repository-create"); return; }
    if (action === "github-repository-save") { await runGithubAction("repository-save"); return; }
    if (action === "github-sync") { await runGithubAction("sync"); return; }
    if (action === "github-pull") { await runGithubAction("pull", { boardId: actionButton.dataset.githubBoardId }); return; }
    if (action === "github-reconcile") { await runGithubAction("reconcile", { boardId: actionButton.dataset.githubBoardId, resolution: actionButton.dataset.githubResolution }); return; }
    if (action === "github-reveal-conflict") {
      const boardId = actionButton.dataset.githubBoardId || "";
      const directory = githubConflictDetails[boardId]?.artifacts?.directory || "";
      if (directory && desktopShell?.revealPath) {
        const result = await desktopShell.revealPath(directory);
        if (result?.ok === false) {
          setMessage(result.error || "无法打开冲突副本目录", "error");
          render();
        }
      }
      return;
    }
    if (action === "github-disconnect") { await runGithubAction("disconnect"); return; }
    if (action === "github-open-device") {
      const url = githubDeviceFlow?.verification_uri || githubDeviceFlow?.verification_uri_complete;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (action === "reload") await load();
    if (action === "save") await save();
    if (action === "confirm-risk") await save({ confirmedRisk: true });
    if (action === "cancel-risk") { riskConfirmationPending = false; setMessage("", ""); render(); }
    if (action === "reset-section") resetActiveSection();
    if (action === "cancel") { discardChanges(); onRequestClose(); return; }
    const provider = draft.ai.agent?.activeProvider === "claude" ? "claude" : "codex";
    if (action === "agent-setup-continue") { agentSetupSteps[provider] = 2; setMessage("", ""); render(); }
    if (action === "agent-edit-setup") { agentSetupSteps[provider] = 2; setMessage("", ""); render(); }
    if (action === "agent-refresh") await runAgentAction("refresh");
    if (action === "agent-restart") await runAgentAction("restart");
    if (action === "agent-discover") await runAgentAction("discover", { provider });
    if (action === "agent-bind") await runAgentAction("bind", { provider, path: host.querySelector("[data-agent-cli-path]")?.value || "" });
    if (action === "agent-save-connection" || action === "agent-clear-connection") {
      await runAgentAction(action === "agent-clear-connection" ? "clear-connection" : "save-connection", {
        provider,
        baseUrl: agentConnectionDrafts[provider].baseUrl,
        apiKey: agentConnectionDrafts[provider].apiKey,
      });
    }
    if (action === "agent-refresh-models") await runAgentAction("refresh-models", { provider });
    if (action === "agent-select-model") await runAgentAction("select-model", { provider, model: host.querySelector("[data-agent-model-select]")?.value || "" });
    if (action === "agent-test-connection") await runAgentAction("test", { provider });
    if (action === "agent-create-backup") await runBackupAction("create");
    if (action === "agent-cancel-restore") { restoreCandidate = ""; setMessage("", ""); render(); }
    if (action === "agent-confirm-restore" && restoreCandidate) await runBackupAction("restore", restoreCandidate);
    if (action === "pick-directory" || action === "pick-root") {
      const pathTarget = actionButton.dataset.pathTarget;
      const currentPath = pathTarget ? getPathValue(draft, pathTarget) : "";
      const result = await desktopShell?.pickDirectory?.({ defaultPath: currentPath || "" });
      if (result?.filePath) {
        if (pathTarget) { setPathValue(draft, pathTarget, result.filePath); markDraftChanged(); render(); }
        else addRoot(result.filePath);
      }
    }
    if (action === "reveal-directory") {
      const value = getPathValue(draft, actionButton.dataset.pathTarget);
      const result = await desktopShell?.revealPath?.(value);
      if (result?.ok === false) { setMessage(result.error || "无法打开目录", "error"); render(); }
    }
    if (action === "add-root") {
      const input = host.querySelector("[data-new-root]");
      addRoot(input?.value);
    }
  });

  host.addEventListener("input", (event) => {
    if (phase === "saving") return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    if (target.matches("[data-github-client-id]")) {
      githubClientId = target.value.trim();
      return;
    }
    if (target.dataset.agentConnectionField) {
      const provider = draft.ai.agent?.activeProvider === "claude" ? "claude" : "codex";
      agentConnectionDrafts[provider][target.dataset.agentConnectionField] = target.value;
      const discardButton = host.querySelector('[data-settings-action="cancel"]');
      if (discardButton) discardButton.disabled = !hasDiscardableChanges() || phase === "saving" || githubSyncAction || Boolean(agentAction);
      return;
    }
    if (target.matches("[data-settings-shortcut]")) {
      shortcutDraft.clickThroughAccelerator = target.value.trim();
      shortcutDraft.clickThroughDisplay = target.value.trim();
      markDraftChanged();
      return;
    }
    if (target.dataset.themeColor) {
      draft.appearance = deriveCustomThemeSettings({
        ...draft.appearance,
        [target.dataset.themeColor]: target.value,
      });
      previewTheme();
      markDraftChanged();
      target.closest("label")?.querySelector("code")?.replaceChildren(target.value);
      return;
    }
    const path = target.dataset.settingsPath;
    if (!path || target.disabled) return;
    const value = target.type === "checkbox" ? target.checked : target.value;
    setPathValue(draft, path, value);
    markDraftChanged();
  });

  host.addEventListener("change", (event) => {
    if (phase === "saving") return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.matches("[data-github-auth-method]")) {
      githubAuthMethod = target.value === "device-flow" ? "device-flow" : "token";
      githubDeviceFlow = null;
      githubSyncError = "";
      const tokenInput = host.querySelector("[data-github-token]");
      if (tokenInput) tokenInput.value = "";
      setMessage("", "");
      render();
      return;
    }
    if (target.matches("[data-github-app-type]")) {
      githubAppType = target.value === "oauth-app" ? "oauth-app" : "github-app";
      return;
    }
    if (target.dataset.permissionKey) {
      draft.permissions.permissions[target.dataset.permissionKey] = target.checked;
      markDraftChanged();
      return;
    }
    const path = target.dataset.settingsPath;
    if (!path || target.disabled) return;
    setPathValue(draft, path, target.type === "checkbox" ? target.checked : target.value);
    markDraftChanged();
    if ((target.tagName === "SELECT" || target.type === "radio") && !target.closest(".settings-center-agent-policy")) render();
  });

  function close() {
    if (phase === "saving") return false;
    if (themePreviewActive || snapshot?.sections?.appearance) restoreThemePreview();
    return true;
  }

  function discardChanges() {
    if (!snapshot || phase === "saving") return false;
    ++requestSequence;
    if (themePreviewActive || snapshot.sections?.appearance) restoreThemePreview();
    draft = clone(snapshot.sections);
    shortcutDraft = clone(shortcutSnapshot);
    agentConnectionDrafts = Object.fromEntries(["codex", "claude"].map((provider) => [provider, {
      baseUrl: String(snapshot.sections.ai?.agent?.providers?.[provider]?.baseUrl || ""),
      apiKey: "",
    }]));
    agentSetupSteps = Object.fromEntries(["codex", "claude"].map((provider) => [
      provider,
      resolveAgentSetupStep(draft.ai?.agent?.providers?.[provider] || {}, agentRuntime?.providers?.[provider] || {}),
    ]));
    phase = "idle";
    fieldErrors = {};
    riskConfirmationPending = false;
    conflictPending = false;
    restoreCandidate = "";
    setMessage("", "");
    render();
    return true;
  }

  function open() {
    if (!draft || phase === "load-error") return load();
    if (snapshot?.sections?.appearance && stableStringify(draft.appearance) !== stableStringify(snapshot.sections.appearance)) {
      previewTheme();
    }
    render();
    return Promise.resolve();
  }

  render();
  return {
    open,
    openSection(section) {
      if (SECTION_DEFS.some((item) => item.key === section)) activeSection = section;
      render();
    },
    close,
    reload: load,
    isDirty,
    isSaving: () => phase === "saving",
  };
}
