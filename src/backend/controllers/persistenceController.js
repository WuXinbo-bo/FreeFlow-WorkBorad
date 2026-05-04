function createPersistenceController(deps) {
  const {
    permissionsService,
    modelProfilesService,
    modelProviderSettingsService,
    onModelProviderSettingsChanged,
    uiSettingsService,
    themeSettingsService,
    clipboardStoreService,
    sessionService,
    canvasBoardService,
    fileTextService,
  } = deps;

  return {
    async getPermissions(_req, res) {
      try {
        const store = await permissionsService.readPermissionsStore();
        res.json({
          ok: true,
          file: permissionsService.PERMISSIONS_FILE,
          desktopDir: permissionsService.DESKTOP_DIR,
          workspaceDir: permissionsService.WORKSPACE_DIR,
          ...store,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to read permissions file",
          details: error.message,
          file: permissionsService.PERMISSIONS_FILE,
        });
      }
    },

    async savePermissions(req, res) {
      const { permissions, allowedRoots } = req.body ?? {};
      try {
        const next = await permissionsService.writePermissionsStore({
          permissions,
          allowedRoots: Array.isArray(allowedRoots)
            ? allowedRoots.map((item) => permissionsService.normalizeRootPath(item)).filter(Boolean)
            : undefined,
        });
        res.json({
          ok: true,
          file: permissionsService.PERMISSIONS_FILE,
          desktopDir: permissionsService.DESKTOP_DIR,
          workspaceDir: permissionsService.WORKSPACE_DIR,
          ...next,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to write permissions file",
          details: error.message,
        });
      }
    },

    async getModelProfiles(_req, res) {
      try {
        const store = await modelProfilesService.readModelProfilesStore();
        res.json({
          ok: true,
          file: modelProfilesService.MODEL_PROFILES_FILE,
          ...store,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to read model profiles file",
          details: error.message,
          file: modelProfilesService.MODEL_PROFILES_FILE,
        });
      }
    },

    async saveModelProfiles(req, res) {
      try {
        const next = await modelProfilesService.writeModelProfilesStore({
          profiles: req.body?.profiles,
        });
        res.json({
          ok: true,
          file: modelProfilesService.MODEL_PROFILES_FILE,
          ...next,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to write model profiles file",
          details: error.message,
          file: modelProfilesService.MODEL_PROFILES_FILE,
        });
      }
    },

    async getModelProviderSettings(_req, res) {
      try {
        const store = await modelProviderSettingsService.readModelProviderSettingsStore();
        res.json({
          ok: true,
          file: modelProviderSettingsService.MODEL_PROVIDER_SETTINGS_FILE,
          ...store,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to read model provider settings file",
          details: error.message,
          file: modelProviderSettingsService.MODEL_PROVIDER_SETTINGS_FILE,
        });
      }
    },

    async saveModelProviderSettings(req, res) {
      try {
        const next = await modelProviderSettingsService.writeModelProviderSettingsStore(req.body || {});
        if (typeof onModelProviderSettingsChanged === "function") {
          await onModelProviderSettingsChanged(next);
        }
        res.json({
          ok: true,
          file: modelProviderSettingsService.MODEL_PROVIDER_SETTINGS_FILE,
          ...next,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to write model provider settings file",
          details: error.message,
          file: modelProviderSettingsService.MODEL_PROVIDER_SETTINGS_FILE,
        });
      }
    },

    async getUiSettings(_req, res) {
      try {
        const store = await uiSettingsService.readUiSettingsStore();
        res.json({
          ok: true,
          file: uiSettingsService.UI_SETTINGS_FILE,
          ...store,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to read UI settings file",
          details: error.message,
          file: uiSettingsService.UI_SETTINGS_FILE,
        });
      }
    },

    async saveUiSettings(req, res) {
      try {
        const next = await uiSettingsService.writeUiSettingsStore(req.body || {});
        res.json({
          ok: true,
          file: uiSettingsService.UI_SETTINGS_FILE,
          ...next,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to write UI settings file",
          details: error.message,
          file: uiSettingsService.UI_SETTINGS_FILE,
        });
      }
    },

    async getWorkbenchPreferences(_req, res) {
      try {
        const preferences = await uiSettingsService.readWorkbenchPreferencesStore();
        res.json({
          ok: true,
          file: uiSettingsService.UI_SETTINGS_FILE,
          preferences,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to read workbench preferences",
          details: error.message,
          file: uiSettingsService.UI_SETTINGS_FILE,
        });
      }
    },

    async saveWorkbenchPreferences(req, res) {
      try {
        const next = await uiSettingsService.writeWorkbenchPreferencesStore(req.body || {});
        res.json({
          ok: true,
          file: uiSettingsService.UI_SETTINGS_FILE,
          preferences: next.preferences,
          uiSettings: next.uiSettings,
          updatedAt: next.uiSettings.updatedAt,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to write workbench preferences",
          details: error.message,
          file: uiSettingsService.UI_SETTINGS_FILE,
        });
      }
    },

    async getThemeSettings(_req, res) {
      try {
        const store = await themeSettingsService.readThemeSettingsStore();
        res.json({
          ok: true,
          ...store,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to read theme settings file",
          details: error.message,
        });
      }
    },

    async saveThemeSettings(req, res) {
      try {
        const next = await themeSettingsService.writeThemeSettingsStore(req.body || {});
        res.json({
          ok: true,
          ...next,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to write theme settings file",
          details: error.message,
        });
      }
    },

    async getClipboardStore(_req, res) {
      try {
        const store = await clipboardStoreService.readClipboardStore();
        res.json({
          ok: true,
          file: clipboardStoreService.CLIPBOARD_STORE_FILE,
          ...store,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to read clipboard store",
          details: error.message,
          file: clipboardStoreService.CLIPBOARD_STORE_FILE,
        });
      }
    },

    async saveClipboardStore(req, res) {
      try {
        const next = await clipboardStoreService.writeClipboardStore(req.body || {});
        res.json({
          ok: true,
          file: clipboardStoreService.CLIPBOARD_STORE_FILE,
          ...next,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to write clipboard store",
          details: error.message,
          file: clipboardStoreService.CLIPBOARD_STORE_FILE,
        });
      }
    },

    async extractFileText(req, res) {
      try {
        const result = await fileTextService.extractFileText({
          filePath: String(req.body?.filePath || "").trim(),
          fileName: String(req.body?.fileName || "").trim(),
          mimeType: String(req.body?.mimeType || "").trim().toLowerCase(),
        });
        res.json(result);
      } catch (error) {
        res.status(error.statusCode || 500).json({
          ok: false,
          error: error.message.includes("filePath is required") || error.message.includes("Unsupported")
            ? error.message
            : "Failed to extract file text",
          details: error.statusCode ? undefined : error.message,
          filePath: String(req.body?.filePath || "").trim(),
        });
      }
    },

    async getDocxPreviewBase64(req, res) {
      const filePath = String(req.body?.filePath || "").trim();
      const fileName = String(req.body?.fileName || "").trim();
      const mimeType = String(req.body?.mimeType || "").trim().toLowerCase();
      const lowerPath = filePath.toLowerCase();
      const lowerName = fileName.toLowerCase();
      const isDocx =
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        lowerPath.endsWith(".docx") ||
        lowerName.endsWith(".docx");

      if (!filePath) {
        return res.status(400).json({
          ok: false,
          error: "filePath is required",
          code: "FILE_PREVIEW_PATH_REQUIRED",
          data: "",
          mime: "",
        });
      }

      if (!isDocx) {
        return res.status(400).json({
          ok: false,
          error: "Only DOCX preview is supported",
          code: "FILE_PREVIEW_UNSUPPORTED_TYPE",
          data: "",
          mime: "",
        });
      }

      try {
        const permissions = await permissionsService.readPermissionsStore();
        const allowedRoots = Array.isArray(permissions?.allowedRoots) ? permissions.allowedRoots : [];
        const normalizedFilePath = permissionsService.normalizeRootPath(filePath);
        const withinAllowedRoot = allowedRoots.some((root) => {
          const normalizedRoot = permissionsService.normalizeRootPath(root);
          return normalizedRoot && normalizedFilePath && normalizedFilePath.startsWith(normalizedRoot);
        });

        if (!withinAllowedRoot) {
          return res.status(403).json({
            ok: false,
            error: "File path is outside allowed roots",
            code: "FILE_PREVIEW_FORBIDDEN",
            data: "",
            mime: "",
          });
        }

        const fs = require("fs");
        const path = require("path");
        const resolvedPath = path.resolve(filePath);
        const buffer = await fs.promises.readFile(resolvedPath);
        res.json({
          ok: true,
          filePath: resolvedPath,
          data: buffer.toString("base64"),
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to read DOCX preview file",
          code: "FILE_PREVIEW_READ_FAILED",
          details: error.message,
          data: "",
          mime: "",
        });
      }
    },

    async getPdfPreviewBase64(req, res) {
      const filePath = String(req.body?.filePath || "").trim();
      const fileName = String(req.body?.fileName || "").trim();
      const mimeType = String(req.body?.mimeType || "").trim().toLowerCase();
      const lowerPath = filePath.toLowerCase();
      const lowerName = fileName.toLowerCase();
      const isPdf =
        mimeType === "application/pdf" ||
        lowerPath.endsWith(".pdf") ||
        lowerName.endsWith(".pdf");

      if (!filePath) {
        return res.status(400).json({
          ok: false,
          error: "filePath is required",
          code: "FILE_PREVIEW_PATH_REQUIRED",
          data: "",
          mime: "",
        });
      }

      if (!isPdf) {
        return res.status(400).json({
          ok: false,
          error: "Only PDF preview is supported",
          code: "FILE_PREVIEW_UNSUPPORTED_TYPE",
          data: "",
          mime: "",
        });
      }

      try {
        const permissions = await permissionsService.readPermissionsStore();
        const allowedRoots = Array.isArray(permissions?.allowedRoots) ? permissions.allowedRoots : [];
        const normalizedFilePath = permissionsService.normalizeRootPath(filePath);
        const withinAllowedRoot = allowedRoots.some((root) => {
          const normalizedRoot = permissionsService.normalizeRootPath(root);
          return normalizedRoot && normalizedFilePath && normalizedFilePath.startsWith(normalizedRoot);
        });

        if (!withinAllowedRoot) {
          return res.status(403).json({
            ok: false,
            error: "File path is outside allowed roots",
            code: "FILE_PREVIEW_FORBIDDEN",
            data: "",
            mime: "",
          });
        }

        const fs = require("fs");
        const path = require("path");
        const resolvedPath = path.resolve(filePath);
        const buffer = await fs.promises.readFile(resolvedPath);
        res.json({
          ok: true,
          filePath: resolvedPath,
          data: buffer.toString("base64"),
          mime: "application/pdf",
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to read PDF preview file",
          code: "FILE_PREVIEW_READ_FAILED",
          details: error.message,
          data: "",
          mime: "",
        });
      }
    },

    async getSessions(_req, res) {
      try {
        const store = await sessionService.readSessionStore();
        res.json({
          ok: true,
          file: sessionService.SESSIONS_FILE,
          ...store,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to read session file",
          details: error.message,
          file: sessionService.SESSIONS_FILE,
        });
      }
    },

    async saveSessions(req, res) {
      const { currentSessionId, sessions } = req.body ?? {};
      if (!Array.isArray(sessions)) {
        return res.status(400).json({ error: "sessions must be an array" });
      }

      try {
        const info = await sessionService.writeSessionStore({
          currentSessionId,
          sessions,
        });
        res.json({
          ok: true,
          file: sessionService.SESSIONS_FILE,
          ...info,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to write session file",
          details: error.message,
          file: sessionService.SESSIONS_FILE,
        });
      }
    },

    async getCanvasBoard(req, res) {
      try {
        const explicitPath = String(req.query?.filePath || "").trim();
        const store = await canvasBoardService.readCanvasBoard(explicitPath);
        res.json({
          ok: true,
          ...store,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to read canvas board file",
          details: error.message,
        });
      }
    },

    async saveCanvasBoard(req, res) {
      try {
        const info = await canvasBoardService.writeCanvasBoard(req.body || {});
        res.json({
          ok: true,
          ...info,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: "Failed to write canvas board file",
          details: error.message,
        });
      }
    },

    async repairCanvasBoard(req, res) {
      try {
        const filePath = String(req.body?.filePath || "").trim();
        const info = await canvasBoardService.repairCanvasBoardFile(filePath);
        res.json(info);
      } catch (error) {
        res.status(error.statusCode || 500).json({
          ok: false,
          error: error.message || "Failed to repair canvas board file",
          code: error.code || "",
          details: error.statusCode ? undefined : error.message,
        });
      }
    },
  };
}

module.exports = {
  createPersistenceController,
};
