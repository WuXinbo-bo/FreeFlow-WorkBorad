export const API_ROUTES = {
  uiSettings: "/api/ui-settings",
  workbenchPreferences: "/api/ui-settings/workbench-preferences",
  themeSettings: "/api/theme-settings",
  modelProviderSettings: "/api/model-provider-settings",
  filePreviewDocxBase64: "/api/file-preview/docx-base64",
  filePreviewPdfBase64: "/api/file-preview/pdf-base64",
  meta: "/api/meta",
  sessions: "/api/sessions",
  canvasBoard: "/api/canvas-board",
  chatOnce: "/api/chat-once",
};

export async function readJsonResponse(response, label = "接口") {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const raw = await response.text().catch(() => "");
    if (raw.startsWith("<!DOCTYPE") || raw.startsWith("<html")) {
      throw new Error(`${label}接口返回了 HTML 页面，当前服务可能还是旧版本，请重启 npm start 并强制刷新浏览器`);
    }

    throw new Error(`${label}接口返回了非 JSON 内容`);
  }

  return response.json();
}
