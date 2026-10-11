const assert = require("node:assert/strict");
async function main() {
  const { createWorkspaceSearchIndex } = await import("../public/src/engines/canvas2d-core/search/workspaceSearchIndex.js");
  const files = new Map([ ["/ws/a.freeflow", { name: "A", modifiedAt: 1, size: 10, text: JSON.stringify({ items: [{ id: "a", type: "text", plainText: "旧报价", text: "旧报价" }] }) }], ["/ws/b.freeflow", { name: "B", modifiedAt: 1, size: 10, text: JSON.stringify({ items: [{ id: "b", type: "text", plainText: "报价明细", text: "报价明细" }] }) }] ]);
  let reads = 0;
  const index = createWorkspaceSearchIndex({ listBoards: async () => ({ ok: true, boards: [...files].map(([filePath, file]) => ({ filePath, ...file })) }), readBoard: async (path) => { reads += 1; return { ok: true, text: files.get(path).text }; } });
  try {
    const options = { currentPath: "/ws/a.freeflow", currentItems: [{ id: "a", type: "text", plainText: "未保存报价", text: "未保存报价" }] };
    let result = await index.search("/ws", "报价", options);
    assert.equal(result.results.length, 2); assert(result.results.some((item) => item.summary.includes("未保存"))); assert.equal(reads, 1);
    await index.search("/ws", "报价", options); assert.equal(reads, 1);
    files.get("/ws/b.freeflow").modifiedAt = 2;
    files.get("/ws/b.freeflow").text = JSON.stringify({ items: [{ id: "b", type: "text", plainText: "同步后的新条目", text: "同步后的新条目" }] });
    result = await index.search("/ws", "报价", options); assert.equal(result.results.length, 1); assert.equal(reads, 2);
    const saved = files.get("/ws/b.freeflow"); files.delete("/ws/b.freeflow");
    assert.equal((await index.search("/ws", "新条目", options)).results.length, 0);
    files.set("/ws/b.freeflow", saved);
    assert.equal((await index.search("/ws", "新条目", options)).results.length, 1);
    files.set("/ws/bad.freeflow", { name: "损坏文件", modifiedAt: 1, size: 1, text: "{" });
    result = await index.search("/ws", "报价", options); assert.equal(result.warnings.length, 1); assert.equal(result.results.length, 1);
    const controller = new AbortController(); controller.abort();
    assert.equal((await index.search("/ws", "报价", { ...options, signal: controller.signal })).canceled, true);
    const large = "长".repeat(25000) + "末尾报价";
    files.get("/ws/b.freeflow").modifiedAt = 3;
    files.get("/ws/b.freeflow").text = JSON.stringify({ items: [{ id: "b", type: "text", plainText: large, text: large }] });
    assert.equal((await index.search("/ws", "末尾报价", options)).results.length, 1, "long text must not be silently truncated");
    const limited = createWorkspaceSearchIndex({ maxCharacters: 1, listBoards: async () => ({ ok: true, boards: [{ filePath: "/ws/b.freeflow", name: "B", modifiedAt: 3, size: 10 }] }), readBoard: async () => ({ ok: true, text: files.get("/ws/b.freeflow").text }) });
    const budget = await limited.search("/ws", "报价");
    assert.equal(budget.results.length, 0); assert.equal(budget.warnings.length, 1); limited.dispose();
    let finishOld;
    const racing = createWorkspaceSearchIndex({
      listBoards: async (root) => ({ ok: true, boards: [{ filePath: `${root}/a.freeflow`, name: root, modifiedAt: 1, size: 10 }] }),
      readBoard: async (path) => path.startsWith("/old") ? new Promise((resolve) => { finishOld = resolve; }) : { ok: true, text: JSON.stringify({ items: [{ id: "new", type: "text", text: "新工作区报价" }] }) },
    });
    const oldSearch = racing.search("/old", "报价");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const newSearch = await racing.search("/new", "报价");
    finishOld({ ok: true, text: JSON.stringify({ items: [{ id: "old", type: "text", text: "旧工作区报价" }] }) });
    assert.equal((await oldSearch).canceled, true);
    assert(newSearch.results.every((entry) => entry.boardPath.startsWith("/new")));
    racing.dispose();
    console.log("[workspace-search] unsaved override, incremental reads, external changes, delete/restore, bad file and cancellation passed");
  } finally { index.dispose(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
