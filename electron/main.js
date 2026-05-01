const path = require("path");
let electron = require("electron");
if (typeof electron === "string") {
  electron = require("electron/main");
}
const { app, BrowserWindow, ipcMain, shell, globalShortcut, clipboard, desktopCapturer, session, screen, dialog, nativeImage } = electron;
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const HTMLtoDOCX = require("html-to-docx");
const { compileWordExportAstToDocxBuffer } = require("./wordDocxCompiler");
const { ensureDoubaoWindow, chatWithDoubao, cancelDoubaoChat, prepareDoubaoPrompt } = require("./doubao-web");
const { AI_MIRROR_TARGETS, createAiMirrorTargetManager } = require("./aiMirrorTargetManager");
const { createExternalWindowEmbedManager } = require("./win32/externalWindowEmbed");
const { createWebContentsViewEmbedManager } = require("./web/webContentsViewEmbed");
const { ensureAppStartupState } = require("../src/backend/services/appStartupService");
const {
  DATA_DIR,
  CANVAS_BOARD_DIR,
  TEMP_DRAG_DIR,
  TUTORIAL_ASSET_DIR_NAME,
  SHORTCUT_SETTINGS_FILE,
} = require("../src/backend/config/paths");

const WINDOW_CONFIG = {
  width: 1480,
  height: 920,
  minWidth: 1180,
  minHeight: 760,
  transparent: true,
  frame: false,
  hasShadow: false,
  autoHideMenuBar: true,
  backgroundColor: "#00000000",
  alwaysOnTop: true,
  skipTaskbar: false,
};

const SERVER_PORT = Number(process.env.PORT || 3000);
const PRODUCT_NAME = "FreeFlow";
const APP_USER_MODEL_ID = "com.wuxinbo.freeflow";
const DEFAULT_TUTORIAL_BOARD_NAME = "FreeFlow教程画布.json";
const TUTORIAL_BOARD_TEMPLATE_VERSION = "1.0.9-rc";
const DEFAULT_SHORTCUT_SETTINGS = Object.freeze({
  clickThroughAccelerator: "CommandOrControl+Shift+X",
});
const APP_URL = `http://127.0.0.1:${SERVER_PORT}/?desktop=1`;
const PIN_LEVEL = "screen-saver";
const PIN_RELATIVE_LEVEL = 1;
const WORD_PREVIEW_TIMEOUT_MS = 45000;

let mainWindow = null;
let clickThroughEnabled = false;
let windowShapeRects = [];
let pendingWindowShapeRects = [];
let pinnedEnabled = Boolean(WINDOW_CONFIG.alwaysOnTop);
let desktopShellFullscreenEnabled = false;
let desktopShellRestoreBounds = null;
let desktopShellBoundsTransitionLock = false;
let desktopShortcutRegistered = false;
let lastClickThroughToggleAt = 0;
let mainWindowRendererReadyTimer = null;
let mainWindowBootShapeLocked = true;
const externalWindowEmbedManager = createExternalWindowEmbedManager(() => mainWindow);
const aiMirrorTargetManager = createAiMirrorTargetManager();
const webContentsViewEmbedManager = createWebContentsViewEmbedManager(() => mainWindow, AI_MIRROR_TARGETS);
let everythingCliPath = null;
let desktopEmbedCleanupPromise = Promise.resolve();
let mainWindowCloseInFlight = false;
let desktopShortcutSettings = { ...DEFAULT_SHORTCUT_SETTINGS };
let startupContextCache = null;

const { startServer, stopServer, registerDesktopBridge } = require("../server");

process.on("unhandledRejection", (reason) => {
  console.error("[FreeFlow] unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[FreeFlow] uncaught exception:", error);
});

function resolveAppIconPath() {
  const candidatePaths = [path.join(app.getAppPath(), "build", "icon.ico")];
  for (const candidatePath of candidatePaths) {
    if (candidatePath && fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  return "";
}

function execFileAsync(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      windowsHide: true,
      timeout: WORD_PREVIEW_TIMEOUT_MS,
      ...options,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    child?.stdin?.end?.();
  });
}

function normalizeExecutablePath(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/^["']+|["']+$/g, "").trim();
}

function getLibreOfficeCandidates() {
  const envCandidate = normalizeExecutablePath(process.env.FREEFLOW_LIBREOFFICE_PATH || process.env.LIBREOFFICE_PATH || "");
  return [
    envCandidate,
    "soffice",
    "libreoffice",
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  ].filter(Boolean);
}

function getPdfToPngCandidates() {
  const envCandidate = normalizeExecutablePath(process.env.FREEFLOW_PDF_TO_PNG_PATH || "");
  return [
    envCandidate ? { command: envCandidate, kind: "pdftoppm" } : null,
    { command: "pdftoppm", kind: "pdftoppm" },
    { command: "mutool", kind: "mutool" },
    { command: "magick", kind: "magick" },
  ].filter(Boolean);
}

function convertDocxToPdfWithLibreOfficePackage(docxPath, outputPdfPath) {
  return new Promise((resolve) => {
    let libre = null;
    try {
      libre = require("libreoffice-convert");
    } catch {
      resolve(false);
      return;
    }
    const convert = typeof libre?.convertWithOptions === "function"
      ? libre.convertWithOptions
      : typeof libre?.convert === "function"
        ? libre.convert
        : null;
    if (typeof convert !== "function") {
      resolve(false);
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, WORD_PREVIEW_TIMEOUT_MS);
    try {
      fs.promises.readFile(docxPath).then((sourceBuffer) => {
        const done = (error, pdfBuffer) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          if (error || !pdfBuffer || !pdfBuffer.byteLength) {
            resolve(false);
            return;
          }
          fs.promises.writeFile(outputPdfPath, pdfBuffer)
            .then(() => resolve(fs.existsSync(outputPdfPath)))
            .catch(() => resolve(false));
        };
        if (convert === libre.convertWithOptions) {
          convert(sourceBuffer, "pdf", undefined, {
            fileName: path.basename(docxPath),
            sofficeBinaryPaths: getLibreOfficeCandidates(),
            execOptions: { windowsHide: true, timeout: WORD_PREVIEW_TIMEOUT_MS },
          }, done);
          return;
        }
        convert(sourceBuffer, ".pdf", undefined, done);
      }).catch(() => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(false);
      });
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    }
  });
}

async function convertDocxToPdfWithWord(docxPath, outputPdfPath) {
  if (process.platform !== "win32") {
    return false;
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$word = $null",
    "$doc = $null",
    "try {",
    "  $word = New-Object -ComObject Word.Application",
    "  $word.Visible = $false",
    "  $doc = $word.Documents.Open($args[0], $false, $true)",
    "  $doc.ExportAsFixedFormat($args[1], 17)",
    "} finally {",
    "  if ($doc -ne $null) { $doc.Close($false) | Out-Null }",
    "  if ($word -ne $null) { $word.Quit() | Out-Null }",
    "}",
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  try {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encoded,
      docxPath,
      outputPdfPath,
    ]);
    return fs.existsSync(outputPdfPath);
  } catch {
    return false;
  }
}

async function convertDocxToPdfWithLibreOffice(docxPath, outputDir) {
  for (const candidate of getLibreOfficeCandidates()) {
    try {
      await execFileAsync(candidate, [
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        outputDir,
        docxPath,
      ]);
      const pdfPath = path.join(outputDir, `${path.basename(docxPath, path.extname(docxPath))}.pdf`);
      if (fs.existsSync(pdfPath)) {
        return pdfPath;
      }
    } catch {
      // Try the next local converter candidate.
    }
  }
  return "";
}

