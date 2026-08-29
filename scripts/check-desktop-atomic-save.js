const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { atomicWriteFile } = require("../src/backend/utils/atomicWrite");
const { verifyEnvelopeChecksum } = require("../src/backend/utils/checksum");
const { wrapFreeFlowBoardPayload } = require("../src/backend/models/canvasBoardFileFormat");
const {
  createAtomicBoardFileWriter,
  isFreeFlowBoardPath,
} = require("../electron/atomicBoardFileWriter");

function createPayload(value) {
  return JSON.stringify(
    wrapFreeFlowBoardPayload({
      kind: "structured-host-board",
      version: "1.0.0",
      board: { items: [{ id: value, type: "text", text: value }] },
    }),
    null,
    2
  );
}

function readBoard(targetPath) {
  const envelope = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  assert.equal(verifyEnvelopeChecksum(envelope).valid, true);
  return envelope.payload.board.items[0].id;
}

async function main() {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-atomic-save-"));
  try {
    const targetPath = path.join(testRoot, "board.freeflow");
    const writer = createAtomicBoardFileWriter();
    assert.equal(isFreeFlowBoardPath(targetPath), true);
    assert.equal(isFreeFlowBoardPath(path.join(testRoot, "image.png")), false);

    await writer.write(targetPath, createPayload("first"));
    assert.equal(readBoard(targetPath), "first");
    await writer.write(targetPath, createPayload("second"));
    assert.equal(readBoard(targetPath), "second");

    const failed = await atomicWriteFile(targetPath, createPayload("broken"), {
      beforeRename() {
        throw new Error("injected before rename");
      },
    });
    assert.equal(failed.ok, false);
    assert.equal(readBoard(targetPath), "second");
    assert.deepEqual(
      fs.readdirSync(testRoot).filter((name) => name.endsWith(".tmp")),
      []
    );

    const completionOrder = [];
    const delayedWriter = createAtomicBoardFileWriter({
      async atomicWriteFile(filePath, data, options) {
        const value = JSON.parse(Buffer.from(data).toString("utf8")).payload.board.items[0].id;
        await new Promise((resolve) => setTimeout(resolve, value === "rapid-1" ? 30 : 1));
        const result = await atomicWriteFile(filePath, data, options);
        completionOrder.push(value);
        return result;
      },
    });
    await Promise.all([
      delayedWriter.write(targetPath, createPayload("rapid-1")),
      delayedWriter.write(targetPath, createPayload("rapid-2")),
      delayedWriter.write(targetPath, createPayload("rapid-3")),
    ]);
    assert.deepEqual(completionOrder, ["rapid-1", "rapid-2", "rapid-3"]);
    assert.equal(readBoard(targetPath), "rapid-3");

    console.log("[check-desktop-atomic-save] ok");
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
