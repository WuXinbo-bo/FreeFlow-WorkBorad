const express = require("express");
const fsSync = require("fs");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const yauzl = require("yauzl");
const { PDFParse } = require("pdf-parse");
const { paths } = require("../config");
const { runtime } = require("../config");
const permissionsService = require("../services/permissionsService");
const modelProfilesService = require("../services/modelProfilesService");
const modelProviderSettingsService = require("../services/modelProviderSettingsService");
const uiSettingsService = require("../services/uiSettingsService");
const themeSettingsService = require("../services/themeSettingsService");
const clipboardStoreService = require("../services/clipboardStoreService");
const sessionService = require("../services/sessionService");
const canvasBoardService = require("../services/canvasBoardService");
const { registerAppRoutes } = require("../routes");

const {
  ROOT_DIR,
  DATA_DIR,
  PUBLIC_DIR,
  NODE_MODULES_DIR,
  DESKTOP_DIR,
  WORKSPACE_DIR,
  AGENT_SCREENSHOT_FILE,
} = paths;
const {
  PORT,
  AI_PROVIDER,
  OLLAMA_BASE_URL,
  OPENAI_COMPAT_BASE_URL,
  BIGMODEL_BASE_URL,
  BIGMODEL_API_KEY,
  LOCAL_MODEL_PREFIX,
  CLOUD_MODEL_PREFIX,
  DEFAULT_MODEL,
  CPU_FALLBACK_THREAD_COUNT,
  RECOMMENDED_MODELS,
  BIGMODEL_MODELS,
  AGENT_VISUAL_MODEL,
  AGENT_SCREENSHOT_SETTLE_MS,
} = runtime;
const { PERMISSIONS_FILE, readPermissionsStore, writePermissionsStore, normalizeRootPath } = permissionsService;
const { MODEL_PROFILES_FILE, readModelProfilesStore, writeModelProfilesStore } = modelProfilesService;
const { MODEL_PROVIDER_SETTINGS_FILE, readModelProviderSettingsStore, writeModelProviderSettingsStore } =
  modelProviderSettingsService;
const { UI_SETTINGS_FILE, readUiSettingsStore, writeUiSettingsStore } = uiSettingsService;
const { CLIPBOARD_STORE_FILE, readClipboardStore, writeClipboardStore } = clipboardStoreService;
const { SESSIONS_FILE, readSessionStore, writeSessionStore } = sessionService;

function parseEnvLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  if (!key) {
    return null;
  }

  let value = trimmed.slice(separatorIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function loadEnvFileSync(filePath) {
  try {
    const raw = fsSync.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const entry = parseEnvLine(line);
      if (!entry) continue;
      const [key, value] = entry;
      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Failed to load env file ${filePath}: ${error.message}`);
    }
  }
}

loadEnvFileSync(path.join(ROOT_DIR, ".env"));

const app = express();

let desktopBridge = {
  chatWithDoubao: null,
  cancelDoubaoChat: null,
};

function setNoStoreHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

app.use(express.json({ limit: "1mb" }));
app.use(
  "/vendor",
  express.static(NODE_MODULES_DIR, {
    etag: false,
    lastModified: false,
    setHeaders: setNoStoreHeaders,
  })
);
app.use(
  express.static(PUBLIC_DIR, {
    etag: false,
    lastModified: false,
    setHeaders: setNoStoreHeaders,
  })
);
registerAppRoutes(app, {
  permissionsService,
  modelProfilesService,
  modelProviderSettingsService,
  onModelProviderSettingsChanged(next) {
    modelProviderSettingsCache = next;
  },
  uiSettingsService,
  themeSettingsService,
  clipboardStoreService,
  sessionService,
  canvasBoardService,
  fileTextService: require("../services/fileTextService"),
});

let modelProviderSettingsCache = null;

function getDefaultCloudProviderSettings() {
  return {
    provider: "bigmodel",
    baseUrl: BIGMODEL_BASE_URL,
    apiKey: BIGMODEL_API_KEY,
    models: Array.isArray(BIGMODEL_MODELS) ? [...BIGMODEL_MODELS] : [],
    defaultModel: process.env.BIGMODEL_MODEL || DEFAULT_MODEL,
  };
}

async function ensureModelProviderSettingsLoaded() {
  if (modelProviderSettingsCache) {
    return modelProviderSettingsCache;
  }

  try {
    modelProviderSettingsCache = await readModelProviderSettingsStore();
  } catch {
    modelProviderSettingsCache = {
      cloud: getDefaultCloudProviderSettings(),
      updatedAt: Date.now(),
    };
  }

  return modelProviderSettingsCache;
}

function getCloudProviderSettings() {
  return modelProviderSettingsCache?.cloud || getDefaultCloudProviderSettings();
}

function getConfiguredCloudProviderKind() {
  const provider = String(getCloudProviderSettings().provider || "bigmodel").trim().toLowerCase();
  return provider === "openai_compatible" ? "openai_compatible" : "bigmodel";
}

function getBigModelBaseUrl() {
  return String(getCloudProviderSettings().baseUrl || BIGMODEL_BASE_URL).trim() || BIGMODEL_BASE_URL;
}

function getBigModelApiKey() {
  return String(getCloudProviderSettings().apiKey || "").trim();
}

function getBigModelModels() {
  const models = Array.isArray(getCloudProviderSettings().models) ? getCloudProviderSettings().models : [];
  return models.map((item) => String(item || "").trim()).filter(Boolean);
}

function getConfiguredCloudBaseUrl() {
  const cloud = getCloudProviderSettings();
  const fallback = getConfiguredCloudProviderKind() === "openai_compatible" ? OPENAI_COMPAT_BASE_URL : BIGMODEL_BASE_URL;
  return String(cloud.baseUrl || fallback).trim() || fallback;
}

function getConfiguredCloudApiKey() {
  return String(getCloudProviderSettings().apiKey || "").trim();
}

function getConfiguredCloudModels() {
  const models = Array.isArray(getCloudProviderSettings().models) ? getCloudProviderSettings().models : [];
  return models.map((item) => String(item || "").trim()).filter(Boolean);
}

function getBigModelDefaultModel() {
  return (
    String(getCloudProviderSettings().defaultModel || "").trim() ||
    getBigModelModels()[0] ||
    process.env.BIGMODEL_MODEL ||
    DEFAULT_MODEL
  );
}

function serializeModelProviderSettings() {
  const cloud = getCloudProviderSettings();
  return {
    cloud: {
      provider: getConfiguredCloudProviderKind(),
      baseUrl: getConfiguredCloudBaseUrl(),
      apiKey: getConfiguredCloudApiKey(),
      apiKeyConfigured: Boolean(getConfiguredCloudApiKey()),
      models: getConfiguredCloudModels(),
      defaultModel:
        String(getCloudProviderSettings().defaultModel || "").trim() ||
        getConfiguredCloudModels()[0] ||
        (getConfiguredCloudProviderKind() === "bigmodel" ? getBigModelDefaultModel() : DEFAULT_MODEL),
    },
    file: MODEL_PROVIDER_SETTINGS_FILE,
    updatedAt: modelProviderSettingsCache?.updatedAt || Date.now(),
  };
}

const DOCX_XML_ENTRY_PATTERN = /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i;
const PPTX_XML_ENTRY_PATTERN = /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/i;
const EXTRACTED_FILE_TEXT_LIMIT = 200000;

function decodeXmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, value) => String.fromCodePoint(Number(value) || 0))
    .replace(/&#x([0-9a-f]+);/gi, (_match, value) => String.fromCodePoint(parseInt(value, 16) || 0));
}

function normalizeDocxXmlText(xml) {
  return decodeXmlEntities(
    String(xml || "")
      .replace(/<w:tab\b[^>]*\/>/gi, "\t")
      .replace(/<w:(?:br|cr)\b[^>]*\/>/gi, "\n")
      .replace(/<\/w:p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizePptxXmlText(xml) {
  return decodeXmlEntities(
    String(xml || "")
      .replace(/<a:br\b[^>]*\/>/gi, "\n")
      .replace(/<\/a:p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readZipTextEntries(filePath, entryPattern, normalizeEntryText) {
  const resolvedPath = path.resolve(String(filePath || "").trim());
  if (!resolvedPath) {
    throw new Error("Missing file path");
  }

  const stats = await fs.stat(resolvedPath);
  if (!stats.isFile()) {
    throw new Error("Target path is not a file");
  }

  return new Promise((resolve, reject) => {
    yauzl.open(resolvedPath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) {
        reject(openError);
        return;
      }

      const xmlParts = [];
      let finished = false;

      const complete = (error, text = "") => {
        if (finished) return;
        finished = true;
        zipFile.close();
        if (error) {
          reject(error);
          return;
        }
        resolve(text);
      };

      zipFile.on("error", (error) => complete(error));
      zipFile.on("end", () => {
        const text = xmlParts
          .map((part) => normalizeEntryText(part))
          .filter(Boolean)
          .join("\n\n")
          .slice(0, EXTRACTED_FILE_TEXT_LIMIT);
        complete(null, text);
      });

      zipFile.on("entry", (entry) => {
        if (!DOCX_XML_ENTRY_PATTERN.test(entry.fileName)) {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            complete(streamError);
            return;
          }

          const chunks = [];
          stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on("error", (error) => complete(error));
          stream.on("end", () => {
            xmlParts.push(Buffer.concat(chunks).toString("utf8"));
            zipFile.readEntry();
          });
        });
      });

      zipFile.readEntry();
    });
  });
}

async function readDocxText(filePath) {
  return readZipTextEntries(filePath, DOCX_XML_ENTRY_PATTERN, normalizeDocxXmlText);
}

async function readPptxText(filePath) {
  return readZipTextEntries(filePath, PPTX_XML_ENTRY_PATTERN, normalizePptxXmlText);
}

async function readPdfText(filePath) {
  const resolvedPath = path.resolve(String(filePath || "").trim());
  const data = await fs.readFile(resolvedPath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return String(result?.text || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, EXTRACTED_FILE_TEXT_LIMIT);
  } finally {
    await parser.destroy().catch(() => {});
  }
}

function detectExtractableFileType(filePath = "", fileName = "", mimeType = "") {
  const lowerPath = String(filePath || "").trim().toLowerCase();
  const lowerName = String(fileName || "").trim().toLowerCase();
  const lowerMimeType = String(mimeType || "").trim().toLowerCase();

  if (
    lowerMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx") ||
    lowerPath.endsWith(".docx")
  ) {
    return "docx";
  }

  if (
    lowerMimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    lowerName.endsWith(".pptx") ||
    lowerPath.endsWith(".pptx")
  ) {
    return "pptx";
  }

  if (lowerMimeType === "application/pdf" || lowerName.endsWith(".pdf") || lowerPath.endsWith(".pdf")) {
    return "pdf";
  }

  return "";
}

async function readSupportedFileText(filePath, fileName, mimeType) {
  const fileType = detectExtractableFileType(filePath, fileName, mimeType);
  if (fileType === "docx") {
    return {
      fileType,
      text: await readDocxText(filePath),
    };
  }
  if (fileType === "pptx") {
    return {
      fileType,
      text: await readPptxText(filePath),
    };
  }
  if (fileType === "pdf") {
    return {
      fileType,
      text: await readPdfText(filePath),
    };
  }

  throw new Error("Unsupported file type for extraction");
}

function getProviderLabel() {
  if (AI_PROVIDER === "lmstudio") return "LM Studio";
  if (AI_PROVIDER === "bigmodel") return getProviderLabelByKind(getConfiguredCloudProviderKind());
  return "Ollama";
}

function getProviderLabelByKind(kind) {
  if (kind === "bigmodel") return "BigModel";
  if (kind === "openai_compatible") return "OpenAI 兼容";
  if (kind === "lmstudio") return "LM Studio";
  return "Ollama";
}

function getProviderBaseUrl() {
  if (AI_PROVIDER === "lmstudio") return OPENAI_COMPAT_BASE_URL;
  if (AI_PROVIDER === "bigmodel") return getConfiguredCloudBaseUrl();
  return OLLAMA_BASE_URL;
}

function supportsRuntimeOptions() {
  return AI_PROVIDER === "ollama";
}

function isOpenAICompatibleProvider() {
  return AI_PROVIDER === "lmstudio" || AI_PROVIDER === "bigmodel";
}

function supportsRuntimeOptionsForProvider(provider) {
  return provider === "ollama";
}

function isOpenAICompatibleProviderByKind(provider) {
  return provider === "lmstudio" || provider === "bigmodel" || provider === "openai_compatible";
}

function inferContextLengthFromName(modelName = "") {
  const value = String(modelName || "").trim().toLowerCase();
  const explicitMatch = value.match(/(?:^|[^a-z0-9])(\d{1,3})k(?:[^a-z0-9]|$)/i);
  if (explicitMatch) {
    return Number(explicitMatch[1]) * 1024;
  }
  if (/128000|131072/.test(value)) return 131072;
  if (/64000|65536/.test(value)) return 65536;
  if (/32000|32768/.test(value)) return 32768;
  if (/16000|16384/.test(value)) return 16384;
  if (/8000|8192/.test(value)) return 8192;
  if (/4000|4096/.test(value)) return 4096;
  return 0;
}

function extractModelContextLength(entry = {}, fallbackName = "") {
  const detailCandidates = [
    entry?.details?.context_length,
    entry?.details?.contextLength,
    entry?.context_length,
    entry?.contextLength,
  ];
  for (const candidate of detailCandidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }

  const modelInfo = entry?.model_info && typeof entry.model_info === "object" ? entry.model_info : {};
  for (const [key, value] of Object.entries(modelInfo)) {
    if (!/context_length|contextlength|max_context|num_ctx/i.test(String(key))) {
      continue;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }

  const parameters = String(entry?.parameters || "");
  const parameterMatch = parameters.match(/(?:^|\n)\s*num_ctx\s+(\d+)/i);
  if (parameterMatch) {
    const numeric = Number(parameterMatch[1]);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }

  return inferContextLengthFromName(fallbackName);
}

function buildContextOptions(maxContext = 0) {
  const presets = [1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072];
  const normalizedMax = Number(maxContext);
  if (!Number.isFinite(normalizedMax) || normalizedMax <= 0) {
    return presets.slice(0, 3);
  }

  const values = presets.filter((value) => value <= normalizedMax);
  if (!values.length) {
    values.push(Math.max(1024, normalizedMax));
  } else if (values[values.length - 1] !== normalizedMax) {
    values.push(normalizedMax);
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

function buildModelEntry(source, rawName) {
  const cleanName = String(typeof rawName === "string" ? rawName : rawName?.name || rawName?.id || "").trim();
  if (!cleanName) return null;
  const contextLength = extractModelContextLength(rawName, cleanName);
  const contextOptions = buildContextOptions(contextLength);

  return {
    name: `${source === "local" ? LOCAL_MODEL_PREFIX : CLOUD_MODEL_PREFIX}${cleanName}`,
    id: `${source === "local" ? LOCAL_MODEL_PREFIX : CLOUD_MODEL_PREFIX}${cleanName}`,
    rawName: cleanName,
    source,
    displayName: `${source === "local" ? "本地：" : "云端："}${cleanName}`,
    contextLength,
    contextOptions,
  };
}

function parseRoutedModel(modelName) {
  const cleanName = String(modelName || "").trim();

  if (cleanName.startsWith(LOCAL_MODEL_PREFIX)) {
    return {
      provider: "ollama",
      source: "local",
      rawModel: cleanName.slice(LOCAL_MODEL_PREFIX.length),
    };
  }

  if (cleanName.startsWith(CLOUD_MODEL_PREFIX)) {
    return {
      provider: getConfiguredCloudProviderKind(),
      source: "cloud",
      rawModel: cleanName.slice(CLOUD_MODEL_PREFIX.length),
    };
  }

  if (AI_PROVIDER === "bigmodel") {
    return {
      provider: getConfiguredCloudProviderKind(),
      source: "cloud",
      rawModel: cleanName,
    };
  }

  return {
    provider: "ollama",
    source: "local",
    rawModel: cleanName,
  };
}

function formatProviderNetworkError(error) {
  if (AI_PROVIDER === "lmstudio") {
    return `无法连接到 LM Studio：${OPENAI_COMPAT_BASE_URL}。请先在 LM Studio 中加载模型，并开启 Local Server / Developer 服务。`;
  }

  if (AI_PROVIDER === "bigmodel") {
    if (getConfiguredCloudProviderKind() === "bigmodel" && !getConfiguredCloudApiKey()) {
      return "未配置云端模型 API Key。请在模型菜单的云端配置中填写后刷新。";
    }
    return `无法连接到 ${getProviderLabelByKind(getConfiguredCloudProviderKind())}：${getConfiguredCloudBaseUrl()}。请检查网络、API Key 和模型权限。`;
  }

  return `无法连接到 Ollama：${OLLAMA_BASE_URL}。请确认 ollama serve 正在运行。`;
}

function formatProviderNetworkErrorByKind(provider, error) {
  if (provider === "lmstudio") {
    return `无法连接到 LM Studio：${OPENAI_COMPAT_BASE_URL}。请先在 LM Studio 中加载模型，并开启 Local Server / Developer 服务。`;
  }

  if (provider === "bigmodel") {
    if (!getConfiguredCloudApiKey()) {
      return "未配置云端模型 API Key。请在模型菜单的云端配置中填写后刷新。";
    }
    return `无法连接到 ${getProviderLabelByKind(provider)}：${getConfiguredCloudBaseUrl()}。请检查网络、API Key 和模型权限。`;
  }

  if (provider === "openai_compatible") {
    return `无法连接到 ${getProviderLabelByKind(provider)}：${getConfiguredCloudBaseUrl()}。请检查接口地址、API Key 和模型权限。`;
  }

  return `无法连接到 Ollama：${OLLAMA_BASE_URL}。请确认 ollama serve 正在运行。`;
}

// Persistent stores are served by src/backend/services/* and src/backend/routes/persistenceRoutes.js.

function isPathAllowed(targetPath, allowedRoots) {
  const resolvedTarget = normalizeRootPath(targetPath);
  return allowedRoots.some((root) => {
    const resolvedRoot = normalizeRootPath(root);
    return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
  });
}

function assertPermission(permissionStore, key) {
  if (!permissionStore.permissions[key]) {
    const error = new Error(`Permission "${key}" is disabled`);
    error.statusCode = 403;
    throw error;
  }
}

function assertAllowedPath(permissionStore, targetPath) {
  if (!isPathAllowed(targetPath, permissionStore.allowedRoots)) {
    const error = new Error(`Path is outside allowed roots: ${targetPath}`);
    error.statusCode = 403;
    throw error;
  }
}

function getFirstDefined(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function runProcess(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      ...options,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `Process exited with code ${code}`));
        return;
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code,
      });
    });
  });
}

function runPowerShell(script) {
  return runProcess("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
}

function runCommand(command, args = []) {
  return runProcess(command, Array.isArray(args) ? args : []);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function escapePowerShellSingleQuoted(value) {
  return String(value ?? "").replace(/'/g, "''");
}

function stripMarkdownCodeFence(text) {
  const raw = String(text || "").trim();
  if (!raw.startsWith("```")) {
    return raw;
  }

  return raw
    .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractFirstJsonObject(text) {
  const raw = stripMarkdownCodeFence(text);
  const start = raw.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }

  return null;
}

async function imagePathToDataUrl(filePath) {
  const raw = await fs.readFile(filePath);
  return `data:image/png;base64,${raw.toString("base64")}`;
}

async function callBigModelChatCompletion({
  model = AGENT_VISUAL_MODEL,
  messages = [],
  temperature = 0.1,
  max_tokens = 1200,
  thinkingEnabled = false,
}) {
  const target = getProviderRequestTarget("bigmodel");
  const response = await fetch(target.url, {
    method: "POST",
    headers: target.headers,
    body: JSON.stringify(
      buildProviderRequestBody({
        provider: "bigmodel",
        model,
        messages,
        options: {
          temperature,
          max_tokens,
          __thinkingEnabled: thinkingEnabled,
        },
        stream: false,
      })
    ),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data?.error?.message || data?.message || `BigModel returned ${response.status}`
    );
    error.statusCode = response.status;
    throw error;
  }

  return extractProviderMessageByProvider("bigmodel", data);
}

async function listProviderModels() {
  await ensureModelProviderSettingsLoaded();

  if (AI_PROVIDER !== "lmstudio") {
    const models = [];
    let ollamaError = null;

    const cloudModels = getConfiguredCloudModels();
    const cloudProviderKind = getConfiguredCloudProviderKind();
    const shouldExposeCloudModels =
      cloudProviderKind === "bigmodel"
        ? Boolean(getConfiguredCloudApiKey()) && cloudModels.length > 0
        : Boolean(getConfiguredCloudBaseUrl()) && cloudModels.length > 0;

    if (shouldExposeCloudModels) {
      for (const modelName of cloudModels) {
        const entry = buildModelEntry("cloud", modelName);
        if (entry) models.push(entry);
      }
    }

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }

      const data = await response.json();
      const seen = new Set();
      const localCandidates = [];
      for (const item of data.models ?? []) {
        const rawName = String(item?.name || item?.id || "").trim();
        if (!rawName) continue;
        const key = rawName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        localCandidates.push(item);
      }

      const enrichedCandidates = await Promise.all(
        localCandidates.map(async (item) => ({
          ...(item && typeof item === "object" ? item : {}),
          ...(await fetchOllamaModelDetails(item?.name || item?.id || "")),
        }))
      );

      for (const item of enrichedCandidates) {
        const entry = buildModelEntry("local", item);
        if (entry) models.push(entry);
      }

      for (const modelName of RECOMMENDED_MODELS) {
        const key = String(modelName).trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = buildModelEntry("local", modelName);
        if (entry) models.push(entry);
      }
    } catch (error) {
      ollamaError = error;
    }

    if (!models.length) {
      throw ollamaError || new Error("No local or cloud models available");
    }

    return models;
  }

  const withRecommendedModels = (models) => {
    const normalized = Array.isArray(models) ? models : [];
    const seen = new Set(
      normalized
        .map((item) => String(item?.name || item?.id || "").trim())
        .filter(Boolean)
        .map((name) => name.toLowerCase())
    );
    const next = [...normalized];

    for (const modelName of RECOMMENDED_MODELS) {
      if (seen.has(modelName.toLowerCase())) continue;
      next.push({ name: modelName, id: modelName });
    }

    return next;
  };

  if (AI_PROVIDER === "lmstudio") {
    const response = await fetch(`${OPENAI_COMPAT_BASE_URL}/models`);
    if (!response.ok) {
      throw new Error(`LM Studio returned ${response.status}`);
    }

    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : [];
    return withRecommendedModels(models.map((item) => ({
      name: item.id,
      id: item.id,
    })));
  }

  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`);
  }

  const data = await response.json();
  return withRecommendedModels(data.models ?? []);
}

function isPreferredQuantizedModel(name) {
  return /q4[_-]?k[_-]?m/i.test(String(name || "").trim());
}

function resolveDefaultModel(models = []) {
  const normalized = Array.isArray(models) ? models : [];
  const configuredDefaultModel = AI_PROVIDER === "bigmodel" ? `${CLOUD_MODEL_PREFIX}${getBigModelDefaultModel()}` : DEFAULT_MODEL;
  const configuredDefaultRawModel =
    AI_PROVIDER === "bigmodel" ? getBigModelDefaultModel() : String(DEFAULT_MODEL || "").trim();
  const preferredSource = AI_PROVIDER === "bigmodel" ? "cloud" : "local";
  const sourceModels = normalized.filter((item) => String(item?.source || "") === preferredSource);

  const preferredQuantized = sourceModels.find((item) => isPreferredQuantizedModel(item?.rawName || item?.name || item?.id));
  if (preferredQuantized) {
    return String(preferredQuantized.name || preferredQuantized.id || configuredDefaultModel).trim() || configuredDefaultModel;
  }

  const exactDefault = normalized.find((item) => {
    const name = String(item?.name || item?.id || "").trim();
    const rawName = String(item?.rawName || "").trim();
    return name === configuredDefaultModel || rawName === configuredDefaultRawModel;
  });
  if (exactDefault) {
    return String(exactDefault.name || exactDefault.id || configuredDefaultModel).trim() || configuredDefaultModel;
  }

  const firstPreferred = sourceModels[0];
  if (firstPreferred) {
    return String(firstPreferred.name || firstPreferred.id || configuredDefaultModel).trim() || configuredDefaultModel;
  }

  const fallbackQuantized = normalized.find((item) => isPreferredQuantizedModel(item?.rawName || item?.name || item?.id));
  if (fallbackQuantized) {
    return String(fallbackQuantized.name || fallbackQuantized.id || configuredDefaultModel).trim() || configuredDefaultModel;
  }

  return String(normalized[0]?.name || normalized[0]?.id || configuredDefaultModel).trim() || configuredDefaultModel;
}

function buildOllamaRuntimeOptions(options = {}) {
  const { __thinkingEnabled, ...runtimeOptions } = options || {};
  const requestedContext = Number(runtimeOptions?.num_ctx);
  const normalizedContext = Number.isFinite(requestedContext) && requestedContext > 0 ? requestedContext : 2048;
  const requestedNumGpu = Number(runtimeOptions?.num_gpu);
  const cpuOnly = Number.isFinite(requestedNumGpu) && requestedNumGpu === 0;
  const requestedMainGpu = Number(runtimeOptions?.main_gpu);

  const nextOptions = {
    temperature: 0.3,
    top_p: 0.9,
    ...runtimeOptions,
    num_ctx: normalizedContext,
  };

  if (cpuOnly) {
    nextOptions.num_thread = CPU_FALLBACK_THREAD_COUNT;
    nextOptions.num_gpu = 0;
    nextOptions.use_mmap = false;
  }

  if (Number.isFinite(requestedMainGpu) && requestedMainGpu >= 0) {
    nextOptions.main_gpu = requestedMainGpu;
  } else {
    delete nextOptions.main_gpu;
  }

  return nextOptions;
}

function buildProviderRequestBody({ provider, model, messages, options = {}, stream }) {
  const { __thinkingEnabled, ...providerOptions } = options || {};

  if (isOpenAICompatibleProviderByKind(provider)) {
    const { temperature, top_p, max_tokens, max_completion_tokens } = providerOptions || {};
    const payload = {
      model: model || DEFAULT_MODEL,
      messages,
      stream,
      ...(temperature !== undefined ? { temperature } : { temperature: stream ? 0.7 : 0.3 }),
      ...(top_p !== undefined ? { top_p } : { top_p: 0.9 }),
      ...(max_tokens !== undefined ? { max_tokens } : {}),
      ...(max_completion_tokens !== undefined ? { max_completion_tokens } : {}),
    };

    if (provider === "bigmodel" && typeof __thinkingEnabled === "boolean") {
      payload.thinking = {
        type: __thinkingEnabled ? "enabled" : "disabled",
      };
    }

    return payload;
  }

  return {
    model: model || DEFAULT_MODEL,
    messages,
    stream,
    options: buildOllamaRuntimeOptions(providerOptions),
  };
}

function normalizeTextPart(value) {
  return typeof value === "string" ? value : "";
}

function extractOpenAICompatibleDelta(parsed) {
  const delta = parsed?.choices?.[0]?.delta || {};
  return {
    content: normalizeTextPart(delta.content),
    thinking: normalizeTextPart(
      delta.reasoning_content ?? delta.reasoning ?? delta.thinking ?? delta.reasoning_text
    ),
  };
}

function extractProviderMessageByProvider(provider, data) {
  if (isOpenAICompatibleProviderByKind(provider)) {
    const message = data?.choices?.[0]?.message || {};
    return {
      content: normalizeTextPart(message.content),
      thinking: normalizeTextPart(
        message.reasoning_content ?? message.reasoning ?? message.thinking ?? message.reasoning_text
      ),
    };
  }

  const message = data?.message || {};
  return {
    content: normalizeTextPart(message.content),
    thinking: normalizeTextPart(message.thinking),
  };
}

async function streamFromLmStudio(response, res) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      const lines = event
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        const delta = extractOpenAICompatibleDelta(parsed);
        if (!delta.content && !delta.thinking) continue;

        res.write(
          `${JSON.stringify({
            message: {
              content: delta.content,
              thinking: delta.thinking,
            },
          })}\n`
        );
      }
    }
  }
}

function buildOpenAICompatibleChatUrl(baseUrl = "") {
  const normalized = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalized) return "/chat/completions";
  if (/\/chat\/completions$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}

function getProviderRequestTarget(provider) {
  if (provider === "bigmodel") {
    if (!getBigModelApiKey()) {
      const error = new Error("BIGMODEL_API_KEY is missing");
      error.statusCode = 500;
      throw error;
    }

    return {
      url: `${getBigModelBaseUrl()}/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getBigModelApiKey()}`,
      },
    };
  }

  if (provider === "openai_compatible") {
    const headers = {
      "Content-Type": "application/json",
    };
    const apiKey = getConfiguredCloudApiKey();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    return {
      url: buildOpenAICompatibleChatUrl(getConfiguredCloudBaseUrl()),
      headers,
    };
  }

  if (provider === "lmstudio") {
    return {
      url: `${OPENAI_COMPAT_BASE_URL}/chat/completions`,
      headers: {
        "Content-Type": "application/json",
      },
    };
  }

  return {
    url: `${OLLAMA_BASE_URL}/api/chat`,
    headers: {
      "Content-Type": "application/json",
    },
  };
}

function normalizeVideoControllerEntry(entry = {}) {
  const name = String(
    entry?.Name ??
      entry?.name ??
      entry?.Chipset_Model ??
      entry?.sppci_model ??
      entry?.product ??
      entry?.model ??
      entry?.gpu_name ??
      ""
  ).trim();
  const vendor = String(
    entry?.AdapterCompatibility ??
      entry?.adapterCompatibility ??
      entry?.spdisplays_vendor ??
      entry?.vendor ??
      entry?.manufacturer ??
      ""
  ).trim();

  if (!name && !vendor) {
    return null;
  }

  return {
    Name: name,
    AdapterCompatibility: vendor,
  };
}

async function fetchOllamaModelDetails(rawName = "") {
  const cleanName = String(rawName || "").trim();
  if (!cleanName) {
    return {};
  }

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/show`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: cleanName, model: cleanName }),
    });
    if (!response.ok) {
      return {};
    }
    return await response.json().catch(() => ({}));
  } catch {
    return {};
  }
}

