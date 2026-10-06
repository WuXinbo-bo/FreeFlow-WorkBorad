const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

if (process.platform !== "darwin") {
  console.log("macOS paths test skipped on this platform");
  process.exit(0);
}

const paths = require("../src/backend/config/paths");
const expectedRoot = path.join(os.homedir(), "Library", "Application Support", "FreeFlow");
assert.equal(paths.USER_APP_DIR, expectedRoot);
assert.equal(paths.DATA_DIR, path.join(expectedRoot, "AppData"));
assert.equal(paths.CANVAS_BOARD_DIR, path.join(expectedRoot, "CanvasBoards"));
assert.equal(process.env.FREEFLOW_HOME_DIR, expectedRoot);
assert.equal(process.env.FREEFLOW_USER_DATA_DIR, paths.DATA_DIR);
console.log("macOS paths: Application Support root, data and canvas directories passed");
