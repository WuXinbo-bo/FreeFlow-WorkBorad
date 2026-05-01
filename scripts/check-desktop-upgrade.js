const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireFresh(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(resolved);
}

function createLegacyBoardPayload(title = "旧版画布") {
  return {
    version: 1,
    updatedAt: Date.now(),
    view: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    },
    selectedIds: [],
    items: [
      {
        id: "legacy-text-1",
        kind: "text",
        title,
        text: `${title}内容`,
        x: 120,
        y: 96,
        width: 320,
        height: 120,
        fontSize: 20,
        bold: false,
        highlighted: false,
        createdAt: Date.now(),
      },
    ],
  };
}

async function writeJson(filePath, payload) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

async function runScenario({
  name,
  missingRecentBoard = false,
  hasShownStartupTutorial = false,
  dismissedTutorialIntroVersion = "",
  lastTutorialIntroVersion = "",
}) {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "freeflow-upgrade-"));
  const homeDir = path.join(tempRoot, "FreeFlow");
  const appDataDir = path.join(homeDir, "AppData");
  const boardDir = path.join(homeDir, "CanvasBoards");
  const tutorialBoardPath = path.join(boardDir, "FreeFlow教程画布.json");
  const recentBoardPath = path.join(boardDir, "我的旧画布.json");

  await fsp.mkdir(appDataDir, { recursive: true });
  await fsp.mkdir(boardDir, { recursive: true });

  process.env.FREEFLOW_HOME_DIR = homeDir;
  process.env.FREEFLOW_USER_DATA_DIR = appDataDir;
  process.env.FREEFLOW_CANVAS_BOARD_DIR = boardDir;
  process.env.FREEFLOW_CACHE_DIR = path.join(appDataDir, "Cache");
  process.env.FREEFLOW_RUNTIME_DIR = path.join(appDataDir, "Runtime");
  process.env.FREEFLOW_TEMP_DRAG_DIR = path.join(appDataDir, "Runtime", "drag-export");

  const { SHORTCUT_SETTINGS_FILE } = requireFresh("../src/backend/config/paths");

  await writeJson(path.join(appDataDir, "ui-settings.json"), {
    appName: "FreeFlow",
    appSubtitle: "自由画布与 AI 工作台",
    canvasTitle: "FreeFlow 工作白板",
    canvasBoardSavePath: boardDir,
    canvasLastOpenedBoardPath: missingRecentBoard ? recentBoardPath : recentBoardPath,
    hasShownStartupTutorial,
    lastTutorialIntroVersion,
    dismissedTutorialIntroVersion,
    canvasImageSavePath: path.join(boardDir, "importImage"),
    textColor: "#123456",
    dialogColor: "#f0f0f0",
    themePreset: "custom-legacy",
    updatedAt: Date.now() - 1000,
  });

  await writeJson(path.join(appDataDir, "model-provider-settings.json"), {
    cloud: {
      provider: "openai_compatible",
      baseUrl: "https://api.example.com/v1",
      apiKey: "legacy-key",
      models: ["gpt-4o-mini", "gemini-2.5-flash"],
      defaultModel: "gpt-4o-mini",
    },
    updatedAt: Date.now() - 2000,
  });

  await writeJson(path.join(appDataDir, "model-profiles.json"), {
    profiles: {
      "local::qwen3.5:4b": {
        contextLimit: 4096,
        thinkingEnabled: true,
        deviceMode: "auto",
      },
    },
    updatedAt: Date.now() - 3000,
  });

  await writeJson(path.join(appDataDir, "sessions.json"), {
    currentSessionId: "session-1",
    sessions: [
      {
        id: "session-1",
        title: "历史会话",
        createdAt: Date.now() - 5000,
        updatedAt: Date.now() - 4000,
        messages: [{ id: "msg-1", role: "user", content: "历史消息" }],
      },
    ],
  });

  await writeJson(path.join(appDataDir, "clipboard-store.json"), {
    mode: "manual",
    maxItems: 20,
    items: [{ id: "clip-1", content: "剪贴板内容", source: "manual" }],
    updatedAt: Date.now() - 3500,
  });

  await writeJson(path.join(appDataDir, "permissions.json"), {
    permissions: { fileRead: true, fileWrite: true },
    allowedRoots: [boardDir],
    updatedAt: Date.now() - 2500,
  });

  await writeJson(recentBoardPath, createLegacyBoardPayload("我的旧画布"));
  if (missingRecentBoard) {
    await fsp.rm(recentBoardPath, { force: true });
  }

  await writeJson(tutorialBoardPath, createLegacyBoardPayload("教程画布"));
  await writeJson(SHORTCUT_SETTINGS_FILE, {
    clickThroughAccelerator: "Control+Alt+X",
  });

  const { ensureAppStartupState } = requireFresh("../src/backend/services/appStartupService");
  const uiSettingsService = requireFresh("../src/backend/services/uiSettingsService");
  const modelProviderSettingsService = requireFresh("../src/backend/services/modelProviderSettingsService");
  const sessionService = requireFresh("../src/backend/services/sessionService");
  const canvasBoardService = requireFresh("../src/backend/services/canvasBoardService");

  let ensureTutorialBoardFileCallCount = 0;
  const startupContext = await ensureAppStartupState({
    ensureTutorialBoardFile: async () => {
      ensureTutorialBoardFileCallCount += 1;
      return {
      ok: true,
      filePath: tutorialBoardPath,
      created: false,
      };
    },
  });

  const uiSettings = await uiSettingsService.readUiSettingsStore();
  const providerSettings = await modelProviderSettingsService.readModelProviderSettingsStore();
  const sessions = await sessionService.readSessionStore();
  const boardInfo = await canvasBoardService.readCanvasBoard(
    missingRecentBoard ? tutorialBoardPath : recentBoardPath
  );
  const shortcutSettings = JSON.parse(await fsp.readFile(SHORTCUT_SETTINGS_FILE, "utf8"));

  assert(startupContext.ok, `${name}: 启动上下文初始化失败`);
  assert(uiSettings.schemaVersion === 2, `${name}: ui-settings 未写入 schemaVersion`);
  assert(uiSettings.textColor === "#123456", `${name}: 主题设置未保留`);
  assert(uiSettings.dialogColor === "#f0f0f0", `${name}: 对话框颜色未保留`);
  assert(uiSettings.defaultCanvasPanelSide === "left", `${name}: 习惯设置默认画布侧未兼容`);
  assert(uiSettings.defaultChatPanelSide === "right", `${name}: 习惯设置默认对话侧未兼容`);
  assert(uiSettings.defaultCanvasPanelVisible === true, `${name}: 习惯设置默认画布开关未兼容`);
  assert(uiSettings.defaultChatPanelVisible === true, `${name}: 习惯设置默认对话开关未兼容`);
  assert(uiSettings.defaultLaunchFullscreen === false, `${name}: 习惯设置默认全屏开关未兼容`);
  assert(startupContext.workbenchPreferences.defaultCanvasPanelSide === uiSettings.defaultCanvasPanelSide, `${name}: 启动习惯画布侧不一致`);
  assert(startupContext.workbenchPreferences.defaultChatPanelSide === uiSettings.defaultChatPanelSide, `${name}: 启动习惯对话侧不一致`);
  assert(startupContext.workbenchPreferences.defaultCanvasPanelVisible === uiSettings.defaultCanvasPanelVisible, `${name}: 启动习惯画布开关不一致`);
  assert(startupContext.workbenchPreferences.defaultChatPanelVisible === uiSettings.defaultChatPanelVisible, `${name}: 启动习惯对话开关不一致`);
  assert(startupContext.workbenchPreferences.defaultLaunchFullscreen === uiSettings.defaultLaunchFullscreen, `${name}: 启动习惯全屏开关不一致`);
  assert(
    uiSettings.dismissedTutorialIntroVersion === dismissedTutorialIntroVersion,
    `${name}: 已关闭教程版本被启动迁移覆盖`
  );
  assert(uiSettings.lastTutorialIntroVersion === lastTutorialIntroVersion, `${name}: 教程介绍版本被启动迁移覆盖`);
  assert(shortcutSettings.clickThroughAccelerator === "Control+Alt+X", `${name}: 快捷键设置未保留`);
  assert(providerSettings.schemaVersion === 1, `${name}: AI 配置未纳入 schemaVersion`);
  assert(providerSettings.cloud.baseUrl === "https://api.example.com/v1", `${name}: AI 配置未保留`);
  assert(sessions.schemaVersion === 1, `${name}: 历史会话未纳入 schemaVersion`);
  assert(Array.isArray(sessions.sessions) && sessions.sessions.length === 1, `${name}: 历史会话未保留`);
  assert(boardInfo.board.schemaVersion === 1, `${name}: 老画布未纳入 schemaVersion`);
  assert(boardInfo.board.items[0]?.text?.includes(missingRecentBoard ? "教程画布" : "我的旧画布"), `${name}: 老画布未正常读取`);
  assert(path.extname(boardInfo.file) === ".freeflow", `${name}: 老画布读取后未升级为 .freeflow 格式`);
  if (!missingRecentBoard) {
    assert(boardInfo.file !== recentBoardPath, `${name}: 老 JSON 画布不应被原地覆盖`);
  }
  assert(ensureTutorialBoardFileCallCount === 1, `${name}: 教程画布刷新链路未执行`);
  assert(startupContext.startup.tutorialBoardPath === tutorialBoardPath, `${name}: 教程画布路径未回传`);

  if (missingRecentBoard) {
    assert(
      startupContext.startup.initialBoardPath === tutorialBoardPath,
      `${name}: 教程画布回退未生效`
    );
  } else {
    assert(
      startupContext.startup.initialBoardPath === recentBoardPath,
      `${name}: 首次启动应先打开用户记录的旧 JSON 最近画布`
    );
  }

  if (dismissedTutorialIntroVersion) {
    assert(
      startupContext.startup.shouldOpenStartupTutorial === false,
      `${name}: 当前版本教程已关闭后不应再次触发启动教程`
    );
  }

  return {
    name,
    tempRoot,
    initialBoardPath: startupContext.startup.initialBoardPath,
    tutorialBoardPath: startupContext.startup.tutorialBoardPath,
    ensureTutorialBoardFileCallCount,
    usedTutorialFallback: startupContext.startup.usedTutorialFallback,
  };
}