async function getWindowsVideoControllers() {
  const result = await runPowerShell(
    "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterCompatibility | ConvertTo-Json -Depth 3"
  );
  const parsed = JSON.parse(result.stdout || "[]");
  return (Array.isArray(parsed) ? parsed : [parsed]).map(normalizeVideoControllerEntry).filter(Boolean);
}

async function getMacVideoControllers() {
  const result = await runCommand("system_profiler", ["SPDisplaysDataType", "-json"]);
  const parsed = JSON.parse(result.stdout || "{}");
  const displays = Array.isArray(parsed?.SPDisplaysDataType) ? parsed.SPDisplaysDataType : [];
  return displays.map(normalizeVideoControllerEntry).filter(Boolean);
}

function parseLinuxGpuLines(text = "") {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const normalized = line.replace(/^[0-9a-f]{2}:[0-9a-f]{2}\.[0-9]\s+/i, "");
      const match = normalized.match(/(VGA compatible controller|3D controller|Display controller):\s*(.+)$/i);
      if (!match) return null;
      const name = String(match[2] || "").trim();
      const vendorMatch = name.match(/AMD|Advanced Micro Devices|NVIDIA|Intel|Apple|Qualcomm/);
      return normalizeVideoControllerEntry({
        Name: name,
        AdapterCompatibility: vendorMatch ? vendorMatch[0] : "",
      });
    })
    .filter(Boolean);
}

