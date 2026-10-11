const assert = require("node:assert/strict");

async function main() {
  const { boardSyncLabel, summarizeSyncPlan } = await import("../public/src/engines/canvas2d-core/workspace/syncPresentation.js");
  const { getQuickSwitchBoards } = await import("../public/src/engines/canvas2d-core/workspace/quickSwitch.js");
  assert.equal(boardSyncLabel({ state: "up-to-date", connected: true }), "已同步");
  assert.equal(boardSyncLabel({ state: "up-to-date", connected: true, cached: true }), "上次已同步");
  assert.equal(boardSyncLabel({ state: "synced", connected: true, changed: true }), "本地已更新 · 待检查");
  assert.equal(boardSyncLabel({ state: "up-to-date", connected: true, dirty: true }), "未保存 · 待上传");
  assert.equal(boardSyncLabel({ state: "up-to-date", reloadRequired: true }), "磁盘已更新 · 待重载");
  assert.equal(boardSyncLabel({ state: "up-to-date", connected: false }), "仅本地");
  assert.equal(boardSyncLabel({ connected: true }), "尚未检查");
  assert.deepEqual(summarizeSyncPlan({ counts: { "local-only": 2, "local-changed": 1, "remote-only": 3, "remote-changed": 1, "both-changed": 1, "path-collision": 2, "deleted-remote": 1 } }), { upload: 3, pull: 4, conflict: 3, deleted: 1 });
  const boards = [{ name: "Alpha.freeflow", filePath: "/Boards/Alpha.freeflow", modifiedAt: 2 }, { name: "Beta.freeflow", filePath: "/Boards/Beta.freeflow", modifiedAt: 3 }];
  const recent = [{ ...boards[0], openedAt: 5 }, { name: "Outside.freeflow", filePath: "/Other/Outside.freeflow", openedAt: 4 }];
  assert.deepEqual(getQuickSwitchBoards(boards, recent, "", "workspace", "modified").map((item) => item.name), ["Beta.freeflow", "Alpha.freeflow"]);
  assert.deepEqual(getQuickSwitchBoards(boards, recent, "Alpha", "workspace", "modified").map((item) => item.filePath), [boards[0].filePath], "search duplicated recent/workspace canvas");
  assert.equal(getQuickSwitchBoards(boards, recent, "Outside", "workspace", "name")[0].filePath, recent[1].filePath, "quick search missed recent canvas outside the workspace");
  assert.equal(getQuickSwitchBoards(boards, recent, "/Other", "workspace", "modified")[0].filePath, recent[1].filePath);
  assert.equal(getQuickSwitchBoards(boards, recent, "", "workspace", "modified").some((entry) => entry.filePath.startsWith("/Other")), false, "recent canvas leaked into ordinary workspace view");
  assert.equal(getQuickSwitchBoards(boards, recent, "missing", "recent", "name").length, 0);
  console.log("[check-workspace-daily-use] saved/synced distinction, stale results, dirty/reload/offline states, counts, search and recent dedup passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