async function convertPdfToPngImages(pdfPath, outputDir) {
  for (const candidate of getPdfToPngCandidates()) {
    try {
      if (candidate.kind === "pdftoppm") {
        const prefix = path.join(outputDir, "page");
        await execFileAsync(candidate.command, ["-png", "-r", "180", pdfPath, prefix]);
      } else if (candidate.kind === "mutool") {
        await execFileAsync(candidate.command, ["draw", "-r", "180", "-o", path.join(outputDir, "page-%d.png"), pdfPath]);
      } else if (candidate.kind === "magick") {
        await execFileAsync(candidate.command, ["-density", "180", pdfPath, "-quality", "95", path.join(outputDir, "page-%d.png")]);
      }
      const files = (await fs.promises.readdir(outputDir))
        .filter((name) => /^page[-\d]*.*\.png$/i.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (files.length) {
        const images = [];
        for (const name of files) {
          const filePath = path.join(outputDir, name);
          const buffer = await fs.promises.readFile(filePath);
          images.push({
            name,
            mime: "image/png",
            dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
          });
        }
        return images;
      }
    } catch {
      // Try the next local rasterizer candidate.
    }
  }
  return [];
}

async function buildWordPreviewImagesFromAst(ast, options = {}) {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "freeflow-word-preview-"));
  const defaultName = String(options.defaultName || "freeflow-word-preview").trim().replace(/[\\/:*?"<>|]+/g, "_") || "freeflow-word-preview";
  const docxPath = path.join(tempRoot, `${defaultName}.docx`);
  const pdfPath = path.join(tempRoot, `${defaultName}.pdf`);
  try {
    const buffer = await compileWordExportAstToDocxBuffer(ast);
    if (!buffer || !buffer.byteLength) {
      return { ok: false, code: "WORD_PREVIEW_DOCX_EMPTY", message: "Word 预览文档生成失败", images: [] };
    }
    await fs.promises.writeFile(docxPath, buffer);
    let finalPdfPath = "";
    if (await convertDocxToPdfWithLibreOfficePackage(docxPath, pdfPath)) {
      finalPdfPath = pdfPath;
    }
    if (!finalPdfPath && await convertDocxToPdfWithWord(docxPath, pdfPath)) {
      finalPdfPath = pdfPath;
    }
    if (!finalPdfPath) {
      finalPdfPath = await convertDocxToPdfWithLibreOffice(docxPath, tempRoot);
    }
    if (!finalPdfPath) {
      return {
        ok: false,
        code: "WORD_PREVIEW_PDF_CONVERTER_MISSING",
        message: "未检测到可用的 Word/LibreOffice PDF 转换能力，无法生成 1:1 预览",
        images: [],
      };
    }
    const images = await convertPdfToPngImages(finalPdfPath, tempRoot);
    if (!images.length) {
      return {
        ok: false,
        code: "WORD_PREVIEW_IMAGE_CONVERTER_MISSING",
        message: "PDF 已生成，但未检测到 pdftoppm、mutool 或 ImageMagick，无法转为预览图片",
        images: [],
      };
    }
    return {
      ok: true,
      code: "WORD_PREVIEW_OK",
      message: "Word 预览已生成",
      images,
      pageCount: images.length,
    };
  } finally {
    setTimeout(() => {
      fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }, 30000);
  }
}

async function buildWordPreviewDocxFromAst(ast) {
  const buffer = await compileWordExportAstToDocxBuffer(ast);
  if (!buffer || !buffer.byteLength) {
    return {
      ok: false,
      code: "WORD_PREVIEW_DOCX_EMPTY",
      message: "Word 预览文档生成失败",
      docxBase64: "",
      size: 0,
    };
  }
  return {
    ok: true,
    code: "WORD_PREVIEW_DOCX_OK",
    message: "Word 预览文档已生成",
    docxBase64: buffer.toString("base64"),
    size: buffer.byteLength,
  };
}

function normalizeAcceleratorToken(token = "") {
  const value = String(token || "").trim();
  if (!value) return "";
  const lower = value.toLowerCase();

  if (["cmdorctrl", "commandorcontrol", "ctrlorcmd", "controlorcommand"].includes(lower)) {
    return "CommandOrControl";
  }
  if (["ctrl", "control", "ctl"].includes(lower)) {
    return "Control";
  }
  if (["cmd", "command"].includes(lower)) {
    return "Command";
  }
  if (lower === "shift") {
    return "Shift";
  }
  if (["alt", "option"].includes(lower)) {
    return "Alt";
  }
  if (["super", "meta"].includes(lower)) {
    return "Super";
  }
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(value)) {
    return value.toUpperCase();
  }
  if (/^[a-z]$/i.test(value)) {
    return value.toUpperCase();
  }
  if (/^[0-9]$/.test(value)) {
    return value;
  }

  const namedKeys = {
    space: "Space",
    tab: "Tab",
    enter: "Enter",
    escape: "Escape",
    esc: "Escape",
    plus: "+",
  };

  return namedKeys[lower] || value;
}

function normalizeAccelerator(value = "", fallback = DEFAULT_SHORTCUT_SETTINGS.clickThroughAccelerator) {
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }

  const parts = raw
    .split("+")
    .map((item) => normalizeAcceleratorToken(item))
    .filter(Boolean);

  if (!parts.length) {
    return fallback;
  }

  const modifiers = [];
  let key = "";
  for (const part of parts) {
    if (["CommandOrControl", "Control", "Command", "Shift", "Alt", "Super"].includes(part)) {
      if (!modifiers.includes(part)) {
        modifiers.push(part);
      }
      continue;
    }
    key = part;
  }

  if (!key) {
    return fallback;
  }

  return [...modifiers, key].join("+");
}

function formatAcceleratorForDisplay(accelerator = "") {
  return normalizeAccelerator(accelerator)
    .split("+")
    .map((part) => {
      if (part === "CommandOrControl") return process.platform === "darwin" ? "Cmd" : "Ctrl";
      if (part === "Control") return "Ctrl";
      if (part === "Command") return "Cmd";
      return part;
    })
    .join("+");
}

function normalizeShortcutSettings(input = {}) {
  return {
    clickThroughAccelerator: normalizeAccelerator(input?.clickThroughAccelerator),
  };
}

function getShortcutSettingsPayload() {
  const normalized = normalizeShortcutSettings(desktopShortcutSettings);
  return {
    ...normalized,
    clickThroughDisplay: formatAcceleratorForDisplay(normalized.clickThroughAccelerator),
  };
}

function loadShortcutSettings() {
  try {
    const raw = fs.readFileSync(SHORTCUT_SETTINGS_FILE, "utf8");
    desktopShortcutSettings = normalizeShortcutSettings(JSON.parse(raw));
  } catch {
    desktopShortcutSettings = { ...DEFAULT_SHORTCUT_SETTINGS };
  }
  return getShortcutSettingsPayload();
}

async function saveShortcutSettings(input = {}) {
  desktopShortcutSettings = normalizeShortcutSettings({
    ...desktopShortcutSettings,
    ...input,
  });
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(SHORTCUT_SETTINGS_FILE, JSON.stringify(desktopShortcutSettings, null, 2), "utf8");
  if (app.isReady()) {
    registerDesktopShortcuts();
  }
  return getShortcutSettingsPayload();
}

function matchesAcceleratorInput(input, accelerator) {
  const normalized = normalizeAccelerator(accelerator);
  const parts = normalized.split("+");
  const key = String(parts.pop() || "").toLowerCase();
  const modifierSet = new Set(parts);

  const expectsCtrl = modifierSet.has("Control") || (process.platform !== "darwin" && modifierSet.has("CommandOrControl"));
  const expectsMeta = modifierSet.has("Command") || (process.platform === "darwin" && modifierSet.has("CommandOrControl"));
  const expectsShift = modifierSet.has("Shift");
  const expectsAlt = modifierSet.has("Alt");

  return (
    String(input?.key || "").toLowerCase() === key &&
    Boolean(input?.control) === expectsCtrl &&
    Boolean(input?.meta) === expectsMeta &&
    Boolean(input?.shift) === expectsShift &&
    Boolean(input?.alt) === expectsAlt
  );
}