async function getLinuxVideoControllers() {
  try {
    const nvidiaResult = await runCommand("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"]);
    const parsedNvidia = String(nvidiaResult.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name) =>
        normalizeVideoControllerEntry({
          Name: name,
          AdapterCompatibility: "NVIDIA",
        })
      )
      .filter(Boolean);
    if (parsedNvidia.length) {
      return parsedNvidia;
    }
  } catch {
    // Fallback to lspci below.
  }

  const result = await runCommand("lspci", []);
  return parseLinuxGpuLines(result.stdout);
}

async function getVideoControllers() {
  try {
    if (process.platform === "win32") {
      return await getWindowsVideoControllers();
    }
    if (process.platform === "darwin") {
      return await getMacVideoControllers();
    }
    if (process.platform === "linux") {
      return await getLinuxVideoControllers();
    }
  } catch {
    // Fall through to empty list.
  }
  return [];
}

function pickPreferredGpu(videoControllers) {
  const controllers = Array.isArray(videoControllers) ? videoControllers : [];
  const preferred = controllers.find((item) => {
    const name = String(item?.Name || "");
    const vendor = String(item?.AdapterCompatibility || "");
    return (
      !/Oray|Microsoft Basic|DisplayLink/i.test(name) &&
      /AMD|Advanced Micro Devices|NVIDIA|Intel/i.test(vendor)
    );
  });

  return preferred?.Name || "";
}

function summarizeHardware(videoControllers) {
  const controllers = Array.isArray(videoControllers) ? videoControllers : [];
  const preferredGpuName = pickPreferredGpu(controllers);
  const gpuAvailable = Boolean(preferredGpuName || controllers.length);
  return {
    platform: process.platform,
    preferredGpuName,
    videoControllers: controllers,
    gpuAvailable,
    runtimePermissionRequired: false,
    runtimePermissionGranted: gpuAvailable,
  };
}

