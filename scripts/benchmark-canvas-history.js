const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { performance } = require("node:perf_hooks");

const ROOT = path.resolve(__dirname, "..");
const HISTORY = "public/src/engines/canvas2d-core/history.js";

async function worker(mode, ref) {
  let source = mode === "baseline"
    ? execFileSync("git", ["show", `${ref}:${HISTORY}`], { cwd: ROOT, encoding: "utf8" })
    : fs.readFileSync(path.join(ROOT, HISTORY), "utf8");
  for (const name of ["constants.js", "utils.js"]) {
    source = source.replace(`"./${name}"`, JSON.stringify(pathToFileURL(path.join(ROOT, path.dirname(HISTORY), name)).href));
  }
  const { createHistoryState, pushPatchHistory } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  global.gc();
  const before = process.memoryUsage().heapUsed;
  const history = createHistoryState();
  const started = performance.now();
  for (let index = 0; index < 80; index += 1) {
    const text = Array.from({ length: 2048 }, (_, word) => `${index}-${word}-some rich text`).join("");
    pushPatchHistory(history, { itemIds: ["a"], beforeItems: [{ id: "a", html: text }], afterItems: [{ id: "a", html: `${text} next` }] });
  }
  const recordMs = performance.now() - started;
  global.gc();
  return { entries: history.undo.length, heapGrowthMiB: (process.memoryUsage().heapUsed - before) / 1024 / 1024, recordMs, signatureBytes: Buffer.byteLength(history.lastSignature) };
}

async function main() {
  if (process.argv[2] === "--worker") {
    console.log(JSON.stringify(await worker(process.argv[3], process.argv[4])));
    return;
  }
  const ref = process.argv[2];
  if (!ref) throw new Error("Usage: node scripts/benchmark-canvas-history.js <baseline-git-ref>");
  const results = {};
  for (const mode of ["baseline", "current"]) {
    const samples = Array.from({ length: 3 }, () => JSON.parse(execFileSync(process.execPath, ["--expose-gc", __filename, "--worker", mode, ref], { cwd: ROOT, env: process.env, encoding: "utf8" })));
    results[mode] = Object.fromEntries(Object.keys(samples[0]).map((key) => [key, samples.map((sample) => sample[key]).sort((a, b) => a - b)[1]]));
  }
  console.log(JSON.stringify({ baselineRef: ref, samples: 3, ...results }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
