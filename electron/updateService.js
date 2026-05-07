const { app } = require("electron");

const DEFAULT_UPDATE_CONFIG = Object.freeze({
  owner: "WuXinbo-bo",
  repo: "FreeFlow-WorkBorad",
  websiteUrl: "https://wuxinbo-bo.github.io/",
  releasesPageUrl: "https://github.com/WuXinbo-bo/FreeFlow-WorkBorad/releases/",
  apiBaseUrl: "https://api.github.com",
  assetNameTemplate: "FreeFlow-v{version}-x64.exe",
});

const DEFAULT_REQUEST_TIMEOUT_MS = 7000;

function normalizeVersion(value = "") {
  return String(value || "").trim().replace(/^v/i, "").trim();
}

function parseVersion(value = "") {
  const normalized = normalizeVersion(value);
  if (!normalized || !/^\d+(?:\.\d+){0,3}$/.test(normalized)) {
    return null;
  }
  return normalized.split(".").map((part) => Number(part) || 0);
}

function compareVersions(left = "", right = "") {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) {
    return null;
  }
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] || 0;
    const rightValue = rightParts[index] || 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  return 0;
}

function resolveCurrentVersion() {
  try {
    return normalizeVersion(app?.getVersion?.() || "");
  } catch {
    return "";
  }
}

function resolveUpdateConfig(overrides = {}) {
  return {
    ...DEFAULT_UPDATE_CONFIG,
    ...(overrides && typeof overrides === "object" ? overrides : {}),
  };
}

function buildLatestReleaseUrl(config) {
  return `${String(config.apiBaseUrl || DEFAULT_UPDATE_CONFIG.apiBaseUrl).replace(/\/+$/, "")}/repos/${config.owner}/${config.repo}/releases/latest`;
}

function resolveDownloadAsset(assets = [], remoteVersion = "", config = DEFAULT_UPDATE_CONFIG) {
  const expectedName = String(config.assetNameTemplate || DEFAULT_UPDATE_CONFIG.assetNameTemplate).replace(
    "{version}",
    remoteVersion
  );
  const list = Array.isArray(assets) ? assets : [];
  const exact = list.find((asset) => String(asset?.name || "").trim() === expectedName);
  if (exact?.browser_download_url) {
    return {
      name: String(exact.name || "").trim(),
      url: String(exact.browser_download_url || "").trim(),
      size: Number(exact.size || 0) || 0,
    };
  }
  const fallback = list.find((asset) => /freeflow-v[\d.]+-x64\.exe$/i.test(String(asset?.name || "").trim()));
  if (fallback?.browser_download_url) {
    return {
      name: String(fallback.name || "").trim(),
      url: String(fallback.browser_download_url || "").trim(),
      size: Number(fallback.size || 0) || 0,
    };
  }
  return {
    name: "",
    url: "",
    size: 0,
  };
}

async function fetchLatestRelease(config, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS) || DEFAULT_REQUEST_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildLatestReleaseUrl(config), {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = Number(response.status || 0) || 0;
      const error = new Error(String(payload?.message || `GitHub API 请求失败：HTTP ${status}`));
      error.code = status === 404 ? "NO_RELEASE_FOUND" : status === 403 ? "RATE_LIMITED" : "NETWORK_ERROR";
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("请求 GitHub 更新接口超时");
      timeoutError.code = "TIMEOUT";
      throw timeoutError;
    }
    if (!error?.code) {
      error.code = "NETWORK_ERROR";
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function checkForAppUpdate(options = {}) {
  const config = resolveUpdateConfig(options.config);
  const currentVersion = normalizeVersion(options.currentVersion || resolveCurrentVersion());
  const payload =
    options.mockRelease && typeof options.mockRelease === "object"
      ? options.mockRelease
      : await fetchLatestRelease(config, options);
  const latestVersionRaw = String(payload?.tag_name || "").trim();
  const latestVersion = normalizeVersion(latestVersionRaw);
  const comparison = compareVersions(currentVersion, latestVersion);
  const versionValid = comparison !== null;
  const hasUpdate = versionValid ? comparison < 0 : false;
  const asset = resolveDownloadAsset(payload?.assets, latestVersion, config);
  return {
    ok: true,
    source: options.mockRelease ? "mock" : "github",
    currentVersion,
    latestVersion,
    latestVersionRaw,
    hasUpdate,
    isLatest: versionValid ? comparison === 0 : false,
    releaseName: String(payload?.name || "").trim(),
    releaseNotes: String(payload?.body || "").trim(),
    publishedAt: String(payload?.published_at || "").trim(),
    releasePageUrl: String(payload?.html_url || config.releasesPageUrl || "").trim(),
    websiteUrl: String(config.websiteUrl || DEFAULT_UPDATE_CONFIG.websiteUrl).trim(),
    downloadUrl: asset.url || String(payload?.html_url || config.releasesPageUrl || "").trim(),
    downloadAssetName: asset.name,
    downloadAssetSize: asset.size,
    versionValid,
    errorCode: versionValid ? "" : "VERSION_PARSE_FAILED",
    errorMessage: versionValid ? "" : "远程版本号格式无法识别",
  };
}

module.exports = {
  DEFAULT_UPDATE_CONFIG,
  DEFAULT_REQUEST_TIMEOUT_MS,
  normalizeVersion,
  parseVersion,
  compareVersions,
  checkForAppUpdate,
};