async function getSystemStats(permissionStore) {
  assertPermission(permissionStore, "systemMonitor");

  const cpuOutput = await runPowerShell(
    "(Get-Counter '\\Processor(_Total)\\% Processor Time').CounterSamples | Select-Object -ExpandProperty CookedValue"
  );
  const diskOutput = await runPowerShell(
    "Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Depth 3"
  );

  let disks = [];
  try {
    const parsed = JSON.parse(diskOutput.stdout || "[]");
    disks = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    disks = [];
  }

  return {
    cpuPercent: Number(cpuOutput.stdout || "0").toFixed(1),
    memory: {
      totalBytes: os.totalmem(),
      freeBytes: os.freemem(),
      usedBytes: os.totalmem() - os.freemem(),
    },
    disks: disks.map((disk) => ({
      device: disk.DeviceID,
      sizeBytes: Number(disk.Size || 0),
      freeBytes: Number(disk.FreeSpace || 0),
      usedBytes: Math.max(Number(disk.Size || 0) - Number(disk.FreeSpace || 0), 0),
    })),
    uptimeSeconds: os.uptime(),
  };
}

async function readComputerFile(permissionStore, targetPath) {
  assertPermission(permissionStore, "fileRead");
  assertAllowedPath(permissionStore, targetPath);

  const resolved = normalizeRootPath(targetPath);
  const content = await fs.readFile(resolved, "utf8");
  return {
    path: resolved,
    content,
  };
}

async function writeComputerFile(permissionStore, targetPath, content) {
  assertPermission(permissionStore, "fileWrite");
  assertAllowedPath(permissionStore, targetPath);

  const resolved = normalizeRootPath(targetPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, String(content || ""), "utf8");
  return {
    path: resolved,
    bytesWritten: Buffer.byteLength(String(content || ""), "utf8"),
  };
}

async function listComputerDirectory(permissionStore, targetPath) {
  assertPermission(permissionStore, "fileRead");
  assertAllowedPath(permissionStore, targetPath);

  const resolved = normalizeRootPath(targetPath);
  const entries = await fs.readdir(resolved, { withFileTypes: true });
  return {
    path: resolved,
    entries: entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    })),
  };
}

async function moveIntoAvailablePath(sourcePath, targetDir) {
  const parsed = path.parse(sourcePath);
  let candidate = path.join(targetDir, parsed.base);
  let index = 1;

  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(targetDir, `${parsed.name}-${index}${parsed.ext}`);
      index += 1;
    } catch {
      break;
    }
  }

  await fs.rename(sourcePath, candidate);
  return candidate;
}

async function organizeDesktop(permissionStore) {
  assertPermission(permissionStore, "desktopOrganize");
  assertAllowedPath(permissionStore, DESKTOP_DIR);

  const entries = await fs.readdir(DESKTOP_DIR, { withFileTypes: true });
  const moved = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).replace(".", "").toLowerCase() || "misc";
    const folderName = extension.toUpperCase();
    const targetDir = path.join(DESKTOP_DIR, folderName);
    await fs.mkdir(targetDir, { recursive: true });

    const sourcePath = path.join(DESKTOP_DIR, entry.name);
    const targetPath = await moveIntoAvailablePath(sourcePath, targetDir);
    moved.push({
      from: sourcePath,
      to: targetPath,
    });
  }

  return {
    desktop: DESKTOP_DIR,
    movedCount: moved.length,
    moved,
  };
}

function mapAppTarget(appName) {
  const normalized = String(appName || "").trim().toLowerCase();
  const mapping = {
    "记事本": { command: "notepad.exe", processName: "notepad.exe" },
    notepad: { command: "notepad.exe", processName: "notepad.exe" },
    "计算器": { command: "calc.exe", processName: "CalculatorApp.exe" },
    calc: { command: "calc.exe", processName: "CalculatorApp.exe" },
    explorer: { command: "explorer.exe", processName: "explorer.exe" },
    文件资源管理器: { command: "explorer.exe", processName: "explorer.exe" },
    powershell: { command: "powershell.exe", processName: "powershell.exe" },
    cmd: { command: "cmd.exe", processName: "cmd.exe" },
  };
  return mapping[normalized] || { command: appName, processName: appName };
}

async function launchApp(permissionStore, appName) {
  assertPermission(permissionStore, "appControl");
  const target = mapAppTarget(appName);
  await runProcess("cmd", ["/c", "start", "", target.command], { shell: false });
  return {
    launched: target.command,
  };
}

async function closeApp(permissionStore, appName) {
  assertPermission(permissionStore, "appControl");
  const target = mapAppTarget(appName);
  await runProcess("taskkill", ["/IM", target.processName, "/F"]);
  return {
    closed: target.processName,
  };
}

