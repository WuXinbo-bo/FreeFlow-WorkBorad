function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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


export function renderAiSetup(context) {
  const { draft, agentRuntime, agentAction, agentConnectionDrafts, agentSetupSteps, snapshot, agentBackups, agentBackupError, backupAction, restoreCandidate, isDirty, PERMISSION_META } = context;
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


export function renderDiagnostics(context) {
  const { draft, agentRuntime, agentAction, agentConnectionDrafts, agentSetupSteps, snapshot, agentBackups, agentBackupError, backupAction, restoreCandidate, isDirty, PERMISSION_META } = context;
    const runtime = agentRuntime || {};
    const enabledPermissions = Object.values(draft.permissions.permissions || {}).filter(Boolean).length;
    const codex = runtime.providers?.codex || {};
    const claude = runtime.providers?.claude || {};
    return `
      <div class="settings-center-section-heading">
        <div><p>运行信息</p><h4>AI 诊断与备份</h4></div>
        <span>只读运行状态</span>
      </div>
      <section class="settings-center-group">
        <div class="settings-center-diagnostic-grid">
          <div><span>设置协议</span><strong>v${Number(snapshot.schemaVersion) || 1}</strong></div>
          <div><span>草稿状态</span><strong>${isDirty() ? "有未保存修改" : "已保存"}</strong></div>
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
