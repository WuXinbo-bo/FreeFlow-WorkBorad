const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const SERVICE_SOURCE = fs.readFileSync(path.join(__dirname, "../src/backend/services/secretStorageService.js"), "utf8");
const ATOMIC = require("../src/backend/utils/atomicWrite");

function loadService(paths, { platform = "win32", execFileSync = () => { throw new Error("DPAPI unavailable"); }, atomicWriteFile = ATOMIC.atomicWriteFile, atomicWriteJsonFile = ATOMIC.atomicWriteJsonFile } = {}) {
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id === "../config/paths") return paths;
    if (id === "../utils/atomicWrite") return { atomicWriteFile, atomicWriteJsonFile };
    if (id === "crypto") return require("node:crypto");
    if (id === "fs/promises") return require("node:fs/promises");
    if (id === "child_process") return { execFileSync };
    throw new Error(`Unexpected require: ${id}`);
  };
  vm.runInNewContext(`(function(require, module, exports) { ${SERVICE_SOURCE}\n})(require, module, module.exports);`, {
    require: localRequire,
    module,
    process: { platform },
    Buffer,
    console,
    setTimeout,
    clearTimeout,
  });
  return module.exports;
}

async function makePaths() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "freeflow-secret-check-"));
  return { dir, paths: { CREDENTIALS_FILE: path.join(dir, "vault.json"), CREDENTIALS_KEY_FILE: path.join(dir, "vault.key") } };
}

async function checkConcurrentFallback(platform) {
  const { dir, paths } = await makePaths();
  try {
    const service = loadService(paths, { platform });
    await Promise.all(Array.from({ length: 32 }, (_, index) => service.writeSecret(`credential-${index}`, `secret-value-${index}`)));
    const raw = JSON.parse(await fsp.readFile(paths.CREDENTIALS_FILE, "utf8"));
    assert.equal(Object.keys(raw.entries).length, 32);
    assert.equal(Buffer.from((await fsp.readFile(paths.CREDENTIALS_KEY_FILE, "utf8")).trim(), "base64").length, 32);
    const restartedService = loadService(paths, { platform });
    for (let index = 0; index < 32; index += 1) {
      assert.equal(await service.readSecret(`credential-${index}`), `secret-value-${index}`);
      assert.equal(await restartedService.readSecret(`credential-${index}`), `secret-value-${index}`);
      assert.equal(JSON.stringify(raw.entries[`credential-${index}`]).includes(`secret-value-${index}`), false);
    }
    await service.clearSecret("credential-0");
    assert.equal(await restartedService.readSecret("credential-0"), "");
    await service.writeSecret("credential-0", "replacement");
    assert.equal(await restartedService.readSecret("credential-0"), "replacement");
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function checkVaultWriteRecovery() {
  const { dir, paths } = await makePaths();
  let failed = true;
  try {
    const service = loadService(paths, {
      atomicWriteJsonFile: async (...args) => {
        if (failed) { failed = false; return { ok: false, error: "simulated vault write failure" }; }
        return ATOMIC.atomicWriteJsonFile(...args);
      },
    });
    await assert.rejects(service.writeSecret("first", "value"), /simulated vault write failure/);
    await service.writeSecret("second", "value-2");
    assert.equal(await loadService(paths).readSecret("second"), "value-2");
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function checkKeyWriteRecovery() {
  const { dir, paths } = await makePaths();
  let failed = true;
  try {
    const service = loadService(paths, {
      atomicWriteFile: async (...args) => {
        if (failed) { failed = false; return { ok: false, error: "simulated key write failure" }; }
        return ATOMIC.atomicWriteFile(...args);
      },
    });
    await assert.rejects(service.writeSecret("first", "value"), /simulated key write failure/);
    await service.writeSecret("second", "value-2");
    assert.equal(await service.readSecret("second"), "value-2");
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function checkDpapiBranch() {
  const { dir, paths } = await makePaths();
  const fakeExec = (_file, _args, options) => options.input.toString("utf8");
  try {
    const service = loadService(paths, { execFileSync: fakeExec });
    await service.writeSecret("dpapi", "windows-secret");
    const raw = JSON.parse(await fsp.readFile(paths.CREDENTIALS_FILE, "utf8"));
    assert.equal(raw.entries.dpapi.scheme, "dpapi-current-user");
    assert.equal(fs.existsSync(paths.CREDENTIALS_KEY_FILE), false);
    assert.equal(await service.readSecret("dpapi"), "windows-secret");
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

Promise.all([checkConcurrentFallback("win32"), checkConcurrentFallback("darwin"), checkKeyWriteRecovery(), checkVaultWriteRecovery(), checkDpapiBranch()]).then(() => {
  console.log("Secret storage: concurrent fallback encryption, retry recovery and Windows DPAPI branch passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
