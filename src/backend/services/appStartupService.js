const fs = require("fs/promises");
const path = require("path");
const { DATA_DIR, CANVAS_BOARD_DIR, CACHE_DIR, RUNTIME_DIR } = require("../config/paths");
const { readUiSettingsStore, writeUiSettingsStore } = require("./uiSettingsService");
const { normalizeUiSettings } = require("../models/uiSettingsModel");

const STARTUP_SCHEMA_VERSION = 1;
const DEFAULT_BOARD_FILE_NAME = "canvas-board.json";

function normalizeDirPath(value = "") {
  return String(value || "").trim().replace(/[\\/]+$/, "");
}

function normalizeFilePath(value = "") {
  return String(value || "").trim().replace(/[\\/]+$/, "");
}

function getPathSeparator(pathValue = "") {
  return String(pathValue || "").includes("\\") ? "\\" : "/";
}

function joinPath(basePath = "", name = "") {
  const cleanBase = normalizeDirPath(basePath);
  const cleanName = String(name || "").trim();
  if (!cleanBase) {
    return cleanName;
  }
  if (!cleanName) {
    return cleanBase;
  }
  return `${cleanBase}${getPathSeparator(cleanBase)}${cleanName}`;
}

function isTutorialBoardPath(filePath = "") {
  const normalizedPath = normalizeFilePath(filePath);
  if (!normalizedPath) {
    return false;
  }
  return path.basename(normalizedPath).toLowerCase() === "freeflow教程画布.json".toLowerCase();
}

async function pathExists(targetPath = "") {
  const normalizedPath = String(targetPath || "").trim();
  if (!normalizedPath) {
    return false;
  }
  try {
    await fs.access(normalizedPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureStartupDirectories() {
  await Promise.all([
    fs.mkdir(DATA_DIR, { recursive: true }),
    fs.mkdir(CANVAS_BOARD_DIR, { recursive: true }),
    fs.mkdir(CACHE_DIR, { recursive: true }),
    fs.mkdir(RUNTIME_DIR, { recursive: true }),
  ]);
}

async function runStartupMigrations() {
  await readUiSettingsStore();
  return {
    currentVersion: STARTUP_SCHEMA_VERSION,
    applied: ["ui-settings-schema-check"],
  };
}

async function ensureAppStartupState(options = {}) {
  const { ensureTutorialBoardFile } = options;

  await ensureStartupDirectories();
  const migrationInfo = await runStartupMigrations();
  const currentSettings = normalizeUiSettings(await readUiSettingsStore());
  const nextSettings = {
    ...currentSettings,
    canvasBoardSavePath: normalizeDirPath(currentSettings.canvasBoardSavePath) || CANVAS_BOARD_DIR,
    canvasImageSavePath: normalizeDirPath(currentSettings.canvasImageSavePath),
    canvasLastOpenedBoardPath: normalizeFilePath(currentSettings.canvasLastOpenedBoardPath),
    hasShownStartupTutorial: Boolean(currentSettings.hasShownStartupTutorial),
  };

  let settingsChanged =
    nextSettings.canvasBoardSavePath !== currentSettings.canvasBoardSavePath ||
    nextSettings.canvasImageSavePath !== currentSettings.canvasImageSavePath ||
    nextSettings.canvasLastOpenedBoardPath !== currentSettings.canvasLastOpenedBoardPath ||
    nextSettings.hasShownStartupTutorial !== currentSettings.hasShownStartupTutorial;

  let tutorialBoard = null;
  let initialBoardPath = "";
  let shouldOpenStartupTutorial = false;

  if (
    nextSettings.canvasLastOpenedBoardPath &&
    !nextSettings.hasShownStartupTutorial &&
    isTutorialBoardPath(nextSettings.canvasLastOpenedBoardPath)
  ) {
    // Older builds wrote the startup tutorial into "recent board", causing it to reopen forever.
    nextSettings.canvasLastOpenedBoardPath = "";
    nextSettings.hasShownStartupTutorial = true;
    settingsChanged = true;
  }

  if (nextSettings.canvasLastOpenedBoardPath && !(await pathExists(nextSettings.canvasLastOpenedBoardPath))) {
    nextSettings.canvasLastOpenedBoardPath = "";
    settingsChanged = true;
  }

  if (nextSettings.canvasLastOpenedBoardPath) {
    initialBoardPath = nextSettings.canvasLastOpenedBoardPath;
  } else if (!nextSettings.hasShownStartupTutorial && typeof ensureTutorialBoardFile === "function") {
    tutorialBoard = await ensureTutorialBoardFile().catch(() => null);
    if (tutorialBoard?.ok && tutorialBoard.filePath && (await pathExists(tutorialBoard.filePath))) {
      initialBoardPath = normalizeFilePath(tutorialBoard.filePath);
      shouldOpenStartupTutorial = true;
      nextSettings.hasShownStartupTutorial = true;
      settingsChanged = true;
    }
  }

  if (!initialBoardPath) {
    const candidateBoardPath = joinPath(nextSettings.canvasBoardSavePath, DEFAULT_BOARD_FILE_NAME);
    if (await pathExists(candidateBoardPath)) {
      initialBoardPath = candidateBoardPath;
    }
  }

  const persistedSettings = settingsChanged ? await writeUiSettingsStore(nextSettings) : nextSettings;

  return {
    ok: true,
    uiSettings: persistedSettings,
    startup: {
      schemaVersion: migrationInfo.currentVersion,
      migrations: migrationInfo.applied,
      boardSavePath: persistedSettings.canvasBoardSavePath,
      canvasImageSavePath: persistedSettings.canvasImageSavePath,
      lastOpenedBoardPath: persistedSettings.canvasLastOpenedBoardPath,
      initialBoardPath,
      tutorialBoardPath: tutorialBoard?.filePath || "",
      shouldOpenStartupTutorial,
      hasShownStartupTutorial: persistedSettings.hasShownStartupTutorial,
      initializedAt: Date.now(),
    },
  };
}

module.exports = {
  STARTUP_SCHEMA_VERSION,
  ensureAppStartupState,
};
