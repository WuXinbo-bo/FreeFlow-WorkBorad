const crypto = require("crypto");
const readline = require("readline");
const { spawn } = require("child_process");
const { wrapperCommand } = require("./cliRuntimeRegistry");

function permissionMode(session) {
  if (session.sandboxMode === "read-only") return "plan";
  if (session.sandboxMode === "danger-full-access" && session.approvalPolicy === "never") return "bypassPermissions";
  if (session.approvalPolicy === "never") return "dontAsk";
  if (session.approvalPolicy === "on-failure") return "acceptEdits";
  return "default";
}

function buildClaudeArgs(commandPath, session, requestedSessionId) {
  const launch = wrapperCommand(commandPath);
  const args = [
    ...launch.args,
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-mode", permissionMode(session),
    "--disallowedTools", "Task", "Agent",
  ];
  if (session.model) args.push("--model", session.model);
  if (session.reasoningEffort) args.push("--effort", session.reasoningEffort);
  if (session.providerThreadId) args.push("--resume", session.providerThreadId);
  else args.push("--session-id", requestedSessionId);
  return { command: launch.command, args };
}

function stopProcess(child) {
  if (!child || child.exitCode != null || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    killer.unref();
    return;
  }
  child.kill("SIGTERM");
}

function textFromContent(content) {
  return (Array.isArray(content) ? content : [])
    .filter((item) => item?.type === "text" && item.text)
    .map((item) => String(item.text))
    .join("\n");
}

