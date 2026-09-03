import { PERMISSION_META, THEME_PRESET_DEFS } from "../../config/ui-meta.js";
import { DEFAULT_THEME_SETTINGS, THEME_SETTING_KEYS } from "../../theme/themeSettings.js";

const SECTION_DEFS = Object.freeze([
  { key: "general", label: "通用", description: "名称与更新" },
  { key: "ai", label: "AI 模型", description: "Codex 运行与默认策略" },
  { key: "appearance", label: "外观", description: "主题与画布视觉" },
  { key: "workbench", label: "工作台", description: "布局与快捷键" },
  { key: "canvas", label: "画布", description: "目录与编辑习惯" },
  { key: "permissions", label: "权限", description: "本地能力与目录" },
  { key: "diagnostics", label: "诊断", description: "配置与连接状态" },
]);

const COLOR_FIELDS = Object.freeze([
  ["backgroundColor", "背景底色"],
  ["shellPanelColor", "主面板"],
  ["floatingPanelColor", "浮层面板"],
  ["controlColor", "控件底色"],
  ["controlActiveColor", "控件激活"],
  ["inputColor", "输入框"],
  ["messageColor", "助手消息"],
  ["userMessageColor", "用户消息"],
  ["textColor", "全局文字"],
  ["shellPanelTextColor", "面板文字"],
  ["buttonColor", "主按钮"],
  ["buttonTextColor", "按钮文字"],
  ["patternColor", "纹理线条"],
  ["dialogColor", "弹窗底色"],
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
  let agentLogin = null;

  function isDirty() {
    if (!snapshot || !draft) return false;
    return stableStringify(snapshot.sections) !== stableStringify(draft) ||
      shortcutSnapshot.clickThroughAccelerator !== shortcutDraft.clickThroughAccelerator;
  }

  function renderNavigation() {
    return SECTION_DEFS.map((section) => `
      <button
        class="settings-center-nav-item${activeSection === section.key ? " is-active" : ""}"
        type="button"
        data-settings-section="${section.key}"
        aria-current="${activeSection === section.key ? "page" : "false"}"
      >
        <span>${escapeHtml(section.label)}</span>
        <small>${escapeHtml(section.description)}</small>
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
    const models = Array.isArray(runtime.models) ? runtime.models : [];
    const runtimeReady = runtime.state === "ready";
    const statusText = !runtime.available
      ? "未找到 Codex CLI"
      : runtimeReady
        ? "运行正常"
        : runtime.state === "starting"
          ? "正在启动"
          : "等待启动";
    const accountText = runtime.authenticated
      ? runtime.account?.email || runtime.account?.type || "已登录"
      : "未登录 ChatGPT";
    return `
      <div class="settings-center-section-heading">
        <div><p>Codex Agent</p><h4>AI 模型调用</h4></div>
        <span>官方 CLI、账户与执行边界</span>
      </div>
      <section class="settings-center-group">
        <div class="settings-center-group-heading settings-center-group-heading-inline"><div><h5>Codex CLI</h5><p>FreeFlow 通过本机官方 Codex app-server 运行，不保存第三方 API Key。</p></div><span class="settings-center-agent-state${runtimeReady ? " is-ready" : runtime.available ? "" : " is-error"}">${escapeHtml(statusText)}</span></div>
        <div class="settings-center-form-grid">
          ${renderField({ path: "ai.agent.cliPath", label: "CLI 路径", value: agent.cliPath || "", maxlength: 1000, placeholder: "留空则从系统 PATH 查找 codex", note: runtime.version ? `已检测 ${runtime.version}` : "可填写 codex 可执行文件的完整路径。" })}
          ${renderField({ path: "ai.agent.workspaceRoot", label: "默认工作区", value: agent.workspaceRoot || "", maxlength: 1000, placeholder: "选择 Codex 默认工作目录", note: "新会话从此目录开始，并受权限页的授权根目录约束。" })}
        </div>
        <div class="settings-center-inline-actions">
          <button type="button" data-settings-action="agent-refresh"${agentAction ? " disabled" : ""}>${agentAction === "refresh" ? "正在检测" : "检测并启动"}</button>
          <button type="button" data-settings-action="agent-restart"${!runtime.available || agentAction ? " disabled" : ""}>${agentAction === "restart" ? "正在重启" : "重启 Agent"}</button>
          ${isDesktop ? `<button type="button" data-settings-action="pick-directory" data-path-target="ai.agent.workspaceRoot">选择目录</button>` : ""}
        </div>
        ${runtime.error ? `<div class="settings-center-runtime-error">${escapeHtml(runtime.error)}</div>` : ""}
      </section>
      <section class="settings-center-group">
        <div class="settings-center-group-heading settings-center-group-heading-inline"><div><h5>ChatGPT 账户</h5><p>登录由 Codex CLI 官方流程完成，FreeFlow 不读取或保存登录令牌。</p></div><span class="settings-center-agent-account${runtime.authenticated ? " is-ready" : ""}">${escapeHtml(accountText)}</span></div>
        <div class="settings-center-inline-actions">
          ${runtime.authenticated
            ? `<button type="button" data-settings-action="agent-logout"${agentAction ? " disabled" : ""}>退出登录</button>`
            : `<button type="button" data-settings-action="agent-login"${!runtime.available || agentAction ? " disabled" : ""}>${agentAction === "login" ? "正在发起登录" : "登录 ChatGPT"}</button>`}
          <button type="button" data-settings-action="agent-refresh"${agentAction ? " disabled" : ""}>刷新状态</button>
          ${agentLogin?.id ? `<button type="button" data-settings-action="agent-cancel-login"${agentAction ? " disabled" : ""}>取消登录</button>` : ""}
        </div>
        ${agentLogin?.url ? `<a class="settings-center-login-link" href="${escapeHtml(agentLogin.url)}" target="_blank" rel="noopener noreferrer">继续完成网页登录</a>` : ""}
      </section>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>新会话默认值</h5><p>仅作用于之后创建的会话；现有会话保持自己的模型和安全边界。</p></div>
        <div class="settings-center-form-grid">
          <label class="settings-center-field"><span>默认模型</span><select data-settings-path="ai.agent.defaultModel">
            <option value=""${agent.defaultModel ? "" : " selected"}>Codex 自动选择</option>
            ${models.map((model) => `<option value="${escapeHtml(model.id)}"${model.id === agent.defaultModel ? " selected" : ""}>${escapeHtml(model.displayName || model.id)}</option>`).join("")}
            ${agent.defaultModel && !models.some((model) => model.id === agent.defaultModel) ? `<option value="${escapeHtml(agent.defaultModel)}" selected>${escapeHtml(agent.defaultModel)}</option>` : ""}
          </select><small>${models.length ? `Codex 返回 ${models.length} 个可用模型。` : "启动并登录后读取可用模型；留空使用 CLI 默认值。"}</small></label>
          <label class="settings-center-field"><span>推理等级</span><select data-settings-path="ai.agent.reasoningEffort">
            ${[["low","低"],["medium","中"],["high","高"],["xhigh","极高"]].map(([value, label]) => `<option value="${value}"${agent.reasoningEffort === value ? " selected" : ""}>${label}</option>`).join("")}
          </select></label>
          <label class="settings-center-field"><span>审批策略</span><select data-settings-path="ai.agent.approvalPolicy">
            <option value="untrusted"${agent.approvalPolicy === "untrusted" ? " selected" : ""}>仅信任操作免审批</option>
            <option value="on-request"${agent.approvalPolicy === "on-request" ? " selected" : ""}>按需审批</option>
            <option value="never"${agent.approvalPolicy === "never" ? " selected" : ""}>从不询问</option>
          </select><small>“从不询问”不会扩大沙箱权限，只会拒绝无法自动执行的操作。</small></label>
          <label class="settings-center-field"><span>沙箱范围</span><select data-settings-path="ai.agent.sandboxMode">
            <option value="read-only"${agent.sandboxMode === "read-only" ? " selected" : ""}>只读</option>
            <option value="workspace-write"${agent.sandboxMode === "workspace-write" ? " selected" : ""}>允许写入工作区</option>
            <option value="danger-full-access"${agent.sandboxMode === "danger-full-access" ? " selected" : ""}>完全访问</option>
          </select></label>
        </div>
        <div class="settings-center-toggle-stack">
          ${renderToggle("ai.agent.queueWhileRunning", "运行时允许排队", agent.queueWhileRunning !== false, "任务执行期间发送普通消息时进入队列，完成后自动继续。")}
          ${renderToggle("ai.agent.showReasoning", "显示推理活动", agent.showReasoning !== false, "只展示 CLI 提供的摘要与活动，不展示内部隐藏推理。")}
        </div>
      </section>
    `;
  }

  function renderAppearance() {
    const theme = draft.appearance;
    const presets = Object.values(THEME_PRESET_DEFS).filter((preset) => preset.key !== "custom");
    return `
      <div class="settings-center-section-heading">
        <div><p>Appearance</p><h4>主题与外观</h4></div>
        <span>实时预览，取消即恢复</span>
      </div>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>主题预设</h5><p>选择后立即预览，只有保存才会成为新默认。</p></div>
        <div class="settings-center-theme-presets">
          ${presets.map((preset) => {
            const colors = preset.settings || DEFAULT_THEME_SETTINGS;
            return `<button type="button" data-theme-preset="${preset.key}" class="${theme.themePreset === preset.key ? "is-active" : ""}"><span class="settings-center-theme-swatch" style="--swatch-bg:${escapeHtml(colors.backgroundColor)};--swatch-panel:${escapeHtml(colors.shellPanelColor)};--swatch-accent:${escapeHtml(colors.buttonColor)}"></span><strong>${escapeHtml(preset.label)}</strong><small>${escapeHtml(preset.description)}</small></button>`;
          }).join("")}
        </div>
      </section>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>透明度</h5><p>面板、画布与背景分别控制。</p></div>
        <div class="settings-center-range-grid">
          ${[["panelOpacity", "面板", 55], ["canvasOpacity", "画布", 20], ["backgroundOpacity", "背景", 0]].map(([key, label, min]) => `
            <label><span>${label}<strong>${Math.round(Number(theme[key]) * 100)}%</strong></span><input type="range" min="${min}" max="100" step="1" data-theme-range="${key}" value="${Math.round(Number(theme[key]) * 100)}" /></label>
          `).join("")}
        </div>
      </section>
      <details class="settings-center-group settings-center-disclosure" open>
        <summary><span><strong>颜色</strong><small>调整核心界面颜色</small></span><span>展开</span></summary>
        <div class="settings-center-color-grid">
          ${COLOR_FIELDS.map(([key, label]) => `<label><span>${escapeHtml(label)}</span><div><input type="color" data-theme-color="${key}" value="${escapeHtml(theme[key] || DEFAULT_THEME_SETTINGS[key] || "#ffffff")}" /><code>${escapeHtml(theme[key] || "")}</code></div></label>`).join("")}
        </div>
      </details>
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
    return `
      <div class="settings-center-section-heading">
        <div><p>Diagnostics</p><h4>设置诊断</h4></div>
        <span>只读运行状态</span>
      </div>
      <section class="settings-center-group">
        <div class="settings-center-diagnostic-grid">
          <div><span>设置协议</span><strong>v${Number(snapshot.schemaVersion) || 1}</strong></div>
          <div><span>草稿状态</span><strong>${isDirty() ? "有未保存修改" : "已同步"}</strong></div>
          <div><span>Codex CLI</span><strong>${runtime.available ? runtime.version || "可用" : "未检测到"}</strong></div>
          <div><span>ChatGPT 账户</span><strong>${runtime.authenticated ? "已登录" : "未登录"}</strong></div>
          <div><span>已启用权限</span><strong>${enabledPermissions} / ${PERMISSION_META.length}</strong></div>
        </div>
        <div class="settings-center-revision"><span>配置版本</span><code>${escapeHtml(snapshot.revision || "-")}</code></div>
        <div class="settings-center-inline-actions"><button type="button" data-settings-action="reload">重新载入设置</button><button type="button" data-settings-action="agent-refresh">刷新 Agent 状态</button></div>
      </section>
      <section class="settings-center-group">
        <div class="settings-center-group-heading"><h5>状态说明</h5><p>运行状态来自 Codex CLI；重新载入会丢弃未保存修改并恢复主题预览。</p></div>
      </section>
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
          <button type="button" data-settings-action="cancel"${phase === "saving" ? " disabled" : ""}>取消</button>
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
    if (!String(draft.ai.agent?.workspaceRoot || "").trim()) errors["ai.agent.workspaceRoot"] = "请选择默认工作区目录";
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
      const [response, shortcutResult, runtimeResult] = await Promise.all([
        fetch(apiRoutes.settingsCenter),
        isDesktop && desktopShell?.getShortcutSettings
          ? desktopShell.getShortcutSettings().catch(() => null)
          : Promise.resolve(null),
        agentClient?.getRuntime
          ? agentClient.getRuntime({ start: true }).catch((error) => ({ runtime: { available: false, state: "error", error: error.message } }))
          : Promise.resolve({ runtime: { available: false, state: "unavailable", error: "Agent API 不可用" } }),
      ]);
      const data = await readJsonResponse(response, "系统设置");
      if (!response.ok || !data.ok) throw new Error(data.error || "无法读取系统设置");
      if (sequence !== requestSequence) return;
      snapshot = clone(data);
      draft = clone(data.sections);
      shortcutSnapshot = clone(shortcutResult?.settings || DEFAULT_SHORTCUT);
      shortcutDraft = clone(shortcutSnapshot);
      agentRuntime = runtimeResult?.runtime || null;
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
    if (activeSection === "appearance") restoreThemePreview();
    fieldErrors = {};
    riskConfirmationPending = false;
    setMessage("已恢复本页到打开时的设置", "");
    render();
  }

  async function runAgentAction(action) {
    if (!agentClient || agentAction) return;
    agentAction = action;
    setMessage("", "");
    render();
    try {
      if (action === "refresh") {
        agentRuntime = (await agentClient.getRuntime({ start: true, refresh: true })).runtime;
      } else if (action === "restart") {
        agentRuntime = (await agentClient.restartRuntime()).runtime;
      } else if (action === "login") {
        const result = await agentClient.startLogin("chatgpt");
        const login = result.login || {};
        agentLogin = {
          id: String(login.loginId || login.id || ""),
          url: String(login.authUrl || login.url || ""),
        };
        if (agentLogin.url) window.open(agentLogin.url, "_blank", "noopener,noreferrer");
        setMessage("登录流程已启动，完成网页授权后刷新状态", "success");
      } else if (action === "cancel-login") {
        await agentClient.cancelLogin(agentLogin?.id || "");
        agentLogin = null;
        setMessage("登录流程已取消", "");
      } else if (action === "logout") {
        agentRuntime = (await agentClient.logout()).runtime;
        agentLogin = null;
        setMessage("已退出 ChatGPT 登录", "success");
      }
    } catch (error) {
      setMessage(error.message || "Agent 操作失败", "error");
    } finally {
      agentAction = "";
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
    const actionButton = target?.closest("[data-settings-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.settingsAction;
    if (action === "reload") await load();
    if (action === "save") await save();
    if (action === "confirm-risk") await save({ confirmedRisk: true });
    if (action === "cancel-risk") { riskConfirmationPending = false; setMessage("", ""); render(); }
    if (action === "reset-section") resetActiveSection();
    if (action === "cancel") { close(); onRequestClose(); }
    if (action === "agent-refresh") await runAgentAction("refresh");
    if (action === "agent-restart") await runAgentAction("restart");
    if (action === "agent-login") await runAgentAction("login");
    if (action === "agent-cancel-login") await runAgentAction("cancel-login");
    if (action === "agent-logout") await runAgentAction("logout");
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
    if (target.matches("[data-settings-shortcut]")) {
      shortcutDraft.clickThroughAccelerator = target.value.trim();
      shortcutDraft.clickThroughDisplay = target.value.trim();
      markDraftChanged();
      return;
    }
    if (target.dataset.themeRange) {
      draft.appearance[target.dataset.themeRange] = Number(target.value) / 100;
      draft.appearance.themePreset = "custom";
      previewTheme();
      markDraftChanged();
      target.closest("label")?.querySelector("strong")?.replaceChildren(`${target.value}%`);
      return;
    }
    if (target.dataset.themeColor) {
      draft.appearance[target.dataset.themeColor] = target.value;
      draft.appearance.themePreset = "custom";
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
    if (target.tagName === "SELECT" || target.type === "radio") render();
  });

  function close() {
    if (phase === "saving") return false;
    ++requestSequence;
    if (themePreviewActive || snapshot?.sections?.appearance) restoreThemePreview();
    if (snapshot) {
      draft = clone(snapshot.sections);
      shortcutDraft = clone(shortcutSnapshot);
    }
    phase = "idle";
    agentAction = "";
    agentLogin = null;
    fieldErrors = {};
    riskConfirmationPending = false;
    setMessage("", "");
    return true;
  }

  render();
  return {
    open: load,
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