function resolveTutorialBoardTemplatePath() {
  const candidatePaths = app.isPackaged
    ? [path.join(process.resourcesPath, "presets", "tutorial-board.json")]
    : [
        path.join(app.getAppPath(), "data", DEFAULT_TUTORIAL_BOARD_NAME),
        path.join(app.getAppPath(), "public", "assets", "presets", "tutorial-board.json"),
      ];

  for (const candidatePath of candidatePaths) {
    if (candidatePath && fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error("未找到教程画布模板文件");
}

function resolveTutorialAssetTemplatePaths() {
  const candidates = app.isPackaged
    ? {
        image: path.join(process.resourcesPath, "presets", "tutorial-assets", "tutorial-group.png"),
        file: path.join(process.resourcesPath, "presets", "tutorial-assets", "README.md"),
      }
    : {
        image: path.join(app.getAppPath(), "public", "assets", "tutorial-group.png"),
        file: path.join(app.getAppPath(), "build", "README.md"),
      };

  return {
    image: fs.existsSync(candidates.image) ? candidates.image : "",
    file: fs.existsSync(candidates.file) ? candidates.file : "",
  };
}

function getMimeFromAssetPath(filePath = "") {
  const ext = path.extname(String(filePath || "")).trim().toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".svg") return "image/svg+xml";
  return "image/png";
}

async function readTutorialAssetDataUrls(assetTargets = {}) {
  const imagePath = String(assetTargets?.image || "").trim();
  if (!imagePath) {
    return {
      image: "",
    };
  }

  try {
    const buffer = await fs.promises.readFile(imagePath);
    return {
      image: `data:${getMimeFromAssetPath(imagePath)};base64,${buffer.toString("base64")}`,
    };
  } catch {
    return {
      image: "",
    };
  }
}

function getTutorialBoardVersionMarkerPath() {
  return path.join(DATA_DIR, "tutorial-board-template-version.json");
}

async function readTutorialBoardVersionMarker() {
  try {
    const raw = await fs.promises.readFile(getTutorialBoardVersionMarkerPath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: String(parsed?.version || "").trim(),
      filePath: String(parsed?.filePath || "").trim(),
    };
  } catch {
    return {
      version: "",
      filePath: "",
    };
  }
}

async function writeTutorialBoardVersionMarker(filePath = "") {
  const payload = {
    version: TUTORIAL_BOARD_TEMPLATE_VERSION,
    filePath: String(filePath || "").trim(),
    updatedAt: Date.now(),
  };
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(getTutorialBoardVersionMarkerPath(), JSON.stringify(payload, null, 2), "utf8");
}

async function ensureTutorialAssetTargets(targetDir) {
  const templates = resolveTutorialAssetTemplatePaths();
  const imageDir = path.join(targetDir, "importImage");
  const fileDir = path.join(targetDir, TUTORIAL_ASSET_DIR_NAME);
  const imageTargetPath = path.join(imageDir, "tutorial-group.png");
  const fileTargetPath = path.join(fileDir, "README.md");

  if (templates.image) {
    await fs.promises.mkdir(imageDir, { recursive: true });
    await fs.promises.copyFile(templates.image, imageTargetPath).catch(() => {});
  }

  if (templates.file) {
    await fs.promises.mkdir(fileDir, { recursive: true });
    await fs.promises.copyFile(templates.file, fileTargetPath).catch(() => {});
  }

  return {
    image: templates.image ? imageTargetPath : "",
    file: templates.file ? fileTargetPath : "",
  };
}

async function rewriteTutorialBoardAssetPaths(boardPath, assetTargets = {}) {
  const targetPath = String(boardPath || "").trim();
  if (!targetPath) {
    return;
  }

  let raw = "";
  try {
    raw = await fs.promises.readFile(targetPath, "utf8");
  } catch {
    return;
  }

  let changed = false;
  let board = null;
  try {
    board = JSON.parse(raw);
  } catch {
    return;
  }
  const assetDataUrls = await readTutorialAssetDataUrls(assetTargets);

  const items = Array.isArray(board?.items) ? board.items : [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    if (item.type === "image" && assetTargets.image) {
      const itemName = String(item.name || "").trim().toLowerCase();
      const sourceBaseName = path.basename(String(item.sourcePath || "")).trim().toLowerCase();
      const shouldRewriteTutorialImage =
        itemName === "tutorial-group.png" ||
        itemName === "group (3).png" ||
        sourceBaseName === "tutorial-group.png" ||
        sourceBaseName.startsWith("group (3).png-");

      if (shouldRewriteTutorialImage) {
        if (item.name !== "tutorial-group.png") {
          item.name = "tutorial-group.png";
          changed = true;
        }
        if (item.source !== "blob") {
          item.source = "blob";
          changed = true;
        }
        if (item.sourcePath) {
          item.sourcePath = "";
          changed = true;
        }
        if (item.fileId) {
          item.fileId = "";
          changed = true;
        }
        if (assetDataUrls.image && item.dataUrl !== assetDataUrls.image) {
          item.dataUrl = assetDataUrls.image;
          changed = true;
        }
      }
    }

    if (item.type === "fileCard" && String(item.fileName || item.name || "").trim().toLowerCase() === "readme.md" && assetTargets.file) {
      if (item.sourcePath !== assetTargets.file) {
        item.sourcePath = assetTargets.file;
        changed = true;
      }
      if (item.fileId) {
        item.fileId = "";
        changed = true;
      }
    }
  }

  if (!changed) {
    return;
  }

  await fs.promises.writeFile(targetPath, JSON.stringify(board, null, 2), "utf8");
}

async function ensureTutorialBoardFile() {
  const templatePath = resolveTutorialBoardTemplatePath();
  const targetDir = CANVAS_BOARD_DIR;
  const targetPath = path.join(targetDir, DEFAULT_TUTORIAL_BOARD_NAME);
  let created = false;
  let updated = false;

  await fs.promises.mkdir(targetDir, { recursive: true });
  const marker = await readTutorialBoardVersionMarker();
  const tutorialBoardExists = fs.existsSync(targetPath);
  const shouldRefreshTutorialBoard = !tutorialBoardExists || marker.version !== TUTORIAL_BOARD_TEMPLATE_VERSION;

  if (shouldRefreshTutorialBoard) {
    created = !tutorialBoardExists;
    updated = tutorialBoardExists;
    await fs.promises.copyFile(templatePath, targetPath);
  }

  const assetTargets = await ensureTutorialAssetTargets(targetDir);
  await rewriteTutorialBoardAssetPaths(targetPath, assetTargets);
  await writeTutorialBoardVersionMarker(targetPath);

  return {
    ok: true,
    templatePath,
    filePath: targetPath,
    created,
    updated,
    version: TUTORIAL_BOARD_TEMPLATE_VERSION,
  };
}

async function ensureDesktopStartupContext({ force = false } = {}) {
  if (!force && startupContextCache?.ok) {
    return startupContextCache;
  }
  startupContextCache = await ensureAppStartupState({
    ensureTutorialBoardFile,
  });
  return startupContextCache;
}

function normalizeShapeRects(rects) {
  if (!Array.isArray(rects)) {
    return [];
  }

  return rects
    .map((rect) => ({
      x: Math.max(0, Math.floor(Number(rect?.x) || 0)),
      y: Math.max(0, Math.floor(Number(rect?.y) || 0)),
      width: Math.max(0, Math.ceil(Number(rect?.width) || 0)),
      height: Math.max(0, Math.ceil(Number(rect?.height) || 0)),
    }))
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

function resolveEverythingCli() {
  if (everythingCliPath) {
    return Promise.resolve(everythingCliPath);
  }
  const envPath = String(process.env.EVERYTHING_CLI || "").trim();
  if (envPath && fs.existsSync(envPath)) {
    everythingCliPath = envPath;
    return Promise.resolve(everythingCliPath);
  }
  return new Promise((resolve) => {
    execFile("where", ["es.exe"], { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }
      const line = String(stdout || "")
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)[0];
      if (line && fs.existsSync(line)) {
        everythingCliPath = line;
        resolve(everythingCliPath);
        return;
      }
      resolve("");
    });
  });
}

function getFileIdForPath(targetPath = "") {
  return new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("Unsupported platform"));
      return;
    }
    const normalizedPath = String(targetPath || "").trim();
    if (!normalizedPath) {
      reject(new Error("Path is required"));
      return;
    }
    execFile("fsutil", ["file", "queryfileid", normalizedPath], { windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      const output = String(stdout || "").trim();
      const match = output.match(/0x[0-9a-fA-F]+/);
      if (match && match[0]) {
        resolve(match[0]);
        return;
      }
      const parts = output.split(/\s+/);
      resolve(parts[parts.length - 1] || "");
    });
  });
}

async function findPathByFileId(fileId = "") {
  if (process.platform !== "win32") {
    return "";
  }
  const cleanId = String(fileId || "").trim();
  if (!cleanId) {
    return "";
  }
  const cliPath = await resolveEverythingCli();
  if (!cliPath) {
    return "";
  }
  return new Promise((resolve) => {
    execFile(cliPath, ["-n", "1", `fileid:${cleanId}`], { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }
      const firstLine = String(stdout || "")
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)[0];
      resolve(firstLine || "");
    });
  });
}

function applyWindowShape(rects = windowShapeRects) {
  if (!mainWindow || mainWindow.isDestroyed() || typeof mainWindow.setShape !== "function") {
    return;
  }

  const nextRects = normalizeShapeRects(rects);
  windowShapeRects = nextRects;

  if (mainWindowBootShapeLocked) {
    pendingWindowShapeRects = nextRects;
    const [width, height] = mainWindow.getContentSize();
    mainWindow.setShape([{ x: 0, y: 0, width, height }]);
    return;
  }

  if (!windowShapeRects.length) {
    const [width, height] = mainWindow.getContentSize();
    mainWindow.setShape([{ x: 0, y: 0, width, height }]);
    return;
  }

  mainWindow.setShape(windowShapeRects);
}

function getDefaultWindowBoundsForDisplay(display = screen.getPrimaryDisplay()) {
  const workArea = display?.workArea || { x: 0, y: 0, width: WINDOW_CONFIG.width, height: WINDOW_CONFIG.height };
  const width = Math.max(WINDOW_CONFIG.minWidth, Math.min(WINDOW_CONFIG.width, workArea.width));
  const height = Math.max(WINDOW_CONFIG.minHeight, Math.min(WINDOW_CONFIG.height, workArea.height));
  const x = Math.round(workArea.x + Math.max(0, (workArea.width - width) / 2));
  const y = Math.round(workArea.y + Math.max(0, (workArea.height - height) / 2));
  return { x, y, width, height };
}

function getStartupWindowOptions() {
  const display = screen.getPrimaryDisplay();
  const defaultBounds = getDefaultWindowBoundsForDisplay(display);
  const shouldLaunchFullscreen = Boolean(
    startupContextCache?.workbenchPreferences?.defaultLaunchFullscreen ??
    startupContextCache?.uiSettings?.defaultLaunchFullscreen
  );
  if (!shouldLaunchFullscreen) {
    desktopShellFullscreenEnabled = false;
    desktopShellRestoreBounds = null;
    return defaultBounds;
  }

  const workArea = display?.workArea || defaultBounds;
  desktopShellFullscreenEnabled = true;
  desktopShellRestoreBounds = defaultBounds;
  return {
    ...defaultBounds,
    x: Math.round(Number(workArea.x) || 0),
    y: Math.round(Number(workArea.y) || 0),
    width: Math.max(WINDOW_CONFIG.minWidth, Math.round(Number(workArea.width) || defaultBounds.width)),
    height: Math.max(WINDOW_CONFIG.minHeight, Math.round(Number(workArea.height) || defaultBounds.height)),
  };
}

