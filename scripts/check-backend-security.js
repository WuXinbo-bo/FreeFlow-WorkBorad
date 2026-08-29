const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-backend-security-"));
const appHome = path.join(testRoot, "home");
const dataDir = path.join(appHome, "AppData");
process.env.FREEFLOW_HOME_DIR = appHome;
process.env.FREEFLOW_USER_DATA_DIR = dataDir;
process.env.FREEFLOW_CANVAS_BOARD_DIR = path.join(appHome, "CanvasBoards");

const { isLoopbackAddress } = require("../src/backend/utils/networkBoundary");
const { resolveAllowedExistingPath } = require("../src/backend/utils/allowedPath");
const modelProviderSettingsService = require("../src/backend/services/modelProviderSettingsService");
const permissionsService = require("../src/backend/services/permissionsService");
const server = require("../src/backend");

async function expectForbidden(promise) {
  await assert.rejects(promise, (error) => error?.statusCode === 403);
}

async function main() {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("127.24.1.9"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("0.0.0.0"), false);
  assert.equal(isLoopbackAddress("192.168.1.10"), false);
  assert.equal(isLoopbackAddress("::ffff:192.168.1.10"), false);

  const allowedRoot = path.join(testRoot, "allowed");
  const siblingRoot = path.join(testRoot, "allowed-prefix-collision");
  const outsideRoot = path.join(testRoot, "outside");
  fs.mkdirSync(allowedRoot, { recursive: true });
  fs.mkdirSync(siblingRoot, { recursive: true });
  fs.mkdirSync(outsideRoot, { recursive: true });
  const allowedFile = path.join(allowedRoot, "ok.txt");
  const siblingFile = path.join(siblingRoot, "no.txt");
  const outsideFile = path.join(outsideRoot, "secret.txt");
  fs.writeFileSync(allowedFile, "allowed", "utf8");
  fs.writeFileSync(siblingFile, "denied", "utf8");
  fs.writeFileSync(outsideFile, "denied", "utf8");

  assert.equal(await resolveAllowedExistingPath(allowedFile, [allowedRoot]), fs.realpathSync(allowedFile));
  await expectForbidden(resolveAllowedExistingPath(siblingFile, [allowedRoot]));
  await expectForbidden(resolveAllowedExistingPath(path.join(allowedRoot, "..", "outside", "secret.txt"), [allowedRoot]));

  const linkedOutside = path.join(allowedRoot, "linked-outside");
  fs.symlinkSync(outsideRoot, linkedOutside, process.platform === "win32" ? "junction" : "dir");
  await expectForbidden(resolveAllowedExistingPath(path.join(linkedOutside, "secret.txt"), [allowedRoot]));

  await permissionsService.writePermissionsStore({
    allowedRoots: [allowedRoot],
    permissions: {},
  });

  await modelProviderSettingsService.writeModelProviderSettingsStore({
    cloud: {
      provider: "bigmodel",
      baseUrl: "https://example.invalid/v1",
      apiKey: "secret-one",
      models: ["model-one"],
      defaultModel: "model-one",
    },
  });
  const publicSettings = modelProviderSettingsService.toPublicModelProviderSettings(
    await modelProviderSettingsService.readModelProviderSettingsStore()
  );
  assert.equal(publicSettings.cloud.apiKey, "");
  assert.equal(publicSettings.cloud.apiKeyConfigured, true);

  await modelProviderSettingsService.writeModelProviderSettingsStore({
    cloud: {
      provider: "bigmodel",
      baseUrl: "https://example.invalid/v2",
      apiKey: "",
      models: ["model-two"],
      defaultModel: "model-two",
    },
  });
  assert.equal((await modelProviderSettingsService.readModelProviderSettingsStore()).cloud.apiKey, "secret-one");

  await modelProviderSettingsService.writeModelProviderSettingsStore({
    cloud: {
      provider: "bigmodel",
      baseUrl: "https://example.invalid/v3",
      apiKey: "secret-two",
      models: ["model-three"],
      defaultModel: "model-three",
    },
  });
  assert.equal((await modelProviderSettingsService.readModelProviderSettingsStore()).cloud.apiKey, "secret-two");

  const instance = await server.startServer(0);
  try {
    const address = instance.address();
    assert.equal(address.address, "127.0.0.1");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const allowedResponse = await fetch(`${baseUrl}/api/local-file?path=${encodeURIComponent(allowedFile)}`);
    assert.equal(allowedResponse.status, 200);
    assert.equal(await allowedResponse.text(), "allowed");
    for (let index = 0; index < 3; index += 1) {
      const deniedResponse = await fetch(`${baseUrl}/api/local-file?path=${encodeURIComponent(outsideFile)}`);
      assert.equal(deniedResponse.status, 403);
    }
  } finally {
    await server.stopServer();
  }

  console.log("[check-backend-security] ok");
}

main()
  .finally(() => fs.rmSync(testRoot, { recursive: true, force: true }))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
