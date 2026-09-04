"use strict";

const assert = require("assert");

async function main() {
  const {
    activityGroupLabel,
    buildConversationTurns,
    formatTurnDuration,
    groupPresentedActivities,
    visibleActivities,
  } = await import("../public/src/runtime/conversationAssistant/activityPresentation.js");

  const activities = [
    { id: "hidden-user", rawType: "userMessage", turnId: "turn-1", createdAt: 1 },
    { id: "reasoning-old", semanticType: "reasoning", turnId: "turn-1", summary: "旧推理", phase: "running", createdAt: 2 },
    { id: "command-1", semanticType: "command", turnId: "turn-1", title: "执行命令", summary: "npm test", phase: "completed", detail: { output: "ok" }, createdAt: 3 },
    { id: "command-2", semanticType: "command", turnId: "turn-1", title: "执行命令", summary: "npm run build", phase: "completed", createdAt: 4 },
    { id: "routine", semanticType: "status", turnId: "turn-1", summary: "turn completed", phase: "completed", createdAt: 5 },
    { id: "reasoning-new", semanticType: "reasoning", turnId: "turn-1", summary: "最新推理", phase: "completed", createdAt: 6 },
    { id: "unknown-protocol", semanticType: "unknown", turnId: "turn-1", summary: "活动", detail: { tokenUsage: {} }, createdAt: 7 },
    { id: "reasoning-empty", semanticType: "reasoning", turnId: "turn-1", summary: "正在思考", phase: "completed", detail: { summary: [], content: [] }, createdAt: 8 },
  ];

  const visible = visibleActivities(activities);
  assert.deepStrictEqual(visible.map((item) => item.id), ["command-1", "command-2", "reasoning-new"], "presentation did not hide protocol chatter and stale reasoning");
  assert.deepStrictEqual(visibleActivities(activities, { showReasoning: false }).map((item) => item.id), ["command-1", "command-2"], "reasoning preference was ignored");

  const groups = groupPresentedActivities(visible);
  assert.strictEqual(groups.length, 2, "consecutive activities were not grouped");
  assert.strictEqual(groups[0].activities.length, 2, "command group lost an activity");
  assert.strictEqual(activityGroupLabel(groups[0]), "执行 2 个命令", "group label is not user-facing");

  const session = {
    messages: [
      { id: "user-1", turnId: "turn-1", role: "user", content: "检查项目", createdAt: 1 },
      { id: "assistant-1", turnId: "turn-1", role: "assistant", content: "检查完成", createdAt: 8 },
      { id: "orphan", turnId: "", role: "assistant", content: "旧会话消息", createdAt: 12 },
    ],
    turns: [{ id: "turn-1", status: "completed", createdAt: 1, startedAt: 1, completedAt: 7 }],
    activities: [...activities, { id: "session-error", semanticType: "error", summary: "恢复失败", phase: "failed", createdAt: 9 }],
    approvals: [
      { id: "approval-turn", turnId: "turn-1" },
      { id: "approval-session", turnId: "" },
    ],
  };
  const presentation = buildConversationTurns(session);
  assert.strictEqual(presentation.turns.length, 2, "orphan messages were not preserved");
  assert.deepStrictEqual(presentation.turns[0].userMessages.map((item) => item.id), ["user-1"], "user message was not associated with its turn");
  assert.deepStrictEqual(presentation.turns[0].assistantMessages.map((item) => item.id), ["assistant-1"], "assistant reply was not associated with its turn");
  assert.deepStrictEqual(presentation.turns[0].approvals.map((item) => item.id), ["approval-turn"], "turn approval association failed");
  assert.deepStrictEqual(presentation.sessionApprovals.map((item) => item.id), ["approval-session"], "session approval was dropped");
  assert.deepStrictEqual(presentation.sessionActivities.map((item) => item.id), ["session-error"], "session activity was not separated from turn activity");
  assert.strictEqual(formatTurnDuration({ startedAt: 1_000, completedAt: 66_000 }), "1 分 5 秒", "turn duration formatting regressed");

  console.log("[check-agent-activity-presentation] turn grouping, activity filtering, and recovery projection passed");
}

main().catch((error) => {
  console.error(`[check-agent-activity-presentation] ${error.stack || error.message}`);
  process.exitCode = 1;
});