function normalizeWindowBounds(bounds) {
  if (!bounds) return null;
  return {
    x: Math.round(Number(bounds.x) || 0),
    y: Math.round(Number(bounds.y) || 0),
    width: Math.max(WINDOW_CONFIG.minWidth, Math.round(Number(bounds.width) || WINDOW_CONFIG.width)),
    height: Math.max(WINDOW_CONFIG.minHeight, Math.round(Number(bounds.height) || WINDOW_CONFIG.height)),
  };
}

function getDesktopShellState() {
  const fullscreen = Boolean(
    desktopShellFullscreenEnabled ||
    mainWindow?.isFullScreen?.() ||
    mainWindow?.isMaximized?.()
  );
  return {
    isDesktop: true,
    pinned: pinnedEnabled,
    fullscreen,
    clickThrough: clickThroughEnabled,
    externalWindowEmbed: externalWindowEmbedManager.getState(),
    webContentsViewEmbed: webContentsViewEmbedManager.getState(),
  };
}

function broadcastDesktopShellState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("desktop-shell:state-changed", getDesktopShellState());
}

function cleanupDesktopEmbeddedSurfaces(reason = "unknown") {
  desktopEmbedCleanupPromise = desktopEmbedCleanupPromise
    .catch(() => {})
    .then(async () => {
      try {
        externalWindowEmbedManager.setEmbeddedWindowVisibility(false);
      } catch {
        // Ignore visibility cleanup failures during shutdown.
      }

      try {
        externalWindowEmbedManager.clearEmbeddedWindow({ reason, restoreVisible: false });
      } catch {
        // Ignore native cleanup failures during shutdown.
      }

      try {
        webContentsViewEmbedManager.setVisibility(false);
      } catch {
        // Ignore view visibility cleanup failures during shutdown.
      }

      try {
        webContentsViewEmbedManager.clearTarget();
      } catch {
        // Ignore view destroy failures during shutdown.
      }

      await aiMirrorTargetManager.dispose().catch(() => {});
    });

  return desktopEmbedCleanupPromise;
}

function applyClickThrough(enabled) {
  const nextEnabled = Boolean(enabled);
  clickThroughEnabled = nextEnabled;

  try {
    externalWindowEmbedManager.setEmbeddedWindowMinimized(nextEnabled);
  } catch (error) {
    console.warn(`Failed to sync embedded window minimized state: ${error.message}`);
  }

  try {
    webContentsViewEmbedManager.setVisibility(!nextEnabled);
  } catch (error) {
    console.warn(`Failed to sync WebContentsView visibility state: ${error.message}`);
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return clickThroughEnabled;
  }

  mainWindow.setIgnoreMouseEvents(clickThroughEnabled, { forward: true });

  if (!clickThroughEnabled) {
    applyWindowShape();
    mainWindow.focus();
    try {
      webContentsViewEmbedManager.focusTarget();
    } catch {
      // Ignore view focus restoration failures.
    }
  }

  broadcastDesktopShellState();

  return clickThroughEnabled;
}

function toggleClickThrough() {
  const now = Date.now();
  if (now - lastClickThroughToggleAt < 250) {
    return clickThroughEnabled;
  }
  lastClickThroughToggleAt = now;
  return applyClickThrough(!clickThroughEnabled);
}

function applyPinnedState(enabled) {
  pinnedEnabled = Boolean(enabled);

  if (!mainWindow || mainWindow.isDestroyed()) {
    return pinnedEnabled;
  }

  if (pinnedEnabled) {
    mainWindow.setAlwaysOnTop(true, PIN_LEVEL, PIN_RELATIVE_LEVEL);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.moveTop();
  } else {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setVisibleOnAllWorkspaces(false);
  }

  broadcastDesktopShellState();
  return pinnedEnabled;
}

function reinforcePinnedState() {
  if (!pinnedEnabled || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.setAlwaysOnTop(true, PIN_LEVEL, PIN_RELATIVE_LEVEL);
  mainWindow.moveTop();
}

function syncDesktopShellExpandedStateFromWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    desktopShellFullscreenEnabled = false;
    return;
  }

  const isNativeFullscreen = Boolean(mainWindow.isFullScreen?.());
  const isNativeMaximized = Boolean(mainWindow.isMaximized?.());
  if (isNativeFullscreen || isNativeMaximized) {
    desktopShellFullscreenEnabled = true;
    return;
  }
}

function captureDesktopShellRestoreBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (
    desktopShellBoundsTransitionLock ||
    desktopShellFullscreenEnabled ||
    mainWindow.isFullScreen?.() ||
    mainWindow.isMaximized?.()
  ) {
    return;
  }
  desktopShellRestoreBounds = normalizeWindowBounds(mainWindow.getBounds());
}

function expandMainWindowToDesktopWorkspace() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  if (!desktopShellRestoreBounds) {
    desktopShellRestoreBounds = normalizeWindowBounds(mainWindow.getBounds());
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (mainWindow.isFullScreen?.()) {
    mainWindow.setFullScreen(false);
  }

  if (mainWindow.isMaximized?.()) {
    mainWindow.unmaximize();
  }

  const display = screen.getDisplayMatching(mainWindow.getBounds());
  const nextBounds = display?.workArea ? { ...display.workArea } : getDefaultWindowBoundsForDisplay(display);
  desktopShellFullscreenEnabled = true;
  desktopShellBoundsTransitionLock = true;
  mainWindow.setBounds(nextBounds, true);
  setTimeout(() => {
    desktopShellBoundsTransitionLock = false;
  }, 80);
  reinforcePinnedState();
  broadcastDesktopShellState();
  return true;
}

function restoreMainWindowFromDesktopWorkspace() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (mainWindow.isFullScreen?.()) {
    mainWindow.setFullScreen(false);
  }

  if (mainWindow.isMaximized?.()) {
    mainWindow.unmaximize();
  }

  const display = screen.getDisplayMatching(mainWindow.getBounds());
  const nextBounds =
    normalizeWindowBounds(desktopShellRestoreBounds) ||
    getDefaultWindowBoundsForDisplay(display);
  desktopShellRestoreBounds = null;
  desktopShellFullscreenEnabled = false;
  desktopShellBoundsTransitionLock = true;
  mainWindow.setBounds(nextBounds, true);
  setTimeout(() => {
    desktopShellBoundsTransitionLock = false;
  }, 80);
  reinforcePinnedState();
  broadcastDesktopShellState();
  return true;
}

function registerDesktopShortcuts() {
  globalShortcut.unregisterAll();

  const accelerators = [normalizeAccelerator(desktopShortcutSettings.clickThroughAccelerator)];
  let registered = false;
  for (const accelerator of accelerators) {
    const ok = globalShortcut.register(accelerator, () => {
      toggleClickThrough();
    });
    registered = registered || ok;
    if (!ok) {
      console.warn(`[desktop-shell] Failed to register global shortcut: ${accelerator}`);
    }
  }

  if (registered) {
    console.log(`[desktop-shell] Global shortcut ready: ${formatAcceleratorForDisplay(accelerators[0])}`);
  } else {
    console.warn("[desktop-shell] Global shortcut unavailable, using window-level fallback only");
  }

  desktopShortcutRegistered = registered;
}

function registerWindowShortcutFallback(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.on("before-input-event", (event, input) => {
    if (desktopShortcutRegistered || input?.type !== "keyDown") {
      return;
    }
    if (matchesAcceleratorInput(input, desktopShortcutSettings.clickThroughAccelerator)) {
      event.preventDefault();
      toggleClickThrough();
    }
  });
}

function tryShowMainWindow(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  if (!window.__freeflowReadyToShow || !window.__freeflowRendererReady) {
    return;
  }

  if (!window.isVisible()) {
    window.show();
  }
}

function registerDisplayMediaHandler() {
  const defaultSession = session.defaultSession;
  if (!defaultSession?.setDisplayMediaRequestHandler || !desktopCapturer) {
    return;
  }

  defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 0, height: 0 },
          fetchWindowIcons: false,
        });
        const primaryDisplayId = String(screen.getPrimaryDisplay()?.id || "");
        const preferredSource =
          sources.find((source) => String(source.display_id || "") === primaryDisplayId) || sources[0];

        callback({
          video: preferredSource,
          audio: false,
        });
      } catch (error) {
        console.error("Failed to acquire desktop capture source:", error);
        callback({ audio: false });
      }
    },
    {
      useSystemPicker: false,
    }
  );
}

async function getCaptureSourcesPayload() {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 0, height: 0 },
    fetchWindowIcons: false,
  });
  return {
    ok: true,
    sources: sources
      .map((source) => {
        const id = String(source.id || "").trim();
        const name = String(source.name || "").trim();
        const displayId = String(source.display_id || "").trim();
        const kind = id.startsWith("window:") ? "window" : "screen";
        if (!id || !name) {
          return null;
        }
        if (name === "AI_Worker Desktop" || name === "FreeFlow Desktop") {
          return null;
        }
        return {
          id,
          name,
          kind,
          displayId,
          label: kind === "screen" ? `桌面 · ${name}` : `窗口 · ${name}`,
          embedCapable: kind === "window" && externalWindowEmbedManager.isSupported(),
        };
      })
      .filter(Boolean),
  };
}

