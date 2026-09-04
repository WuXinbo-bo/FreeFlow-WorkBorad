const crypto = require("crypto");
const { pickWorkbenchPreferences } = require("../models/uiSettingsModel");
const { normalizeThemeSettings, pickThemeSettings } = require("../models/themeSettingsModel");

const PRODUCT_NAME = "FreeFlow";

function createSettingsError(message, { statusCode = 400, code = "SETTINGS_INVALID", fieldErrors = {} } = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.fieldErrors = fieldErrors;
  return error;
}

function normalizePath(value, field) {
  const next = String(value || "").trim();
  if (next.length > 400) {
    throw createSettingsError("设置内容校验失败", { fieldErrors: { [field]: "路径不能超过 400 个字符" } });
  }
  return next;
}

function buildRevision(snapshot) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(snapshot.sections))
    .digest("hex")
    .slice(0, 20);
}

function createSettingsCenterService(deps) {
  const {
    uiSettingsService,
    permissionsService,
    agentSettingsService,
  } = deps;
  let transactionQueue = Promise.resolve();

  async function readSourceStores() {
    const [uiSettings, permissionStore, agentSettings] = await Promise.all([
      uiSettingsService.readUiSettingsStore(),
      permissionsService.readPermissionsStore(),
      agentSettingsService.readAgentSettings(),
    ]);
    return { uiSettings, permissionStore, agentSettings };
  }

  function toSnapshot(stores) {
    const { uiSettings, permissionStore, agentSettings } = stores;
    const snapshot = {
      schemaVersion: 1,
      sections: {
        general: {
          productName: PRODUCT_NAME,
          workspaceName: uiSettings.appName || PRODUCT_NAME,
          workspaceSubtitle: uiSettings.appSubtitle || "",
          assistantName: uiSettings.assistantName || PRODUCT_NAME,
          updateCheckEnabled: uiSettings.updateCheckEnabled !== false,
        },
        ai: {
          agent: { ...agentSettings },
        },
        appearance: pickThemeSettings(uiSettings),
        workbench: pickWorkbenchPreferences(uiSettings),
        canvas: {
          defaultBoardDirectory: uiSettings.canvasBoardSavePath || "",
          workspaceDirectory: uiSettings.canvasWorkspaceFolderPath || "",
          exportImageDirectory: uiSettings.canvasImageSavePath || "",
          autosaveEnabled: uiSettings.canvasAutosaveEnabled !== false,
          linkSemanticsEnabled: uiSettings.canvasLinkSemanticsEnabled !== false,
        },
        permissions: {
          permissions: { ...(permissionStore.permissions || {}) },
          allowedRoots: Array.isArray(permissionStore.allowedRoots) ? [...permissionStore.allowedRoots] : [],
        },
      },
    };
    return {
      ok: true,
      ...snapshot,
      revision: buildRevision(snapshot),
    };
  }

  async function readSettingsSnapshot() {
    return toSnapshot(await readSourceStores());
  }

  function buildPatches(sections = {}, stores) {
    const uiPatch = {};
    let permissionsPatch = null;
    let agentPatch = null;

    if (sections.general) {
      const workspaceName = String(sections.general.workspaceName || "").trim();
      const workspaceSubtitle = String(sections.general.workspaceSubtitle || "").trim();
      const assistantName = String(sections.general.assistantName || "").trim();
      if (!workspaceName || workspaceName.length > 40) {
        throw createSettingsError("设置内容校验失败", {
          fieldErrors: { "general.workspaceName": "工作区名称应为 1 至 40 个字符" },
        });
      }
      if (!workspaceSubtitle || workspaceSubtitle.length > 80) {
        throw createSettingsError("设置内容校验失败", {
          fieldErrors: { "general.workspaceSubtitle": "工作区副标题应为 1 至 80 个字符" },
        });
      }
      if (!assistantName || assistantName.length > 40) {
        throw createSettingsError("设置内容校验失败", {
          fieldErrors: { "general.assistantName": "助手名称应为 1 至 40 个字符" },
        });
      }
      uiPatch.appName = workspaceName;
      uiPatch.appSubtitle = workspaceSubtitle;
      uiPatch.assistantName = assistantName;
      uiPatch.updateCheckEnabled = sections.general.updateCheckEnabled !== false;
    }

    if (sections.ai) {
      if (sections.ai.agent && typeof sections.ai.agent === "object") {
        const agent = sections.ai.agent;
        const workspaceRoot = normalizePath(agent.workspaceRoot, "ai.agent.workspaceRoot");
        if (!workspaceRoot) {
          throw createSettingsError("设置内容校验失败", {
            fieldErrors: { "ai.agent.workspaceRoot": "请选择默认工作区目录" },
          });
        }
        if (agent.providers && typeof agent.providers === "object") {
          const providerPatches = {};
          for (const provider of ["codex", "claude"]) {
            const source = agent.providers[provider];
            if (!source || typeof source !== "object") continue;
            providerPatches[provider] = {
              reasoningEffort: String(source.reasoningEffort || "high"),
              approvalPolicy: String(source.approvalPolicy || "on-request"),
              sandboxMode: String(source.sandboxMode || "workspace-write"),
            };
          }
          agentPatch = {
            activeProvider: agent.activeProvider === "claude" ? "claude" : "codex",
            providers: providerPatches,
            workspaceRoot,
            queueWhileRunning: agent.queueWhileRunning !== false,
            showReasoning: agent.showReasoning !== false,
          };
        } else {
          agentPatch = {
            cliPath: normalizePath(agent.cliPath, "ai.agent.cliPath"),
            defaultModel: String(agent.defaultModel || "").trim().slice(0, 200),
            reasoningEffort: String(agent.reasoningEffort || "high"),
            approvalPolicy: String(agent.approvalPolicy || "on-request"),
            sandboxMode: String(agent.sandboxMode || "workspace-write"),
            workspaceRoot,
            queueWhileRunning: agent.queueWhileRunning !== false,
            showReasoning: agent.showReasoning !== false,
          };
        }
      }
    }

    if (sections.appearance) {
      Object.assign(uiPatch, normalizeThemeSettings(sections.appearance));
    }

    if (sections.workbench) {
      Object.assign(uiPatch, pickWorkbenchPreferences(sections.workbench));
    }

    if (sections.canvas) {
      uiPatch.canvasBoardSavePath = normalizePath(sections.canvas.defaultBoardDirectory, "canvas.defaultBoardDirectory");
      uiPatch.canvasWorkspaceFolderPath = normalizePath(sections.canvas.workspaceDirectory, "canvas.workspaceDirectory");
      uiPatch.canvasImageSavePath = normalizePath(sections.canvas.exportImageDirectory, "canvas.exportImageDirectory");
      uiPatch.canvasAutosaveEnabled = sections.canvas.autosaveEnabled !== false;
      uiPatch.canvasLinkSemanticsEnabled = sections.canvas.linkSemanticsEnabled !== false;
    }

    if (sections.permissions) {
      const permissions = {};
      for (const key of Object.keys(stores.permissionStore.permissions || {})) {
        permissions[key] = sections.permissions.permissions?.[key] === true;
      }
      permissionsPatch = {
        permissions,
        allowedRoots: Array.isArray(sections.permissions.allowedRoots)
          ? sections.permissions.allowedRoots.map((item) => permissionsService.normalizeRootPath(item)).filter(Boolean)
          : stores.permissionStore.allowedRoots,
      };
    }

    return { uiPatch, permissionsPatch, agentPatch };
  }

  function saveSettingsSnapshot(payload = {}) {
    const operation = transactionQueue.catch(() => {}).then(async () => {
      const stores = await readSourceStores();
      const currentSnapshot = toSnapshot(stores);
      if (payload.revision && payload.revision !== currentSnapshot.revision) {
        throw createSettingsError("设置已在其他位置更新，请重新载入后再保存", {
          statusCode: 409,
          code: "SETTINGS_REVISION_CONFLICT",
        });
      }
      const sections = payload.sections && typeof payload.sections === "object" ? payload.sections : {};
      const patches = buildPatches(sections, stores);
      const effectiveAgent = patches.agentPatch || stores.agentSettings;
      const effectiveRoots = patches.permissionsPatch?.allowedRoots || stores.permissionStore.allowedRoots;
      try {
        await permissionsService.resolveAllowedExistingPath(effectiveAgent.workspaceRoot, effectiveRoots);
      } catch {
        throw createSettingsError("设置内容校验失败", {
          fieldErrors: { "ai.agent.workspaceRoot": "默认工作区必须位于权限页的授权目录内" },
        });
      }
      const changed = [];
      try {
        if (Object.keys(patches.uiPatch).length) {
          await uiSettingsService.writeUiSettingsStore(patches.uiPatch);
          changed.push("ui");
        }
        if (patches.permissionsPatch) {
          await permissionsService.writePermissionsStore(patches.permissionsPatch);
          changed.push("permissions");
        }
        if (patches.agentPatch) {
          await agentSettingsService.writeAgentSettings(patches.agentPatch);
          changed.push("agent");
        }
      } catch (error) {
        if (changed.includes("agent")) await agentSettingsService.writeAgentSettings(stores.agentSettings).catch(() => {});
        if (changed.includes("permissions")) await permissionsService.writePermissionsStore(stores.permissionStore).catch(() => {});
        if (changed.includes("ui")) await uiSettingsService.writeUiSettingsStore(stores.uiSettings).catch(() => {});
        throw error;
      }
      return readSettingsSnapshot();
    });
    transactionQueue = operation;
    return operation;
  }

  return {
    readSettingsSnapshot,
    saveSettingsSnapshot,
  };
}

module.exports = {
  createSettingsCenterService,
  createSettingsError,
};
