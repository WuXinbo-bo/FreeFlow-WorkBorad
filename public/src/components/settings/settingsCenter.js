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

  function renderActiveSection() {
    if (!draft) return "";
    switch (activeSection) {
      case "ai": return renderAi();
      case "appearance": return renderAppearance();
      case "workbench": return renderWorkbench();
      case "canvas": return renderCanvas();
      case "permissions": return renderPermissions();
      case "diagnostics": return renderDiagnostics();
      default: return renderGeneral();
    }
  }

  function render() {
    if (phase === "loading" || !draft) {
      host.innerHTML = `<div class="settings-center-loading"><span></span><strong>正在读取设置</strong></div>`;
      return;
    }
    if (phase === "load-error") {
      host.innerHTML = `<div class="settings-center-load-error"><strong>设置读取失败</strong><p>${escapeHtml(message)}</p><button type="button" data-settings-action="reload">重新载入</button></div>`;
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
          ${conflictPending ? `<button type="button" data-settings-action="reload">重新载入最新设置</button>` : ""}
          <button type="button" data-settings-action="reset-section"${phase === "saving" ? " disabled" : ""}>恢复本页</button>
          <button type="button" data-settings-action="cancel"${!hasDiscardableChanges() || phase === "saving" || Boolean(agentAction) ? " disabled" : ""}>放弃修改</button>
          <button class="is-primary" type="button" data-settings-action="save"${!isDirty() || phase === "saving" ? " disabled" : ""}>${phase === "saving" ? "保存中" : "保存设置"}</button>
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
    const saveButton = host.querySelector('[data-settings-action="save"]');
    if (saveButton) saveButton.disabled = !isDirty() || phase === "saving";
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
      const [response, shortcutResult, runtimeResult, backupsResult] = await Promise.all([
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

  host.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const sectionButton = target?.closest("[data-settings-section]");
    if (sectionButton) {
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
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    if (target.dataset.agentConnectionField) {
      const provider = draft.ai.agent?.activeProvider === "claude" ? "claude" : "codex";
      agentConnectionDrafts[provider][target.dataset.agentConnectionField] = target.value;
      const discardButton = host.querySelector('[data-settings-action="cancel"]');
      if (discardButton) discardButton.disabled = !hasDiscardableChanges() || phase === "saving" || Boolean(agentAction);
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
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
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