function createMainWindow() {
  const appIconPath = resolveAppIconPath();
  const startupBounds = getStartupWindowOptions();
  const window = new BrowserWindow({
    x: startupBounds.x,
    y: startupBounds.y,
    width: startupBounds.width,
    height: startupBounds.height,
    minWidth: WINDOW_CONFIG.minWidth,
    minHeight: WINDOW_CONFIG.minHeight,
    transparent: WINDOW_CONFIG.transparent,
    frame: WINDOW_CONFIG.frame,
    hasShadow: WINDOW_CONFIG.hasShadow,
    autoHideMenuBar: WINDOW_CONFIG.autoHideMenuBar,
    backgroundColor: WINDOW_CONFIG.backgroundColor,
    show: false,
    title: `${PRODUCT_NAME} Desktop`,
    icon: appIconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  registerWindowShortcutFallback(window);
  window.__freeflowReadyToShow = false;
  window.__freeflowRendererReady = false;
  mainWindowBootShapeLocked = true;
  pendingWindowShapeRects = [];

  window.setAlwaysOnTop(WINDOW_CONFIG.alwaysOnTop, PIN_LEVEL, PIN_RELATIVE_LEVEL);
  window.setSkipTaskbar(WINDOW_CONFIG.skipTaskbar);
  window.removeMenu();

  window.once("ready-to-show", () => {
    window.__freeflowReadyToShow = true;
    tryShowMainWindow(window);
  });

  mainWindowRendererReadyTimer = setTimeout(() => {
    if (!window.isDestroyed()) {
      window.__freeflowRendererReady = true;
      tryShowMainWindow(window);
    }
  }, 4000);

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const source = String(sourceId || "").trim() || "renderer";
    console.log(`[renderer:${level}] ${source}:${line} ${message}`);
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error(
      `[renderer:did-fail-load] code=${errorCode} mainFrame=${Boolean(isMainFrame)} url=${validatedURL || ""} error=${errorDescription || ""}`
    );
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[renderer:gone] reason=${details?.reason || "unknown"} exitCode=${details?.exitCode ?? ""}`);
  });

  window.on("close", (event) => {
    if (mainWindowCloseInFlight) {
      return;
    }

    mainWindowCloseInFlight = true;
    event.preventDefault();

    try {
      externalWindowEmbedManager.setEmbeddedWindowVisibility(false);
    } catch {
      // Ignore immediate hide failures and continue cleanup.
    }

    try {
      externalWindowEmbedManager.clearEmbeddedWindow({
        reason: "main-window-close",
        restoreVisible: false,
      });
    } catch {
      // Ignore immediate native cleanup failures and continue cleanup.
    }

    try {
      webContentsViewEmbedManager.setVisibility(false);
    } catch {
      // Ignore immediate view hide failures and continue cleanup.
    }

    try {
      webContentsViewEmbedManager.clearTarget();
    } catch {
      // Ignore immediate view cleanup failures and continue cleanup.
    }

    cleanupDesktopEmbeddedSurfaces("main-window-close")
      .catch(() => {})
      .finally(() => {
        if (window.isDestroyed()) {
          return;
        }
        window.destroy();
      });
  });

  window.on("closed", () => {
    mainWindowCloseInFlight = false;
    cleanupDesktopEmbeddedSurfaces("main-window-closed");
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.on("blur", () => {
    reinforcePinnedState();
  });

  window.on("focus", () => {
    reinforcePinnedState();
  });

  window.on("show", () => {
    reinforcePinnedState();
  });

  window.on("restore", () => {
    reinforcePinnedState();
    syncDesktopShellExpandedStateFromWindow();
    captureDesktopShellRestoreBounds();
    broadcastDesktopShellState();
  });

  window.on("maximize", () => {
    reinforcePinnedState();
    syncDesktopShellExpandedStateFromWindow();
    broadcastDesktopShellState();
  });

  window.on("unmaximize", () => {
    reinforcePinnedState();
    if (!window.isFullScreen()) {
      desktopShellFullscreenEnabled = false;
    }
    broadcastDesktopShellState();
  });

  window.on("leave-full-screen", () => {
    reinforcePinnedState();
    if (!window.isMaximized()) {
      desktopShellFullscreenEnabled = false;
    }
    broadcastDesktopShellState();
  });

  window.on("enter-full-screen", () => {
    reinforcePinnedState();
    syncDesktopShellExpandedStateFromWindow();
    broadcastDesktopShellState();
  });

  window.on("resize", () => {
    captureDesktopShellRestoreBounds();
    broadcastDesktopShellState();
  });

  window.on("move", () => {
    captureDesktopShellRestoreBounds();
  });

  window.on("closed", () => {
    if (mainWindowRendererReadyTimer) {
      clearTimeout(mainWindowRendererReadyTimer);
      mainWindowRendererReadyTimer = null;
    }
  });

  return window;
}

function copyFilesToClipboard(paths = []) {
  const entries = Array.isArray(paths)
    ? [...new Set(paths.map((item) => path.resolve(String(item || "").trim())).filter(Boolean))]
    : [];

  const existingEntries = entries.filter((item) => fs.existsSync(item));
  if (!existingEntries.length) {
    throw new Error("没有可写入剪贴板的有效文件路径");
  }

  return new Promise((resolve, reject) => {
    const command = `
$paths = @(
${existingEntries.map((item) => `'${item.replace(/'/g, "''")}'`).join(",\n")}
)
Set-Clipboard -LiteralPath $paths
`;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message || "复制文件到系统剪贴板失败"));
          return;
        }
        resolve({
          ok: true,
          count: existingEntries.length,
          paths: existingEntries,
        });
      }
    );
  });
}

function createTransparentDragIcon() {
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAj3G1lwAAAABJRU5ErkJggg==";
  return nativeImage.createFromDataURL(`data:image/png;base64,${pngBase64}`);
}

function startFileDrag(event, paths = []) {
  const entries = Array.isArray(paths)
    ? [...new Set(paths.map((item) => path.resolve(String(item || "").trim())).filter(Boolean))]
    : [];

  const existingEntries = entries.filter((item) => fs.existsSync(item));
  if (!existingEntries.length) {
    throw new Error("没有可拖拽的有效文件路径");
  }
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow) {
    throw new Error("无法获取拖拽窗口");
  }
  senderWindow.webContents.startDrag({
    files: existingEntries,
    icon: createTransparentDragIcon(),
  });
  return {
    ok: true,
    count: existingEntries.length,
    paths: existingEntries,
  };
}

function ensureTempDragDir() {
  fs.mkdirSync(TEMP_DRAG_DIR, { recursive: true });
  return TEMP_DRAG_DIR;
}

function normalizeFileName(name, fallback) {
  const raw = String(name || "").trim() || fallback;
  return raw.replace(/[\\/:*?"<>|]+/g, "_");
}

function getExtensionFromMime(mime = "") {
  const type = String(mime || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("bmp")) return "bmp";
  if (type.includes("svg")) return "svg";
  return "png";
}

function getMimeFromExtension(targetPath = "") {
  const ext = path.extname(String(targetPath || "").trim()).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function readClipboardFiles() {
  return new Promise((resolve) => {
    const command = `
try {
  $items = Get-Clipboard -Format FileDropList -ErrorAction Stop | ForEach-Object {
    if ($_ -is [string]) { $_ } elseif ($_.PSObject.Properties.Match('FullName').Count -gt 0) { $_.FullName } else { $_.ToString() }
  }
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  @{ ok = $true; paths = @($items) } | ConvertTo-Json -Compress
} catch {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  @{ ok = $true; paths = @() } | ConvertTo-Json -Compress
}
`;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve({
            ok: false,
            error: error.message || "Failed to read file paths from clipboard",
            paths: [],
            count: 0,
          });
          return;
        }

        try {
          const payload = JSON.parse(String(stdout || "").trim() || "{}");
          const paths = Array.isArray(payload?.paths)
            ? payload.paths.map((item) => String(item || "").trim()).filter(Boolean)
            : [];
          resolve({
            ok: true,
            paths,
            count: paths.length,
          });
        } catch (parseError) {
          resolve({
            ok: false,
            error: parseError.message || "Failed to parse clipboard file list",
            paths: [],
            count: 0,
          });
        }
      }
    );
  });
}

function getClipboardImageDataUrl() {
  try {
    const image = clipboard.readImage();
    if (!image || image.isEmpty()) {
      return "";
    }
    return image.toDataURL();
  } catch {
    return "";
  }
}

function triggerSystemScreenshot() {
  if (process.platform === "darwin") {
    execFile("screencapture", ["-i"], { windowsHide: true }, () => {});
    return;
  }
  if (process.platform === "win32") {
    execFile("explorer.exe", ["ms-screenclip:"], { windowsHide: true }, () => {});
    return;
  }
  execFile("gnome-screenshot", ["-a"], { windowsHide: true }, () => {});
}

function waitForClipboardImageChange(previous, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const current = getClipboardImageDataUrl();
      if (current && current !== previous) {
        clearInterval(timer);
        resolve(current);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        resolve("");
      }
    }, 320);
  });
}

async function captureScreenImageFromSystem() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: "窗口未就绪" };
  }
  const previous = getClipboardImageDataUrl();
  try {
    mainWindow.hide();
    mainWindow.setSkipTaskbar(true);
  } catch {
    // Ignore hide errors.
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
  try {
    triggerSystemScreenshot();
  } catch (error) {
    try {
      mainWindow.show();
      mainWindow.setSkipTaskbar(false);
    } catch {
      // Ignore restore errors.
    }
    return { ok: false, error: error.message || "无法启动系统截图" };
  }
  const dataUrl = await waitForClipboardImageChange(previous, 60000);
  try {
    mainWindow.show();
    mainWindow.setSkipTaskbar(false);
    mainWindow.focus();
  } catch {
    // Ignore restore errors.
  }
  if (!dataUrl) {
    return { ok: false, error: "未获取到截图内容" };
  }
  return { ok: true, dataUrl };
}

async function bootstrapDesktopApp() {
  registerDesktopBridge({
    chatWithDoubao,
    cancelDoubaoChat,
  });
  registerDisplayMediaHandler();
  await ensureDesktopStartupContext({ force: true }).catch((error) => {
    console.warn(`[desktop-shell] Failed to initialize startup context: ${error.message}`);
  });
  await startServer(SERVER_PORT);
  await session.defaultSession?.clearCache().catch(() => {});
  mainWindow = createMainWindow();
  await mainWindow.loadURL(APP_URL);
}

ipcMain.handle("desktop-shell:get-state", () => ({
  ...getDesktopShellState(),
}));

ipcMain.on("desktop-shell:renderer-ready", (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return;
  }

  if (mainWindowRendererReadyTimer) {
    clearTimeout(mainWindowRendererReadyTimer);
    mainWindowRendererReadyTimer = null;
  }

  mainWindow.__freeflowRendererReady = true;
  tryShowMainWindow(mainWindow);
});

ipcMain.handle("desktop-shell:release-boot-shape-lock", (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return getDesktopShellState();
  }

  mainWindowBootShapeLocked = false;
  const nextRects = pendingWindowShapeRects.length ? pendingWindowShapeRects : windowShapeRects;
  applyWindowShape(nextRects);
  return getDesktopShellState();
});

ipcMain.handle("desktop-shell:read-clipboard-text", () => {
  try {
    return {
      ok: true,
      text: clipboard.readText(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to read clipboard",
      text: "",
    };
  }
});

ipcMain.handle("desktop-shell:get-capture-sources", async () => {
  try {
    return await getCaptureSourcesPayload();
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to get capture sources",
      sources: [],
    };
  }
});

ipcMain.handle("desktop-shell:capture-screen-image", async () => {
  try {
    return await captureScreenImageFromSystem();
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to capture screen",
    };
  }
});

ipcMain.handle("desktop-shell:list-ai-mirror-targets", async () => {
  try {
    return aiMirrorTargetManager.listTargets();
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to list AI mirror targets",
      targets: [],
    };
  }
});

ipcMain.handle("desktop-shell:prepare-ai-mirror-target", async (_event, payload) => {
  try {
    return await aiMirrorTargetManager.prepareTarget(payload || {});
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to prepare AI mirror target",
    };
  }
});

ipcMain.handle("desktop-shell:stop-ai-mirror-target", async (_event, payload) => {
  try {
    return await aiMirrorTargetManager.stopTarget(payload || {});
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to stop AI mirror target",
    };
  }
});

ipcMain.handle("desktop-shell:embed-external-window", (_event, payload) => {
  try {
    return externalWindowEmbedManager.embedExternalWindow(payload || {});
  } catch (error) {
    return {
      ok: false,
      active: false,
      error: error.message || "Failed to embed external window",
    };
  }
});

ipcMain.handle("desktop-shell:sync-external-window-bounds", (_event, payload) => {
  try {
    return externalWindowEmbedManager.syncEmbeddedWindowBounds(payload || {});
  } catch (error) {
    return {
      ok: false,
      active: false,
      error: error.message || "Failed to sync embedded window bounds",
    };
  }
});

ipcMain.handle("desktop-shell:set-external-window-visibility", (_event, visible) => {
  try {
    return externalWindowEmbedManager.setEmbeddedWindowVisibility(visible);
  } catch (error) {
    return {
      ok: false,
      active: false,
      error: error.message || "Failed to set embedded window visibility",
    };
  }
});

ipcMain.handle("desktop-shell:clear-external-window", (_event, payload) => {
  return externalWindowEmbedManager.clearEmbeddedWindow({
    reason: "renderer-request",
    ...(payload || {}),
  });
});

ipcMain.handle("desktop-shell:focus-embedded-window", (_event, payload) => {
  try {
    return externalWindowEmbedManager.focusEmbeddedWindow(payload || {});
  } catch (error) {
    return {
      ok: false,
      active: false,
      error: error.message || "Failed to focus embedded window",
    };
  }
});

ipcMain.handle("desktop-shell:attach-ai-mirror-webcontents-view", async (_event, payload) => {
  try {
    return await webContentsViewEmbedManager.attachTarget(payload || {});
  } catch (error) {
    return {
      ok: false,
      active: false,
      error: error.message || "Failed to attach AI mirror WebContentsView",
    };
  }
});

ipcMain.handle("desktop-shell:sync-ai-mirror-webcontents-view-bounds", (_event, payload) => {
  try {
    return webContentsViewEmbedManager.syncBounds(payload || {});
  } catch (error) {
    return {
      ok: false,
      active: false,
      error: error.message || "Failed to sync AI mirror WebContentsView bounds",
    };
  }
});

ipcMain.handle("desktop-shell:set-ai-mirror-webcontents-view-visibility", (_event, visible) => {
  try {
    return webContentsViewEmbedManager.setVisibility(visible);
  } catch (error) {
    return {
      ok: false,
      active: false,
      error: error.message || "Failed to set AI mirror WebContentsView visibility",
    };
  }
});

ipcMain.handle("desktop-shell:clear-ai-mirror-webcontents-view", () => {
  try {
    return webContentsViewEmbedManager.clearTarget();
  } catch (error) {
    return {
      ok: false,
      active: false,
      error: error.message || "Failed to clear AI mirror WebContentsView",
    };
  }
});

ipcMain.handle("desktop-shell:focus-ai-mirror-webcontents-view", () => {
  try {
    return webContentsViewEmbedManager.focusTarget();
  } catch (error) {
    return {
      ok: false,
      active: false,
      error: error.message || "Failed to focus AI mirror WebContentsView",
    };
  }
});

ipcMain.handle("desktop-shell:copy-files-to-clipboard", async (_event, paths) => {
  try {
    return await copyFilesToClipboard(paths);
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to copy files to clipboard",
      count: 0,
      paths: [],
    };
  }
});

ipcMain.handle("desktop-shell:get-file-id", async (_event, targetPath) => {
  try {
    const fileId = await getFileIdForPath(targetPath);
    return { ok: Boolean(fileId), fileId };
  } catch (error) {
    return {
      ok: false,
      fileId: "",
      error: error.message || "Failed to get file id",
    };
  }
});

ipcMain.handle("desktop-shell:find-path-by-file-id", async (_event, fileId) => {
  try {
    const pathValue = await findPathByFileId(fileId);
    return { ok: Boolean(pathValue), path: pathValue };
  } catch (error) {
    return {
      ok: false,
      path: "",
      error: error.message || "Failed to find path by file id",
    };
  }
});

ipcMain.handle("desktop-shell:path-exists", async (_event, targetPath) => {
  const normalizedPath = String(targetPath || "").trim();
  if (!normalizedPath) {
    return false;
  }
  try {
    await fs.promises.access(normalizedPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("desktop-shell:ensure-tutorial-board", async () => {
  try {
    return await ensureTutorialBoardFile();
  } catch (error) {
    return {
      ok: false,
      templatePath: "",
      filePath: "",
      created: false,
      error: error.message || "创建教程画布失败",
    };
  }
});

ipcMain.handle("desktop-shell:get-startup-context", async () => {
  try {
    return await ensureDesktopStartupContext();
  } catch (error) {
    return {
      ok: false,
      error: error.message || "初始化启动上下文失败",
    };
  }
});

ipcMain.handle("desktop-shell:start-file-drag", async (event, paths) => {
  try {
    return startFileDrag(event, paths);
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to start file drag",
      count: 0,
      paths: [],
    };
  }
});

ipcMain.handle("desktop-shell:start-export-drag", async (event, payload) => {
  try {
    const target = payload || {};
    const rawPaths = Array.isArray(target.paths) ? target.paths : [];
    const texts = Array.isArray(target.texts) ? target.texts : [];
    const images = Array.isArray(target.images) ? target.images : [];
    const tempDir = ensureTempDragDir();
    const created = [];

    for (const entry of texts) {
      const name = normalizeFileName(entry?.name, "Text");
      const filename = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`;
      const fullPath = path.join(tempDir, filename);
      await fs.promises.writeFile(fullPath, String(entry?.content || ""), "utf8");
      created.push(fullPath);
    }

    for (const entry of images) {
      const mime = String(entry?.mime || "image/png");
      const ext = getExtensionFromMime(mime);
      const name = normalizeFileName(entry?.name, "Image");
      const filename = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const fullPath = path.join(tempDir, filename);
      const data = String(entry?.data || "");
      if (!data) {
        continue;
      }
      const buffer = Buffer.from(data, "base64");
      await fs.promises.writeFile(fullPath, buffer);
      created.push(fullPath);
    }

    const allPaths = [...new Set([...rawPaths, ...created])];
    if (!allPaths.length) {
      throw new Error("没有可拖拽的内容");
    }
    return startFileDrag(event, allPaths);
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to start export drag",
      count: 0,
      paths: [],
    };
  }
});

