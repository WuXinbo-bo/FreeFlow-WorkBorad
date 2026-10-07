const fs = require("fs/promises");
const { GITHUB_SYNC_SETTINGS_FILE } = require("../config/paths");
const { atomicWriteJsonFile } = require("../utils/atomicWrite");
const secretStorageService = require("./secretStorageService");
const { GitHubApiClient } = require("./githubApiClient");

const ACCESS_TOKEN_SECRET = "github-sync-access-token";
const REFRESH_TOKEN_SECRET = "github-sync-refresh-token";
const DEFAULT_GITHUB_HOST = "https://github.com";
const deviceFlows = new Map();
let connectionGeneration = 0;
let connectionQueue = Promise.resolve();

function mutateConnection(task) {
  const operation = connectionQueue.catch(() => {}).then(task);
  connectionQueue = operation;
  return operation;
}

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
  connectionGeneration += 1;
  deviceFlows.clear();
  await mutateConnection(async () => {
    await Promise.all([
      secretStorageService.clearSecret(ACCESS_TOKEN_SECRET),
      secretStorageService.clearSecret(REFRESH_TOKEN_SECRET),
    ]);
    const settings = await readSettings();
    await writeSettings({ ...settings, auth: { ...settings.auth, method: "", user: null } });
  });
}

async function getPublicAuthStatus({ clientId = "", appType = "" } = {}) {
  const settings = await readSettings();
  const resolvedClientId = String(clientId || settings.auth?.clientId || "").trim();
  return {
    clientId: resolvedClientId,
    deviceFlowConfigured: Boolean(resolvedClientId),
    appType: (appType || settings.auth?.appType) === "oauth-app" ? "oauth-app" : "github-app",
    method: settings.auth?.method || "",
    user: settings.auth?.user || null,
  };
}

async function storeConnection({ accessToken, refreshToken = "", method, user, clientId = "", appType, generation }) {
  return mutateConnection(async () => {
    if (generation !== connectionGeneration) throw new Error("GitHub 连接操作已取消，请重试");
    const settings = await readSettings();
    await saveTokens({ accessToken, refreshToken });
    if (!refreshToken) await secretStorageService.clearSecret(REFRESH_TOKEN_SECRET);
    await writeSettings({
      ...settings,
      ...(settings.owner && settings.owner !== user.login ? { owner: "", repo: "", branch: "main", boardPath: "" } : {}),
      auth: { ...settings.auth, ...(clientId ? { clientId, appType } : {}), method, user },
    });
    deviceFlows.clear();
    return { connected: true, user };
  });
}

async function validateToken(token, fetchImpl) {
  try {
    const user = await new GitHubApiClient({ token, fetchImpl }).getUser();
    if (!user?.login || !user?.id) throw new Error("GitHub 未返回有效的用户身份");
    return { login: user.login, id: user.id };
  } catch (error) {
    if (error.status === 401) throw new Error("GitHub 凭证无效或已过期，请重新授权");
    if (error.status === 403) throw new Error("GitHub 拒绝了此凭证，请检查令牌权限或接口限流");
    throw error;
  }
}

async function connectWithToken({ token, fetchImpl = globalThis.fetch } = {}) {
  const accessToken = String(token || "").trim();
  if (!accessToken || accessToken.length > 512) throw new Error("请输入有效的 GitHub 个人访问令牌");
  const generation = ++connectionGeneration;
  deviceFlows.clear();
  const user = await validateToken(accessToken, fetchImpl);
  return storeConnection({ accessToken, method: "token", user, generation });
}

async function requestDeviceAuthorization(pathname, payload, { fetchImpl, githubHost }) {
  const response = await fetchImpl(`${String(githubHost).replace(/\/$/, "")}${pathname}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body.error && !["authorization_pending", "slow_down"].includes(body.error))) {
    const messages = {
      incorrect_client_credentials: "GitHub Client ID 无效，请检查授权应用配置",
      device_flow_disabled: "此 GitHub 应用未启用 Device Flow，请在应用设置中启用后重试",
      expired_token: "GitHub 授权码已过期，请重新连接",
      access_denied: "GitHub 授权已取消，请重新连接",
    };
    const error = new Error(messages[body.error] || body.error_description || body.message || `GitHub 授权请求失败 (${response.status})`);
    error.code = body.error || "GITHUB_AUTH_FAILED";
    throw error;
  }
  return body;
}

async function beginDeviceFlow({ clientId, appType, fetchImpl = globalThis.fetch, githubHost = DEFAULT_GITHUB_HOST } = {}) {
  const { clientId: cleanClientId, appType: resolvedAppType } = await getPublicAuthStatus({ clientId, appType });
  if (!cleanClientId) throw new Error("尚未配置 GitHub Client ID，可使用个人访问令牌连接，或填写启用了 Device Flow 的授权应用 Client ID");
  const generation = ++connectionGeneration;
  deviceFlows.clear();
  const body = await requestDeviceAuthorization("/login/device/code", {
    client_id: cleanClientId,
    ...(resolvedAppType === "oauth-app" ? { scope: "repo" } : {}),
  }, { fetchImpl, githubHost });
  if (!body.device_code || !body.user_code || !body.verification_uri) throw new Error("GitHub 未返回有效的设备授权码");
  if (generation !== connectionGeneration) throw new Error("GitHub 连接操作已取消，请重试");
  const interval = Math.max(5, Number(body.interval) || 5);
  deviceFlows.clear();
  deviceFlows.set(body.device_code, {
    clientId: cleanClientId,
    appType: resolvedAppType,
    generation,
    interval,
    nextPollAt: Date.now() + interval * 1000,
    expiresAt: Date.now() + (Number(body.expires_in) || 900) * 1000,
  });
  return { device_code: body.device_code, user_code: body.user_code, verification_uri: body.verification_uri, expires_in: body.expires_in || 900, interval };
}

async function pollDeviceFlow({ deviceCode, fetchImpl = globalThis.fetch, githubHost = DEFAULT_GITHUB_HOST } = {}) {
  const cleanDeviceCode = String(deviceCode || "").trim();
  const flow = deviceFlows.get(cleanDeviceCode);
  if (!flow || flow.generation !== connectionGeneration || Date.now() >= flow.expiresAt) {
    deviceFlows.delete(cleanDeviceCode);
    throw new Error("GitHub 授权码已失效，请重新连接");
  }
  if (Date.now() < flow.nextPollAt) return { pending: true, interval: flow.interval };
  flow.nextPollAt = Date.now() + flow.interval * 1000;
  const body = await requestDeviceAuthorization("/login/oauth/access_token", {
    client_id: flow.clientId, device_code: cleanDeviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  }, { fetchImpl, githubHost });
  if (body.error === "authorization_pending" || body.error === "slow_down") {
    if (body.error === "slow_down") flow.interval = Math.max(flow.interval + 5, Number(body.interval) || 0);
    flow.nextPollAt = Date.now() + flow.interval * 1000;
    return { pending: true, interval: flow.interval };
  }
  if (!body.access_token) throw new Error("GitHub 未返回有效的授权凭证");
  const user = await validateToken(body.access_token, fetchImpl);
  return { pending: false, ...(await storeConnection({ accessToken: body.access_token, refreshToken: body.refresh_token, method: "device-flow", user, clientId: flow.clientId, appType: flow.appType, generation: flow.generation })) };
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
  getPublicAuthStatus,
  connectWithToken,
  beginDeviceFlow,
  pollDeviceFlow,
};
