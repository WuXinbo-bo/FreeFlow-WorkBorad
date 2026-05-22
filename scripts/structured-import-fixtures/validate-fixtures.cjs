const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const fixtureRoot = path.join(root, "docs", "test", "structured-import-fixtures");
const indexPath = path.join(fixtureRoot, "fixture-index.json");

function fail(message) {
  console.error(`[fixtures] ${message}`);
  process.exitCode = 1;
}

function main() {
  if (!fs.existsSync(indexPath)) {
    fail(`missing index file: ${indexPath}`);
    return;
  }

  let list;
  try {
    list = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  } catch (error) {
    fail(`failed to parse fixture-index.json: ${error.message}`);
    return;
  }

  if (!Array.isArray(list) || list.length === 0) {
    fail("fixture-index.json must be a non-empty array");
    return;
  }

  const seenIds = new Set();
  let hasError = false;

  for (const item of list) {
    const id = String(item?.id || "").trim();
    const file = String(item?.file || "").trim();
    if (!id) {
      fail("fixture item missing id");
      hasError = true;
      continue;
    }
    if (seenIds.has(id)) {
      fail(`duplicate fixture id: ${id}`);
      hasError = true;
    }
    seenIds.add(id);
    if (!file) {
      fail(`fixture ${id} missing file path`);
      hasError = true;
      continue;
    }
    const abs = path.join(fixtureRoot, file);
    if (!fs.existsSync(abs)) {
      fail(`fixture ${id} file not found: ${file}`);
      hasError = true;
    }
  }

  if (!hasError) {
    console.log(`[fixtures] ok: ${list.length} fixtures validated`);
  }
}

main();