ipcMain.handle("desktop-shell:open-path", async (_event, targetPath) => {
  const normalizedPath = String(targetPath || "").trim();
  if (!normalizedPath) {
    return {
      ok: false,
      error: "路径不能为空",
    };
  }

  try {
    const errorMessage = await shell.openPath(normalizedPath);
    return {
      ok: !errorMessage,
      error: errorMessage || "",
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "打开路径失败",
    };
  }
});

ipcMain.handle("desktop-shell:reveal-path", async (_event, targetPath) => {
  const normalizedPath = String(targetPath || "").trim();
  if (!normalizedPath) {
    return {
      ok: false,
      error: "路径不能为空",
    };
  }

  try {
    shell.showItemInFolder(normalizedPath);
    return {
      ok: true,
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "定位路径失败",
    };
  }
});

ipcMain.handle("desktop-shell:pick-canvas-board-path", async (_event, payload) => {
  const defaultPath = String(payload?.defaultPath || "").trim();
  const result = await dialog.showSaveDialog(mainWindow || undefined, {
    title: "选择画布保存文件",
    buttonLabel: "选择此位置",
    defaultPath: defaultPath || path.join(CANVAS_BOARD_DIR, "canvas-board.json"),
    filters: [
      { name: "JSON 文件", extensions: ["json"] },
      { name: "所有文件", extensions: ["*"] },
    ],
    properties: ["showOverwriteConfirmation"],
  });

  return {
    canceled: result.canceled,
    filePath: result.filePath || "",
  };
});

