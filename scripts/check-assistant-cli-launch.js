const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execute = promisify(execFile);

async function checkInsideUtility(directory) {
  assert.equal(process.type, "utility");
  const { wrapperCommand, cliProcessEnv, probeExecutable } = require("../src/backend/agent/cliRuntimeRegistry");
  const { discoverCodexExecutable } = require("../src/backend/agent/codexAppServerClient");
  const { AgentRuntime } = require("../src/backend/agent/agentRuntime");
  const { getDefaultAgentSettings } = require("../src/backend/agent/agentSettingsModel");
  const { createClaudeCliRunner } = require("../src/backend/agent/claudeCliRunner");
  const script = path.join(directory, "cli.js");
  const launch = wrapperCommand(script);
  assert.equal(launch.env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal((await probeExecutable(script)).version, "freeflow-cli 1.0.0");
  assert.equal((await discoverCodexExecutable(script)).available, true);
  const extraWrapper = process.platform === "win32" ? path.join(directory, "npm", "codex.cmd") : path.join(directory, "node-wrapper");
  assert.equal((await probeExecutable(extraWrapper)).version, "freeflow-cli 1.0.0");

  process.env.ELECTRON_RUN_AS_NODE = "inherited-value";
  const native = wrapperCommand(path.join(directory, "native", process.platform === "win32" ? "native-stub.cmd" : "native-stub"));
  const nativeEnv = cliProcessEnv(native);
  assert.equal(nativeEnv.ELECTRON_RUN_AS_NODE, undefined, "native executables must not inherit Electron's Node mode");
  const nativeResult = await execute(native.command, native.args, { env: nativeEnv, timeout: 5000 });
  assert.equal(nativeResult.stdout.trim(), "native-clean");
  delete process.env.ELECTRON_RUN_AS_NODE;

  const settings = getDefaultAgentSettings(directory);
  Object.assign(settings.providers.codex, { baseUrl: "https://example.invalid/v1", apiKeyConfigured: true, models: [{ id: "stub" }], selectedModel: "stub" });
  const runtime = new AgentRuntime({
    databaseFile: path.join(directory, "sessions.sqlite"),
    attachmentsDir: path.join(directory, "attachments"),
    profilesDir: path.join(directory, "profiles"),
    backupsDir: path.join(directory, "backups"),
    workspacesDir: path.join(directory, "workspaces"),
    settingsService: {
      readAgentSettings: async () => settings,
      readAgentRuntimeSettings: async () => ({ ...settings.providers.codex, apiKey: "stub-test-key" }),
    },
    permissionsService: { readPermissionsStore: async () => ({ allowedRoots: [directory] }), resolveAllowedExistingPath: async (value) => value },
    cliRegistry: { detect: async () => ({ available: true, path: script, version: "1.0.0" }) },
  });
  try {
    const client = await runtime.ensureClient({ allowUnvalidated: true });
    const result = await client.request("test/environment");
    assert.equal(result.nodeMode, "1");
    assert.equal(result.profile, path.join(directory, "profiles", "codex"));
  } finally {
    await runtime.shutdown();
  }
  const run = createClaudeCliRunner().start({
    commandPath: script,
    session: { workspaceRoot: directory, model: "stub", approvalPolicy: "never", sandboxMode: "read-only" },
    provider: { baseUrl: "https://example.invalid/v1", apiKey: "stub-test-key" },
    profileDir: path.join(directory, "profiles", "claude"),
    prompt: "local launch check",
    signal: new AbortController().signal,
  });
  assert.equal((await run.completion).finalText, "claude-ready");
  return { ok: true, checks: ["utility-process", "js-wrapper", process.platform === "win32" ? "npm-cmd-wrapper" : "node-shebang", "native-environment", "codex-start-stop", "claude-start-exit"] };
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-cli-launch-"));
  let child;
  let timeout;
  try {
    const stub = `#!/usr/bin/env node
if (process.env.ELECTRON_RUN_AS_NODE !== '1') process.exit(15);
if (process.argv.includes('--version')) { console.log('freeflow-cli 1.0.0'); }
else if (process.argv.includes('app-server')) {
  require('node:readline').createInterface({input:process.stdin}).on('line', line => {
    const request=JSON.parse(line); if(request.id) console.log(JSON.stringify({id:request.id,result:request.method==='test/environment'?{nodeMode:process.env.ELECTRON_RUN_AS_NODE,profile:process.env.CODEX_HOME}:{}}));
  });
} else {
  process.stdin.resume(); process.stdin.on('end',()=>console.log(JSON.stringify({type:'result',subtype:'success',result:'claude-ready',session_id:'stub-session'})));
}
`;
    await fs.writeFile(path.join(directory, "cli.js"), stub);
    if (process.platform === "win32") {
      const bin = path.join(directory, "npm");
      const cli = path.join(bin, "node_modules", "@openai", "codex", "bin", "codex.js");
      await fs.mkdir(path.dirname(cli), { recursive: true });
      await fs.writeFile(cli, stub);
      await fs.writeFile(path.join(bin, "codex.cmd"), "@echo off\r\nexit /b 19\r\n");
    } else {
      await fs.writeFile(path.join(directory, "node-wrapper"), stub, { mode: 0o700 });
    }
    const nativeDirectory = path.join(directory, "native");
    await fs.mkdir(nativeDirectory);
    await fs.writeFile(path.join(nativeDirectory, process.platform === "win32" ? "native-stub.cmd" : "native-stub"), process.platform === "win32"
      ? "@echo off\r\nif defined ELECTRON_RUN_AS_NODE exit /b 19\r\necho native-clean\r\n"
      : '#!/bin/sh\n[ -z "$ELECTRON_RUN_AS_NODE" ] || exit 19\nprintf native-clean\n', { mode: 0o700 });
    const mainFile = path.join(directory, "main.cjs");
    await fs.writeFile(mainFile, `const {app,utilityProcess}=require('electron');app.whenReady().then(()=>{const child=utilityProcess.fork(${JSON.stringify(__filename)},[${JSON.stringify(directory)}],{stdio:'pipe'});child.stdout.resume();child.stderr.resume();child.on('message',message=>{console.log(JSON.stringify(message));child.kill();app.exit(message.ok?0:1);});child.on('exit',code=>{if(code)app.exit(code);});setTimeout(()=>{child.kill();app.exit(2);},25000).unref();});`);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(require("electron"), [mainFile], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (bytes) => { stdout += bytes; });
    child.stderr.on("data", (bytes) => { stderr = `${stderr}${bytes}`.slice(-2000); });
    timeout = setTimeout(() => child.kill(), 35000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    assert.equal(code, 0, `Electron utility CLI checks failed: ${stdout}${stderr}`);
    const result = JSON.parse(stdout.trim().split("\n").at(-1));
    assert.equal(result.ok, true);
    console.log(`[check-assistant-cli-launch] real Electron ${result.checks.join(", ")} passed`);
  } finally {
    clearTimeout(timeout);
    child?.kill();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

if (process.parentPort) {
  checkInsideUtility(process.argv[2]).then((result) => process.parentPort.postMessage(result)).catch((error) => process.parentPort.postMessage({ ok: false, error: error.stack }));
} else {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
