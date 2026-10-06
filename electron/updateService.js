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

function resolveUpdateTarget(options = {}) {
  const platform = String(options.platform || (typeof process !== "undefined" ? process.platform : "win32")).trim().toLowerCase();
  const arch = String(options.arch || (typeof process !== "undefined" ? process.arch : "x64")).trim().toLowerCase();
  if (platform === "darwin") {
    return {
      platform,
      arch,
      extensions: ["dmg", "zip"],
      pattern: new RegExp(`^freeflow-v[\\d.]+(?:[-\\w.]*)-${arch}\\.(?:dmg|zip)$`, "i"),
    };
  }
  if (platform === "win32") {
    return {
      platform,
      arch,
      extensions: ["exe"],
      pattern: new RegExp(`^freeflow-v[\\d.]+(?:[-\\w.]*)-${arch}(?:-portable)?\\.exe$`, "i"),
    };
  }
  return {
    platform,
    arch,
    extensions: ["AppImage", "deb", "rpm", "tar.gz"],
    pattern: new RegExp(`^freeflow-v[\\d.]+(?:[-\\w.]*)-${arch}\\.(?:AppImage|deb|rpm|tar\\.gz)$`, "i"),
  };
}

function normalizeVersion(value = "") {
  return String(value || "")
    .trim()
    .replace(/^v/i, "")
    .trim();
}

function parseVersion(value = "") {
  const normalized = normalizeVersion(value);
  const match = normalized.match(/^(\d+(?:\.\d+){0,3})(?:[-+].*)?$/);
  if (!match) {
    return null;
  }
  return match[1].split(".").map((part) => Number(part) || 0);
}

function parseVersionInfo(value = "") {
  const normalized = normalizeVersion(value);
  const match = normalized.match(/^(\d+(?:\.\d+){0,3})(?:-([^+]+))?(?:\+.*)?$/);
  if (!match) {
    return null;
  }
  return {
    parts: match[1].split(".").map((part) => Number(part) || 0),
    prerelease: String(match[2] || "").trim(),
  };
}

function compareVersions(left = "", right = "") {
  const leftInfo = parseVersionInfo(left);
  const rightInfo = parseVersionInfo(right);
  if (!leftInfo || !rightInfo) {
    return null;
  }
  const length = Math.max(leftInfo.parts.length, rightInfo.parts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftInfo.parts[index] || 0;
    const rightValue = rightInfo.parts[index] || 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  if (leftInfo.prerelease && !rightInfo.prerelease) return -1;
  if (!leftInfo.prerelease && rightInfo.prerelease) return 1;
  if (leftInfo.prerelease && rightInfo.prerelease) {
    return leftInfo.prerelease.localeCompare(rightInfo.prerelease, undefined, {
      numeric: true,
      sensitivity: "base",
    });
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

function resolveDownloadAsset(assets = [], remoteVersion = "", config = DEFAULT_UPDATE_CONFIG, options = {}) {
  const target = resolveUpdateTarget(options);
  const escapedVersion = String(remoteVersion || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const list = Array.isArray(assets) ? assets : [];
  const configuredTemplate = String(config.assetNameTemplate || "").trim();
  const expectedNames = [];
  const configuredName = configuredTemplate
    .replace("{version}", remoteVersion)
    .replace("{arch}", target.arch);
  const configuredExtension = configuredName.split(".").pop()?.toLowerCase() || "";
  if (configuredTemplate && target.extensions.some((extension) => extension.toLowerCase() === configuredExtension)) {
    expectedNames.push(configuredName);
  } else {
    for (const extension of target.extensions) {
      expectedNames.push(`FreeFlow-v${remoteVersion}-${target.arch}.${extension}`);
    }
  }
  const exact = list.find((asset) => expectedNames.includes(String(asset?.name || "").trim()));
  if (exact?.browser_download_url) {
    return {
      name: String(exact.name || "").trim(),
      url: String(exact.browser_download_url || "").trim(),
      size: Number(exact.size || 0) || 0,
    };
  }
  const installerPattern = escapedVersion
    ? new RegExp(`^freeflow-v${escapedVersion}(?:[-\\w.]*)-${target.arch}(?:-portable)?\\.(?:${target.extensions.map((value) => value.replace(".", "\\.")).join("|")})$`, "i")
    : target.pattern;
  const fallback = list.find((asset) => installerPattern.test(String(asset?.name || "").trim()));
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
  const asset = resolveDownloadAsset(payload?.assets, latestVersion, config, {
    platform: options.platform,
    arch: options.arch,
  });
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
  resolveUpdateTarget,
  resolveDownloadAsset,
  checkForAppUpdate,
};