ipcMain.handle("desktop-shell:pick-directory", async (_event, payload) => {
  const defaultPath = String(payload?.defaultPath || "").trim();
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: "选择文件夹",
    defaultPath: defaultPath || CANVAS_BOARD_DIR,
    properties: ["openDirectory", "createDirectory"],
  });

  return {
    canceled: result.canceled,
    filePath: result.filePaths?.[0] || "",
  };
});

ipcMain.handle("desktop-shell:pick-canvas-board-open", async (_event, payload) => {
  const defaultPath = String(payload?.defaultPath || "").trim();
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: "选择画布文件",
    defaultPath: defaultPath || CANVAS_BOARD_DIR,
    filters: [
      { name: "JSON 文件", extensions: ["json"] },
      { name: "所有文件", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });

  return {
    canceled: result.canceled,
    filePath: result.filePaths?.[0] || "",
  };
});

ipcMain.handle("desktop-shell:list-canvas-boards", async (_event, payload) => {
  const folderPath = String(payload?.folderPath || "").trim();
  if (!folderPath) {
    return { ok: false, error: "工作区路径不能为空", folderPath: "", boards: [] };
  }
  try {
    const resolvedFolder = path.resolve(folderPath);
    const entries = await fs.promises.readdir(resolvedFolder, { withFileTypes: true });
    const boards = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) {
        continue;
      }
      const filePath = path.join(resolvedFolder, entry.name);
      let stat = null;
      try {
        stat = await fs.promises.stat(filePath);
      } catch {
        continue;
      }
      boards.push({
        name: entry.name,
        filePath,
        size: stat.size,
        modifiedAt: stat.mtimeMs,
      });
    }
    boards.sort((a, b) => Number(b.modifiedAt || 0) - Number(a.modifiedAt || 0));
    return { ok: true, error: "", folderPath: resolvedFolder, boards };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "读取画布工作区失败",
      folderPath,
      boards: [],
    };
  }
});

ipcMain.handle("desktop-shell:ensure-directory", async (_event, targetPath) => {
  const normalizedPath = String(targetPath || "").trim();
  if (!normalizedPath) {
    return { ok: false, error: "路径不能为空", path: "" };
  }
  try {
    const resolvedPath = path.resolve(normalizedPath);
    await fs.promises.mkdir(resolvedPath, { recursive: true });
    return { ok: true, error: "", path: resolvedPath };
  } catch (error) {
    return { ok: false, error: error.message || "创建文件夹失败", path: normalizedPath };
  }
});

ipcMain.handle("desktop-shell:pick-image-save-path", async (_event, payload) => {
  const defaultName = String(payload?.defaultName || "").trim();
  const result = await dialog.showSaveDialog(mainWindow || undefined, {
    title: "导出图片",
    buttonLabel: "保存图片",
    defaultPath: defaultName || path.join(app.getPath("pictures"), "freeflow-image.png"),
    filters: [
      { name: "PNG 图片", extensions: ["png"] },
      { name: "JPEG 图片", extensions: ["jpg", "jpeg"] },
      { name: "所有文件", extensions: ["*"] },
    ],
    properties: ["showOverwriteConfirmation"],
  });

  return {
    canceled: result.canceled,
    filePath: result.filePath || "",
  };
});

ipcMain.handle("desktop-shell:pick-text-save-path", async (_event, payload) => {
  const defaultName = String(payload?.defaultName || "").trim();
  const title = String(payload?.title || "").trim() || "导出文本";
  const buttonLabel = String(payload?.buttonLabel || "").trim() || "保存文本";
  const filters = Array.isArray(payload?.filters) && payload.filters.length
    ? payload.filters.map((entry) => ({
        name: String(entry?.name || "").trim() || "文件",
        extensions: Array.isArray(entry?.extensions) && entry.extensions.length
          ? entry.extensions.map((value) => String(value || "").trim().replace(/^\./, "")).filter(Boolean)
          : ["*"],
      }))
    : [
        { name: "文本文件", extensions: ["txt"] },
        { name: "所有文件", extensions: ["*"] },
      ];
  const result = await dialog.showSaveDialog(mainWindow || undefined, {
    title,
    buttonLabel,
    defaultPath: defaultName || path.join(app.getPath("documents"), "freeflow-text.txt"),
    filters,
    properties: ["showOverwriteConfirmation"],
  });

  return {
    canceled: result.canceled,
    filePath: result.filePath || "",
  };
});

ipcMain.handle("desktop-shell:pick-pdf-save-path", async (_event, payload) => {
  const defaultName = String(payload?.defaultName || "").trim();
  const result = await dialog.showSaveDialog(mainWindow || undefined, {
    title: "导出 PDF",
    buttonLabel: "保存 PDF",
    defaultPath: defaultName || path.join(app.getPath("documents"), "freeflow-board.pdf"),
    filters: [
      { name: "PDF 文件", extensions: ["pdf"] },
      { name: "所有文件", extensions: ["*"] },
    ],
    properties: ["showOverwriteConfirmation"],
  });

  return {
    canceled: result.canceled,
    filePath: result.filePath || "",
  };
});

