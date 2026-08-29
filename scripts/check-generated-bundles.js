const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const BUNDLES = [
  "public/assets/canvas2d-ui/current/canvas2d-ui.js",
  "public/assets/canvas-office/current/canvas-office-ui.js",
];
const BUILD_SCRIPTS = ["scripts/build-canvas2d-ui.js", "scripts/build-canvas-office.js"];

async function runNodeScript(scriptPath) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT_DIR,
      env: { ...process.env, FREEFLOW_SKIP_VENDOR_SYNC: "1" },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptPath} failed (${signal || code})`));
    });
  });
}

async function readBundle(relativePath) {
  const filePath = path.join(ROOT_DIR, relativePath);
  try {
    return { exists: true, bytes: await fs.readFile(filePath) };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { exists: false, bytes: null };
    }
    throw error;
  }
}

async function restoreBundle(relativePath, snapshot) {
  const filePath = path.join(ROOT_DIR, relativePath);
  if (snapshot.exists) {
    await fs.writeFile(filePath, snapshot.bytes);
    return;
  }
  await fs.rm(filePath, { force: true });
}

async function main() {
  const before = new Map();
  for (const relativePath of BUNDLES) {
    before.set(relativePath, await readBundle(relativePath));
  }

  let changed = [];
  try {
    for (const scriptPath of BUILD_SCRIPTS) {
      await runNodeScript(scriptPath);
    }
    for (const relativePath of BUNDLES) {
      const previous = before.get(relativePath);
      const current = await readBundle(relativePath);
      if (!previous.exists || !current.exists || !previous.bytes.equals(current.bytes)) {
        changed.push(relativePath);
      }
    }
  } finally {
    await Promise.all(BUNDLES.map((relativePath) => restoreBundle(relativePath, before.get(relativePath))));
  }

  if (changed.length) {
    throw new Error(`Generated bundles are stale:\n- ${changed.join("\n- ")}\nRun the corresponding build scripts and commit the results.`);
  }
  console.log("[check-generated-bundles] ok");
}

main().catch((error) => {
  console.error(`[check-generated-bundles] ${error.message}`);
  process.exitCode = 1;
});
