const path = require("path");
const { spawn } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const TEST_PORT = Number(process.env.FREEFLOW_TEST_PORT || 3217);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const CHECKS = [
  "scripts/check-generated-bundles.js",
  "scripts/check-backend-security.js",
  "scripts/check-desktop-atomic-save.js",
  "scripts/check-electron-ipc-security.js",
  "scripts/check-canvas-lod-scale.js",
  "scripts/check-overlay-budget.js",
  "scripts/check-interaction-coordination.js",
  "scripts/check-camera-interaction-runtime.js",
  "scripts/check-retained-camera-frame.js",
  "scripts/check-presentation-quality-runtime.js",
  "scripts/check-canvas-performance-policy.js",
  "scripts/check-canvas-performance-runtime.js",
  "scripts/check-canvas-render-scheduler.js",
  "scripts/check-canvas-resource-budget-runtime.js",
  "scripts/check-canvas-state-history.js",
  "scripts/check-canvas-large-scene-runtime.js",
  "scripts/check-presentation-snapshot-controller.js",
  "scripts/check-compact-presentation-runtime.js",
  "scripts/check-element-runtime-architecture.js",
  "scripts/check-builtin-element-registry.js",
  "scripts/structured-import/run-parser-unit-tests.cjs",
  "scripts/structured-import/run-renderer-element-integration.cjs",
];

function runNodeScript(scriptPath, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT_DIR,
      env: { ...process.env, ...env },
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

async function waitForServer(child) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Test server exited before becoming ready (${child.exitCode})`);
    }
    try {
      const response = await fetch(`${BASE_URL}/canvas-office.html`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Test server did not become ready at ${BASE_URL}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

async function main() {
  for (const scriptPath of CHECKS) {
    await runNodeScript(scriptPath);
  }

  const server = spawn(process.execPath, ["server.js"], {
    cwd: ROOT_DIR,
    env: { ...process.env, PORT: String(TEST_PORT) },
    stdio: "inherit",
  });
  try {
    await waitForServer(server);
    await runNodeScript("scripts/check-canvas-compact-presentation.js", {
      CANVAS_TEST_URL: `${BASE_URL}/canvas-office.html`,
    });
    await runNodeScript("scripts/check-canvas-presentation-snapshots.js", {
      CANVAS_TEST_URL: `${BASE_URL}/canvas-office.html`,
    });
    await runNodeScript("scripts/check-canvas-presentation-performance.js", {
      CANVAS_TEST_URL: `${BASE_URL}/canvas-office.html`,
    });
    await runNodeScript("scripts/check-canvas2d-regression.js", {
      CANVAS_TEST_URL: `${BASE_URL}/canvas-office.html`,
    });
    await runNodeScript("scripts/check-canvas2d-element-interactions.js", {
      CANVAS_TEST_URL: `${BASE_URL}/canvas-office.html`,
    });
    await runNodeScript("scripts/check-air-canvas-interactions.js", {
      AIR_CANVAS_TEST_URL: `${BASE_URL}/?desktop=1`,
    });
  } finally {
    await stopServer(server);
  }
  console.log("[test] all checks passed");
}

main().catch((error) => {
  console.error(`[test] ${error.message}`);
  process.exitCode = 1;
});
