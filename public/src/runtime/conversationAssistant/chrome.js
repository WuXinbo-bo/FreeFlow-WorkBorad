import { dispatchTutorialUiEvent } from "../../tutorial-core/tutorialEventBus.js";
import { TUTORIAL_EVENT_TYPES } from "../../tutorial-core/tutorialTypes.js";

export function createConversationAssistantChrome({
  state,
  elements,
  escapeHtml,
  getModelSource,
  getModelDisplayName,
  getModelSourceLabel,
  getAppDisplayName,
  saveUiSettings,
  saveModelProviderSettings,
  setStatus,
  applyModelSelection,
  refreshAvailableModels,
  syncEmbeddedWindowOverlayVisibility,
  scheduleShellMenuLayout,
  scheduleWindowShapeSync,
  suspendScreenSourceForDrawer,
  suspendScreenSourceForShellMenu,
  setDrawerOpen,
  resumeScreenSourceAfterDrawerClose,
  resumeScreenSourceAfterShellMenuClose,
  swapPanels,
  desktopActions,
}) {
  const {
    conversationAppNameEl,
    conversationAppNameInputEl,
    conversationAppRenameTriggerEl,
    conversationModelGuideBtn,
    conversationModelGuideEl,
    conversationModelGroupsEl,
    conversationModelMenuEl,
    conversationSettingsBtn,
    conversationShellClickThroughBtn,
    conversationShellCloseBtn,
    conversationShellFullscreenBtn,
    conversationShellMenuEl,
    conversationShellMoreBtn,
    conversationShellPinBtn,
    conversationShellRefreshBtn,
    conversationShellSwapBtn,
  } = elements;
  let cloudConfigOpen = false;
  let cloudConfigApiKeyVisible = false;
  let cloudConfigDraft = null;

  function buildCloudConfigDraft() {
    const cloudSettings = state.modelProviderSettings?.cloud || {};
    const provider =
      String(cloudSettings.provider || "").trim().toLowerCase() === "openai_compatible"
        ? "openai_compatible"
        : "bigmodel";
    return {
      provider,
      baseUrl: String(cloudSettings.baseUrl || "").trim(),
      apiKey: String(cloudSettings.apiKey || "").trim(),
      modelsText: Array.isArray(cloudSettings.models) ? cloudSettings.models.join("\n") : "",
      defaultModel: String(cloudSettings.defaultModel || "").trim(),
    };
  }

  function ensureCloudConfigDraft() {
    if (!cloudConfigDraft) {
      cloudConfigDraft = buildCloudConfigDraft();
    }
    return cloudConfigDraft;
  }

  function syncCloudConfigDraftField(field, value) {
    const draft = ensureCloudConfigDraft();
    draft[field] = String(value ?? "");
  }

  function closeModelMenu() {
    if (conversationModelMenuEl?.tagName === "DETAILS") {
      conversationModelMenuEl.removeAttribute("open");
      conversationModelGuideEl?.classList.add("is-hidden");
      cloudConfigOpen = false;
      cloudConfigApiKeyVisible = false;
      cloudConfigDraft = null;
    }
  }

  async function setShellMenuOpen(open, options = {}) {
    const { skipScreenSourceResume = false } = options || {};
    const shouldOpen = Boolean(open);
    if (shouldOpen) {
      await suspendScreenSourceForShellMenu?.();
      conversationShellMenuEl?.classList.toggle("is-hidden", false);
      conversationShellMoreBtn?.setAttribute("aria-expanded", "true");
      scheduleShellMenuLayout?.();
    } else {
      conversationShellMenuEl?.classList.toggle("is-hidden", true);
      conversationShellMoreBtn?.setAttribute("aria-expanded", "false");
      if (!skipScreenSourceResume) {
        await resumeScreenSourceAfterShellMenuClose?.();
      }
    }
    dispatchTutorialUiEvent({
      type: shouldOpen ? TUTORIAL_EVENT_TYPES.MENU_OPENED : TUTORIAL_EVENT_TYPES.MENU_CLOSED,
      menuId: "shell-more-menu",
    });
    scheduleWindowShapeSync?.();
    syncEmbeddedWindowOverlayVisibility();
  }

  function renderShellMenuState() {
    const {
      pinBtn,
      fullscreenBtn,
      clickThroughBtn,
    } = desktopActions;

    if (conversationShellPinBtn) {
      conversationShellPinBtn.classList.toggle("is-active", Boolean(state.desktopShellState.pinned));
      const label = conversationShellPinBtn.querySelector(".conversation-shell-menu-label");
      if (label) {
        label.textContent = state.desktopShellState.pinned ? "取消固定" : "固定界面";
      }
      conversationShellPinBtn.toggleAttribute("disabled", Boolean(pinBtn?.disabled));
    }

    if (conversationShellFullscreenBtn) {
      conversationShellFullscreenBtn.classList.toggle("is-active", Boolean(state.desktopShellState.fullscreen));
      const label = conversationShellFullscreenBtn.querySelector(".conversation-shell-menu-label");
      if (label) {
        label.textContent = state.desktopShellState.fullscreen ? "关闭全屏" : "开启全屏";
      }
      conversationShellFullscreenBtn.toggleAttribute("disabled", Boolean(fullscreenBtn?.disabled));
    }

    if (conversationShellClickThroughBtn) {
      conversationShellClickThroughBtn.classList.toggle("is-active", Boolean(state.desktopShellState.fullClickThrough));
      const label = conversationShellClickThroughBtn.querySelector(".conversation-shell-menu-label");
      if (label) {
        label.textContent = state.desktopShellState.fullClickThrough ? "退出穿透" : "穿透";
      }
      conversationShellClickThroughBtn.toggleAttribute("disabled", Boolean(clickThroughBtn?.disabled));
    }
  }

  function renderModelMenu() {
    if (!conversationModelGroupsEl) return;
    const localItems = state.availableModels.filter((item) => getModelSource(item.name) === "local");
    const cloudItems = state.availableModels.filter((item) => getModelSource(item.name) === "cloud");
    const cloudDraft = cloudConfigOpen ? ensureCloudConfigDraft() : buildCloudConfigDraft();

    conversationModelGroupsEl.innerHTML = [
      {
        key: "local",
        title: "本地模型",
        items: localItems,
        actions: `
          <button class="conversation-model-group-icon" type="button" data-model-group-action="refresh-local" title="刷新本地模型">
            ↻
          </button>
        `,
      },
      {
        key: "cloud",
        title: "云端模型",
        items: cloudItems,
        actions: `
          <button class="conversation-model-group-icon" type="button" data-model-group-action="toggle-cloud-config" title="云端模型配置">
            ⚙
          </button>
          <button class="conversation-model-group-icon" type="button" data-model-group-action="refresh-cloud" title="刷新云端模型">
            ↻
          </button>
        `,
      },
    ]
      .map(
        (group) => `
          <section class="conversation-model-group" data-group="${escapeHtml(group.key)}">
            <div class="conversation-model-group-title-row">
              <div class="conversation-model-group-title">${escapeHtml(group.title)}</div>
              <div class="conversation-model-group-actions">${group.actions}</div>
            </div>
            ${
              group.items.length
                ? group.items
                    .map(
                      (item) => `
                        <button
                          class="conversation-model-option${item.name === state.model ? " is-active" : ""}"
                          type="button"
                          data-model-option="${escapeHtml(item.name)}"
                        >
                          <span>${escapeHtml(item.displayName || getModelDisplayName(item.name))}</span>
                          <span class="conversation-model-option-badge">${escapeHtml(getModelSourceLabel(item.name))}</span>
                        </button>
                      `
                    )
                    .join("")
                : `<div class="conversation-model-empty">暂无${escapeHtml(group.title)}</div>`
            }
          </section>
        `
      )
      .join("") +
      `
        <section class="conversation-model-cloud-config${cloudConfigOpen ? "" : " is-hidden"}">
          <div class="conversation-model-cloud-config-head">
            <strong>云端配置</strong>
            <span>当前已支持 BigModel 与 OpenAI 兼容接口，Gemini 等独立协议后续单独适配</span>
          </div>
          <label class="conversation-model-config-field">
            <span>接口类型</span>
            <select class="conversation-model-config-input" data-cloud-config-field="provider">
              <option value="bigmodel"${cloudDraft.provider === "bigmodel" ? " selected" : ""}>BigModel</option>
              <option value="openai_compatible"${cloudDraft.provider === "openai_compatible" ? " selected" : ""}>OpenAI 兼容</option>
            </select>
          </label>
          <label class="conversation-model-config-field">
            <span>接口地址</span>
            <input
              class="conversation-model-config-input"
              type="text"
              data-cloud-config-field="baseUrl"
              value="${escapeHtml(cloudDraft.baseUrl || "")}"
              placeholder="${cloudDraft.provider === "openai_compatible" ? "https://api.openai.com/v1" : "https://open.bigmodel.cn/api/paas/v4"}"
            />
          </label>
          <label class="conversation-model-config-field">
            <span>API Key</span>
            <span class="conversation-model-config-secret">
              <input
                class="conversation-model-config-input"
                type="${cloudConfigApiKeyVisible ? "text" : "password"}"
                data-cloud-config-field="apiKey"
                value="${escapeHtml(cloudDraft.apiKey || "")}"
                placeholder="填写云端 API Key"
              />
              <button
                class="conversation-model-config-visibility"
                type="button"
                data-model-group-action="toggle-cloud-api-key-visibility"
                title="${cloudConfigApiKeyVisible ? "隐藏 API Key" : "显示 API Key"}"
              >
                ${cloudConfigApiKeyVisible ? "🙈" : "👁"}
              </button>
            </span>
          </label>
          <label class="conversation-model-config-field">
            <span>模型列表</span>
            <textarea
              class="conversation-model-config-textarea"
              data-cloud-config-field="models"
              rows="3"
              placeholder="一行一个，或用逗号分隔"
            >${escapeHtml(cloudDraft.modelsText || "")}</textarea>
          </label>
          <label class="conversation-model-config-field">
            <span>默认模型</span>
            <input
              class="conversation-model-config-input"
              type="text"
              data-cloud-config-field="defaultModel"
              value="${escapeHtml(cloudDraft.defaultModel || "")}"
              placeholder="例如 glm-4.7-flash"
            />
          </label>
          <div class="conversation-model-config-actions">
            <button class="conversation-model-config-btn" type="button" data-model-group-action="save-cloud-config">保存并应用</button>
            <button class="conversation-model-config-btn is-secondary" type="button" data-model-group-action="refresh-cloud">刷新模型</button>
          </div>
        </section>
      `;
  }

  function readCloudConfigDraft() {
    const draft = ensureCloudConfigDraft();

    return {
      cloud: {
        provider: draft.provider === "openai_compatible" ? "openai_compatible" : "bigmodel",
        baseUrl: String(draft.baseUrl || "").trim(),
        apiKey: String(draft.apiKey || "").trim(),
        models: String(draft.modelsText || "")
          .split(/[\n,]+/g)
          .map((item) => item.trim())
          .filter(Boolean),
        defaultModel: String(draft.defaultModel || "").trim(),
      },
    };
  }

  async function handleModelGroupAction(action) {
    if (action === "refresh-local") {
      await refreshAvailableModels({
        loadingText: "正在刷新本地模型列表",
        successText: "本地模型列表已刷新",
      });
      return;
    }

    if (action === "refresh-cloud") {
      await refreshAvailableModels({
        loadingText: "正在刷新云端模型列表",
        successText: "云端模型列表已刷新",
      });
      return;
    }

    if (action === "toggle-cloud-config") {
      cloudConfigOpen = !cloudConfigOpen;
      if (cloudConfigOpen) {
        cloudConfigDraft = buildCloudConfigDraft();
      } else {
        cloudConfigApiKeyVisible = false;
        cloudConfigDraft = null;
      }
      renderModelMenu();
      return;
    }

    if (action === "toggle-cloud-api-key-visibility") {
      cloudConfigApiKeyVisible = !cloudConfigApiKeyVisible;
      renderModelMenu();
      return;
    }

    if (action === "save-cloud-config") {
      await saveModelProviderSettings(readCloudConfigDraft());
      await refreshAvailableModels({
        loadingText: "正在应用云端模型配置",
        successText: "云端模型配置已保存并刷新",
      });
      cloudConfigOpen = true;
      cloudConfigDraft = buildCloudConfigDraft();
    }
  }

  function beginAppRename() {
    if (!conversationAppNameInputEl || !conversationAppNameEl) return;
    if (!conversationAppRenameTriggerEl) {
      conversationAppNameInputEl.value = getAppDisplayName();
      requestAnimationFrame(() => {
        conversationAppNameInputEl.focus();
        conversationAppNameInputEl.select?.();
      });
      return;
    }
    conversationAppNameEl.classList.add("is-hidden");
    conversationAppNameInputEl.classList.remove("is-hidden");
    conversationAppNameInputEl.value = getAppDisplayName();
    requestAnimationFrame(() => {
      conversationAppNameInputEl.focus();
      conversationAppNameInputEl.select();
    });
  }

  function cancelAppRename() {
    if (!conversationAppNameInputEl || !conversationAppNameEl) return;
    if (!conversationAppRenameTriggerEl) {
      conversationAppNameInputEl.value = getAppDisplayName();
      return;
    }
    conversationAppNameInputEl.classList.add("is-hidden");
    conversationAppNameEl.classList.remove("is-hidden");
    conversationAppNameInputEl.value = getAppDisplayName();
  }

  async function commitAppRename() {
    if (!conversationAppNameInputEl) return;
    const nextName = String(conversationAppNameInputEl.value || "").trim() || "FreeFlow";
    try {
      await saveUiSettings({ appName: nextName });
      setStatus("AI 名称已更新", "success");
    } catch (error) {
      setStatus(`保存 AI 名称失败：${error.message}`, "warning");
    } finally {
      if (conversationAppRenameTriggerEl) {
        cancelAppRename();
      } else {
        conversationAppNameInputEl.value = getAppDisplayName();
      }
    }
  }

  function bindEvents() {
    conversationShellMoreBtn?.addEventListener("click", async (event) => {
      event.preventDefault();
      const willOpen = conversationShellMenuEl?.classList.contains("is-hidden");
      await setShellMenuOpen(Boolean(willOpen));
    });

    conversationSettingsBtn?.addEventListener("click", async (event) => {
      event.preventDefault();
      await setShellMenuOpen(false, { skipScreenSourceResume: true });
      const willOpen = !state.drawerOpen;
      if (willOpen) {
        await suspendScreenSourceForDrawer();
        setDrawerOpen(true);
        return;
      }
      setDrawerOpen(false);
      await resumeScreenSourceAfterDrawerClose();
    });

    conversationAppRenameTriggerEl?.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      beginAppRename();
    });

    conversationAppNameInputEl?.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await commitAppRename();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelAppRename();
      }
    });

    conversationAppNameInputEl?.addEventListener("blur", async () => {
      if (conversationAppRenameTriggerEl && conversationAppNameInputEl.classList.contains("is-hidden")) return;
      await commitAppRename();
    });

    conversationModelGroupsEl?.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-model-group-action]");
      if (actionButton) {
        event.preventDefault();
        handleModelGroupAction(actionButton.dataset.modelGroupAction).catch((error) => {
          setStatus(error.message, "warning");
        });
        return;
      }

      const option = event.target.closest("[data-model-option]");
      if (!option) return;
      const modelName = option.dataset.modelOption;
      if (!modelName) return;
      applyModelSelection(modelName, { announce: true, persistSession: true });
      closeModelMenu();
    });

    conversationModelGroupsEl?.addEventListener("input", (event) => {
      const field = event.target?.dataset?.cloudConfigField;
      if (!field) return;

      if (field === "models") {
        syncCloudConfigDraftField("modelsText", event.target.value);
        return;
      }

      if (field === "provider") {
        syncCloudConfigDraftField("provider", event.target.value);
        renderModelMenu();
        return;
      }

      syncCloudConfigDraftField(field, event.target.value);
    });

    conversationModelGuideBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      conversationModelGuideEl?.classList.toggle("is-hidden");
    });

    conversationShellPinBtn?.addEventListener("click", () => {
      void setShellMenuOpen(false);
      desktopActions.pinBtn?.click();
    });

    conversationShellFullscreenBtn?.addEventListener("click", () => {
      void setShellMenuOpen(false);
      if (typeof desktopActions.toggleFullscreen === "function") {
        void desktopActions.toggleFullscreen();
        return;
      }
      desktopActions.fullscreenBtn?.click();
    });

    conversationShellSwapBtn?.addEventListener("click", async () => {
      await setShellMenuOpen(false);
      await swapPanels?.();
    });

    conversationShellClickThroughBtn?.addEventListener("click", () => {
      void setShellMenuOpen(false);
      desktopActions.clickThroughBtn?.click();
    });

    conversationShellRefreshBtn?.addEventListener("click", () => {
      void setShellMenuOpen(false);
      desktopActions.refreshBtn?.click();
    });

    conversationShellCloseBtn?.addEventListener("click", () => {
      void setShellMenuOpen(false);
      desktopActions.closeBtn?.click();
    });
  }

  return {
    beginAppRename,
    bindEvents,
    cancelAppRename,
    closeModelMenu,
    commitAppRename,
    renderModelMenu,
    renderShellMenuState,
    setShellMenuOpen,
  };
}
