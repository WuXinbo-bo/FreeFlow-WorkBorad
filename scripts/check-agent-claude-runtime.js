const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AgentRuntime } = require("../src/backend/agent/agentRuntime");
const { buildClaudeArgs, permissionMode } = require("../src/backend/agent/claudeCliRunner");
const { getDefaultAgentSettings, providerValidationFingerprint } = require("../src/backend/agent/agentSettingsModel");

async function eventually(check, message) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(message);
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-claude-runtime-"));
  const fixture = path.join(tempDir, "fake-claude.js");
  fs.writeFileSync(fixture, `
    let prompt = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { prompt += chunk; });
    process.stdin.on("end", () => {
      const sessionId = process.argv.includes("--resume")
        ? process.argv[process.argv.indexOf("--resume") + 1]
        : process.argv[process.argv.indexOf("--session-id") + 1];
      process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: sessionId }) + "\\n");
      if (prompt.includes("slow")) return setTimeout(() => {}, 10000);
      if (prompt.includes("permission failure")) {
        process.stdout.write(JSON.stringify({ type: "assistant", session_id: sessionId, message: { id: "permission-message", content: [{ type: "tool_use", id: "tool-1", name: "Write", input: {} }] } }) + "\\n");
        process.stdout.write(JSON.stringify({ type: "user", session_id: sessionId, message: { content: [{ type: "tool_result", tool_use_id: "tool-1", is_error: true, content: "Permission denied" }] } }) + "\\n");
        return process.stdout.write(JSON.stringify({ type: "result", subtype: "success", session_id: sessionId, result: "" }) + "\\n");
      }
      if (prompt.includes("empty success")) {
        return process.stdout.write(JSON.stringify({ type: "result", subtype: "success", session_id: sessionId, result: "" }) + "\\n");
      }
      if (prompt.includes("process failure")) {
        process.stderr.write("simulated Claude process failure");
        process.exitCode = 3;
        return;
      }
      process.stdout.write(JSON.stringify({ type: "stream_event", session_id: sessionId, event: { type: "message_start", message: { id: "message-1" } } }) + "\\n");
      process.stdout.write(JSON.stringify({ type: "stream_event", session_id: sessionId, event: { type: "content_block_delta", delta: { type: "text_delta", text: "Claude " } } }) + "\\n");
      process.stdout.write(JSON.stringify({ type: "assistant", session_id: sessionId, message: { id: "message-1", content: [{ type: "text", text: "Claude reply" }] } }) + "\\n");
      process.stdout.write(JSON.stringify({ type: "result", subtype: "success", session_id: sessionId, result: "Claude reply" }) + "\\n");
    });
  `);

  const settings = getDefaultAgentSettings(tempDir);
  settings.activeProvider = "claude";
  settings.providers.claude = {
    ...settings.providers.claude,
    cliPath: fixture,
    baseUrl: "https://example.test",
    apiKeyConfigured: true,
    models: [{ id: "claude-test", displayName: "Claude Test" }],
    selectedModel: "claude-test",
    modelValidatedAt: Date.now(),
  };
  settings.providers.claude.validationFingerprint = providerValidationFingerprint("claude", settings.providers.claude);
  const runtime = new AgentRuntime({
    databaseFile: path.join(tempDir, "agent.sqlite"),
    attachmentsDir: path.join(tempDir, "attachments"),
    profilesDir: path.join(tempDir, "profiles"),
    backupsDir: path.join(tempDir, "backups"),
    settingsService: {
      async readAgentSettings() { return structuredClone(settings); },
      async readAgentRuntimeSettings(provider) { return { ...structuredClone(settings.providers[provider]), apiKey: "test-key" }; },
      async updateProviderRuntime() { return structuredClone(settings); },
    },
    permissionsService: {
      async readPermissionsStore() { return { allowedRoots: [tempDir] }; },
      async resolveAllowedExistingPath(value) {
        const resolved = path.resolve(value);
        if (resolved !== tempDir && !resolved.startsWith(`${tempDir}${path.sep}`)) throw new Error("outside root");
        return resolved;
      },
    },
    cliRegistry: {
      async detect(provider) {
        return { provider, available: provider === "claude", requiresSelection: false, candidates: [], path: fixture, version: "test", source: "configured", error: "", checkedAt: Date.now() };
      },
    },
  });

  try {
    const launch = buildClaudeArgs(fixture, settings.providers.claude, "session-test");
    assert(launch.args.includes("--output-format") && launch.args.includes("stream-json"));
    assert(launch.args.includes("Task") && launch.args.includes("Agent"), "delegation tools were not disabled");
    assert.equal(permissionMode({ sandboxMode: "read-only", approvalPolicy: "never" }), "plan");
    assert.equal(permissionMode({ sandboxMode: "workspace-write", approvalPolicy: "never" }), "dontAsk");
    assert.equal(permissionMode({ sandboxMode: "danger-full-access", approvalPolicy: "never" }), "bypassPermissions");
    assert.equal(permissionMode({ sandboxMode: "workspace-write", approvalPolicy: "on-failure" }), "acceptEdits");

    const session = await runtime.createSession({ provider: "claude" });
    const started = await runtime.startTurn(session.id, { text: "normal", clientRequestId: "claude-normal" });
    assert.equal(started.turn.status, "running");
    await eventually(() => runtime.store.findTurnByClientRequestId(session.id, "claude-normal")?.status === "completed", "Claude turn did not complete");
    const completed = await runtime.getSession(session.id);
    assert.equal(completed.status, "idle");
    assert.equal(completed.providerThreadId.length > 0, true);
    assert.equal(completed.messages.filter((item) => item.role === "assistant").at(-1).content, "Claude reply");

    await runtime.startTurn(session.id, { text: "slow", clientRequestId: "claude-slow" });
    await eventually(() => runtime.store.findTurnByClientRequestId(session.id, "claude-slow")?.status === "running", "slow Claude turn did not start");
    await runtime.interruptTurn(session.id);
    await eventually(() => runtime.store.findTurnByClientRequestId(session.id, "claude-slow")?.status === "cancelled", "interrupted Claude turn did not recover");
    assert.equal((await runtime.getSession(session.id)).status, "idle");

    const steerSession = await runtime.createSession({ provider: "claude" });
    await runtime.startTurn(steerSession.id, { text: "slow", clientRequestId: "claude-steer-active" });
    const steered = await runtime.startTurn(steerSession.id, { text: "continue after steer", clientRequestId: "claude-steer-next", mode: "steer" });
    assert.equal(steered.steered, true, "Claude immediate guidance did not interrupt the active process");
    await eventually(() => runtime.store.findTurnByClientRequestId(steerSession.id, "claude-steer-active")?.status === "cancelled", "Claude immediate guidance did not cancel the old turn");
    await eventually(() => runtime.store.findTurnByClientRequestId(steerSession.id, "claude-steer-next")?.status === "completed", "Claude immediate guidance did not dispatch the replacement turn");
    assert.equal((await runtime.getSession(steerSession.id)).pendingInputs.length, 0, "completed Claude guidance remained queued");

    for (const [prompt, requestId, label] of [
      ["permission failure", "claude-permission", "permission rejection"],
      ["empty success", "claude-empty", "empty success"],
      ["process failure", "claude-process", "process failure"],
    ]) {
      const failureSession = await runtime.createSession({ provider: "claude" });
      await runtime.startTurn(failureSession.id, { text: prompt, clientRequestId: requestId });
      await eventually(() => runtime.store.findTurnByClientRequestId(failureSession.id, requestId)?.status === "failed", `Claude ${label} did not enter a recoverable failure state`);
      assert.equal((await runtime.getSession(failureSession.id)).status, "idle", `Claude ${label} did not restore the session to idle`);
    }
  } finally {
    await runtime.shutdown().catch(() => {});
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("[check-agent-claude-runtime] stream, resume, interrupt, guidance, and failure recovery contracts passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
