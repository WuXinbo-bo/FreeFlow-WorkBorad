const express = require("express");
const { createPersistenceController } = require("../controllers/persistenceController");

function createPersistenceRouter(deps) {
  const router = express.Router();
  const controller = createPersistenceController(deps);

  router.get("/permissions", controller.getPermissions);
  router.post("/permissions", controller.savePermissions);
  router.get("/model-profiles", controller.getModelProfiles);
  router.post("/model-profiles", controller.saveModelProfiles);
  router.get("/model-provider-settings", controller.getModelProviderSettings);
  router.post("/model-provider-settings", controller.saveModelProviderSettings);
  router.get("/ui-settings/workbench-preferences", controller.getWorkbenchPreferences);
  router.post("/ui-settings/workbench-preferences", controller.saveWorkbenchPreferences);
  router.get("/ui-settings", controller.getUiSettings);
  router.post("/ui-settings", controller.saveUiSettings);
  router.get("/theme-settings", controller.getThemeSettings);
  router.post("/theme-settings", controller.saveThemeSettings);
  router.get("/clipboard-store", controller.getClipboardStore);
  router.post("/clipboard-store", controller.saveClipboardStore);
  router.post("/file-text-extract", controller.extractFileText);
  router.post("/file-preview/docx-base64", controller.getDocxPreviewBase64);
  router.post("/file-preview/pdf-base64", controller.getPdfPreviewBase64);
  router.get("/sessions", controller.getSessions);
  router.post("/sessions", controller.saveSessions);
  router.get("/canvas-board", controller.getCanvasBoard);
  router.post("/canvas-board", controller.saveCanvasBoard);

  return router;
}

module.exports = {
  createPersistenceRouter,
};
