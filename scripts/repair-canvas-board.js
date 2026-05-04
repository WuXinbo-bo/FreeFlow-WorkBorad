const path = require("path");
const { repairCanvasBoardFile } = require("../src/backend/services/canvasBoardRepairService");

async function main() {
  const rawPath = String(process.argv[2] || "").trim();
  if (!rawPath) {
    console.error("Usage: node scripts/repair-canvas-board.js <board-file-path>");
    process.exitCode = 1;
    return;
  }

  const targetPath = path.resolve(rawPath);
  const result = await repairCanvasBoardFile(targetPath);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error?.message || "repair failed",
        code: error?.code || "",
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
