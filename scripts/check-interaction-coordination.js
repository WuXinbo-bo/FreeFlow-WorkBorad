const assert = require("assert");

async function main() {
  const { createLatestAsyncCommitter } = await import("../public/src/utils/latestAsyncCommitter.js");
  const releases = [];
  const committed = [];
  let active = 0;
  let maxActive = 0;

  const committer = createLatestAsyncCommitter({
    getFingerprint: (value) => String(value.id),
    commit: async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      committed.push(value.id);
      await new Promise((resolve) => releases.push(resolve));
      active -= 1;
    },
  });

  committer.submit({ id: "first" });
  await Promise.resolve();
  committer.submit({ id: "superseded" });
  committer.submit({ id: "latest" });
  assert.deepStrictEqual(committed, ["first"], "a second commit started while the first was in flight");

  releases.shift()();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepStrictEqual(committed, ["first", "latest"], "the latest pending value was not committed");
  assert.strictEqual(maxActive, 1, "commits were not single-flight");

  releases.shift()();
  await committer.whenIdle();
  committer.submit({ id: "stale-session" });
  await Promise.resolve();
  committer.reset();
  committer.submit({ id: "new-session" });
  releases.shift()();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(committed.at(-1), "new-session", "reset did not discard the stale pending session");
  releases.shift()();
  await committer.whenIdle();

  const failed = [];
  const recovered = [];
  const recoveringCommitter = createLatestAsyncCommitter({
    commit: async (value) => {
      if (value.id === "fail") {
        throw new Error("expected failure");
      }
      recovered.push(value.id);
    },
    onError: (error, value) => failed.push(`${value.id}:${error.message}`),
  });
  recoveringCommitter.submit({ id: "fail" });
  await recoveringCommitter.whenIdle();
  recoveringCommitter.submit({ id: "recover" });
  await recoveringCommitter.whenIdle();
  assert.deepStrictEqual(failed, ["fail:expected failure"], "commit failure was not reported");
  assert.deepStrictEqual(recovered, ["recover"], "committer did not recover after a failed task");

  console.log("[check-interaction-coordination] ok");
}

main().catch((error) => {
  console.error(`[check-interaction-coordination] ${error.message}`);
  process.exitCode = 1;
});
