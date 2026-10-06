const fs = require("fs/promises");
const { GITHUB_SYNC_SETTINGS_FILE } = require("../config/paths");
const { atomicWriteJsonFile } = require("../utils/atomicWrite");
const secretStorageService = require("./secretStorageService");

const ACCESS_TOKEN_SECRET = "github-sync-access-token";
const REFRESH_TOKEN_SECRET = "github-sync-refresh-token";
const DEFAULT_GITHUB_HOST = "https://github.com";

async function readSettings(filePath = GITHUB_SYNC_SETTINGS_FILE) {
  try {
    const value = JSON.parse(await fs.readFile(filePath, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

async function writeSettings(value, filePath = GITHUB_SYNC_SETTINGS_FILE) {
  const result = await atomicWriteJsonFile(filePath, value || {}, { mode: 0o600, fsync: true });
  if (!result.ok) throw new Error(result.error || "无法保存 GitHub 同步设置");
  return value || {};
}

async function getAccessToken() {
  return secretStorageService.readSecret(ACCESS_TOKEN_SECRET);
}

async function saveTokens({ accessToken = "", refreshToken = "" } = {}) {
  if (accessToken) await secretStorageService.writeSecret(ACCESS_TOKEN_SECRET, accessToken);
  if (refreshToken) await secretStorageService.writeSecret(REFRESH_TOKEN_SECRET, refreshToken);
}

async function clearTokens() {
  await Promise.all([
    secretStorageService.clearSecret(ACCESS_TOKEN_SECRET),
    secretStorageService.clearSecret(REFRESH_TOKEN_SECRET),
  ]);
}

async function beginDeviceFlow({ clientId, fetchImpl = globalThis.fetch, githubHost = DEFAULT_GITHUB_HOST } = {}) {
  const cleanClientId = String(clientId || "").trim();
  if (!cleanClientId) throw new Error("缺少 GitHub App Client ID，请在环境变量 FREEFLOW_GITHUB_CLIENT_ID 中配置");
  const response = await fetchImpl(`${String(githubHost).replace(/\/$/, "")}/login/device/code`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cleanClientId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error_description || body.message || "无法开始 GitHub 设备授权");
  return body;
}

async function pollDeviceFlow({ clientId, deviceCode, interval = 5, fetchImpl = globalThis.fetch, githubHost = DEFAULT_GITHUB_HOST } = {}) {
  const cleanClientId = String(clientId || "").trim();
  const cleanDeviceCode = String(deviceCode || "").trim();
  if (!cleanClientId || !cleanDeviceCode) throw new Error("GitHub 设备授权参数不完整");
  const response = await fetchImpl(`${String(githubHost).replace(/\/$/, "")}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cleanClientId, device_code: cleanDeviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }),
  });
  const body = await response.json().catch(() => ({}));
  if (body.error === "authorization_pending" || body.error === "slow_down") {
    return { pending: true, interval: Math.max(Number(interval) || 5, Number(body.interval) || 0), ...body };
  }
  if (!response.ok || body.error) throw new Error(body.error_description || body.message || "GitHub 设备授权失败");
  await saveTokens({ accessToken: body.access_token, refreshToken: body.refresh_token });
  return { pending: false, ...body };
}

module.exports = {
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  DEFAULT_GITHUB_HOST,
  readSettings,
  writeSettings,
  getAccessToken,
  saveTokens,
  clearTokens,
  beginDeviceFlow,
  pollDeviceFlow,
};
