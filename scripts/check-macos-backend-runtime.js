const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { wrapperCommand, defaultCandidateResolver } = require("../src/backend/agent/cliRuntimeRegistry");

async function main() {
  const runtimeSource = fs.readFileSync(path.join(__dirname, "../src/backend/runtime/serverRuntime.js"), "utf8");
  assert(runtimeSource.includes("async function sampleCpuPercent()"), "non-Windows CPU stats must use a sampled utilization value");
  assert(runtimeSource.includes('`${click ? "c" : "m"}:'), "macOS mouse move must invoke cliclick instead of returning a fake success");
  assert(runtimeSource.includes("macOS 输入控制权限被拒绝"), "macOS input permission failures must be explicit");
  assert(runtimeSource.includes("macOS 窗口列表需要辅助功能权限"), "macOS window enumeration permission failures must be explicit");
  assert(runtimeSource.includes('runCommand("sips"'), "macOS screenshot bounds must be read from the captured image");
  assert(runtimeSource.includes("windowInfo?.scaleFactor"), "Retina screenshot pixels must be converted to display points before clicking");
  assert(runtimeSource.includes("macOS 临时目录路径无效，已拒绝清理"), "unsafe temporary paths must be rejected");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-macos-cli-"));
  const wrapper = path.join(tempDir, "fake-cli");
  fs.writeFileSync(wrapper, "#!/usr/bin/env node\nconsole.log('ok');\n", { mode: 0o755 });
  const launch = wrapperCommand(wrapper);
  assert.strictEqual(launch.command, process.execPath, "Node shebang wrappers must use the active Node runtime");
  assert.deepStrictEqual(launch.args, [wrapper]);
  const candidates = await defaultCandidateResolver("codex", wrapper);
  assert(candidates.some((item) => item.path === wrapper && item.source === "configured"), "absolute configured CLI path was not retained");
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("[check-macos-backend-runtime] macOS backend CPU, permissions, capture, repair, and CLI contracts passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
