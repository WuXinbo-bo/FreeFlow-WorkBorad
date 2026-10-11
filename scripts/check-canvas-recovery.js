const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { fork } = require("node:child_process");
const recovery = require("../src/backend/services/boardRecoveryService");
const { createAtomicBoardFileWriter } = require("../electron/atomicBoardFileWriter");
const { wrapFreeFlowBoardPayload, parseBoardFileText } = require("../src/backend/models/canvasBoardFileFormat");
const { verifyEnvelopeChecksum } = require("../src/backend/utils/checksum");
const { withFileLock } = require("../src/backend/utils/fileLock");

const text = (value) => JSON.stringify(wrapFreeFlowBoardPayload({ kind: "structured-host-board", board: { boardId: "recovery-board", items: [{ id: value, type: "text", text: value }] } }));
const value = async (file) => parseBoardFileText(await fs.readFile(file, "utf8")).payload.board.items[0].id;

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-canvas-recovery-"));
  const board = path.join(temp, "Original.freeflow");
  const writer = createAtomicBoardFileWriter();
  try {
    await writer.write(board, text("first"));
    assert.equal((await recovery.listCanvasHistory(board)).entries.length, 0);
    await writer.write(board, text("second"));
    const first = (await recovery.listCanvasHistory(board)).entries[0];
    const preview = await recovery.previewCanvasHistory(board, first.id);
    assert.deepEqual(preview.samples, ["first"]);
    await recovery.restoreCanvasHistory(board, first.id);
    assert.equal(await value(board), "first");
    const reverse = (await recovery.listCanvasHistory(board)).entries[0];
    assert.equal(reverse.reason, "before-restore");
    await recovery.restoreCanvasHistory(board, reverse.id);
    assert.equal(await value(board), "second", "restore could not be reversed");
    const identity = JSON.parse(await fs.readFile(board, "utf8"));
    identity.payload.board.boardId = "current-stable-sync-id";
    await writer.write(board, JSON.stringify(identity));
    await recovery.restoreCanvasHistory(board, first.id);
    assert.equal(JSON.parse(await fs.readFile(board, "utf8")).payload.board.boardId, "current-stable-sync-id", "restoring old contents changed the stable sync identity");
    await writer.write(board, text("second"));
    const trashed = await recovery.trashCanvasBoard(board);
    await assert.rejects(fs.access(board), { code: "ENOENT" });
    assert.equal((await recovery.listCanvasTrash(temp)).items[0].id, trashed.trashId);
    await writer.write(board, text("new same-name board"));
    const restored = await recovery.restoreCanvasTrash(temp, trashed.trashId);
    assert.equal(restored.renamed, true);
    assert.equal(await value(board), "new same-name board");
    assert.equal(await value(restored.filePath), "second");
    const forked = JSON.parse(await fs.readFile(restored.filePath, "utf8"));
    assert.notEqual(forked.payload.board.boardId, "recovery-board", "name collision created a duplicate sync identity");
    assert.equal(verifyEnvelopeChecksum(forked).valid, true);
    assert.equal((await recovery.listCanvasTrash(temp)).items.length, 0);
    const again = await recovery.trashCanvasBoard(restored.filePath);
    const direct = await recovery.restoreCanvasTrash(temp, again.trashId);
    assert.equal(direct.filePath, restored.filePath);
    await assert.rejects(recovery.restoreCanvasTrash(temp, "../../outside"));
    await assert.rejects(recovery.restoreCanvasHistory(board, "../../outside"));
    const trashThird = await recovery.trashCanvasBoard(restored.filePath);
    await recovery.purgeCanvasTrash(temp, trashThird.trashId);
    assert.equal((await recovery.listCanvasTrash(temp)).items.length, 0);
    const renamed = path.join(temp, "Renamed.freeflow");
    const historyCount = (await recovery.listCanvasHistory(board)).entries.length;
    await fs.rename(board, renamed);
    await recovery.moveCanvasHistory(board, renamed);
    assert.equal((await recovery.listCanvasHistory(renamed)).entries.length, historyCount, "rename lost history");
    for (let index = 0; index < 35; index += 1) await writer.write(renamed, text(`version-${index}`));
    assert.equal((await recovery.listCanvasHistory(renamed)).entries.length, recovery.MAX_HISTORY_ENTRIES);
    const symlinkBoard = path.join(temp, "Symlink.freeflow");
    const symlinkFolder = path.join(temp, "Redirected");
    const outside = path.join(temp, "Outside");
    await fs.mkdir(symlinkFolder); await fs.mkdir(outside);
    await fs.writeFile(path.join(symlinkFolder, "Protected.freeflow"), text("protected"));
    await fs.symlink(outside, path.join(symlinkFolder, ".freeflow-recovery"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(writer.write(path.join(symlinkFolder, "Protected.freeflow"), text("unwanted")));
    assert.equal(await value(path.join(symlinkFolder, "Protected.freeflow")), "protected", "failed history backup still replaced the current file");
    await fs.unlink(path.join(symlinkFolder, ".freeflow-recovery"));
    await writer.write(path.join(symlinkFolder, "Protected.freeflow"), text("recovered"));
    let symlinksSupported = true;
    try { await fs.symlink(renamed, symlinkBoard, process.platform === "win32" ? "file" : undefined); }
    catch (error) { if (process.platform !== "win32" || error.code !== "EPERM") throw error; symlinksSupported = false; }
    if (symlinksSupported) await assert.rejects(recovery.trashCanvasBoard(symlinkBoard));
    const invalid = path.join(temp, "Broken.freeflow");
    await fs.writeFile(invalid, "{broken");
    await writer.write(invalid, text("fixed"));
    const invalidEntry = (await recovery.listCanvasHistory(invalid)).entries[0];
    await assert.rejects(recovery.restoreCanvasHistory(invalid, invalidEntry.id));
    assert.equal(await value(invalid), "fixed");
    await Promise.all([writer.write(renamed, text("rapid-one")), writer.write(renamed, text("rapid-two")), writer.write(renamed, text("rapid-three"))]);
    assert.equal(await value(renamed), "rapid-three");
    let active = 0;
    let peak = 0;
    await Promise.all(Array.from({ length: 3 }, () => withFileLock(renamed, async () => { active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 20)); active -= 1; })));
    assert.equal(peak, 1, "same-process locks overlapped");
    await withFileLock(renamed, async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      await assert.rejects(withFileLock(renamed, () => { throw new Error("live lock was stolen"); }, { lockExpiryMs: 5, lockTimeoutMs: 20, retryIntervalMs: 5 }), /获取文件锁超时/);
    });
    const childScript = path.join(temp, "lock-test.cjs");
    await fs.writeFile(childScript, `const { withFileLock } = require(${JSON.stringify(path.resolve(__dirname, "../src/backend/utils/fileLock.js"))}); withFileLock(process.argv[2], async () => { process.send('entered'); await new Promise(r => setTimeout(r, 120)); process.send('leaving'); }).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });`);
    let concurrent = 0;
    let maximum = 0;
    await Promise.all(Array.from({ length: 2 }, () => new Promise((resolve, reject) => {
      const child = fork(childScript, [renamed], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
      child.on("message", (event) => { concurrent += event === "entered" ? 1 : -1; maximum = Math.max(maximum, concurrent); });
      child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`lock child exited ${code}`)));
    })));
    assert.equal(maximum, 1, "separate processes acquired the same file lock");
    console.log("[check-canvas-recovery] durable trash, collision/fork, preview, forward/reverse restore, rename, retention, invalid data, rapid saves and process locking passed");
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
