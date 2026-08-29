const path = require("path");
const { atomicWriteFile } = require("../src/backend/utils/atomicWrite");
const { addChecksumToEnvelope, CHECKSUM_ALGORITHMS } = require("../src/backend/utils/checksum");
const { FREEFLOW_BOARD_FILE_KIND } = require("../src/backend/models/canvasBoardFileFormat");

function isFreeFlowBoardPath(targetPath = "") {
  return String(targetPath || "").trim().toLowerCase().endsWith(".freeflow");
}

function serializeBoardFile(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
  const envelope = JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/, "") || "{}");
  if (envelope?.kind !== FREEFLOW_BOARD_FILE_KIND) {
    throw new Error("Invalid .freeflow board envelope");
  }
  const checksummed = addChecksumToEnvelope(envelope, {
    algorithm: CHECKSUM_ALGORITHMS.CRC32,
  });
  return Buffer.from(JSON.stringify(checksummed, null, 2), "utf8");
}

function createAtomicBoardFileWriter(options = {}) {
  const writeAtomically = options.atomicWriteFile || atomicWriteFile;
  const queues = new Map();

  function write(targetPath, data) {
    const resolvedPath = path.resolve(String(targetPath || "").trim());
    const previous = queues.get(resolvedPath) || Promise.resolve();
    const queued = previous
      .catch(() => {})
      .then(async () => {
        const buffer = serializeBoardFile(data);
        const result = await writeAtomically(resolvedPath, buffer, {
          fsync: true,
          preserveTempOnFailure: false,
        });
        if (!result?.ok) {
          throw new Error(result?.error || "Atomic board write failed");
        }
        return {
          ok: true,
          filePath: resolvedPath,
          size: result.bytesWritten,
        };
      });
    queues.set(resolvedPath, queued);
    void queued.finally(() => {
      if (queues.get(resolvedPath) === queued) {
        queues.delete(resolvedPath);
      }
    }).catch(() => {});
    return queued;
  }

  return { write };
}

module.exports = {
  createAtomicBoardFileWriter,
  isFreeFlowBoardPath,
  serializeBoardFile,
};