function createClaudeCliRunner(options = {}) {
  const spawnImpl = options.spawn || spawn;
  return {
    start(input) {
      const requestedSessionId = input.session.providerThreadId || crypto.randomUUID();
      const launch = buildClaudeArgs(input.commandPath, input.session, requestedSessionId);
      const env = {
        ...process.env,
        CLAUDE_CONFIG_DIR: input.profileDir,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        ANTHROPIC_MAX_RETRIES: "2",
        ANTHROPIC_BASE_URL: String(input.provider.baseUrl || "").replace(/\/+$/, ""),
        ANTHROPIC_API_KEY: input.provider.apiKey,
      };
      for (const key of [
        "CLAUDE_WORKER_BRIDGE_URL", "CLAUDE_WORKER_BRIDGE_TOKEN", "CLAUDE_WORKBENCH_PARENT_TASK_ID",
        "CLAUDE_CODEX_BRIDGE_URL", "CLAUDE_CODEX_BRIDGE_TOKEN",
        "WORKBENCH_AGENT_BRIDGE_URL", "WORKBENCH_AGENT_BRIDGE_TOKEN",
      ]) delete env[key];
      const child = spawnImpl(launch.command, launch.args, {
        cwd: input.session.workspaceRoot,
        env,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let providerSessionId = requestedSessionId;
      let stderr = "";
      let completed = false;
      let finalText = "";
      let currentMessageId = "";
      let streamedText = false;
      let spawnError = null;
      let permissionError = "";
      const toolNames = new Map();
      const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
      const abort = () => stopProcess(child);
      input.signal?.addEventListener("abort", abort, { once: true });
      child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-16000); });
      child.once("error", (error) => { spawnError = error; });
      child.stdin.end(input.prompt, "utf8");

      const completion = (async () => {
        for await (const line of lines) {
          if (!line.trim()) continue;
          let item;
          try { item = JSON.parse(line); } catch { continue; }
          if (item.session_id) providerSessionId = String(item.session_id);
          if (item.type === "system" && item.subtype === "init") {
            await input.onSession?.(providerSessionId);
            await input.onActivity?.({ itemId: "runtime", activityType: "status", status: "completed", summary: "Claude 会话已连接" });
            continue;
          }
          if (item.type === "system") {
            if (!["status", "thinking_tokens"].includes(String(item.subtype || ""))) {
              await input.onActivity?.({ itemId: `status:${item.subtype || "runtime"}`, activityType: "status", status: "running", summary: String(item.message || item.subtype || "Claude 状态已更新") });
            }
            continue;
          }
          if (item.type === "stream_event") {
            const event = item.event || {};
            if (event.type === "message_start" && event.message?.id) currentMessageId = String(event.message.id);
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
              streamedText = true;
              await input.onDelta?.(currentMessageId || `claude:${providerSessionId}`, String(event.delta.text));
            }
            if (event.type === "content_block_delta" && event.delta?.type === "thinking_delta" && event.delta.thinking) {
              await input.onActivity?.({ itemId: currentMessageId ? `reasoning:${currentMessageId}` : "reasoning", activityType: "reasoning", status: "running", summary: String(event.delta.thinking) });
            }
            continue;
          }
          if (item.type === "assistant") {
            const message = item.message || {};
            const sourceId = String(message.id || currentMessageId || `claude:${providerSessionId}`);
            const content = Array.isArray(message.content) ? message.content : [];
            const text = textFromContent(content);
            if (text) {
              finalText = text;
              await input.onMessage?.(sourceId, text, streamedText);
            }
            for (const block of content) {
              if (block?.type === "thinking" && block.thinking) await input.onActivity?.({ itemId: `reasoning:${sourceId}`, activityType: "reasoning", status: "completed", summary: String(block.thinking) });
              if (block?.type === "tool_use") {
                const toolId = String(block.id || crypto.randomUUID());
                toolNames.set(toolId, String(block.name || "工具"));
                await input.onActivity?.({ itemId: toolId, activityType: "tool", status: "running", summary: `${toolNames.get(toolId)} 正在执行`, detail: block.input || {} });
              }
            }
            continue;
          }
          if (item.type === "user") {
            for (const block of Array.isArray(item.message?.content) ? item.message.content : []) {
              if (block?.type !== "tool_result") continue;
              const toolId = String(block.tool_use_id || "");
              const toolOutput = typeof block.content === "string" ? block.content : JSON.stringify(block.content || "");
              if (/permission (?:isn't|wasn't|hasn't been|not) granted|requires approval|permission denied|not authorized|unauthori[sz]ed/i.test(toolOutput)) {
                permissionError = toolOutput.replace(/\s+/g, " ").slice(0, 500);
              }
              await input.onActivity?.({ itemId: toolId, activityType: "tool", status: block.is_error ? "failed" : "completed", summary: `${toolNames.get(toolId) || "工具"}${block.is_error ? "执行失败" : "执行完成"}` });
            }
            continue;
          }
          if (item.type === "result") {
            if (item.is_error || (item.subtype && item.subtype !== "success")) throw new Error(String(item.result || item.error || "Claude CLI 运行失败"));
            if (permissionError) throw new Error(`Claude 工具权限未授权：${permissionError}`);
            completed = true;
            finalText = String(item.result || finalText || "").trim();
          }
        }
        const exitCode = await new Promise((resolve) => {
          if (child.exitCode != null) resolve(child.exitCode);
          else child.once("close", resolve);
        });
        if (input.signal?.aborted) throw Object.assign(new Error("Claude CLI 任务已中断"), { name: "AbortError" });
        if (spawnError) throw spawnError;
        if (exitCode) throw new Error(stderr.trim() || `Claude CLI 退出，代码 ${exitCode}`);
        if (!completed) throw new Error(stderr.trim() || "Claude CLI 未返回任务完成事件");
        if (!finalText) throw new Error("Claude CLI 已完成，但没有返回可显示的回复");
        return { sessionId: providerSessionId, finalText };
      })().finally(() => {
        input.signal?.removeEventListener("abort", abort);
        lines.close();
      });

      return { process: child, sessionId: requestedSessionId, completion, abort: () => stopProcess(child) };
    },
  };
}

module.exports = { buildClaudeArgs, createClaudeCliRunner, permissionMode };