async function simulateKeyboard(permissionStore, mode, payload) {
  assertPermission(permissionStore, "inputControl");

  if (mode === "text") {
    const escaped = String(payload || "").replace(/'/g, "''");
    await runPowerShell(`$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('${escaped}')`);
    return { mode, text: payload };
  }

  if (mode === "keys") {
    const escaped = String(payload || "").replace(/'/g, "''");
    await runPowerShell(`$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('${escaped}')`);
    return { mode, keys: payload };
  }

  throw new Error(`Unsupported keyboard mode: ${mode}`);
}

async function simulateMouse(permissionStore, x, y, click = false) {
  assertPermission(permissionStore, "inputControl");
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseControl {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@;
[MouseControl]::SetCursorPos(${Number(x) || 0}, ${Number(y) || 0}) | Out-Null;
${click ? "[MouseControl]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero); [MouseControl]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero);" : ""}
`;
  await runPowerShell(script);
  return {
    x: Number(x) || 0,
    y: Number(y) || 0,
    click: Boolean(click),
  };
}

async function listDesktopWindows(permissionStore) {
  assertPermission(permissionStore, "appControl");
  const script = `
$windows = Get-Process |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |
  Sort-Object ProcessName, MainWindowTitle |
  Select-Object Id, ProcessName, MainWindowTitle, Responding
$windows | ConvertTo-Json -Depth 3
`;
  const result = await runPowerShell(script);

  try {
    const parsed = JSON.parse(result.stdout || "[]");
    const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return {
      count: items.length,
      windows: items.map((item) => ({
        id: Number(item.Id || 0),
        processName: String(item.ProcessName || "").trim(),
        title: String(item.MainWindowTitle || "").trim(),
        responding: item.Responding !== false,
      })),
    };
  } catch {
    return {
      count: 0,
      windows: [],
    };
  }
}

async function focusWindow(permissionStore, query) {
  assertPermission(permissionStore, "appControl");
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    throw new Error("focus window query is required");
  }

  const escapedQuery = escapePowerShellSingleQuoted(normalizedQuery);
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WindowActivator {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@;
$query = '${escapedQuery}'
$queryLower = $query.ToLowerInvariant()
$window = Get-Process |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |
  Where-Object {
    $_.MainWindowTitle.ToLowerInvariant().Contains($queryLower) -or
    $_.ProcessName.ToLowerInvariant().Contains($queryLower)
  } |
  Select-Object -First 1
if (-not $window) {
  throw "WINDOW_NOT_FOUND"
}
[WindowActivator]::ShowWindowAsync($window.MainWindowHandle, 9) | Out-Null
[WindowActivator]::SetForegroundWindow($window.MainWindowHandle) | Out-Null
[pscustomobject]@{
  id = [int]$window.Id
  processName = [string]$window.ProcessName
  title = [string]$window.MainWindowTitle
} | ConvertTo-Json -Depth 3
`;

  try {
    const result = await runPowerShell(script);
    const parsed = JSON.parse(result.stdout || "{}");
    return {
      id: Number(parsed.id || 0),
      processName: String(parsed.processName || "").trim(),
      title: String(parsed.title || "").trim(),
      query: normalizedQuery,
    };
  } catch (error) {
    if (String(error.message || "").includes("WINDOW_NOT_FOUND")) {
      throw new Error(`找不到窗口或应用：${normalizedQuery}`);
    }
    throw error;
  }
}

async function captureForegroundWindow(permissionStore, { focusQuery = "", savePath = AGENT_SCREENSHOT_FILE } = {}) {
  assertPermission(permissionStore, "inputControl");

  if (focusQuery) {
    await focusWindow(permissionStore, focusQuery);
    await wait(AGENT_SCREENSHOT_SETTLE_MS);
  }

  const resolvedSavePath = normalizeRootPath(savePath);
  await fs.mkdir(path.dirname(resolvedSavePath), { recursive: true });
  const escapedSavePath = escapePowerShellSingleQuoted(resolvedSavePath);
  const script = `
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WindowCaptureNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@;
$savePath = '${escapedSavePath}'
$hwnd = [WindowCaptureNative]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) {
  throw "FOREGROUND_WINDOW_NOT_FOUND"
}
$rect = New-Object WindowCaptureNative+RECT
[WindowCaptureNative]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$titleBuilder = New-Object System.Text.StringBuilder 1024
[WindowCaptureNative]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
$pid = [uint32]0
[WindowCaptureNative]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
$width = [Math]::Max($rect.Right - $rect.Left, 1)
$height = [Math]::Max($rect.Bottom - $rect.Top, 1)
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
$bitmap.Save($savePath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
[pscustomobject]@{
  title = [string]$titleBuilder.ToString()
  processId = [int]$pid
  left = [int]$rect.Left
  top = [int]$rect.Top
  width = [int]$width
  height = [int]$height
  path = $savePath
} | ConvertTo-Json -Depth 3
`;

  try {
    const result = await runPowerShell(script);
    const parsed = JSON.parse(result.stdout || "{}");
    return {
      title: String(parsed.title || "").trim(),
      processId: Number(parsed.processId || 0),
      left: Number(parsed.left || 0),
      top: Number(parsed.top || 0),
      width: Number(parsed.width || 0),
      height: Number(parsed.height || 0),
      path: normalizeRootPath(parsed.path || resolvedSavePath),
      focusQuery: String(focusQuery || "").trim(),
    };
  } catch (error) {
    if (String(error.message || "").includes("FOREGROUND_WINDOW_NOT_FOUND")) {
      throw new Error("当前没有可截图的前台窗口");
    }
    throw error;
  }
}

async function locateUiElementWithVision({ imagePath, target, windowInfo }) {
  const imageUrl = await imagePathToDataUrl(imagePath);
  const prompt = [
    "你是 Windows 桌面界面定位助手。",
    `当前截图来自窗口：${windowInfo?.title || "未知窗口"}。`,
    `请在截图中定位这个目标控件：${String(target || "").trim() || "未指定目标"}`,
    "只返回一个 JSON 对象，不要返回 markdown，不要解释。",
    'JSON 格式：{"found":true,"x":123,"y":456,"confidence":0.92,"reason":"简短中文说明"}',
    "坐标必须是相对于截图左上角的像素坐标。",
    '如果找不到，请返回：{"found":false,"reason":"原因"}',
  ].join("\n");

  const assistant = await callBigModelChatCompletion({
    model: AGENT_VISUAL_MODEL,
    temperature: 0.1,
    max_tokens: 400,
    thinkingEnabled: false,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  const jsonText = extractFirstJsonObject(assistant.content);
  if (!jsonText) {
    throw new Error("视觉模型没有返回可解析的定位结果");
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("视觉模型返回的定位结果不是有效 JSON");
  }

  if (!parsed || parsed.found === false) {
    throw new Error(String(parsed?.reason || "视觉模型没有找到目标控件"));
  }

  const relativeX = Math.max(0, Math.round(Number(parsed.x || 0)));
  const relativeY = Math.max(0, Math.round(Number(parsed.y || 0)));

  return {
    x: Number(windowInfo?.left || 0) + relativeX,
    y: Number(windowInfo?.top || 0) + relativeY,
    relativeX,
    relativeY,
    confidence: Number(parsed.confidence || 0),
    reason: String(parsed.reason || "").trim(),
  };
}

async function analyzeWindowUi(permissionStore, { focusQuery = "", instruction = "" } = {}) {
  const windowInfo = await captureForegroundWindow(permissionStore, { focusQuery });
  const imageUrl = await imagePathToDataUrl(windowInfo.path);
  const prompt = [
    "你是 Windows 桌面界面理解助手。",
    `截图窗口标题：${windowInfo.title || "未知窗口"}。`,
    instruction
      ? `请围绕这个目标回答：${instruction}`
      : "请总结当前界面的主要区域、按钮、输入框、列表、状态提示和下一步可操作项。",
    "回答用中文，简洁但具体。",
  ].join("\n");

  const assistant = await callBigModelChatCompletion({
    model: AGENT_VISUAL_MODEL,
    temperature: 0.2,
    max_tokens: 1200,
    thinkingEnabled: false,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  return {
    window: windowInfo,
    model: AGENT_VISUAL_MODEL,
    analysis: String(assistant.content || "").trim(),
  };
}

async function tryRunTesseractOcr(imagePath) {
  try {
    await runProcess("where", ["tesseract"]);
  } catch {
    return null;
  }

  try {
    const result = await runProcess("tesseract", [imagePath, "stdout", "-l", "chi_sim+eng", "--psm", "6"]);
    const text = String(result.stdout || "").trim();
    if (text) {
      return {
        engine: "tesseract",
        text,
      };
    }
  } catch {
    // Fall back to visual OCR below.
  }

  return null;
}

async function recognizeWindowText(permissionStore, { focusQuery = "", instruction = "" } = {}) {
  const windowInfo = await captureForegroundWindow(permissionStore, { focusQuery });
  const localOcr = await tryRunTesseractOcr(windowInfo.path);

  if (localOcr) {
    return {
      window: windowInfo,
      engine: localOcr.engine,
      text: localOcr.text,
      note: instruction ? `OCR 任务提示：${instruction}` : "",
    };
  }

  const imageUrl = await imagePathToDataUrl(windowInfo.path);
  const prompt = [
    "请对这张 Windows 窗口截图做 OCR 文字识别。",
    `窗口标题：${windowInfo.title || "未知窗口"}。`,
    instruction ? `重点要求：${instruction}` : "请尽量提取可见文本，按阅读顺序输出。",
    "直接输出识别到的文字，不要解释。",
  ].join("\n");

  const assistant = await callBigModelChatCompletion({
    model: AGENT_VISUAL_MODEL,
    temperature: 0.1,
    max_tokens: 1600,
    thinkingEnabled: false,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  return {
    window: windowInfo,
    engine: "glm-4.6v-flash",
    text: String(assistant.content || "").trim(),
  };
}

async function clickWindowElement(permissionStore, { focusQuery = "", target = "" } = {}) {
  if (!String(target || "").trim()) {
    throw new Error("target is required for click_window_element");
  }

  const windowInfo = await captureForegroundWindow(permissionStore, { focusQuery });
  const location = await locateUiElementWithVision({
    imagePath: windowInfo.path,
    target,
    windowInfo,
  });

  await simulateMouse(permissionStore, location.x, location.y, true);

  return {
    target: String(target || "").trim(),
    window: windowInfo,
    x: location.x,
    y: location.y,
    relativeX: location.relativeX,
    relativeY: location.relativeY,
    confidence: location.confidence,
    reason: location.reason,
  };
}

async function runCustomScript(permissionStore, script) {
  assertPermission(permissionStore, "scriptExecution");
  const result = await runPowerShell(String(script || ""));
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function runRepairTask(permissionStore, taskName) {
  assertPermission(permissionStore, "selfRepair");

  const tasks = {
    restart_explorer: 'Stop-Process -Name explorer -Force; Start-Process explorer.exe',
    flush_dns: "ipconfig /flushdns",
    clear_temp_user: 'Get-ChildItem -Path $env:TEMP -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue',
  };

  const script = tasks[String(taskName || "").trim()];
  if (!script) {
    throw new Error(`Unknown repair task: ${taskName}`);
  }

  const result = await runPowerShell(script);
  return {
    task: taskName,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function parseScopedAgentArgument(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) {
    return {
      focusQuery: "",
      value: "",
    };
  }

  const delimiterMatch = raw.match(/^(.+?)\s*(?:=>|->|→|\|)\s*(.+)$/);
  if (delimiterMatch) {
    return {
      focusQuery: delimiterMatch[1].trim(),
      value: delimiterMatch[2].trim(),
    };
  }

  const colonMatch = raw.match(/^(.+?)\s*[:：]\s*(.+)$/);
  if (colonMatch && !/^[A-Za-z]:\\/.test(raw)) {
    return {
      focusQuery: colonMatch[1].trim(),
      value: colonMatch[2].trim(),
    };
  }

  return {
    focusQuery: "",
    value: raw,
  };
}

function parseAgentTask(taskText) {
  const task = String(taskText || "").trim();
  const compactTask = task.replace(/\s+/g, "");

  if (/整理.*桌面|桌面.*整理/.test(task) || compactTask === "整理桌面") {
    return { action: "organize_desktop", args: {} };
  }

  if (/监控|查看.*(cpu|内存|磁盘)|系统状态/i.test(task) || compactTask === "查看系统状态") {
    return { action: "system_stats", args: {} };
  }

  if (/^(打开|启动|运行)(记事本|计算器|explorer|powershell|cmd|文件资源管理器)$/i.test(compactTask)) {
    const match = compactTask.match(/^(?:打开|启动|运行)(记事本|计算器|explorer|powershell|cmd|文件资源管理器)$/i);
    return { action: "launch_app", args: { appName: match?.[1] || "" } };
  }

  if (/^(关闭|退出)(记事本|计算器|explorer|powershell|cmd|文件资源管理器)$/i.test(compactTask)) {
    const match = compactTask.match(/^(?:关闭|退出)(记事本|计算器|explorer|powershell|cmd|文件资源管理器)$/i);
    return { action: "close_app", args: { appName: match?.[1] || "" } };
  }

  if (/^(列出窗口|查看窗口列表|查看应用窗口|查看当前窗口列表)$/i.test(compactTask)) {
    return { action: "list_windows", args: {} };
  }

  if (/^聚焦窗口/.test(task)) {
    const match = task.match(/^聚焦窗口\s*[:：]?\s*(.+)$/);
    if (match) {
      return { action: "focus_window", args: { query: match[1].trim() } };
    }
  }

  if (/^分析界面/.test(task)) {
    const match = task.match(/^分析界面\s*[:：]?\s*(.+)$/);
    if (match) {
      const scoped = parseScopedAgentArgument(match[1]);
      return {
        action: "analyze_window_ui",
        args: {
          focusQuery: scoped.focusQuery,
          instruction: scoped.value,
        },
      };
    }
    return {
      action: "analyze_window_ui",
      args: {},
    };
  }

  if (/^识别文字/.test(task)) {
    const match = task.match(/^识别文字\s*[:：]?\s*(.+)$/);
    if (match) {
      const scoped = parseScopedAgentArgument(match[1]);
      return {
        action: "recognize_window_text",
        args: {
          focusQuery: scoped.focusQuery,
          instruction: scoped.value,
        },
      };
    }
    return {
      action: "recognize_window_text",
      args: {},
    };
  }

  if (/^(点击按钮|点击界面元素)/.test(task)) {
    const match = task.match(/^(?:点击按钮|点击界面元素)\s*[:：]?\s*(.+)$/);
    if (match) {
      const scoped = parseScopedAgentArgument(match[1]);
      return {
        action: "click_window_element",
        args: {
          focusQuery: scoped.focusQuery,
          target: scoped.value,
        },
      };
    }
  }

  if (/读取文件|查看文件|读取|查看/.test(task)) {
    const match = task.match(/(?:读取文件|查看文件|读取|查看)\s*[:：]?\s*(.+)$/);
    if (match) {
      return { action: "read_file", args: { targetPath: match[1].trim() } };
    }
  }

  if (/列出目录|查看目录|浏览目录/.test(task)) {
    const match = task.match(/(?:列出目录|查看目录|浏览目录)\s*[:：]?\s*(.+)$/);
    if (match) {
      return { action: "list_directory", args: { targetPath: match[1].trim() } };
    }
  }

  if (/写入文件/.test(task)) {
    const match = task.match(/写入文件\s+(.+?)\s+内容[:：]?\s*([\s\S]+)$/);
    if (match) {
      return {
        action: "write_file",
        args: {
          targetPath: match[1].trim(),
          content: match[2],
        },
      };
    }
  }

  if (/输入文字/.test(task)) {
    const match = task.match(/输入文字[:：]?\s*([\s\S]+)$/);
    if (match) {
      return { action: "keyboard_text", args: { text: match[1] } };
    }
  }

  if (/点击坐标/.test(task)) {
    const match = task.match(/点击坐标\s*(\d+)\s*[,，]\s*(\d+)/);
    if (match) {
      return { action: "mouse_click", args: { x: Number(match[1]), y: Number(match[2]) } };
    }
  }

  if (/运行脚本/.test(task)) {
    const match = task.match(/运行脚本[:：]?\s*([\s\S]+)$/);
    if (match) {
      return { action: "run_script", args: { script: match[1] } };
    }
  }

  if (/修复/.test(task) || /^(清理|刷新).+/.test(compactTask)) {
    if (/dns/i.test(task) || compactTask === "修复DNS" || compactTask === "刷新DNS") {
      return { action: "repair_task", args: { taskName: "flush_dns" } };
    }
    if (/资源管理器|explorer/i.test(task) || compactTask === "修复资源管理器") {
      return { action: "repair_task", args: { taskName: "restart_explorer" } };
    }
    if (/临时文件|temp/i.test(task) || compactTask === "清理临时文件") {
      return { action: "repair_task", args: { taskName: "clear_temp_user" } };
    }
  }

  return null;
}

async function executeControlAction(permissionStore, action, args = {}) {
  switch (action) {
    case "system_stats":
      return getSystemStats(permissionStore);
    case "list_windows":
      return listDesktopWindows(permissionStore);
    case "focus_window":
      return focusWindow(permissionStore, getFirstDefined(args, ["query", "title", "window"]));
    case "analyze_window_ui":
      return analyzeWindowUi(permissionStore, {
        focusQuery: getFirstDefined(args, ["focusQuery", "query", "window"]),
        instruction: getFirstDefined(args, ["instruction", "prompt", "question"]),
      });
    case "recognize_window_text":
      return recognizeWindowText(permissionStore, {
        focusQuery: getFirstDefined(args, ["focusQuery", "query", "window"]),
        instruction: getFirstDefined(args, ["instruction", "prompt", "question"]),
      });
    case "click_window_element":
      return clickWindowElement(permissionStore, {
        focusQuery: getFirstDefined(args, ["focusQuery", "query", "window"]),
        target: getFirstDefined(args, ["target", "button", "element"]),
      });
    case "read_file":
      return readComputerFile(permissionStore, getFirstDefined(args, ["targetPath", "path", "filePath"]));
    case "write_file":
      return writeComputerFile(
        permissionStore,
        getFirstDefined(args, ["targetPath", "path", "filePath"]),
        getFirstDefined(args, ["content", "text"])
      );
    case "list_directory":
      return listComputerDirectory(permissionStore, getFirstDefined(args, ["targetPath", "path", "dirPath"]));
    case "organize_desktop":
      return organizeDesktop(permissionStore);
    case "launch_app":
      return launchApp(permissionStore, getFirstDefined(args, ["appName", "app"]));
    case "close_app":
      return closeApp(permissionStore, getFirstDefined(args, ["appName", "app"]));
    case "keyboard_text":
      return simulateKeyboard(permissionStore, "text", getFirstDefined(args, ["text", "payload"]));
    case "keyboard_keys":
      return simulateKeyboard(permissionStore, "keys", getFirstDefined(args, ["keys", "payload"]));
    case "mouse_click":
      return simulateMouse(permissionStore, args.x, args.y, true);
    case "mouse_move":
      return simulateMouse(permissionStore, args.x, args.y, false);
    case "run_script":
      return runCustomScript(permissionStore, getFirstDefined(args, ["script", "command"]));
    case "repair_task":
      return runRepairTask(permissionStore, getFirstDefined(args, ["taskName", "task"]));
    default:
      throw new Error(`Unknown control action: ${action}`);
  }
}

app.get("/api/meta", async (_req, res) => {
  try {
    await ensureModelProviderSettingsLoaded();
    const [permissions, videoControllers, models] = await Promise.all([
      readPermissionsStore(),
      getVideoControllers(),
      listProviderModels(),
    ]);
    const hardware = summarizeHardware(videoControllers);
    const defaultModel = resolveDefaultModel(models);
    const hasLocalModel = models.some((item) => item.source === "local");
    const hasCloudModel = models.some((item) => item.source === "cloud");
    const cloudProviderKind = getConfiguredCloudProviderKind();
    const provider = hasLocalModel && hasCloudModel ? "hybrid" : hasCloudModel ? cloudProviderKind : AI_PROVIDER;
    const providerLabel = hasLocalModel && hasCloudModel ? `本地 + ${getProviderLabelByKind(cloudProviderKind)}` : getProviderLabel();
    res.json({
      ok: true,
      provider,
      providerLabel,
      defaultModel,
      baseUrl: getProviderBaseUrl(),
      ollamaBaseUrl: OLLAMA_BASE_URL,
      openAiCompatBaseUrl: OPENAI_COMPAT_BASE_URL,
      supportsRuntimeOptions: hasLocalModel,
      sessionsFile: SESSIONS_FILE,
      permissionsFile: PERMISSIONS_FILE,
      desktopDir: DESKTOP_DIR,
      allowedRoots: permissions.allowedRoots,
      preferredGpuName: hardware.preferredGpuName,
      videoControllers: hardware.videoControllers,
      gpuAvailable: hardware.gpuAvailable,
      hardwarePlatform: hardware.platform,
      runtimePermissionRequired: hardware.runtimePermissionRequired,
      runtimePermissionGranted: hardware.runtimePermissionGranted,
      models,
      modelProviderSettings: serializeModelProviderSettings(),
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: formatProviderNetworkError(error),
      details: error.message,
      provider: AI_PROVIDER,
      providerLabel: getProviderLabel(),
      defaultModel: DEFAULT_MODEL,
      baseUrl: getProviderBaseUrl(),
      ollamaBaseUrl: OLLAMA_BASE_URL,
      openAiCompatBaseUrl: OPENAI_COMPAT_BASE_URL,
      supportsRuntimeOptions: supportsRuntimeOptions(),
      sessionsFile: SESSIONS_FILE,
      permissionsFile: PERMISSIONS_FILE,
      desktopDir: DESKTOP_DIR,
      preferredGpuName: "",
      videoControllers: [],
      gpuAvailable: false,
      hardwarePlatform: process.platform,
      runtimePermissionRequired: false,
      runtimePermissionGranted: false,
      models: [],
      modelProviderSettings: serializeModelProviderSettings(),
    });
  }
});

// Persistence and configuration routes are registered from src/backend/routes/persistenceRoutes.js.

app.post("/api/chat", async (req, res) => {
  const { messages, model, options } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }

  const controller = new AbortController();
  const routedModel = parseRoutedModel(model);
  let streamCompleted = false;

  res.on("close", () => {
    if (!streamCompleted) {
      controller.abort();
    }
  });

  try {
    const target = getProviderRequestTarget(routedModel.provider);
    const response = await fetch(
      target.url,
      {
      method: "POST",
      headers: target.headers,
      body: JSON.stringify(
        buildProviderRequestBody({
          provider: routedModel.provider,
          model: routedModel.rawModel,
          messages,
          options,
          stream: true,
        })
      ),
      signal: controller.signal,
      }
    );

    if (!response.ok || !response.body) {
      const details = await response.text();
      return res.status(502).json({
        error: `Failed to contact ${getProviderLabelByKind(routedModel.provider)}`,
        details: details || `HTTP ${response.status}`,
      });
    }

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    if (isOpenAICompatibleProviderByKind(routedModel.provider)) {
      await streamFromLmStudio(response, res);
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    }

    streamCompleted = true;
    res.end();
  } catch (error) {
    if (controller.signal.aborted) {
      return res.end();
    }

    res.status(500).json({
      error: formatProviderNetworkErrorByKind(routedModel.provider, error),
      details: error.message,
    });
  }
});

app.post("/api/chat-once", async (req, res) => {
  const { messages, model, options } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }

  const routedModel = parseRoutedModel(model);

  try {
    const target = getProviderRequestTarget(routedModel.provider);
    const response = await fetch(
      target.url,
      {
      method: "POST",
      headers: target.headers,
      body: JSON.stringify(
        buildProviderRequestBody({
          provider: routedModel.provider,
          model: routedModel.rawModel,
          messages,
          options,
          stream: false,
        })
      ),
      }
    );

    if (!response.ok) {
      const details = await response.text();
      return res.status(502).json({
        error: `Failed to contact ${getProviderLabelByKind(routedModel.provider)}`,
        details: details || `HTTP ${response.status}`,
      });
    }

    const data = await response.json();
    const assistant = extractProviderMessageByProvider(routedModel.provider, data);
    res.json({
      ok: true,
      message: assistant.content,
      thinking: assistant.thinking,
      raw: data,
    });
  } catch (error) {
    res.status(500).json({
      error: formatProviderNetworkErrorByKind(routedModel.provider, error),
      details: error.message,
    });
  }
});

app.get("/api/system/stats", async (_req, res) => {
  try {
    const permissions = await readPermissionsStore();
    const stats = await getSystemStats(permissions);
    res.json({
      ok: true,
      stats,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get("/api/local-file", async (req, res) => {
  const targetPath = String(req.query?.path || "").trim();
  if (!targetPath) {
    res.status(400).json({ ok: false, error: "path is required" });
    return;
  }
  const resolvedPath = path.resolve(targetPath);
  try {
    const stats = await fs.stat(resolvedPath);
    if (!stats.isFile()) {
      res.status(404).json({ ok: false, error: "file not found" });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(resolvedPath);
  } catch (error) {
    res.status(404).json({ ok: false, error: error.message || "file not found" });
  }
});

app.post("/api/control/execute", async (req, res) => {
  const { action, args } = req.body ?? {};

  if (!action) {
    return res.status(400).json({ ok: false, error: "action is required" });
  }

  try {
    const permissions = await readPermissionsStore();
    const result = await executeControlAction(permissions, action, args || {});
    res.json({
      ok: true,
      action,
      result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
      action,
    });
  }
});

app.post("/api/doubao-web/chat", async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();

  if (!prompt) {
    return res.status(400).json({ ok: false, error: "prompt is required" });
  }

  if (typeof desktopBridge.chatWithDoubao !== "function") {
    return res.status(501).json({
      ok: false,
      error: "Doubao web bridge is only available in Electron desktop mode",
    });
  }

  try {
    console.log(`[doubao-web] start prompt length=${prompt.length}`);
    const result = await desktopBridge.chatWithDoubao(prompt, {
      timeoutMs: req.body?.timeoutMs,
    });
    console.log(
      `[doubao-web] complete ok=${Boolean(result?.ok)} stage=${result?.stage || "done"} partial=${Boolean(result?.partial)}`
    );
    res.json({
      ok: Boolean(result?.ok),
      ...result,
    });
  } catch (error) {
    console.error("[doubao-web] failed:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Doubao web bridge failed",
    });
  }
});

app.post("/api/doubao-web/cancel", async (_req, res) => {
  if (typeof desktopBridge.cancelDoubaoChat !== "function") {
    return res.json({ ok: true });
  }

  try {
    const result = await desktopBridge.cancelDoubaoChat();
    res.json({
      ok: true,
      ...(result || {}),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Doubao web cancel failed",
    });
  }
});

app.post("/api/agent/execute", async (req, res) => {
  const { task } = req.body ?? {};
  if (!task) {
    return res.status(400).json({ ok: false, error: "task is required" });
  }

  try {
    const permissions = await readPermissionsStore();
    const plan = parseAgentTask(task);

    if (!plan) {
      return res.json({
        ok: true,
        planned: false,
        message: "当前本地管家暂时无法自动解析这个任务。请改成更明确的命令，例如“整理桌面”、“打开记事本”、“读取文件 D:\\test.txt”。",
      });
    }

    const result = await executeControlAction(permissions, plan.action, plan.args);
    res.json({
      ok: true,
      planned: true,
      action: plan.action,
      args: plan.args,
      result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

let serverInstance = null;

function logStartup(port) {
  console.log(`FreeFlow UI running at http://localhost:${port}`);
  console.log(
    `AI provider: ${getProviderLabel()} (${AI_PROVIDER === "bigmodel" ? getConfiguredCloudProviderKind() : AI_PROVIDER})`
  );
  console.log(`Provider endpoint: ${getProviderBaseUrl()}`);
  console.log(
    `Default model: ${
      AI_PROVIDER === "bigmodel"
        ? String(getCloudProviderSettings().defaultModel || "").trim() || DEFAULT_MODEL
        : DEFAULT_MODEL
    }`
  );
  console.log(
    `Local runtime preset: GPU auto preferred, CPU fallback num_ctx=1024/2048, num_thread=${CPU_FALLBACK_THREAD_COUNT}, use_mmap=false, stream=false`
  );
}

function startServer(port = PORT) {
  if (serverInstance) {
    return Promise.resolve(serverInstance);
  }

  return ensureModelProviderSettingsLoaded().then(
    () =>
      new Promise((resolve, reject) => {
        const nextServer = app.listen(port, () => {
          serverInstance = nextServer;
          logStartup(port);
          resolve(nextServer);
        });

        nextServer.once("error", (error) => {
          if (serverInstance === nextServer) {
            serverInstance = null;
          }
          reject(error);
        });
      })
  );
}

function stopServer() {
  if (!serverInstance) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const activeServer = serverInstance;
    serverInstance = null;
    activeServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function registerDesktopBridge(bridge = {}) {
  desktopBridge = {
    chatWithDoubao: typeof bridge.chatWithDoubao === "function" ? bridge.chatWithDoubao : null,
    cancelDoubaoChat: typeof bridge.cancelDoubaoChat === "function" ? bridge.cancelDoubaoChat : null,
  };
}

module.exports = {
  app,
  startServer,
  stopServer,
  registerDesktopBridge,
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
