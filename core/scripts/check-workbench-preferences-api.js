const assert = require("assert");
const express = require("express");
const { createPersistenceRouter } = require("../src/backend/routes/persistenceRoutes");

async function main() {
  const calls = [];
  const deps = {
    permissionService: {},
    modelProfileService: {},
    modelProviderSettingsService: {},
    uiSettingsService: {
      UI_SETTINGS_FILE: "ui-settings.json",
      async readUiSettingsStore() {
        calls.push("read-ui-settings");
        return { defaultCanvasPanelVisible: true };
      },
      async writeUiSettingsStore(payload) {
        calls.push("write-ui-settings");
        return payload;
      },
      async readWorkbenchPreferencesStore() {
        calls.push("read-workbench-preferences");
        return { defaultCanvasPanelVisible: false, defaultChatPanelVisible: false };
      },
      async writeWorkbenchPreferencesStore(payload) {
        calls.push("write-workbench-preferences");
        return {
          preferences: payload,
          uiSettings: { ...payload, updatedAt: 1 },
        };
      },
    },
    themeSettingsService: {},
    clipboardStoreService: {},
    sessionService: {},
    canvasBoardService: {},
  };

  const router = createPersistenceRouter(deps);
  const stack = router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  const workbenchIndex = stack.indexOf("/ui-settings/workbench-preferences");
  const uiSettingsIndex = stack.indexOf("/ui-settings");
  assert(workbenchIndex >= 0, "workbench preferences route should be registered");
  assert(uiSettingsIndex >= 0, "ui settings route should be registered");
  assert(workbenchIndex < uiSettingsIndex, "specific workbench preferences route should be registered before /ui-settings");

  const app = express();
  app.use(express.json());
  app.use("/api", router);

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      try {
        const port = server.address().port;
        const response = await fetch(`http://127.0.0.1:${port}/api/ui-settings/workbench-preferences`);
        const body = await response.json();
        assert.strictEqual(response.status, 200, "workbench preferences route should respond");
        assert.strictEqual(body.preferences.defaultCanvasPanelVisible, false, "workbench preferences response mismatch");
        assert(calls.includes("read-workbench-preferences"), "workbench preferences handler should be called");
        assert(!calls.includes("read-ui-settings"), "generic ui settings handler should not handle workbench route");
        server.close(resolve);
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });

  console.log("[check-workbench-preferences-api] workbench preferences API routing passed");
}

main().catch((error) => {
  console.error(`[check-workbench-preferences-api] ${error.message}`);
  process.exit(1);
});