async function main() {
  const scenarioName = String(process.argv[2] || "").trim();
  if (scenarioName) {
    const result = await runScenario({
      name: scenarioName,
      missingRecentBoard: scenarioName === "tutorial-fallback",
      hasShownStartupTutorial:
        scenarioName === "legacy-user-template-refresh" ||
        scenarioName === "current-version-intro-dismissed",
      lastTutorialIntroVersion: scenarioName === "current-version-intro-dismissed" ? "1.0.9-rc" : "",
      dismissedTutorialIntroVersion: scenarioName === "current-version-intro-dismissed" ? "1.0.9-rc" : "",
    });
    console.log(JSON.stringify(result));
    return;
  }

  const scenarios = [
    "recent-board-preserved",
    "tutorial-fallback",
    "legacy-user-template-refresh",
    "current-version-intro-dismissed",
  ];
  const results = [];

  for (const name of scenarios) {
    const child = spawnSync(process.execPath, [__filename, name], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (child.status !== 0) {
      const detail = String(child.stderr || child.stdout || "").trim();
      throw new Error(detail || `${name} 执行失败`);
    }

    const output = String(child.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .pop();
    results.push(JSON.parse(output));
  }

  console.log("[check-desktop-upgrade] 升级兼容验证通过：");
  for (const result of results) {
    console.log(`  - ${result.name}: initialBoardPath=${result.initialBoardPath} tutorialFallback=${result.usedTutorialFallback}`);
  }
}

main().catch((error) => {
  console.error(`[check-desktop-upgrade] ${error.message}`);
  process.exit(1);
});
