const assert = require("assert");
const path = require("path");
const { CodexAppServerClient, discoverCodexExecutable } = require("../src/backend/agent/codexAppServerClient");

async function main() {
  const discovered = await discoverCodexExecutable();
  assert(discovered.available, discovered.error || "Codex CLI is unavailable");
  const client = new CodexAppServerClient({
    command: discovered.command,
    cwd: path.resolve(__dirname, ".."),
    clientVersion: "freeflow-smoke",
    requestTimeoutMs: 20_000,
  });
  let threadId = "";
  let turnId = "";
  let answer = "";
  let finishTurn = () => {};
  let completed = null;
  client.on("notification", (method, params) => {
    if (method === "item/agentMessage/delta" && params.turnId === turnId) answer += String(params.delta || "");
    if (method === "item/completed" && params.turnId === turnId && params.item?.type === "agentMessage") {
      answer = String(params.item.text || answer);
    }
    if (method === "turn/completed" && params.turn?.id === turnId) {
      if (params.turn.status === "completed") finishTurn();
      else finishTurn(new Error(params.turn.error?.message || `Codex turn ended as ${params.turn.status}`));
    }
  });
  client.on("server-request", (request) => client.respond(request.id, { decision: "decline" }));
  try {
    await client.start();
    const [accountResult, modelResult] = await Promise.all([
      client.request("account/read", { refreshToken: false }),
      client.request("model/list", { limit: 100, includeHidden: false }),
    ]);
    assert(Array.isArray(modelResult?.data) && modelResult.data.length > 0, "Codex CLI returned no models");
    if (!accountResult?.account && accountResult?.requiresOpenaiAuth !== false) {
      console.log(`[check-agent-cli-smoke] ${discovered.version}: initialize, account, models, and shutdown passed; online turn skipped because Codex CLI is not logged in`);
      return;
    }
    const threadResult = await client.request("thread/start", {
      cwd: path.resolve(__dirname, ".."),
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: "read-only",
      developerInstructions: "Do not delegate work or use multi-agent orchestration.",
      serviceName: "freeflow",
    });
    threadId = String(threadResult?.thread?.id || "");
    assert(threadId, "Codex CLI did not create a thread");
    completed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Codex CLI turn did not complete within 120 seconds")), 120_000);
      finishTurn = (error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
    });
    const turnResult = await client.request("turn/start", {
      threadId,
      input: [{ type: "text", text: "Reply with exactly FREEFLOW_AGENT_OK. Do not use tools." }],
      approvalPolicy: "never",
    }, { timeoutMs: 30_000 });
    turnId = String(turnResult?.turn?.id || "");
    assert(turnId, "Codex CLI did not create a turn");
    await completed;
    assert(answer.includes("FREEFLOW_AGENT_OK"), "Codex CLI did not stream the expected assistant response");
  } finally {
    if (threadId && turnId) {
      await client.request("turn/interrupt", { threadId, turnId }, { timeoutMs: 3000 }).catch(() => {});
    }
    await client.stop();
  }
  console.log(`[check-agent-cli-smoke] ${discovered.version}: initialize, account, models, thread, turn, and shutdown passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
