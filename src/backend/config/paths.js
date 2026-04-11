const path = require("path");
const os = require("os");

const ROOT_DIR = path.resolve(__dirname, "../../..");
const USER_APP_DIR = String(process.env.FREEFLOW_HOME_DIR || "").trim() || path.join(os.homedir(), "FreeFlow");
const IS_PACKAGED_APP_LAYOUT = /(^|[\\/])app\.asar([\\/]|$)/i.test(ROOT_DIR);
const IS_ELECTRON_RUNTIME = Boolean(process.versions?.electron);
const DEFAULT_DATA_DIR =
  IS_PACKAGED_APP_LAYOUT || IS_ELECTRON_RUNTIME ? path.join(USER_APP_DIR, "AppData") : path.join(ROOT_DIR, "data");
const DATA_DIR = String(process.env.FREEFLOW_USER_DATA_DIR || "").trim() || DEFAULT_DATA_DIR;
const CANVAS_BOARD_DIR =
  String(process.env.FREEFLOW_CANVAS_BOARD_DIR || "").trim() || path.join(USER_APP_DIR, "CanvasBoards");
const CACHE_DIR = String(process.env.FREEFLOW_CACHE_DIR || "").trim() || path.join(DATA_DIR, "Cache");
const RUNTIME_DIR = String(process.env.FREEFLOW_RUNTIME_DIR || "").trim() || path.join(DATA_DIR, "Runtime");
const TEMP_DRAG_DIR = String(process.env.FREEFLOW_TEMP_DRAG_DIR || "").trim() || path.join(RUNTIME_DIR, "drag-export");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const NODE_MODULES_DIR = path.join(ROOT_DIR, "node_modules");
const DESKTOP_DIR = path.join(os.homedir(), "Desktop");
const WORKSPACE_DIR = ROOT_DIR;
const TUTORIAL_ASSET_DIR_NAME = "TutorialAssets";
const UI_SETTINGS_FILE = path.join(DATA_DIR, "ui-settings.json");
const MODEL_PROFILES_FILE = path.join(DATA_DIR, "model-profiles.json");
const MODEL_PROVIDER_SETTINGS_FILE = path.join(DATA_DIR, "model-provider-settings.json");
const PERMISSIONS_FILE = path.join(DATA_DIR, "permissions.json");
const CLIPBOARD_STORE_FILE = path.join(DATA_DIR, "clipboard-store.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const SHORTCUT_SETTINGS_FILE = path.join(DATA_DIR, "shortcut-settings.json");
const CANVAS_BOARD_FILE = path.join(CANVAS_BOARD_DIR, "canvas-board.json");
const AGENT_SCREENSHOT_FILE = path.join(DATA_DIR, "agent-current-window.png");

process.env.FREEFLOW_HOME_DIR = USER_APP_DIR;
process.env.FREEFLOW_USER_DATA_DIR = DATA_DIR;
process.env.FREEFLOW_CANVAS_BOARD_DIR = CANVAS_BOARD_DIR;
process.env.FREEFLOW_CACHE_DIR = CACHE_DIR;
process.env.FREEFLOW_RUNTIME_DIR = RUNTIME_DIR;
process.env.FREEFLOW_TEMP_DRAG_DIR = TEMP_DRAG_DIR;

module.exports = {
  ROOT_DIR,
  USER_APP_DIR,
  IS_PACKAGED_APP_LAYOUT,
  IS_ELECTRON_RUNTIME,
  DATA_DIR,
  CANVAS_BOARD_DIR,
  CACHE_DIR,
  RUNTIME_DIR,
  TEMP_DRAG_DIR,
  PUBLIC_DIR,
  NODE_MODULES_DIR,
  DESKTOP_DIR,
  WORKSPACE_DIR,
  TUTORIAL_ASSET_DIR_NAME,
  UI_SETTINGS_FILE,
  MODEL_PROFILES_FILE,
  MODEL_PROVIDER_SETTINGS_FILE,
  PERMISSIONS_FILE,
  CLIPBOARD_STORE_FILE,
  SESSIONS_FILE,
  SHORTCUT_SETTINGS_FILE,
  CANVAS_BOARD_FILE,
  AGENT_SCREENSHOT_FILE,
};