ipcMain.handle("desktop-shell:export-rich-text-docx", async (_event, payload) => {
  const html = String(payload?.html || "").trim();
  const defaultName = String(payload?.defaultName || "").trim() || "freeflow-word.docx";
  const title = String(payload?.title || "").trim() || "导出 Word";
  const buttonLabel = String(payload?.buttonLabel || "").trim() || "保存 Word";
  const documentOptions = payload?.documentOptions && typeof payload.documentOptions === "object"
    ? payload.documentOptions
    : {};
  if (!html) {
    return { ok: false, canceled: false, error: "导出内容为空" };
  }
  try {
    const result = await dialog.showSaveDialog(mainWindow || undefined, {
      title,
      buttonLabel,
      defaultPath: defaultName || path.join(app.getPath("documents"), "freeflow-word.docx"),
      filters: [
        { name: "Word 文档", extensions: ["docx"] },
        { name: "所有文件", extensions: ["*"] },
      ],
      properties: ["showOverwriteConfirmation"],
    });
    if (!result || result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    const generated = await HTMLtoDOCX(html, null, documentOptions);
    const buffer = Buffer.isBuffer(generated)
      ? generated
      : generated instanceof Uint8Array
        ? Buffer.from(generated)
        : ArrayBuffer.isView(generated)
          ? Buffer.from(generated.buffer, generated.byteOffset, generated.byteLength)
          : generated instanceof ArrayBuffer
            ? Buffer.from(generated)
            : Buffer.alloc(0);
    if (!buffer.byteLength) {
      return { ok: false, canceled: false, error: "Word 文档生成失败" };
    }
    const resolvedPath = path.resolve(String(result.filePath || "").trim());
    await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.promises.writeFile(resolvedPath, buffer);
    return {
      ok: true,
      canceled: false,
      path: resolvedPath,
      size: buffer.byteLength,
    };
  } catch (error) {
    console.error("[FreeFlow] export-rich-text-docx failed:", error);
    return {
      ok: false,
      canceled: false,
      error: `旧版 Word 导出失败：${error?.message || "Word 导出失败"}`,
    };
  }
});

ipcMain.handle("desktop-shell:export-word-docx", async (_event, payload) => {
  const ast = payload?.ast && typeof payload.ast === "object" ? payload.ast : null;
  const defaultName = String(payload?.defaultName || "").trim() || "freeflow-word.docx";
  const title = String(payload?.title || "").trim() || "导出 Word";
  const buttonLabel = String(payload?.buttonLabel || "").trim() || "保存 Word";
  if (!ast) {
    return { ok: false, canceled: false, error: "导出内容为空" };
  }
  try {
    const result = await dialog.showSaveDialog(mainWindow || undefined, {
      title,
      buttonLabel,
      defaultPath: defaultName || path.join(app.getPath("documents"), "freeflow-word.docx"),
      filters: [
        { name: "Word 文档", extensions: ["docx"] },
        { name: "所有文件", extensions: ["*"] },
      ],
      properties: ["showOverwriteConfirmation"],
    });
    if (!result || result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    const buffer = await compileWordExportAstToDocxBuffer(ast);
    if (!buffer || !buffer.byteLength) {
      return { ok: false, canceled: false, error: "Word 文档生成失败" };
    }
    const resolvedPath = path.resolve(String(result.filePath || "").trim());
    await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.promises.writeFile(resolvedPath, buffer);
    return {
      ok: true,
      canceled: false,
      path: resolvedPath,
      size: buffer.byteLength,
    };
  } catch (error) {
    console.error("[FreeFlow] export-word-docx failed:", error);
    return {
      ok: false,
      canceled: false,
      error: `结构化 Word 导出失败：${error?.message || "Word 导出失败"}`,
    };
  }
});

ipcMain.handle("desktop-shell:preview-word-docx", async (_event, payload) => {
  const ast = payload?.ast && typeof payload.ast === "object" ? payload.ast : null;
  if (!ast) {
    return { ok: false, canceled: false, code: "WORD_PREVIEW_EMPTY", message: "预览内容为空", docxBase64: "" };
  }
  try {
    return await buildWordPreviewDocxFromAst(ast);
  } catch (error) {
    console.error("[FreeFlow] preview-word-docx failed:", error);
    return {
      ok: false,
      canceled: false,
      code: "WORD_PREVIEW_FAILED",
      message: `Word 预览生成失败：${error?.message || "未知错误"}`,
      docxBase64: "",
    };
  }
});

ipcMain.handle("desktop-shell:read-file", async (_event, targetPath) => {
  const normalizedPath = String(targetPath || "").trim();
  if (!normalizedPath) {
    return { ok: false, error: "路径不能为空", text: "" };
  }
  try {
    const buffer = await fs.promises.readFile(normalizedPath);
    return { ok: true, text: buffer.toString("utf8") };
  } catch (error) {
    return { ok: false, error: error.message || "读取文件失败", text: "" };
  }
});

ipcMain.handle("desktop-shell:read-file-base64", async (_event, targetPath) => {
  const normalizedPath = String(targetPath || "").trim();
  if (!normalizedPath) {
    return { ok: false, error: "路径不能为空", data: "", mime: "" };
  }
  try {
    const buffer = await fs.promises.readFile(normalizedPath);
    return {
      ok: true,
      data: buffer.toString("base64"),
      mime: getMimeFromExtension(normalizedPath),
    };
  } catch (error) {
    return { ok: false, error: error.message || "读取文件失败", data: "", mime: "" };
  }
});

ipcMain.handle("desktop-shell:write-file", async (_event, targetPath, data) => {
  const normalizedPath = String(targetPath || "").trim();
  if (!normalizedPath) {
    return { ok: false, error: "路径不能为空" };
  }
  try {
    const resolvedPath = path.resolve(normalizedPath);
    const buffer = Buffer.from(data || []);
    const dir = path.dirname(resolvedPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(resolvedPath, buffer);
    return { ok: true, filePath: resolvedPath, size: buffer.byteLength };
  } catch (error) {
    return { ok: false, error: error.message || "写入文件失败" };
  }
});

ipcMain.handle("desktop-shell:rename-path", async (_event, sourcePath, targetPath) => {
  const fromPath = String(sourcePath || "").trim();
  const toPath = String(targetPath || "").trim();
  if (!fromPath || !toPath) {
    return { ok: false, error: "路径不能为空" };
  }
  try {
    const dir = path.dirname(toPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.rename(fromPath, toPath);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || "重命名失败" };
  }
});

ipcMain.handle("desktop-shell:read-clipboard-files", async () => {
  try {
    return await readClipboardFiles();
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to read clipboard files",
      count: 0,
      paths: [],
    };
  }
});

ipcMain.handle("desktop-shell:set-click-through", (_event, enabled) => {
  if (!mainWindow) {
    return { clickThrough: false };
  }

  return { clickThrough: applyClickThrough(enabled) };
});

ipcMain.handle("desktop-shell:toggle-click-through", () => {
  if (!mainWindow) {
    return { clickThrough: false };
  }

  return { clickThrough: toggleClickThrough() };
});

ipcMain.handle("desktop-shell:get-shortcut-settings", () => {
  return {
    ok: true,
    settings: getShortcutSettingsPayload(),
  };
});

ipcMain.handle("desktop-shell:set-shortcut-settings", async (_event, payload) => {
  try {
    const settings = await saveShortcutSettings(payload || {});
    return {
      ok: true,
      settings,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "保存快捷键设置失败",
      settings: getShortcutSettingsPayload(),
    };
  }
});

ipcMain.handle("desktop-shell:set-window-shape", (_event, rects) => {
  if (!mainWindow) {
    return getDesktopShellState();
  }

  applyWindowShape(rects);
  return getDesktopShellState();
});

ipcMain.handle("desktop-shell:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("desktop-shell:close", () => {
  mainWindow?.close();
});

ipcMain.handle("desktop-shell:toggle-pin", () => {
  if (!mainWindow) {
    return getDesktopShellState();
  }

  const nextPinned = !pinnedEnabled;
  applyPinnedState(nextPinned);
  return getDesktopShellState();
});

ipcMain.handle("desktop-shell:set-pinned", (_event, enabled) => {
  if (!mainWindow) {
    return getDesktopShellState();
  }

  applyPinnedState(enabled);
  return getDesktopShellState();
});

ipcMain.handle("desktop-shell:toggle-fullscreen", () => {
  if (!mainWindow) {
    return { fullscreen: false };
  }

  const shouldExitExpandedMode = Boolean(
    desktopShellFullscreenEnabled ||
    mainWindow.isFullScreen?.() ||
    mainWindow.isMaximized?.()
  );

  if (shouldExitExpandedMode) {
    restoreMainWindowFromDesktopWorkspace();
  } else {
    expandMainWindowToDesktopWorkspace();
  }

  return getDesktopShellState();
});

ipcMain.handle("desktop-shell:reload", async () => {
  try {
    await cleanupDesktopEmbeddedSurfaces("renderer-reload");
  } catch {
    // Ignore cleanup failures and continue reload to avoid trapping the UI.
  }
  mainWindow?.webContents.reloadIgnoringCache();
  return { ok: true };
});

ipcMain.handle("desktop-shell:open-doubao-window", async () => {
  await ensureDoubaoWindow({ reveal: true });
  return { ok: true };
});

ipcMain.handle("desktop-shell:chat-with-doubao", async (_event, payload) => {
  const prompt = String(payload?.prompt || "").trim();
  if (!prompt) {
    return { ok: false, error: "prompt is required" };
  }

  return chatWithDoubao(prompt, {
    timeoutMs: payload?.timeoutMs,
  });
});

ipcMain.handle("desktop-shell:cancel-doubao-chat", async () => {
  return cancelDoubaoChat();
});

ipcMain.handle("desktop-shell:prepare-doubao-prompt", async (_event, payload) => {
  const prompt = String(payload?.prompt || "").trim();
  if (!prompt) {
    return { ok: false, error: "prompt is required" };
  }
  return prepareDoubaoPrompt(prompt, {
    timeoutMs: payload?.timeoutMs,
  });
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();

app.setName(PRODUCT_NAME);
if (process.platform === "win32" && typeof app.setAppUserModelId === "function") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(bootstrapDesktopApp).catch((error) => {
    console.error("Failed to start desktop shell:", error);
    app.quit();
  });
}

app.whenReady().then(() => {
  loadShortcutSettings();
  registerDesktopShortcuts();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    try {
      await bootstrapDesktopApp();
    } catch (error) {
      console.error("Failed to reactivate desktop shell:", error);
    }
  }
});

app.on("window-all-closed", async () => {
  await stopServer().catch(() => {});
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await cleanupDesktopEmbeddedSurfaces("before-quit");
  globalShortcut.unregisterAll();
  await stopServer().catch(() => {});
});

