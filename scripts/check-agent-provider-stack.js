const assert = require("assert");
const fs = require("fs/promises");
const http = require("http");
const os = require("os");
const path = require("path");

const {
  getDefaultAgentSettings,
  normalizeAgentSettings,
  providerValidationFingerprint,
} = require("../src/backend/agent/agentSettingsModel");
const {
  createCliRuntimeRegistry,
} = require("../src/backend/agent/cliRuntimeRegistry");
const {
  createAgentConnectionService,
  providerApiRoot,
} = require("../src/backend/agent/agentConnectionService");

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function main() {
  const defaults = getDefaultAgentSettings("D:\\Workspace");
  assert.equal(defaults.activeProvider, "codex");
  assert.equal(defaults.providers.codex.selectedModel, "", "Codex must not choose a model automatically");
  assert.equal(defaults.providers.claude.selectedModel, "", "Claude must not choose a model automatically");

  const migrated = normalizeAgentSettings({
    schemaVersion: 1,
    provider: "codex",
    cliPath: "D:\\Tools\\codex.exe",
    defaultModel: "gpt-old",
    workspaceRoot: "D:\\Workspace",
    reasoningEffort: "xhigh",
    approvalPolicy: "never",
    sandboxMode: "workspace-write",
  });
  assert.equal(migrated.providers.codex.cliPath, "D:\\Tools\\codex.exe");
  assert.equal(migrated.providers.codex.selectedModel, "", "legacy automatic defaults must not bypass manual selection");
  assert.equal(migrated.providers.codex.legacyModelHint, "gpt-old");
  assert.equal(normalizeAgentSettings({
    ...defaults,
    providers: {
      ...defaults.providers,
      codex: { ...defaults.providers.codex, approvalPolicy: "on-failure" },
    },
  }).providers.codex.approvalPolicy, "on-request", "legacy Codex on-failure policy was not migrated");
  const legacySourceRoot = "D:\\FreeFlow-WorkBoard";
  const managedWorkspaceRoot = "C:\\Users\\test\\FreeFlow\\AIWorkspaces";
  const migratedWorkspace = normalizeAgentSettings({
    ...getDefaultAgentSettings(legacySourceRoot),
    schemaVersion: 2,
  }, {
    workspaceRoot: managedWorkspaceRoot,
    legacyWorkspaceRoot: legacySourceRoot,
  });
  assert.equal(migratedWorkspace.workspaceRoot, managedWorkspaceRoot, "legacy source workspace did not migrate to the managed workspace");
  assert.throws(() => providerApiRoot("codex", "file:///tmp/models"), /HTTP 或 HTTPS/, "non-HTTP provider URL was accepted");
  assert.throws(() => providerApiRoot("codex", "https://user:secret@example.test"), /账号或密码/, "credentials embedded in a provider URL were accepted");

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-provider-stack-"));
  try {
    const first = path.join(tempRoot, "codex-one.exe");
    const second = path.join(tempRoot, "codex-two.exe");
    await fs.writeFile(first, "fixture");
    await fs.writeFile(second, "fixture");
    const registry = createCliRuntimeRegistry({
      candidateResolver: async () => [
        { path: first, source: "system" },
        { path: second, source: "system" },
      ],
      probe: async (candidate) => ({ ok: true, version: path.basename(candidate) }),
    });
    const unbound = await registry.detect("codex");
    assert.equal(unbound.candidates.length, 2);
    assert.equal(unbound.available, false, "multiple discoveries must remain unbound");
    assert.equal(unbound.requiresSelection, true);
    const bound = await registry.detect("codex", { configuredPath: second });
    assert.equal(bound.available, true);
    assert.equal(bound.path, second);

    let settings = getDefaultAgentSettings(tempRoot);
    const secrets = new Map();
    const settingsService = {
      async readAgentSettings() { return structuredClone(settings); },
      async readAgentRuntimeSettings(provider) {
        return { ...structuredClone(settings.providers[provider]), apiKey: secrets.get(provider) || "" };
      },
      async updateProviderConnection(provider, input) {
        const current = settings.providers[provider];
        const changed = current.baseUrl !== input.baseUrl || input.apiKeyAction === "replace" || input.apiKeyAction === "clear";
        if (input.apiKeyAction === "replace") secrets.set(provider, input.apiKey);
        if (input.apiKeyAction === "clear") secrets.delete(provider);
        settings.providers[provider] = {
          ...current,
          baseUrl: input.baseUrl,
          apiKeyConfigured: secrets.has(provider),
          models: changed ? [] : current.models,
          selectedModel: changed ? "" : current.selectedModel,
          modelValidatedAt: changed ? 0 : current.modelValidatedAt,
          validationFingerprint: changed ? "" : current.validationFingerprint,
          connectionRevision: changed ? (current.connectionRevision || 0) + 1 : current.connectionRevision,
        };
        return structuredClone(settings);
      },
      async updateProviderModels(provider, models) {
        settings.providers[provider] = {
          ...settings.providers[provider],
          models,
          modelsFetchedAt: Date.now(),
        };
        return structuredClone(settings);
      },
      async selectProviderModel(provider, model) {
        assert(settings.providers[provider].models.some((item) => item.id === model));
        settings.providers[provider] = { ...settings.providers[provider], selectedModel: model, modelValidatedAt: 0, validationFingerprint: "" };
        return structuredClone(settings);
      },
      async markProviderValidated(provider) {
        const next = { ...settings.providers[provider], modelValidatedAt: Date.now() };
        next.validationFingerprint = providerValidationFingerprint(provider, next);
        settings.providers[provider] = next;
        return structuredClone(settings);
      },
    };

    const server = http.createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/v1/models") {
        response.end(JSON.stringify({ data: [{ id: "gpt-test" }, { id: "gpt-second" }] }));
        return;
      }
      if (request.url === "/v1/responses" && request.method === "POST") {
        response.end(JSON.stringify({ id: "response-test", output: [] }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: { message: "not found" } }));
    });
    const baseUrl = await listen(server);
    assert.equal(providerApiRoot("codex", `${baseUrl}/v1/models`), `${baseUrl}/v1`);
    try {
      let runtimeValidations = 0;
      const connections = createAgentConnectionService({
        settingsService,
        validateRuntime: async (provider) => {
          assert.equal(provider, "codex");
          runtimeValidations += 1;
        },
      });
      await connections.saveConnection("codex", { baseUrl, apiKey: "secret", apiKeyAction: "replace" });
      const refreshed = await connections.refreshModels("codex");
      assert.deepEqual(refreshed.models.map((item) => item.id), ["gpt-second", "gpt-test"]);
      assert.equal(refreshed.settings.providers.codex.selectedModel, "", "model refresh must not select a default");
      await connections.selectModel("codex", "gpt-test");
      const validated = await connections.testConnection("codex");
      assert.equal(validated.ready, true);
      assert.equal(runtimeValidations, 1, "connection test bypassed the Codex app-server validator");
      assert.equal(
        validated.settings.providers.codex.validationFingerprint,
        providerValidationFingerprint("codex", validated.settings.providers.codex),
        "successful validation did not bind to the active configuration"
      );
      const changed = await connections.saveConnection("codex", { baseUrl: `${baseUrl}/gateway`, apiKeyAction: "keep" });
      assert.equal(changed.providers.codex.models.length, 0);
      assert.equal(changed.providers.codex.selectedModel, "");
      assert.equal(changed.providers.codex.modelValidatedAt, 0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }

    const previousHome = process.env.FREEFLOW_HOME_DIR;
    const previousData = process.env.FREEFLOW_USER_DATA_DIR;
    process.env.FREEFLOW_HOME_DIR = path.join(tempRoot, "actual-service");
    process.env.FREEFLOW_USER_DATA_DIR = path.join(tempRoot, "actual-service", "AppData");
    for (const modulePath of [
      "../src/backend/config/paths",
      "../src/backend/services/secretStorageService",
      "../src/backend/agent/agentSettingsService",
    ]) delete require.cache[require.resolve(modulePath)];
    const actualPaths = require("../src/backend/config/paths");
    await fs.mkdir(path.dirname(actualPaths.AGENT_SETTINGS_FILE), { recursive: true });
    await fs.writeFile(actualPaths.AGENT_SETTINGS_FILE, JSON.stringify({
      ...getDefaultAgentSettings(actualPaths.WORKSPACE_DIR),
      schemaVersion: 2,
    }));
    const actualService = require("../src/backend/agent/agentSettingsService");
    const migratedSettings = await actualService.readAgentSettings();
    const persistedSettings = JSON.parse(await fs.readFile(actualPaths.AGENT_SETTINGS_FILE, "utf8"));
    assert.equal(migratedSettings.workspaceRoot, actualPaths.AGENT_WORKSPACES_DIR, "settings service kept the source directory as the default workspace");
    assert.equal(persistedSettings.schemaVersion, 3, "settings service did not persist the workspace schema migration");
    assert.equal(persistedSettings.workspaceRoot, actualPaths.AGENT_WORKSPACES_DIR, "settings service did not persist the managed workspace root");
    await actualService.updateProviderConnection("codex", {
      baseUrl,
      apiKey: "stored-secret",
      apiKeyAction: "replace",
    });
    const publicSettings = await actualService.readAgentSettings();
    const runtimeSettings = await actualService.readAgentRuntimeSettings("codex");
    assert.equal(publicSettings.providers.codex.apiKeyConfigured, true);
    assert.equal(Object.hasOwn(publicSettings.providers.codex, "apiKey"), false, "public settings exposed the API key");
    assert.equal(runtimeSettings.apiKey, "stored-secret");
    if (previousHome === undefined) delete process.env.FREEFLOW_HOME_DIR;
    else process.env.FREEFLOW_HOME_DIR = previousHome;
    if (previousData === undefined) delete process.env.FREEFLOW_USER_DATA_DIR;
    else process.env.FREEFLOW_USER_DATA_DIR = previousData;
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }

  console.log("[check-agent-provider-stack] manual runtime, connection, and model contracts passed");
}

main().catch((error) => {
  console.error(`[check-agent-provider-stack] ${error.stack || error.message}`);
  process.exitCode = 1;
});
