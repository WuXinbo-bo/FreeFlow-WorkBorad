const assert = require("assert/strict");
const fs = require("fs/promises");
const path = require("path");
const http = require("http");
const express = require("express");
const { createAssistantPluginRouter } = require("../src/backend/plugins/assistantPluginRoutes");

async function main() {
  let installs = 0;
  const status = { installed: true, phase: "ready", desiredEnabled: true, activeEnabled: false };
  const manager = {
    getStatus: () => ({ ...status }),
    install: async () => { installs += 1; return { ...status }; },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/plugins/assistant", createAssistantPluginRouter({ manager, processHost: { isRunning: () => false } }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/plugins/assistant`;
  const originalRemove = fs.rm;
  const temporaryDirectories = [];
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  fs.rm = async (target, options) => {
    if (path.basename(target).startsWith("freeflow-plugin-import-")) {
      temporaryDirectories.push(target);
      throw Object.assign(new Error("simulated Windows import file lock"), { code: "EBUSY" });
    }
    return originalRemove(target, options);
  };
  try {
    const missingHeader = await fetch(`${baseUrl}/install`, { method: "POST" });
    assert.equal(missingHeader.status, 403);
    const crossOrigin = await fetch(`${baseUrl}/install`, {
      method: "POST", headers: { "x-freeflow-plugin": "1", origin: "https://untrusted.example", "sec-fetch-site": "cross-site" },
    });
    assert.equal(crossOrigin.status, 403);
    const imported = await fetch(`${baseUrl}/import`, {
      method: "POST", headers: { "x-freeflow-plugin": "1", "content-type": "application/octet-stream" }, body: Buffer.from("fake package; manager is stubbed for cleanup fault injection"),
    });
    assert.equal(imported.status, 202);
    assert.equal((await imported.json()).plugin.operationPending, true, "accepted imports must keep UI polling before manager phases advance");
    assert.equal(installs, 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(temporaryDirectories.length, 1, "temporary cleanup should reach the injected file lock");
    const nextInstall = await fetch(`${baseUrl}/install`, { method: "POST", headers: { "x-freeflow-plugin": "1" } });
    assert.equal(nextInstall.status, 202, "cleanup failure must release the installation lock");
    assert.equal(installs, 2);
    const readableStatus = await fetch(`${baseUrl}/status`);
    assert.equal(readableStatus.status, 200);
    assert.equal((await readableStatus.json()).plugin.phase, "ready");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(unhandled.length, 0, "cleanup failure must not become an unhandled rejection");
    console.log("PASS assistant plugin routes: origin/header protection and injected Windows cleanup failure preserve server, installation state, and subsequent installs");
  } finally {
    fs.rm = originalRemove;
    process.off("unhandledRejection", onUnhandled);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    for (const directory of temporaryDirectories) await originalRemove(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
