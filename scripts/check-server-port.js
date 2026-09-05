const assert = require("assert/strict");
const http = require("http");
const { DEFAULT_PORT, resolveServerPort } = require("../src/backend/config/serverPort");
const { listenOnLoopback } = require("../src/backend/utils/loopbackServer");
const { createIpcEventValidator } = require("../electron/ipcSecurity");

async function main() {
  const saved = { PORT: process.env.PORT, FREEFLOW_PORT: process.env.FREEFLOW_PORT };
  const servers = [];
  try {
    delete process.env.FREEFLOW_PORT;
    delete process.env.PORT;
    assert.equal(resolveServerPort(), DEFAULT_PORT);
    assert.notEqual(DEFAULT_PORT, 3000);
    process.env.PORT = "3000";
    assert.equal(resolveServerPort({ desktop: true }), DEFAULT_PORT);
    assert.equal(resolveServerPort(), 3000);
    process.env.PORT = "unrelated-project-port";
    assert.equal(resolveServerPort({ desktop: true }), DEFAULT_PORT);
    process.env.FREEFLOW_PORT = "53128";
    assert.equal(resolveServerPort({ desktop: true }), 53128);
    for (const value of ["-1", "65536", "NaN", "12.5"]) {
      process.env.FREEFLOW_PORT = value;
      assert.throws(() => resolveServerPort());
    }
    process.env.FREEFLOW_PORT = "0";
    assert.equal(resolveServerPort(), 0);

    const occupied = http.createServer((_req, res) => res.end("existing application"));
    servers.push(occupied);
    await listenOnLoopback(occupied, 0);
    const preferred = occupied.address().port;
    const app = http.createServer((_req, res) => res.end("FreeFlow"));
    servers.push(app);
    await listenOnLoopback(app, preferred);
    const actual = app.address().port;
    assert.notEqual(actual, preferred);
    assert.equal(app.address().address, "127.0.0.1");
    assert.equal(await (await fetch(`http://127.0.0.1:${preferred}`)).text(), "existing application");
    assert.equal(await (await fetch(`http://127.0.0.1:${actual}`)).text(), "FreeFlow");

    let origin = `http://127.0.0.1:${preferred}`;
    const frame = { url: `${origin}/?desktop=1` };
    const sender = { mainFrame: frame, isDestroyed: () => false };
    const validate = createIpcEventValidator({ expectedOrigin: () => origin, getAllowedWebContents: () => [sender] });
    validate({ sender, senderFrame: frame });
    origin = `http://127.0.0.1:${actual}`;
    assert.throws(() => validate({ sender, senderFrame: frame }));
    frame.url = `${origin}/canvas-office.html?backgroundExport=1`;
    validate({ sender, senderFrame: frame });
    await new Promise((resolve) => occupied.close(resolve));
    await new Promise((resolve) => app.close(resolve));
    await listenOnLoopback(app, preferred);
    assert.equal(app.address().port, preferred, "restart must recover the preferred port once it is free");
    console.log("[check-server-port] defaults, conflict fallback, IPC origins, and restart passed");
  } finally {
    for (const server of servers) if (server.listening) await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
