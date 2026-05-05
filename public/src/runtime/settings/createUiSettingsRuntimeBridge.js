export function createUiSettingsRuntimeBridge(deps) {
  const {
    state,
    CONFIG,
    DESKTOP_SHELL,
    API_ROUTES,
    readJsonResponse,
    normalizeUiSettings,
    pickWorkbenchPreferences,
    buildUiSettingsPayload,
    applyUiSettings,
    setStatus,
  } = deps;

  let startupContextPromise = null;
  let startupTutorialIntroPersistSeq = 0;

  function readUiSettingsCache() {
    try {
      const raw = localStorage.getItem(CONFIG.uiSettingsCacheKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  async function loadStartupContext() {
    if (startupContextPromise) {
      return startupContextPromise;
    }
    startupContextPromise = (async () => {
      if (!DESKTOP_SHELL?.getStartupContext) {
        return null;
      }
      const context = await DESKTOP_SHELL.getStartupContext().catch(() => null);
      if (context?.ok) {
        globalThis.__FREEFLOW_STARTUP_CONTEXT = context;
        return context;
      }
      return null;
    })();
    return startupContextPromise;
  }

  async function refreshStartupContext() {
    if (!DESKTOP_SHELL?.refreshStartupContext) {
      startupContextPromise = null;
      return loadStartupContext();
    }
    const context = await DESKTOP_SHELL.refreshStartupContext().catch(() => null);
    if (context?.ok) {
      globalThis.__FREEFLOW_STARTUP_CONTEXT = context;
      startupContextPromise = Promise.resolve(context);
      return context;
    }
    startupContextPromise = null;
    return loadStartupContext();
  }

  function getStartupContext() {
    const context = globalThis.__FREEFLOW_STARTUP_CONTEXT;
    return context && typeof context === "object" && context.ok ? context : null;
  }

  function writeUiSettingsCache(payload = {}) {
    try {
      localStorage.setItem(CONFIG.uiSettingsCacheKey, JSON.stringify(normalizeUiSettings(payload)));
    } catch {
      // Ignore local cache failures.
    }
  }

  function writeStartupContextUiSettings(nextUiSettings = {}) {
    const context = getStartupContext();
    if (!context) {
      return;
    }
    const nextNormalizedUiSettings = normalizeUiSettings({
      ...(context.uiSettings || {}),
      ...nextUiSettings,
    });
    const nextStartup = {
      ...(context.startup || {}),
    };
    if (typeof nextUiSettings.canvasBoardSavePath === "string") {
      nextStartup.boardSavePath = nextNormalizedUiSettings.canvasBoardSavePath;
    }
    if (typeof nextUiSettings.canvasImageSavePath === "string") {
      nextStartup.canvasImageSavePath = nextNormalizedUiSettings.canvasImageSavePath;
    }
    if (typeof nextUiSettings.canvasLastOpenedBoardPath === "string") {
      nextStartup.lastOpenedBoardPath = nextNormalizedUiSettings.canvasLastOpenedBoardPath;
      nextStartup.initialBoardPath = nextNormalizedUiSettings.canvasLastOpenedBoardPath;
    }
    globalThis.__FREEFLOW_STARTUP_CONTEXT = {
      ...context,
      uiSettings: nextNormalizedUiSettings,
      workbenchPreferences: pickWorkbenchPreferences(nextNormalizedUiSettings),
      startup: nextStartup,
    };
  }

  function getStartupTutorialIntroVersion() {
    return String(CONFIG.startupTutorialIntroVersion || "").trim();
  }

  function shouldAutoShowStartupTutorialIntro() {
    const introVersion = getStartupTutorialIntroVersion();
    if (!introVersion) {
      return false;
    }
    const startup = getStartupContext()?.startup || {};
    const shouldOpenStartupTutorial = Boolean(startup?.shouldOpenStartupTutorial);
    const hasShownStartupTutorial = Boolean(state.uiSettings?.hasShownStartupTutorial);
    const lastIntroVersion = String(state.uiSettings?.lastTutorialIntroVersion || "").trim();
    const dismissedIntroVersion = String(state.uiSettings?.dismissedTutorialIntroVersion || "").trim();

    if (dismissedIntroVersion === introVersion) {
      return false;
    }
    if (shouldOpenStartupTutorial) {
      return true;
    }
    if (!hasShownStartupTutorial) {
      return true;
    }
    return lastIntroVersion !== introVersion;
  }

  async function persistStartupTutorialIntroSettings(overrides = {}) {
    const persistSeq = ++startupTutorialIntroPersistSeq;
    const introVersion = getStartupTutorialIntroVersion();
    const payload = buildUiSettingsPayload({
      hasShownStartupTutorial: true,
      lastTutorialIntroVersion: overrides.lastTutorialIntroVersion ?? introVersion,
      dismissedTutorialIntroVersion:
        overrides.dismissedTutorialIntroVersion ?? state.uiSettings?.dismissedTutorialIntroVersion ?? "",
    });
    writeUiSettingsCache(payload);

    try {
      const response = await fetch(API_ROUTES.uiSettings, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJsonResponse(response, "界面设置");
      if (!response.ok || !data.ok) {
        throw new Error(data.details || data.error || "保存界面设置失败");
      }
      if (persistSeq !== startupTutorialIntroPersistSeq) {
        return;
      }
      state.uiSettings = normalizeUiSettings({
        ...payload,
        ...data,
      });
      writeUiSettingsCache(state.uiSettings);
      applyUiSettings();
    } catch {
      if (persistSeq !== startupTutorialIntroPersistSeq) {
        return;
      }
      state.uiSettings = normalizeUiSettings(payload);
      writeUiSettingsCache(state.uiSettings);
    }
  }

  async function loadUiSettings() {
    const cached = readUiSettingsCache();
    const startupContext = await loadStartupContext();
    const startupUiSettings = startupContext?.uiSettings || {};
    const startupWorkbenchPreferences = startupContext?.workbenchPreferences || {};
    try {
      const response = await fetch(API_ROUTES.uiSettings);
      const data = await readJsonResponse(response, "界面设置");

      if (!response.ok || !data.ok) {
        throw new Error(data.details || data.error || "无法读取界面设置");
      }

      state.uiSettings = normalizeUiSettings({
        ...startupUiSettings,
        ...startupWorkbenchPreferences,
        ...data,
      });
    } catch (error) {
      state.uiSettings = normalizeUiSettings({
        ...startupUiSettings,
        ...startupWorkbenchPreferences,
        ...cached,
      });
      setStatus(`界面设置读取失败：${error.message}`, "warning");
    }

    state.workbenchPreferences = pickWorkbenchPreferences({
      ...state.uiSettings,
      ...startupWorkbenchPreferences,
    });
    writeUiSettingsCache(state.uiSettings);
    applyUiSettings();
  }

  return {
    readUiSettingsCache,
    loadStartupContext,
    refreshStartupContext,
    getStartupContext,
    writeUiSettingsCache,
    writeStartupContextUiSettings,
    getStartupTutorialIntroVersion,
    shouldAutoShowStartupTutorialIntro,
    persistStartupTutorialIntroSettings,
    loadUiSettings,
  };
}
