import {
  CONFIG,
  DESKTOP_SHELL,
  IS_DESKTOP_APP,
  DOUBAO_WEB_MODEL,
  LOCAL_MODEL_PREFIX,
  CLOUD_MODEL_PREFIX,
  AGENT_PREFERRED_MODEL,
  getCanvasFileTypeTagMeta,
} from "../config/index.js";
import { PERMISSION_META, SIDEBAR_SECTION_DEFS } from "../config/ui-meta.js";
import { createInitialState } from "../state/createInitialState.js";
import { mountLemniscateBloomLoader } from "../components/loaders/lemniscateBloomLoader.js";
import { createCanvasItemInteractionController } from "../components/canvas/canvasItemInteractions.js";
import { mountThemeSettingsPanel } from "../components/theme/themeSettingsPanel.js";
import { DEFAULT_THEME_SETTINGS, normalizeThemeSettings } from "../theme/themeSettings.js";
import { applyThemeCssVariables } from "../theme/themeCssVariables.js";
import { API_ROUTES, readJsonResponse } from "../api/http.js";
import { listAiMirrorTargets, prepareAiMirrorTarget, stopAiMirrorTarget } from "./aiMirrorClient.js";

const state = createInitialState();
const APP_CLIPBOARD_TTL_MS = 120000;
const SCREEN_SOURCE_EMBED_FIT_MODES = Object.freeze(["contain", "cover", "fill"]);
const DEFAULT_SCREEN_SOURCE_EMBED_POLICY = Object.freeze({
  fitMode: "fill",
});

state.screenSource.embedPolicies = loadScreenSourceEmbedPolicies();

function normalizeScreenSourceFitMode(value) {
  const fitMode = String(value || "").trim().toLowerCase();
  return SCREEN_SOURCE_EMBED_FIT_MODES.includes(fitMode) ? fitMode : DEFAULT_SCREEN_SOURCE_EMBED_POLICY.fitMode;
}

function normalizeScreenSourceEmbedPolicy(policy = {}) {
  return {
    fitMode: normalizeScreenSourceFitMode(policy?.fitMode),
  };
}

function normalizeScreenSourceEmbedPoliciesMap(input = {}) {
  const entries = {};
  for (const [sourceId, policy] of Object.entries(input || {})) {
    const cleanSourceId = String(sourceId || "").trim();
    if (!cleanSourceId) continue;
    entries[cleanSourceId] = normalizeScreenSourceEmbedPolicy(policy);
  }
  return entries;
}

function loadScreenSourceEmbedPolicies() {
  try {
    const raw = localStorage.getItem(CONFIG.screenSourceEmbedPolicyKey);
    if (!raw) {
      return {};
    }
    return normalizeScreenSourceEmbedPoliciesMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function persistScreenSourceEmbedPolicies() {
  try {
    localStorage.setItem(CONFIG.screenSourceEmbedPolicyKey, JSON.stringify(state.screenSource.embedPolicies || {}));
  } catch {
    // Ignore local persistence failures.
  }
}

function getScreenSourceEmbedPolicy(sourceId = "") {
  const cleanSourceId = String(sourceId || "").trim();
  if (!cleanSourceId) {
    return { ...DEFAULT_SCREEN_SOURCE_EMBED_POLICY };
  }

  return normalizeScreenSourceEmbedPolicy(state.screenSource.embedPolicies?.[cleanSourceId]);
}

function updateScreenSourceEmbedPolicy(sourceId = "", nextPolicy = {}) {
  const cleanSourceId = String(sourceId || "").trim();
  if (!cleanSourceId) return;

  state.screenSource.embedPolicies = {
    ...(state.screenSource.embedPolicies || {}),
    [cleanSourceId]: normalizeScreenSourceEmbedPolicy({
      ...getScreenSourceEmbedPolicy(cleanSourceId),
      ...nextPolicy,
    }),
  };
  persistScreenSourceEmbedPolicies();
}

function normalizeSidebarSections(input) {
  const next = [];
  const seen = new Set();

  for (const item of Array.isArray(input) ? input : []) {
    const key =
      typeof item === "string"
        ? item.trim()
        : typeof item?.key === "string"
          ? item.key.trim()
          : "";
    if (!SIDEBAR_SECTION_DEFS.some((entry) => entry.key === key) || seen.has(key)) continue;
    seen.add(key);
    next.push({
      key,
      visible: item?.visible !== false,
    });
  }

  for (const item of SIDEBAR_SECTION_DEFS) {
    if (seen.has(item.key)) continue;
    next.push({
      key: item.key,
      visible: true,
    });
  }

  return next;
}

function normalizeUiSettings(payload = {}) {
  const rawAppName = typeof payload.appName === "string" && payload.appName.trim() ? payload.appName.trim() : "Bo AI";
  const rawAppSubtitle =
    typeof payload.appSubtitle === "string" && payload.appSubtitle.trim()
      ? payload.appSubtitle.trim()
      : "无限画布助手";
  const rawCanvasTitle =
    typeof payload.canvasTitle === "string" && payload.canvasTitle.trim()
      ? payload.canvasTitle.trim()
      : "无限画布与 AI 助手";
  const appName = rawAppName === "AI_Worker" ? "Bo AI" : rawAppName;
  const appSubtitle =
    rawAppSubtitle === "本地模型工作台" || rawAppSubtitle === "Infinite Board Assistant"
      ? "无限画布助手"
      : rawAppSubtitle;
  const canvasTitle = rawCanvasTitle === "Infinite Canvas & AI Assistant Overlay" ? "无限画布与 AI 助手" : rawCanvasTitle;
  const canvasBoardSavePath =
    typeof payload.canvasBoardSavePath === "string" && payload.canvasBoardSavePath.trim()
      ? payload.canvasBoardSavePath.trim()
      : "data/canvas-board.json";
  const theme = normalizeThemeSettings(payload);

  return {
    appName: appName.slice(0, 40),
    appSubtitle: appSubtitle.slice(0, 80),
    canvasTitle: canvasTitle.slice(0, 60),
    canvasBoardSavePath: canvasBoardSavePath.slice(0, 400),
    ...theme,
    sidebarSections: normalizeSidebarSections(payload.sidebarSections),
  };
}

function sanitizeCanvasTextPreview(text, maxLength = 8000) {
  return String(text || "").replace(/\0/g, "").trim().slice(0, maxLength);
}

function isExtractableCanvasFile(fileName = "", mimeType = "") {
  const normalizedName = String(fileName || "").trim().toLowerCase();
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  return (
    normalizedMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    normalizedMimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    normalizedMimeType === "application/pdf" ||
    normalizedName.endsWith(".docx") ||
    normalizedName.endsWith(".pptx") ||
    normalizedName.endsWith(".pdf")
  );
}

function getFileNameFromPath(filePath = "") {
  return String(filePath || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || "未命名文件";
}

function getFileExtension(fileName = "") {
  const normalizedName = String(fileName || "").trim().toLowerCase();
  const index = normalizedName.lastIndexOf(".");
  return index >= 0 ? normalizedName.slice(index + 1) : "";
}

function clampCanvasScale(scale) {
  const numericScale = Number(scale) || CONFIG.canvasDefaultScale;
  return Math.min(Math.max(numericScale, CONFIG.canvasMinScale), CONFIG.canvasMaxScale);
}

function normalizeCanvasTextBoxFontSize(fontSize) {
  const numericValue = Number(fontSize) || CONFIG.canvasTextBoxDefaultFontSize;
  return Math.min(Math.max(numericValue, CONFIG.canvasTextBoxMinFontSize), CONFIG.canvasTextBoxMaxFontSize);
}

function sanitizeCanvasTextboxText(text, maxLength = 8000) {
  return String(text || "").replace(/\0/g, "").replace(/\r\n?/g, "\n").slice(0, maxLength);
}

function normalizeCanvasBoard(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const view = source.view && typeof source.view === "object" ? source.view : {};
  const items = Array.isArray(source.items) ? source.items : [];

  return {
    view: {
      scale: clampCanvasScale(view.scale),
      offsetX: Number(view.offsetX) || CONFIG.canvasDefaultOffsetX,
      offsetY: Number(view.offsetY) || CONFIG.canvasDefaultOffsetY,
    },
    selectedIds: Array.isArray(source.selectedIds)
      ? source.selectedIds.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 24)
      : [],
    items: items
      .map((item, index) => ({
        id: String(item?.id || crypto.randomUUID()),
        kind: ["text", "image", "file", "textbox"].includes(item?.kind) ? item.kind : "text",
        title: String(item?.title || "").trim() || `素材 ${index + 1}`,
        text:
          item?.kind === "textbox"
            ? sanitizeCanvasTextboxText(item?.text || "")
            : sanitizeCanvasTextPreview(item?.text || ""),
        dataUrl: typeof item?.dataUrl === "string" ? item.dataUrl : "",
        filePath: String(item?.filePath || "").trim(),
        fileName: String(item?.fileName || "").trim(),
        mimeType: String(item?.mimeType || "").trim(),
        isDirectory: Boolean(item?.isDirectory),
        fileSize: Number(item?.fileSize) || 0,
        x: Number(item?.x) || index * 44,
        y: Number(item?.y) || index * 36,
        width:
          (item?.kind === "textbox" || item?.kind === "text")
            ? Math.max(220, Math.min(420, Number(item?.width) || CONFIG.canvasTextBoxDefaultWidth))
            : Math.max(220, Number(item?.width) || CONFIG.canvasCardWidth),
        height:
          (item?.kind === "textbox" || item?.kind === "text")
            ? Math.max(88, Math.min(180, Number(item?.height) || CONFIG.canvasTextBoxDefaultHeight))
            : Math.max(88, Number(item?.height) || CONFIG.canvasCardHeight),
        fontSize: normalizeCanvasTextBoxFontSize(item?.fontSize),
        bold: Boolean(item?.bold),
        highlighted: Boolean(item?.highlighted),
        createdAt: Number(item?.createdAt) || Date.now(),
      }))
      .slice(0, 120),
  };
}

function normalizeModelList(models = [], fallbackModel = "") {
  const entries = [];
  const seen = new Set();

  for (const item of Array.isArray(models) ? models : []) {
    const name = String(item?.name || item?.id || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      name,
      id: item?.id || name,
      rawName: String(item?.rawName || "").trim(),
      source: String(item?.source || "").trim(),
      displayName: String(item?.displayName || "").trim() || getModelDisplayName(name),
    });
  }

  for (const name of [String(fallbackModel || "").trim()]) {
    const cleanName = String(name || "").trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      name: cleanName,
      id: cleanName,
      rawName: stripRoutedModelName(cleanName),
      source: getModelSource(cleanName),
      displayName: getModelDisplayName(cleanName),
    });
  }

  return entries;
}

function stripRoutedModelName(modelName) {
  const value = String(modelName || "").trim();
  if (value.startsWith(LOCAL_MODEL_PREFIX)) {
    return value.slice(LOCAL_MODEL_PREFIX.length);
  }
  if (value.startsWith(CLOUD_MODEL_PREFIX)) {
    return value.slice(CLOUD_MODEL_PREFIX.length);
  }
  return value;
}

function getModelSource(modelName) {
  const value = String(modelName || "").trim();
  if (value.startsWith(LOCAL_MODEL_PREFIX)) return "local";
  if (value.startsWith(CLOUD_MODEL_PREFIX)) return "cloud";
  if (isDoubaoWebModel(value)) return "browser";
  return "local";
}

function isLocalModel(modelName) {
  return getModelSource(modelName) === "local";
}

function supportsRuntimeOptionsForModel(modelName) {
  return isLocalModel(modelName);
}

function supportsThinkingToggle(modelName) {
  if (isDoubaoWebModel(modelName)) {
    return false;
  }
  return /^(qwen3\.5:|glm-4\.7-flash|glm-4\.6v-flash)/i.test(stripRoutedModelName(modelName));
}

function isDoubaoWebModel(modelName) {
  return String(modelName || "").trim().toLowerCase() === DOUBAO_WEB_MODEL;
}

function getModelDisplayName(modelName) {
  const value = String(modelName || "").trim();
  if (isDoubaoWebModel(value)) {
    return "豆包网页版";
  }

  const rawValue = stripRoutedModelName(value);
  const shortRawValue = rawValue === "qwen2.5:0.5b-instruct-q4_0" ? "qwen2.5:0.5b" : rawValue;

  if (value.startsWith(LOCAL_MODEL_PREFIX)) {
    return `本地：${shortRawValue}`;
  }
  if (value.startsWith(CLOUD_MODEL_PREFIX)) {
    return `云端：${shortRawValue}`;
  }

  return shortRawValue;
}

function hasAvailableModel(modelName) {
  const target = String(modelName || "").trim();
  if (!target || !modelSelect) return false;
  return [...modelSelect.options].some((option) => option.value === target);
}

function getPreferredAgentModel() {
  const selectedModel = String(modelSelect?.value || state.model || "").trim();

  if (selectedModel && !isDoubaoWebModel(selectedModel) && hasAvailableModel(selectedModel)) {
    return selectedModel;
  }

  if (hasAvailableModel(AGENT_PREFERRED_MODEL)) {
    return AGENT_PREFERRED_MODEL;
  }

  return selectedModel || AGENT_PREFERRED_MODEL;
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
  if (start < 0) return "";

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

  return "";
}

function getDeviceModeLabel(deviceMode, gpuName = "") {
  if (deviceMode === "cpu") {
    return "CPU";
  }
  if (deviceMode === "cloud") {
    return "云端";
  }
  if (deviceMode === "browser") {
    return "网页桥接";
  }

  return gpuName ? `${gpuName} / 自动` : "GPU / 自动";
}

function getDefaultModelProfile(modelName = "") {
  return {
    contextLimit: CONFIG.defaultContextLimit,
    thinkingEnabled: supportsThinkingToggle(modelName),
    deviceMode: "auto",
  };
}

function normalizeStoredContextLimit(limit) {
  return Number(limit) === 1024 ? 1024 : CONFIG.defaultContextLimit;
}

function normalizeModelProfileEntry(modelName, profile = {}) {
  const base = getDefaultModelProfile(modelName);
  const incoming = profile && typeof profile === "object" ? profile : {};

  return {
    ...base,
    ...incoming,
    contextLimit: normalizeStoredContextLimit(incoming.contextLimit),
    deviceMode: incoming.deviceMode === "cpu" ? "cpu" : "auto",
    thinkingEnabled:
      typeof incoming.thinkingEnabled === "boolean" ? incoming.thinkingEnabled : base.thinkingEnabled,
  };
}

function sanitizeModelProfilesMap(profiles = {}) {
  const next = {};
  let changed = false;

  for (const [modelName, profile] of Object.entries(profiles && typeof profiles === "object" ? profiles : {})) {
    if (!modelName || isDoubaoWebModel(modelName)) {
      changed = true;
      continue;
    }

    const normalized = normalizeModelProfileEntry(modelName, profile);
    next[modelName] = normalized;

    if (
      !profile ||
      Number(profile.contextLimit) !== normalized.contextLimit ||
      profile.deviceMode !== normalized.deviceMode ||
      Boolean(profile.thinkingEnabled) !== normalized.thinkingEnabled
    ) {
      changed = true;
    }
  }

  return {
    profiles: next,
    changed,
  };
}

function getModelProfile(modelName) {
  const key = String(modelName || "").trim();
  if (!key) {
    return getDefaultModelProfile(key);
  }

  return normalizeModelProfileEntry(key, state.modelProfiles[key]);
}

function getModelContextLimit(modelName) {
  return Number(getModelProfile(modelName).contextLimit) || CONFIG.defaultContextLimit;
}

function getModelDeviceMode(modelName) {
  return getModelProfile(modelName).deviceMode === "cpu" ? "cpu" : "auto";
}

function syncProviderCapabilities() {
  if (!deviceModeSelect) return;
  if (isDoubaoWebModel(state.model)) {
    deviceModeSelect.disabled = true;
    deviceModeSelect.value = "auto";
    return;
  }

  const enabled = supportsRuntimeOptionsForModel(state.model);
  deviceModeSelect.disabled = !enabled;
  deviceModeSelect.value = getModelDeviceMode(state.model);

  const autoOption = deviceModeSelect.querySelector('option[value="auto"]');
  if (autoOption) {
    autoOption.textContent = getDeviceModeLabel("auto", state.hardware.preferredGpuName);
  }
}

function ensureContextLimitOption(limit) {
  const numericLimit = Number(limit) || CONFIG.defaultContextLimit;
  const values = [...new Set([...CONFIG.contextLimitOptions, numericLimit])].sort((a, b) => a - b);
  contextLimitSelect.innerHTML = values
    .map((value) => `<option value="${value}">${value}</option>`)
    .join("");
}

function applyModelSelection(modelName, { announce = false, persistSession = true } = {}) {
  const nextModel = String(modelName || "").trim() || state.model;
  if (!nextModel) return;
  const isDoubaoModel = isDoubaoWebModel(nextModel);

  state.model = nextModel;
  const nextLimit = getModelContextLimit(nextModel);
  state.contextLimit = nextLimit;

  if (modelSelect.value !== nextModel) {
    modelSelect.value = nextModel;
  }

  ensureContextLimitOption(nextLimit);
  contextLimitSelect.value = String(nextLimit);
  contextLimitSelect.disabled = isDoubaoModel;
  if (deviceModeSelect) {
    deviceModeSelect.value = isDoubaoModel ? "auto" : getModelDeviceMode(nextModel);
    deviceModeSelect.disabled = !supportsRuntimeOptionsForModel(nextModel) || isDoubaoModel;
  }
  syncThinkingToggle(nextModel);
  if (runtimeSummaryEl) {
    runtimeSummaryEl.textContent = isDoubaoModel
      ? "浏览器自动化 · 豆包网页"
      : `${getModelDisplayName(nextModel)} · ${getDeviceModeLabel(
          isLocalModel(nextModel) ? getModelDeviceMode(nextModel) : "cloud",
          state.hardware.preferredGpuName
        )}`;
  }
  if (conversationModelLabelEl) {
    conversationModelLabelEl.textContent = getModelDisplayName(nextModel);
  }
  renderConversationModelMenu();

  const session = getCurrentSession();
  if (session && persistSession) {
    session.activeModel = nextModel;
    touchSession(session);
    persistSessions();
    renderSessions();
  }

  renderContextStats();

  if (announce) {
    if (isDoubaoModel) {
      setStatus("已切换到豆包网页版。消息会通过 Electron 打开豆包网页、自动发送并抓取回答。", "success");
      return;
    }
    const thinkingSuffix = supportsThinkingToggle(nextModel)
      ? `，Thinking ${getModelProfile(nextModel).thinkingEnabled ? "开启" : "关闭"}`
      : "";
    const deviceSuffix = `，设备 ${getDeviceModeLabel(
      isLocalModel(nextModel) ? getModelDeviceMode(nextModel) : "cloud",
      state.hardware.preferredGpuName
    )}`;
    setStatus(
      `已切换到 ${getModelDisplayName(nextModel)}，上下文窗口 ${nextLimit}${deviceSuffix}${thinkingSuffix}`,
      "success"
    );
  }
}

function syncThinkingToggle(modelName) {
  const supported = supportsThinkingToggle(modelName);
  thinkingToggleWrap?.classList.toggle("is-hidden", !supported);

  if (thinkingToggle) {
    thinkingToggle.disabled = !supported;
    if (supported) {
      thinkingToggle.checked = Boolean(getModelProfile(modelName).thinkingEnabled);
    } else {
      thinkingToggle.checked = false;
    }
  }

  if (!composerThinkingBtn) return;

  composerThinkingBtn.classList.toggle("is-hidden", !supported);
  composerThinkingBtn.disabled = !supported;
  if (supported) {
    const enabled = Boolean(getModelProfile(modelName).thinkingEnabled);
    composerThinkingBtn.classList.toggle("is-active", enabled);
    composerThinkingBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    composerThinkingBtn.title = enabled ? "关闭 Thinking" : "开启 Thinking";
    composerThinkingBtn.setAttribute("aria-label", enabled ? "关闭 Thinking" : "开启 Thinking");
  } else {
    composerThinkingBtn.classList.remove("is-active");
    composerThinkingBtn.setAttribute("aria-pressed", "false");
    composerThinkingBtn.title = "";
    composerThinkingBtn.setAttribute("aria-label", "切换 Thinking");
  }
}

async function setThinkingEnabledForActiveModel(enabled) {
  const activeModel = modelSelect?.value || state.model;
  if (!activeModel || !supportsThinkingToggle(activeModel)) return;

  state.modelProfiles[activeModel] = {
    ...getModelProfile(activeModel),
    thinkingEnabled: Boolean(enabled),
  };

  if (thinkingToggle) {
    thinkingToggle.checked = Boolean(enabled);
  }
  syncThinkingToggle(activeModel);

  try {
    await saveModelProfiles();
    setStatus(`${getModelDisplayName(activeModel)} Thinking 已${enabled ? "开启" : "关闭"}`, "success");
  } catch (error) {
    setStatus(`模型档案保存失败：${error.message}`, "warning");
  }
}

function buildAgentConversationMessages(session) {
  const messages = [];
  const canvasContext = buildCanvasSelectionContext();

  if (session?.summary) {
    messages.push({
      role: "system",
      content: `以下是当前会话的运行摘要，请作为上下文继续处理：\n${session.summary}`,
    });
  }

  if (canvasContext) {
    messages.push({
      role: "system",
      content: `以下是左侧无限画布中当前选中的素材卡，请优先把它们作为本次任务的上下文：\n${canvasContext}`,
    });
  }

  messages.push(
    ...(session?.messages || [])
      .filter((item) => !item.transient && !item.summarized && !item.pending && String(item.content || "").trim())
      .map(({ role, content }) => ({ role, content }))
  );

  return messages;
}

function buildAgentPlannerMessages(task, session) {
  const enabledPermissions = PERMISSION_META.filter(
    (item) => state.permissionStore.permissions[item.key]
  ).map((item) => item.name);

  const permissionSummary = enabledPermissions.length
    ? enabledPermissions.join("、")
    : "当前没有任何已开启权限";

  const allowedRoots = state.permissionStore.allowedRoots.length
    ? state.permissionStore.allowedRoots.join("；")
    : "当前没有任何授权目录";

  return [
    {
      role: "system",
      content: [
        `你是 ${getAppDisplayName()} 的本地桌面管家。`,
        "你现在不是单纯的命令改写器，而是一个可对话的任务管家。",
        "你必须先理解用户意图，再决定是：直接回答、追问澄清，还是执行本地动作。",
        "如果用户只是像聊天一样提问、追问上一步结果、询问建议或让你解释当前情况，你应该直接回复，不要强行执行动作。",
        "只有当用户明确希望你操作电脑、读取界面、识别文字、点击按钮、打开应用、读写文件或执行系统任务时，才进入执行模式。",
        "",
        "当需要执行本地动作时，你能选择的标准命令只有这些：",
        "1. 整理桌面",
        "2. 查看系统状态",
        "3. 打开记事本",
        "4. 打开计算器",
        "5. 打开文件资源管理器",
        "6. 打开 PowerShell",
        "7. 打开 CMD",
        "8. 关闭记事本",
        "9. 关闭计算器",
        "10. 关闭文件资源管理器",
        "11. 关闭 PowerShell",
        "12. 关闭 CMD",
        "13. 读取文件 <绝对路径>",
        "14. 查看目录 <绝对路径>",
        "15. 写入文件 <绝对路径> 内容：<文本内容>",
        "16. 输入文字：<文本内容>",
        "17. 点击坐标 X,Y",
        "18. 运行脚本：<PowerShell 脚本>",
        "19. 修复 DNS",
        "20. 修复资源管理器",
        "21. 清理临时文件",
        "22. 列出窗口",
        "23. 聚焦窗口 <窗口标题或进程名>",
        "24. 分析界面 <窗口标题 => 任务说明> 或 分析界面 <任务说明>",
        "25. 识别文字 <窗口标题 => 任务说明> 或 识别文字 <任务说明>",
        "26. 点击按钮 <窗口标题 => 按钮文字或元素描述> 或 点击按钮 <按钮文字或元素描述>",
        "",
        "输出要求：",
        "- 你必须只返回一个 JSON 对象，不要返回 markdown，不要解释，不要输出 JSON 之外的任何内容。",
        '- JSON 格式之一：{"mode":"reply","reply":"给用户的自然语言回复"}',
        '- JSON 格式之二：{"mode":"clarify","reply":"你的澄清问题"}',
        '- JSON 格式之三：{"mode":"execute","task":"标准命令","reply":"一句简短说明，告诉用户你准备执行什么"}',
        "",
        "决策规则：",
        "- 如果当前信息足够，且用户希望你实际操作电脑，返回 mode=execute。",
        "- 如果用户只是聊天、咨询、解释、追问结果、询问下一步建议，返回 mode=reply。",
        "- 如果用户目标不清楚，缺少关键对象、窗口、按钮或文件路径，返回 mode=clarify。",
        "",
        "执行命令规则：",
        "- 如果用户要读取、写入、查看目录，尽量保留原始绝对路径。",
        "- 如果用户表达的是同义句，例如“帮我看一下系统占用”，应改写成“查看系统状态”。",
        "- 如果用户表达“帮我把桌面整理一下”，应改写成“整理桌面”。",
        "- 如果用户要求你看当前界面、识别窗口内容、看图操作、找按钮、读屏幕文字，优先改写为“分析界面”“识别文字”或“点击按钮”。",
        "- 需要指定窗口时，使用“窗口标题 => 目标”这种格式。",
        "- 如果请求依赖未授权能力，也仍然可以先规划标准命令，不要替用户拒绝；由执行层处理权限结果。",
        "",
        "回复规则：",
        "- reply/clarify 要像正常聊天一样自然、简洁、有上下文感。",
        "- 你可以引用当前会话中已经发生的执行结果来回答用户追问。",
        "",
        `当前已开启权限：${permissionSummary}。`,
        `当前授权目录：${allowedRoots}。`,
      ].join("\n"),
    },
    ...buildAgentConversationMessages(session),
    {
      role: "user",
      content: task,
    },
  ];
}

function applyThinkingDirective(messages, modelName) {
  if (!supportsThinkingToggle(modelName)) {
    return messages;
  }

  const thinkingEnabled = getModelProfile(modelName).thinkingEnabled;
  const nextMessages = Array.isArray(messages) ? messages.map((item) => ({ ...item })) : [];
  if (thinkingEnabled || !isLocalModel(modelName)) {
    return nextMessages;
  }

  const lastMessage = nextMessages[nextMessages.length - 1];
  if (lastMessage?.role === "assistant" && String(lastMessage.content || "").trim() === "<think>\n\n</think>") {
    return nextMessages;
  }

  nextMessages.push({
    role: "assistant",
    content: "<think>\n\n</think>\n\n",
  });
  return nextMessages;
}

function buildRequestOptions(modelName, extraOptions = {}) {
  if (isDoubaoWebModel(modelName)) {
    return {};
  }
  const baseOptions = {
    __thinkingEnabled: Boolean(getModelProfile(modelName).thinkingEnabled),
    ...(extraOptions || {}),
  };

  if (!isLocalModel(modelName)) {
    return baseOptions;
  }
  const deviceMode = getModelDeviceMode(modelName);
  return {
    num_ctx: getModelContextLimit(modelName),
    ...(deviceMode === "cpu"
      ? {
          num_gpu: 0,
          use_mmap: false,
        }
      : {}),
    ...baseOptions,
  };
}

function parseAgentPlannerResponse(rawText) {
  const jsonText = extractFirstJsonObject(rawText);
  if (!jsonText) {
    return {
      mode: "reply",
      reply: String(rawText || "").trim() || "我理解了你的请求，但暂时没有整理出进一步动作。",
      task: "",
    };
  }

  try {
    const parsed = JSON.parse(jsonText);
    return {
      mode: ["execute", "reply", "clarify"].includes(parsed?.mode) ? parsed.mode : "reply",
      reply: String(parsed?.reply || "").trim(),
      task: String(parsed?.task || "").trim(),
    };
  } catch {
    return {
      mode: "reply",
      reply: String(rawText || "").trim() || "我理解了你的请求，但暂时没有整理出进一步动作。",
      task: "",
    };
  }
}

function buildExecutionFlowText(steps = []) {
  return steps
    .map((step, index) => `${index + 1}. ${String(step || "").trim()}`)
    .filter((line) => !/\d+\.\s*$/.test(line))
    .join("\n");
}

async function rewriteAgentTask(task, session, preferredModel = "") {
  const model = preferredModel || getPreferredAgentModel();
  const messages = applyThinkingDirective(buildAgentPlannerMessages(task, session), model);
  const response = await fetch(API_ROUTES.chatOnce, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      options: buildRequestOptions(model, {
        temperature: 0.1,
      }),
      messages,
    }),
  });
  const data = await readJsonResponse(response, "管家模式规划");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "本地管家规划失败");
  }

  return parseAgentPlannerResponse(String(data.message || "").trim());
}

const threadViewport = document.querySelector("#thread-viewport");
const sidePanelEl = document.querySelector(".side-panel");
const sidePanelScrollEl = document.querySelector(".side-panel-scroll");
const conversationPanel = document.querySelector(".conversation-panel");
const rightPanelWindowStripEl = document.querySelector("#right-panel-window-strip");
const rightPanelWindowSliderEl = document.querySelector("#right-panel-window-slider");
const rightPanelViewTabEls = Array.from(document.querySelectorAll("[data-right-panel-view]"));
const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const composerAttachmentsEl = document.querySelector("#composer-attachments");
const promptInput = document.querySelector("#prompt-input");
const sendBtn = document.querySelector("#send-btn");
const stopBtn = document.querySelector("#stop-btn");
const composerThinkingBtn = document.querySelector("#composer-thinking-btn");
const clearBtn = document.querySelector("#clear-btn");
const clearHistoryBtn = document.querySelector("#clear-history-btn");
const refreshStorageBtn = document.querySelector("#refresh-storage-btn");
const savePermissionsBtn = document.querySelector("#save-permissions-btn");
const refreshPermissionsBtn = document.querySelector("#refresh-permissions-btn");
const refreshSystemBtn = document.querySelector("#refresh-system-btn");
const addRootBtn = document.querySelector("#add-root-btn");
const rootPathInput = document.querySelector("#root-path-input");
const permissionGridEl = document.querySelector("#permission-grid");
const allowedRootListEl = document.querySelector("#allowed-root-list");
const systemStatsEl = document.querySelector("#system-stats");
const agentModeToggle = document.querySelector("#agent-mode-toggle");
const permissionsSectionEl = document.querySelector("#permissions-section");
const thinkingToggleWrap = document.querySelector("#thinking-toggle-wrap");
const thinkingToggle = document.querySelector("#thinking-toggle");
const historyListEl = document.querySelector("#history-list");
const historyCountEl = document.querySelector("#history-count");
const modelSelect = document.querySelector("#model-select");
const deviceModeSelect = document.querySelector("#device-mode-select");
const outputModeSelect = document.querySelector("#output-mode-select");
const contextLimitSelect = document.querySelector("#context-limit-select");
const defaultModelEl = document.querySelector("#default-model");
const connectionStatusEl = document.querySelector("#connection-status");
const responseModeLabelEl = document.querySelector("#response-mode-label");
const statusTextEl = document.querySelector("#status-text");
const statusPillEl = document.querySelector("#status-pill");
const workspaceEl = document.querySelector(".workspace");
const contextSummaryEl = document.querySelector("#context-summary");
const contextUsedEl = document.querySelector("#context-used");
const contextRemainingEl = document.querySelector("#context-remaining");
const messageCountEl = document.querySelector("#message-count");
const contextProgressEl = document.querySelector("#context-progress");
const contextRatioEl = document.querySelector("#context-ratio");
const contextBreakdownEl = document.querySelector("#context-breakdown");
const messageTemplate = document.querySelector("#message-template");
const budgetCardEl = document.querySelector(".budget-card");
const sidebarSectionElements = new Map(
  [...document.querySelectorAll("[data-sidebar-section]")].map((element) => [element.dataset.sidebarSection, element])
);
const drawerToggleBtn = document.querySelector("#drawer-toggle-btn");
const drawerCloseBtn = document.querySelector("#drawer-close-btn");
const drawerBackdropEl = document.querySelector("#drawer-backdrop");
const insightDrawerEl = document.querySelector("#insight-drawer");
const insightDrawerHandleEl = document.querySelector("#insight-drawer-handle");
const leftPaneResizerEl = document.querySelector("#left-pane-resizer");
const rightPaneResizerEl = document.querySelector("#right-pane-resizer");
const stageRestoreDockEl = document.querySelector("#stage-restore-dock");
const stageRestoreBtn = document.querySelector("#stage-restore-btn");
const stagePanelDragEls = Array.from(document.querySelectorAll("[data-stage-panel-drag]"));
const stagePanelActionEls = Array.from(document.querySelectorAll("[data-stage-panel-action]"));
const desktopShellControlsEl = document.querySelector("#desktop-shell-controls");
const desktopWindowBarEl = document.querySelector("#desktop-window-bar");
const desktopStatusBannerEl = document.querySelector("#desktop-status-banner");
const desktopStatusBannerTextEl = document.querySelector("#desktop-status-banner-text");
const desktopPassThroughHintEl = document.querySelector("#desktop-pass-through-hint");
const desktopRefreshBtn = document.querySelector("#desktop-refresh-btn");
const desktopFullscreenBtn = document.querySelector("#desktop-fullscreen-btn");
const desktopMenuBtn = document.querySelector("#desktop-menu-btn");
const desktopMenuPanel = document.querySelector("#desktop-menu-panel");
const desktopClickThroughBtn = document.querySelector("#desktop-clickthrough-btn");
const desktopPinBtn = document.querySelector("#desktop-pin-btn");
const desktopMinimizeBtn = document.querySelector("#desktop-minimize-btn");
const desktopCloseBtn = document.querySelector("#desktop-close-btn");
const toggleLeftPaneBtn = document.querySelector("#toggle-left-pane-btn");
const toggleRightPaneBtn = document.querySelector("#toggle-right-pane-btn");
const restoreLeftPaneBtn = document.querySelector("#restore-left-pane-btn");
const restoreRightPaneBtn = document.querySelector("#restore-right-pane-btn");
const brandNameEl = document.querySelector("#brand-name");
const brandSubtitleEl = document.querySelector("#brand-subtitle");
const canvasTitleEl = document.querySelector("#canvas-title");
const canvasTitleRenameTriggerEl = document.querySelector("#canvas-title-rename-trigger");
const canvasTitleInputEl = document.querySelector("#canvas-title-input");
const appNameInput = document.querySelector("#app-name-input");
const appSubtitleInput = document.querySelector("#app-subtitle-input");
const canvasBoardPathInputEl = document.querySelector("#canvas-board-path-input");
const canvasBoardPathBrowseBtn = document.querySelector("#canvas-board-path-browse-btn");
const canvasBoardPathOpenBtn = document.querySelector("#canvas-board-path-open-btn");
const saveUiSettingsBtn = document.querySelector("#save-ui-settings-btn");
const drawerAppNameInputEl = document.querySelector("#drawer-app-name-input");
const drawerAppSubtitleInputEl = document.querySelector("#drawer-app-subtitle-input");
const drawerCanvasBoardPathInputEl = document.querySelector("#drawer-canvas-board-path-input");
const drawerCanvasBoardPathBrowseBtn = document.querySelector("#drawer-canvas-board-path-browse-btn");
const drawerCanvasBoardPathOpenBtn = document.querySelector("#drawer-canvas-board-path-open-btn");
const drawerSaveUiSettingsBtn = document.querySelector("#drawer-save-ui-settings-btn");
const themeSettingsPanelHostEl = document.querySelector("#theme-settings-panel-host");
const sidebarLayoutListEl = document.querySelector("#sidebar-layout-list");
const clipboardModeSelect = document.querySelector("#clipboard-mode-select");
const clipboardCaptureBtn = document.querySelector("#clipboard-capture-btn");
const clipboardClearBtn = document.querySelector("#clipboard-clear-btn");
const clipboardSaveChatBtn = document.querySelector("#clipboard-save-chat-btn");
const clipboardListEl = document.querySelector("#clipboard-list");
const clipboardCountEl = document.querySelector("#clipboard-count");
const clipboardSummaryEl = document.querySelector("#clipboard-summary");
const clipboardStatusPillEl = document.querySelector("#clipboard-status-pill");
const controlMenuTabsEl = document.querySelector("#control-menu-tabs");
const controlMenuMetaEl = document.querySelector("#control-menu-meta");
const canvasViewportEl = document.querySelector("#canvas-viewport");
const canvasSurfaceEl = document.querySelector("#canvas-surface");
const canvasItemsEl = document.querySelector("#canvas-items");
const canvasEmptyStateEl = document.querySelector("#canvas-empty-state");
const canvasItemCountEl = document.querySelector("#canvas-item-count");
const canvasZoomLabelEl = document.querySelector("#canvas-zoom-label");
const canvasZoomRangeEl = document.querySelector("#canvas-zoom-range");
const canvasStatusPillEl = document.querySelector("#canvas-status-pill");
const canvasReturnBtn = document.querySelector("#canvas-return-btn");
const canvasZoomInBtn = document.querySelector("#canvas-zoom-in-btn");
const canvasZoomOutBtn = document.querySelector("#canvas-zoom-out-btn");
const canvasPasteBtn = document.querySelector("#canvas-paste-btn");
const canvasResetViewBtn = document.querySelector("#canvas-reset-view-btn");
const canvasClearBtn = document.querySelector("#canvas-clear-btn");
const conversationTitleEl = document.querySelector("#conversation-title");
const conversationTitleInputEl = document.querySelector("#conversation-title-input");
const conversationAppPillEl = document.querySelector("#conversation-app-pill");
const conversationAppRenameTriggerEl = document.querySelector("#conversation-app-rename-trigger");
const conversationAppNameEl = document.querySelector("#conversation-app-name");
const conversationAppNameInputEl = document.querySelector("#conversation-app-name-input");
const conversationModelMenuEl = document.querySelector("#conversation-model-menu");
const conversationModelGroupsEl = document.querySelector("#conversation-model-groups");
const conversationModelGuideEl = document.querySelector("#conversation-model-guide");
const conversationModelGuideBtn = document.querySelector("#conversation-model-guide-btn");
const conversationModelLabelEl = document.querySelector("#conversation-model-label");
const conversationModePillEl = document.querySelector("#conversation-mode-pill");
const conversationSettingsBtn = document.querySelector("#conversation-settings-btn");
const conversationShellMoreBtn = document.querySelector("#conversation-shell-more");
const conversationShellMenuEl = document.querySelector("#conversation-shell-menu");
const conversationShellPinBtn = document.querySelector("#conversation-shell-pin-btn");
const conversationShellFullscreenBtn = document.querySelector("#conversation-shell-fullscreen-btn");
const conversationShellClickThroughBtn = document.querySelector("#conversation-shell-clickthrough-btn");
const conversationShellRefreshBtn = document.querySelector("#conversation-shell-refresh-btn");
const conversationShellCloseBtn = document.querySelector("#conversation-shell-close-btn");
const screenSourceHeaderSlotEl = document.querySelector("#screen-source-header-slot");
const screenSourceHeaderMenuEl = document.querySelector("#screen-source-header-menu");
const screenSourcePanelEl = document.querySelector("#screen-source-panel");
const screenSourceToolbarEl = document.querySelector("#screen-source-toolbar");
const screenSourceInlineActionsEl = document.querySelector("#screen-source-inline-actions");
const screenSourceOverflowMenuEl = document.querySelector("#screen-source-overflow-menu");
const screenSourceStageEl = document.querySelector(".screen-source-stage");
const screenSourceShellWrapEl = document.querySelector("#screen-source-shell-wrap");
const screenSourcePreviewShellEl = document.querySelector(".screen-source-preview-shell");
const screenSourceVideoEl = document.querySelector("#screen-source-video");
const screenSourceEmptyEl = document.querySelector("#screen-source-empty");
const screenSourceLoaderHostEl = document.querySelector("#screen-source-loader-host");
const screenSourceEmptyTitleEl = document.querySelector("#screen-source-empty-title");
const screenSourceEmptyTextEl = document.querySelector("#screen-source-empty-text");
const screenSourceStartBtn = document.querySelector("#screen-source-start-btn");
const screenSourceStopBtn = document.querySelector("#screen-source-stop-btn");
const screenSourceStatusPillEl = document.querySelector("#screen-source-status-pill");
const screenSourceFitModeSelectEl = document.querySelector("#screen-source-fit-mode-select");
const screenSourceSelectEl = document.querySelector("#screen-source-select");
const screenSourceRefreshBtn = document.querySelector("#screen-source-refresh-btn");
const screenSourceActionButtonEls = {
  refresh: Array.from(document.querySelectorAll('[data-screen-source-action="refresh"]')),
  start: Array.from(document.querySelectorAll('[data-screen-source-action="start"]')),
  stop: Array.from(document.querySelectorAll('[data-screen-source-action="stop"]')),
};
const canvasContextMenuEl = createCanvasContextMenu();
const canvasImageLightboxEl = createCanvasImageLightbox();
const runtimeSummaryEl = document.querySelector("#runtime-summary");
const customizeSummaryEl = document.querySelector("#customize-summary");
const historySummaryEl = document.querySelector("#history-summary");
const renameSessionBtn = document.querySelector("#rename-session-btn");
const saveSessionRenameBtn = document.querySelector("#save-session-rename-btn");
const cancelSessionRenameBtn = document.querySelector("#cancel-session-rename-btn");
let permissionAttentionTimer = null;
let removeDesktopShellStateListener = null;
let desktopSurfaceSyncPromise = Promise.resolve();
const desktopClearStageEl = document.querySelector(".desktop-clear-stage");
let desktopShapeSyncFrame = 0;
let screenSourceEmbedSyncFrame = 0;
let screenSourceToolbarSyncFrame = 0;
let rightPanelWindowSliderFrame = 0;
let activeClipboardZone = "";
let embeddedWindowOverlayHidden = false;
let embeddedWindowOverlaySyncPromise = Promise.resolve();
let drawerResumeScreenSourceTargetId = "";
let canvasTitleRenameInFlight = false;
const screenSourceEmptyLoader = mountLemniscateBloomLoader(screenSourceLoaderHostEl);
const themeSettingsPanel = mountThemeSettingsPanel(themeSettingsPanelHostEl, {
  onPreviewChange: handleThemeSettingsPreviewChange,
  onSave: handleThemeSettingsSave,
  onReset: handleThemeSettingsReset,
});
const canvasItemInteractionController = createCanvasItemInteractionController({
  canvasViewportEl,
  chatFormEl: chatForm,
  screenSourcePanelEl,
  screenSourceHeaderSlotEl,
  getState: () => state,
  getCanvasItemById,
  getSelectedCanvasItems,
  setSelectionToCanvasItem,
  clearCanvasSelection,
  renderCanvasBoard,
  saveCanvasBoardToStorage,
  setCanvasStatus,
  closeCanvasContextMenu,
  openCanvasContextMenu,
  openCanvasImageLightbox,
  startEditingCanvasTextbox,
  openCanvasItem,
  createCanvasTextboxAt,
  updateCanvasView,
  onExternalDrop: handleCanvasExternalDrop,
  isEditableElement,
  getCanvasPositionFromClientPoint,
  setActiveClipboardZone,
});

bootstrap();

function updatePromptPlaceholder() {
  if (!promptInput) return;

  promptInput.placeholder = agentModeToggle?.checked
    ? "像聊天一样描述你的目标，例如：帮我看看这个窗口在干嘛、点一下保存按钮、刚才识别到了什么、读取 D:\\FreeFlow-WorkBoard\\data\\sessions.json"
    : `给 ${getAppDisplayName()} 发送任务，例如：整理这段代码逻辑，或者起草一封邮件。`;
}

function getAppDisplayName() {
  return String(state.uiSettings?.appName || "").trim() || "Bo AI";
}

function getAppSubtitle() {
  return String(state.uiSettings?.appSubtitle || "").trim() || "无限画布助手";
}

function getCanvasTitle() {
  return String(state.uiSettings?.canvasTitle || "").trim() || "无限画布与 AI 助手";
}

function normalizeRightPanelView(value) {
  return String(value || "").trim() === "screen" ? "screen" : "assistant";
}

function getModelSourceLabel(modelName) {
  const source = getModelSource(modelName);
  if (source === "cloud") return "云端";
  if (source === "browser") return "网页";
  return "本地";
}

function closeConversationModelMenu() {
  conversationModelMenuEl?.removeAttribute("open");
  conversationModelGuideEl?.classList.add("is-hidden");
}

function setConversationShellMenuOpen(open) {
  conversationShellMenuEl?.classList.toggle("is-hidden", !open);
  conversationShellMoreBtn?.setAttribute("aria-expanded", String(Boolean(open)));
  syncEmbeddedWindowOverlayVisibility();
}

function renderConversationShellMenuState() {
  if (conversationShellPinBtn) {
    conversationShellPinBtn.classList.toggle("is-active", Boolean(state.desktopShellState.pinned));
    const label = conversationShellPinBtn.querySelector(".conversation-shell-menu-label");
    if (label) {
      label.textContent = state.desktopShellState.pinned ? "取消固定" : "固定界面";
    }
  }
  if (conversationShellFullscreenBtn) {
    conversationShellFullscreenBtn.classList.toggle("is-active", Boolean(state.desktopShellState.fullscreen));
    const label = conversationShellFullscreenBtn.querySelector(".conversation-shell-menu-label");
    if (label) {
      label.textContent = state.desktopShellState.fullscreen ? "退出全屏" : "全屏";
    }
  }
  if (conversationShellClickThroughBtn) {
    conversationShellClickThroughBtn.classList.toggle("is-active", Boolean(state.desktopShellState.fullClickThrough));
    const label = conversationShellClickThroughBtn.querySelector(".conversation-shell-menu-label");
    if (label) {
      label.textContent = state.desktopShellState.fullClickThrough ? "退出穿透" : "穿透";
    }
  }
}

function closeScreenSourceOverflowMenu() {
  screenSourceOverflowMenuEl?.removeAttribute("open");
  syncEmbeddedWindowOverlayVisibility();
}

function closeScreenSourceHeaderMenu() {
  screenSourceHeaderMenuEl?.removeAttribute("open");
  syncEmbeddedWindowOverlayVisibility();
}

function shouldHideEmbeddedWindowForOverlay() {
  if (!state.screenSource.embeddedSourceId || state.activeRightPanelView !== "screen") {
    return false;
  }

  return Boolean(
    state.drawerOpen ||
      !desktopMenuPanel?.classList.contains("is-hidden") ||
      !conversationShellMenuEl?.classList.contains("is-hidden") ||
      screenSourceHeaderMenuEl?.hasAttribute("open") ||
      screenSourceOverflowMenuEl?.hasAttribute("open")
  );
}

function syncEmbeddedWindowOverlayVisibility() {
  if (!IS_DESKTOP_APP || typeof DESKTOP_SHELL?.setExternalWindowVisibility !== "function") {
    return Promise.resolve();
  }

  const shouldHide = shouldHideEmbeddedWindowForOverlay();
  if (!state.screenSource.embeddedSourceId) {
    embeddedWindowOverlayHidden = false;
    return Promise.resolve();
  }

  if (embeddedWindowOverlayHidden === shouldHide) {
    return embeddedWindowOverlaySyncPromise;
  }

  embeddedWindowOverlayHidden = shouldHide;
  embeddedWindowOverlaySyncPromise = embeddedWindowOverlaySyncPromise
    .catch(() => {})
    .then(() => DESKTOP_SHELL.setExternalWindowVisibility(!shouldHide))
    .then(() => {
      if (!shouldHide) {
        scheduleEmbeddedScreenSourceSync();
        focusEmbeddedScreenSourceWindow();
      }
    })
    .catch(() => {});

  return embeddedWindowOverlaySyncPromise;
}

function prepareEmbeddedWindowForDrawerOpen() {
  if (
    !IS_DESKTOP_APP ||
    !state.screenSource.embeddedSourceId ||
    state.activeRightPanelView !== "screen" ||
    typeof DESKTOP_SHELL?.setExternalWindowVisibility !== "function"
  ) {
    return;
  }

  embeddedWindowOverlayHidden = true;
  embeddedWindowOverlaySyncPromise = embeddedWindowOverlaySyncPromise
    .catch(() => {})
    .then(() => DESKTOP_SHELL.setExternalWindowVisibility(false))
    .catch(() => {});
}

async function suspendScreenSourceForDrawer() {
  if (
    !IS_DESKTOP_APP ||
    state.drawerOpen ||
    state.activeRightPanelView !== "screen" ||
    (!state.screenSource.embeddedSourceId && !state.screenSource.stream)
  ) {
    return;
  }

  drawerResumeScreenSourceTargetId = String(
    state.screenSource.activeTargetId || state.screenSource.selectedSourceId || ""
  ).trim();

  await stopScreenSourceCapture({
    announce: false,
    statusText: "AI镜像已临时关闭",
  });
}

async function resumeScreenSourceAfterDrawerClose() {
  const targetId = String(drawerResumeScreenSourceTargetId || "").trim();
  drawerResumeScreenSourceTargetId = "";

  if (!targetId || state.activeRightPanelView !== "screen") {
    return;
  }

  state.screenSource.selectedSourceId = targetId;
  const selected = state.screenSource.availableSources.find((item) => item.id === targetId) || null;
  state.screenSource.selectedSourceLabel = selected?.label || selected?.name || "";

  try {
    await ensureScreenSourceCapture();
  } catch {
    // Keep drawer closing resilient; status will be updated by ensureScreenSourceCapture.
  }
}

function setScreenSourceActionButtonsState(action, { text, disabled } = {}) {
  const buttons = screenSourceActionButtonEls[action] || [];
  for (const button of buttons) {
    if (typeof text === "string") {
      button.textContent = text;
    }
    if (typeof disabled === "boolean") {
      button.disabled = disabled;
    }
  }
}

function syncRightPanelWindowSlider() {
  if (!rightPanelWindowStripEl || !rightPanelWindowSliderEl) {
    return;
  }

  const activeTab = rightPanelViewTabEls.find((tab) => tab.classList.contains("is-active"));
  if (!activeTab) {
    rightPanelWindowSliderEl.style.width = "0px";
    return;
  }

  const stripRect = rightPanelWindowStripEl.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();
  rightPanelWindowSliderEl.style.width = `${Math.max(0, tabRect.width)}px`;
  rightPanelWindowSliderEl.style.transform = `translateX(${Math.max(0, tabRect.left - stripRect.left)}px)`;
}

function scheduleRightPanelWindowSliderSync() {
  if (rightPanelWindowSliderFrame) {
    window.cancelAnimationFrame(rightPanelWindowSliderFrame);
  }

  rightPanelWindowSliderFrame = window.requestAnimationFrame(() => {
    rightPanelWindowSliderFrame = 0;
    syncRightPanelWindowSlider();
  });
}

function syncScreenSourceToolbarLayout() {
  if (!screenSourceToolbarEl || !screenSourceInlineActionsEl || !screenSourceOverflowMenuEl) {
    return;
  }

  screenSourceToolbarEl.classList.remove("is-compact");
  const needsCompact = screenSourceToolbarEl.scrollWidth > screenSourceToolbarEl.clientWidth + 4;
  screenSourceToolbarEl.classList.toggle("is-compact", needsCompact);
  if (!needsCompact) {
    closeScreenSourceOverflowMenu();
  }
}

function scheduleScreenSourceToolbarLayoutSync() {
  if (screenSourceToolbarSyncFrame) {
    window.cancelAnimationFrame(screenSourceToolbarSyncFrame);
  }

  screenSourceToolbarSyncFrame = window.requestAnimationFrame(() => {
    screenSourceToolbarSyncFrame = 0;
    syncScreenSourceToolbarLayout();
  });
}

function renderScreenSourceState() {
  const selectedSource =
    state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId) || null;
  const selectedPolicy = getScreenSourceEmbedPolicy(selectedSource?.id || state.screenSource.selectedSourceId);
  const hasEmbeddedWindow = Boolean(state.screenSource.embeddedSourceId);
  const hasStream = Boolean(state.screenSource.stream);
  const hasActiveProjection = hasEmbeddedWindow || hasStream;
  const canEmbedWindow =
    Boolean(IS_DESKTOP_APP) &&
    DESKTOP_SHELL?.platform === "win32" &&
    typeof DESKTOP_SHELL?.embedExternalWindow === "function" &&
    typeof DESKTOP_SHELL?.syncExternalWindowBounds === "function" &&
    typeof DESKTOP_SHELL?.clearExternalWindow === "function";

  if (screenSourceStatusPillEl) {
    screenSourceStatusPillEl.textContent = state.screenSource.statusText || (hasActiveProjection ? "映射中" : "未启动");
  }
  if (screenSourceEmptyEl) {
    screenSourceEmptyEl.classList.toggle("is-hidden", hasActiveProjection);
    if (screenSourceEmptyTitleEl) {
      screenSourceEmptyTitleEl.textContent = canEmbedWindow ? "等待嵌入" : "等待映射";
    }
    if (screenSourceEmptyTextEl) {
      screenSourceEmptyTextEl.textContent = "选择目标后点击开始。";
    }
  }
  if (screenSourcePreviewShellEl) {
    screenSourcePreviewShellEl.classList.toggle("is-native-embedded", hasEmbeddedWindow);
  }
  if (screenSourceShellWrapEl) {
    screenSourceShellWrapEl.classList.toggle("is-native-embedded", hasEmbeddedWindow);
    screenSourceShellWrapEl.classList.toggle("has-active-projection", hasActiveProjection);
  }
  if (screenSourceVideoEl) {
    screenSourceVideoEl.classList.toggle("is-hidden", hasEmbeddedWindow);
  }
  const startButtonLabel = hasActiveProjection
    ? "重新嵌入"
    : "开始映射";
  const stopButtonLabel = hasEmbeddedWindow ? "停止嵌入" : "停止映射";
  setScreenSourceActionButtonsState("start", {
    disabled: Boolean(state.screenSource.startPromise),
    text: startButtonLabel,
  });
  setScreenSourceActionButtonsState("stop", {
    disabled: !hasActiveProjection && !state.screenSource.startPromise,
    text: stopButtonLabel,
  });
  setScreenSourceActionButtonsState("refresh", {
    disabled: Boolean(state.screenSource.startPromise),
    text: "重新嵌入",
  });
  if (screenSourceSelectEl) {
    const sources = Array.isArray(state.screenSource.availableSources) ? state.screenSource.availableSources : [];
    screenSourceSelectEl.innerHTML = sources.length
      ? sources
          .map(
            (source) =>
              `<option value="${escapeHtml(source.id)}"${source.id === state.screenSource.selectedSourceId ? " selected" : ""}>${escapeHtml(
                source.label || source.name || source.id
              )}</option>`
          )
          .join("")
      : `<option value="">暂无可用 AI 镜像目标</option>`;
    screenSourceSelectEl.disabled = !sources.length || Boolean(state.screenSource.startPromise);
  }
  if (screenSourceFitModeSelectEl) {
    screenSourceFitModeSelectEl.value = selectedPolicy.fitMode;
    screenSourceFitModeSelectEl.disabled =
      !selectedSource ||
      !IS_DESKTOP_APP ||
      DESKTOP_SHELL?.platform !== "win32" ||
      Boolean(state.screenSource.startPromise);
  }
  scheduleScreenSourceToolbarLayoutSync();
}

function syncScreenSourceVideo() {
  if (!screenSourceVideoEl) return;
  const stream = state.screenSource.embeddedSourceId ? null : state.screenSource.stream || null;
  if (screenSourceVideoEl.srcObject !== stream) {
    screenSourceVideoEl.srcObject = stream;
  }
  if (stream) {
    screenSourceVideoEl.play().catch(() => {});
  }
  renderScreenSourceState();
}

function getScreenSourcePreviewBounds() {
  if (!screenSourcePreviewShellEl) {
    return { x: 0, y: 0, width: 640, height: 360 };
  }

  const rect = screenSourcePreviewShellEl.getBoundingClientRect();
  return {
    x: Math.max(0, Math.floor(rect.left)),
    y: Math.max(0, Math.floor(rect.top)),
    width: Math.max(1, Math.ceil(rect.width)),
    height: Math.max(1, Math.ceil(rect.height)),
  };
}

function waitForScreenSourceLayoutStability() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

function getCurrentScreenSourceEmbedLayout(sourceId = "") {
  const policySourceId =
    String(state.screenSource.activeTargetId || state.screenSource.selectedSourceId || sourceId || "").trim();
  const source =
    state.screenSource.availableSources.find((item) => item.id === policySourceId) ||
    state.screenSource.availableSources.find((item) => item.id === sourceId) ||
    null;
  const policy = getScreenSourceEmbedPolicy(source?.id || policySourceId);

  return {
    fitMode: policy.fitMode,
  };
}

async function syncEmbeddedScreenSourceBounds() {
  if (
    !state.screenSource.embeddedSourceId ||
    state.activeRightPanelView !== "screen" ||
    !IS_DESKTOP_APP ||
    typeof DESKTOP_SHELL?.syncExternalWindowBounds !== "function"
  ) {
    return;
  }

  const response = await DESKTOP_SHELL.syncExternalWindowBounds({
    bounds: getScreenSourcePreviewBounds(),
    layout: getCurrentScreenSourceEmbedLayout(state.screenSource.activeTargetId || state.screenSource.embeddedSourceId),
  });
  if (!response?.ok) {
    throw new Error(response?.error || "同步嵌入窗口位置失败");
  }
}

async function focusEmbeddedScreenSourceWindow() {
  if (
    !IS_DESKTOP_APP ||
    !state.screenSource.embeddedSourceId ||
    typeof DESKTOP_SHELL?.focusEmbeddedWindow !== "function"
  ) {
    return;
  }

  try {
    await DESKTOP_SHELL.focusEmbeddedWindow({
      sourceId: state.screenSource.embeddedSourceId,
      activeTargetId: state.screenSource.activeTargetId,
    });
  } catch {
    // Ignore focus restoration failures; the embedded window can still work if the native shell rejects it.
  }
}

function scheduleEmbeddedScreenSourceSync() {
  if (!state.screenSource.embeddedSourceId || state.activeRightPanelView !== "screen") {
    return;
  }

  if (screenSourceEmbedSyncFrame) {
    window.cancelAnimationFrame(screenSourceEmbedSyncFrame);
  }

  screenSourceEmbedSyncFrame = window.requestAnimationFrame(() => {
    screenSourceEmbedSyncFrame = 0;
    syncEmbeddedScreenSourceBounds()
      .then(() => focusEmbeddedScreenSourceWindow())
      .catch(() => {});
  });
}

async function stopScreenSourceCapture({ announce = true, statusText = "画面映射已停止" } = {}) {
  const stream = state.screenSource.stream;
  const activeTargetId = String(state.screenSource.activeTargetId || state.screenSource.selectedSourceId || "").trim();
  if (stream) {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Ignore track shutdown failures.
      }
    }
  }

  if (state.screenSource.embeddedSourceId && IS_DESKTOP_APP && typeof DESKTOP_SHELL?.clearExternalWindow === "function") {
    try {
      await DESKTOP_SHELL.clearExternalWindow({ restoreVisible: false });
    } catch {
      // Keep renderer state consistent even if native cleanup fails.
    }
  }

  if (activeTargetId) {
    try {
      await stopAiMirrorTarget(activeTargetId);
    } catch {
      // Ignore managed target shutdown failures during cleanup.
    }
  }

  state.screenSource.stream = null;
  state.screenSource.startPromise = null;
  state.screenSource.activeMode = "";
  state.screenSource.activeTargetId = "";
  state.screenSource.embeddedSourceId = "";
  state.screenSource.embeddedSourceLabel = "";
  embeddedWindowOverlayHidden = false;
  state.screenSource.statusText = statusText;
  if (screenSourceVideoEl && screenSourceVideoEl.srcObject) {
    screenSourceVideoEl.srcObject = null;
  }
  renderScreenSourceState();
  if (announce) {
    setStatus(statusText, "success");
  }
}

function normalizeScreenSourceEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((source) => ({
      id: String(source?.id || "").trim(),
      name: String(source?.name || "").trim(),
      kind: String(source?.kind || "").trim() === "window" ? "window" : "screen",
      displayId: String(source?.displayId || "").trim(),
      label: String(source?.label || "").trim(),
      note: String(source?.note || "").trim(),
    }))
    .filter((source) => source.id && source.name);
}

async function refreshScreenSourceTargets({ preserveSelection = true } = {}) {
  if (!IS_DESKTOP_APP || typeof DESKTOP_SHELL?.listAiMirrorTargets !== "function") {
    state.screenSource.availableSources = [];
    state.screenSource.selectedSourceId = "";
    state.screenSource.selectedSourceLabel = "";
    state.screenSource.statusText = "当前环境不支持 AI 镜像目标";
    renderScreenSourceState();
    return [];
  }

  const sources = normalizeScreenSourceEntries(await listAiMirrorTargets());
  const previousId = preserveSelection ? state.screenSource.selectedSourceId : "";
  const nextSelected = sources.find((source) => source.id === previousId) || sources[0] || null;

  state.screenSource.availableSources = sources;
  state.screenSource.selectedSourceId = nextSelected?.id || "";
  state.screenSource.selectedSourceLabel = nextSelected?.label || nextSelected?.name || "";

  if (!state.screenSource.stream && !state.screenSource.embeddedSourceId) {
    state.screenSource.statusText = nextSelected ? `已选择 ${state.screenSource.selectedSourceLabel}` : "暂无可用 AI 镜像目标";
  }

  renderScreenSourceState();
  return sources;
}

async function ensureScreenSourceCapture({ force = false } = {}) {
  if (force && (state.screenSource.stream || state.screenSource.embeddedSourceId)) {
    await stopScreenSourceCapture({ announce: false, statusText: "正在重新建立画面映射" });
  }

  if (state.screenSource.stream || state.screenSource.embeddedSourceId) {
    renderScreenSourceState();
    return state.screenSource.stream || state.screenSource.embeddedSourceId;
  }

  if (state.screenSource.startPromise) {
    return state.screenSource.startPromise;
  }

  if (!navigator.mediaDevices?.getUserMedia && !navigator.mediaDevices?.getDisplayMedia) {
    const message = "当前环境不支持屏幕映射";
    state.screenSource.statusText = message;
    renderScreenSourceState();
    throw new Error(message);
  }

  const initialSource =
    state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId) ||
    state.screenSource.availableSources[0] ||
    null;
  state.screenSource.statusText = initialSource ? `正在准备 ${initialSource.label || initialSource.name}` : "正在准备 AI 镜像";
  renderScreenSourceState();

  state.screenSource.startPromise = (async () => {
    const source =
      state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId) ||
      state.screenSource.availableSources[0] ||
      null;

    if (
      IS_DESKTOP_APP &&
      DESKTOP_SHELL?.platform === "win32" &&
      typeof DESKTOP_SHELL?.embedExternalWindow === "function" &&
      typeof DESKTOP_SHELL?.syncExternalWindowBounds === "function" &&
      typeof DESKTOP_SHELL?.clearExternalWindow === "function" &&
      typeof DESKTOP_SHELL?.prepareAiMirrorTarget === "function" &&
      source?.id
    ) {
      const preparedTarget = await prepareAiMirrorTarget(source.id);
      await waitForScreenSourceLayoutStability();
      const response = await DESKTOP_SHELL.embedExternalWindow({
        sourceId: preparedTarget?.projection?.sourceId,
        bounds: getScreenSourcePreviewBounds(),
        layout: getCurrentScreenSourceEmbedLayout(source.id),
      });
      if (!response?.ok) {
        throw new Error(response?.error || "窗口嵌入失败");
      }

      state.screenSource.stream = null;
      state.screenSource.activeTargetId = source.id;
      state.screenSource.activeMode = "embedded";
      state.screenSource.embeddedSourceId = String(preparedTarget?.projection?.sourceId || "").trim();
      state.screenSource.embeddedSourceLabel = preparedTarget?.target?.label || source.label || source.name || "";
      state.screenSource.statusText = `已嵌入：${state.screenSource.embeddedSourceLabel || "当前窗口"}`;
      state.screenSource.startPromise = null;
      syncScreenSourceVideo();
      scheduleEmbeddedScreenSourceSync();
      focusEmbeddedScreenSourceWindow();
      return {
        mode: "embedded",
        result: response,
      };
    }

    if (IS_DESKTOP_APP && DESKTOP_SHELL?.getCaptureSources && navigator.mediaDevices?.getUserMedia) {
      if (!state.screenSource.availableSources.length || !state.screenSource.selectedSourceId) {
        await refreshScreenSourceTargets();
      }

      const currentSource =
        state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId) ||
        state.screenSource.availableSources[0];
      if (!currentSource?.id) {
        throw new Error("没有可用的映射目标");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: currentSource.id,
            minWidth: 1280,
            maxWidth: 3840,
            minHeight: 720,
            maxHeight: 2160,
            minFrameRate: 8,
            maxFrameRate: 20,
          },
        },
      });
      return {
        mode: "capture",
        stream,
      };
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("当前环境不支持屏幕映射");
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 12, max: 20 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    return {
      mode: "capture",
      stream,
    };
  })()
    .then((result) => {
      if (result?.mode === "embedded") {
        return result.result;
      }

      const stream = result?.stream;
      const videoTrack = stream.getVideoTracks?.()[0];
      if (!videoTrack) {
        throw new Error("没有获取到可用的视频轨道");
      }

      videoTrack.addEventListener(
        "ended",
        () => {
          stopScreenSourceCapture({ announce: false, statusText: "画面映射已结束" });
        },
        { once: true }
      );

      state.screenSource.stream = stream;
      state.screenSource.activeMode = "capture";
      state.screenSource.activeTargetId = state.screenSource.activeTargetId || state.screenSource.selectedSourceId || "";
      state.screenSource.embeddedSourceId = "";
      state.screenSource.embeddedSourceLabel = "";
      const label =
        result?.label ||
        state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId)?.label ||
        state.screenSource.selectedSourceLabel ||
        "当前目标";
      state.screenSource.statusText = `正在实时映射：${label}`;
      state.screenSource.startPromise = null;
      syncScreenSourceVideo();
      return stream;
    })
    .catch((error) => {
      state.screenSource.startPromise = null;
      state.screenSource.statusText = `映射失败：${error.message}`;
      renderScreenSourceState();
      throw error;
    });

  return state.screenSource.startPromise;
}

function renderRightPanelView() {
  const activeView = normalizeRightPanelView(state.activeRightPanelView);
  state.activeRightPanelView = activeView;
  setActiveClipboardZone(activeView === "screen" ? "screen" : "assistant");
  conversationPanel?.classList.toggle("screen-view-active", activeView === "screen");
  screenSourceHeaderSlotEl?.classList.toggle("is-hidden", activeView !== "screen");
  screenSourcePanelEl?.classList.toggle("is-hidden", activeView !== "screen");
  screenSourcePanelEl?.classList.toggle("is-active", activeView === "screen");
  if (activeView !== "screen") {
    closeScreenSourceHeaderMenu();
    closeScreenSourceOverflowMenu();
  }
  syncEmbeddedWindowOverlayVisibility();

  for (const tab of rightPanelViewTabEls) {
    const isActive = tab.dataset.rightPanelView === activeView;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }
  scheduleRightPanelWindowSliderSync();

  renderScreenSourceState();
  if (activeView === "screen") {
    waitForScreenSourceLayoutStability().then(() => {
      scheduleEmbeddedScreenSourceSync();
      focusEmbeddedScreenSourceWindow();
    });
  }
  syncComposerOffset();
  scheduleDesktopWindowShapeSync();
}

async function setActiveRightPanelView(view, { persist = true, ensureCapture = false } = {}) {
  state.activeRightPanelView = normalizeRightPanelView(view);
  if (persist) {
    localStorage.setItem(CONFIG.rightPanelViewKey, state.activeRightPanelView);
  }
  renderRightPanelView();

  if (state.activeRightPanelView !== "screen" && state.screenSource.embeddedSourceId) {
    await stopScreenSourceCapture({ announce: false, statusText: "窗口嵌入已停止" });
    return;
  }

  if (state.activeRightPanelView === "screen" && IS_DESKTOP_APP) {
    try {
      await refreshScreenSourceTargets();
    } catch (error) {
      setStatus(`读取映射目标失败：${error.message}`, "warning");
    }
  }

  if (state.activeRightPanelView === "screen" && ensureCapture) {
    try {
      await ensureScreenSourceCapture();
    } catch (error) {
      setStatus(`画面映射启动失败：${error.message}`, "warning");
    }
  }
}

function renderConversationModelMenu() {
  if (!conversationModelGroupsEl) return;
  const groups = [
    {
      key: "local",
      title: "本地模型",
      items: state.availableModels.filter((item) => getModelSource(item.name) === "local"),
    },
    {
      key: "cloud",
      title: "云端模型",
      items: state.availableModels.filter((item) => getModelSource(item.name) === "cloud"),
    },
  ].filter((group) => group.items.length);

  conversationModelGroupsEl.innerHTML = groups
    .map(
      (group) => `
        <section class="conversation-model-group" data-group="${escapeHtml(group.key)}">
          <div class="conversation-model-group-title">${escapeHtml(group.title)}</div>
          ${group.items
            .map(
              (item) => `
                <button
                  class="conversation-model-option${item.name === state.model ? " is-active" : ""}"
                  type="button"
                  data-model-option="${escapeHtml(item.name)}"
                >
                  <span>${escapeHtml(item.displayName || getModelDisplayName(item.name))}</span>
                  <span class="conversation-model-option-badge">${escapeHtml(getModelSourceLabel(item.name))}</span>
                </button>
              `
            )
            .join("")}
        </section>
      `
    )
    .join("");
}

function beginConversationAppRename() {
  if (!conversationAppNameInputEl || !conversationAppNameEl) return;
  conversationAppNameEl.classList.add("is-hidden");
  conversationAppNameInputEl.classList.remove("is-hidden");
  conversationAppNameInputEl.value = getAppDisplayName();
  requestAnimationFrame(() => {
    conversationAppNameInputEl.focus();
    conversationAppNameInputEl.select();
  });
}

function cancelConversationAppRename() {
  if (!conversationAppNameInputEl || !conversationAppNameEl) return;
  conversationAppNameInputEl.classList.add("is-hidden");
  conversationAppNameEl.classList.remove("is-hidden");
  conversationAppNameInputEl.value = getAppDisplayName();
}

async function commitConversationAppRename() {
  if (!conversationAppNameInputEl) return;
  const nextName = String(conversationAppNameInputEl.value || "").trim() || "Bo AI";
  try {
    await saveUiSettings({ appName: nextName });
    setStatus("AI 名称已更新", "success");
  } catch (error) {
    setStatus(`保存 AI 名称失败：${error.message}`, "warning");
  } finally {
    cancelConversationAppRename();
  }
}

function beginCanvasTitleRename() {
  if (!canvasTitleInputEl || !canvasTitleEl) return;
  canvasTitleRenameInFlight = false;
  canvasTitleInputEl.disabled = false;
  canvasTitleEl.classList.add("is-hidden");
  canvasTitleRenameTriggerEl?.classList.add("is-hidden");
  canvasTitleInputEl.classList.remove("is-hidden");
  canvasTitleInputEl.value = getCanvasTitle();
  requestAnimationFrame(() => {
    canvasTitleInputEl.focus();
    canvasTitleInputEl.select();
  });
}

function cancelCanvasTitleRename() {
  if (!canvasTitleInputEl || !canvasTitleEl) return;
  canvasTitleRenameInFlight = false;
  canvasTitleInputEl.disabled = false;
  canvasTitleInputEl.classList.add("is-hidden");
  canvasTitleRenameTriggerEl?.classList.remove("is-hidden");
  canvasTitleEl.classList.remove("is-hidden");
  canvasTitleInputEl.value = getCanvasTitle();
}

async function commitCanvasTitleRename() {
  if (!canvasTitleInputEl || canvasTitleRenameInFlight) return;
  canvasTitleRenameInFlight = true;
  canvasTitleInputEl.disabled = true;
  const nextTitle = String(canvasTitleInputEl.value || "").trim() || "无限画布与 AI 助手";
  try {
    await saveUiSettings({ canvasTitle: nextTitle });
    setStatus("画布标题已更新", "success");
  } catch (error) {
    setStatus(`保存画布标题失败：${error.message}`, "warning");
  } finally {
    cancelCanvasTitleRename();
  }
}

function applyThemeAppearance() {
  applyThemeCssVariables(document.documentElement, state.uiSettings);
  themeSettingsPanel.update(state.uiSettings);
}

function handleThemeSettingsPreviewChange(overrides = {}) {
  state.uiSettings = normalizeUiSettings({
    ...state.uiSettings,
    ...overrides,
  });
  applyThemeAppearance();
}

async function handleThemeSettingsSave() {
  try {
    await saveThemeSettings();
    setStatus("主题设置已保存", "success");
  } catch (error) {
    setStatus(`保存主题设置失败：${error.message}`, "warning");
  }
}

function handleThemeSettingsReset() {
  state.uiSettings = normalizeUiSettings({
    ...state.uiSettings,
    ...DEFAULT_THEME_SETTINGS,
    themePreset: DEFAULT_THEME_SETTINGS.themePreset,
  });
  applyThemeAppearance();
  setStatus("已恢复默认主题", "success");
}

function getVisibleControlMenuItems() {
  return normalizeSidebarSections(state.uiSettings?.sidebarSections).filter((item) => item.visible !== false);
}

function ensureActiveControlMenu() {
  const visibleItems = getVisibleControlMenuItems();
  if (!visibleItems.length) {
    state.activeControlMenu = "";
    return;
  }

  if (!visibleItems.some((item) => item.key === state.activeControlMenu)) {
    state.activeControlMenu = visibleItems[0].key;
  }
}

function renderControlMenuTabs() {
  if (!controlMenuTabsEl) return;

  ensureActiveControlMenu();
  const visibleItems = getVisibleControlMenuItems();
  controlMenuTabsEl.innerHTML = visibleItems
    .map((item) => {
      const meta = SIDEBAR_SECTION_DEFS.find((entry) => entry.key === item.key);
      const active = item.key === state.activeControlMenu;
      return `
        <button
          class="control-menu-tab${active ? " is-active" : ""}"
          type="button"
          role="tab"
          aria-selected="${active ? "true" : "false"}"
          data-control-menu-key="${escapeHtml(item.key)}"
        >
          <span class="control-menu-tab-title">${escapeHtml(meta?.label || item.key)}</span>
          <span class="control-menu-tab-copy">${escapeHtml(meta?.description || "")}</span>
        </button>
      `;
    })
    .join("");

  const activeMeta = SIDEBAR_SECTION_DEFS.find((entry) => entry.key === state.activeControlMenu);
  if (controlMenuMetaEl) {
    controlMenuMetaEl.textContent = activeMeta?.description || "选择一个菜单查看详细设置";
  }
}

function applySidebarLayout() {
  if (!sidePanelScrollEl) return;

  const orderedSections = normalizeSidebarSections(state.uiSettings?.sidebarSections);
  state.uiSettings.sidebarSections = orderedSections;
  ensureActiveControlMenu();

  for (const item of orderedSections) {
    const element = sidebarSectionElements.get(item.key);
    if (!element) continue;
    const visible = item.visible !== false && item.key === state.activeControlMenu;
    element.classList.toggle("is-hidden", !visible);
    element.classList.toggle("control-menu-panel", true);
    sidePanelScrollEl.appendChild(element);
  }

  renderControlMenuTabs();
}

function setActiveControlMenu(menuKey) {
  const nextKey = String(menuKey || "").trim();
  if (!nextKey) return;

  state.activeControlMenu = nextKey;
  localStorage.setItem(CONFIG.controlMenuKey, nextKey);
  applySidebarLayout();
}

function renderSidebarLayoutSettings() {
  if (!sidebarLayoutListEl) return;

  const items = normalizeSidebarSections(state.uiSettings?.sidebarSections);
  const visibleCount = items.filter((item) => item.visible !== false).length;

  sidebarLayoutListEl.innerHTML = items
    .map((item, index) => {
      const meta = SIDEBAR_SECTION_DEFS.find((entry) => entry.key === item.key);
      return `
        <article class="layout-item" data-layout-key="${escapeHtml(item.key)}">
          <div class="layout-item-copy">
            <strong>${escapeHtml(meta?.label || item.key)}</strong>
            <span>${escapeHtml(meta?.description || "")}</span>
          </div>
          <div class="layout-item-actions">
            <button class="ghost-btn compact-btn layout-action-btn" type="button" data-layout-action="toggle" data-layout-key="${escapeHtml(item.key)}">
              ${item.visible === false ? "显示" : "隐藏"}
            </button>
            <button class="ghost-btn compact-btn layout-action-btn" type="button" data-layout-action="up" data-layout-key="${escapeHtml(item.key)}" ${index === 0 ? "disabled" : ""}>
              上移
            </button>
            <button class="ghost-btn compact-btn layout-action-btn" type="button" data-layout-action="down" data-layout-key="${escapeHtml(item.key)}" ${index === items.length - 1 ? "disabled" : ""}>
              下移
            </button>
          </div>
          <div class="layout-item-meta">
            <span class="pill-note">${item.visible === false ? "已隐藏" : "显示中"}</span>
            ${
              item.visible === false && visibleCount <= 1
                ? `<span class="layout-item-tip">至少保留一个控制菜单板块可见</span>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function applyUiSettings() {
  state.uiSettings = normalizeUiSettings(state.uiSettings);
  const appName = getAppDisplayName();
  const appSubtitle = getAppSubtitle();
  const canvasTitle = getCanvasTitle();

  document.title = appName;
  if (brandNameEl) {
    brandNameEl.textContent = appName;
  }
  if (brandSubtitleEl) {
    brandSubtitleEl.textContent = appSubtitle;
  }
  if (conversationAppNameEl) {
    conversationAppNameEl.textContent = appName;
  }
  if (conversationAppNameInputEl) {
    conversationAppNameInputEl.value = appName;
  }
  if (appNameInput) {
    appNameInput.value = appName;
  }
  if (drawerAppNameInputEl) {
    drawerAppNameInputEl.value = appName;
  }
  if (appSubtitleInput) {
    appSubtitleInput.value = appSubtitle;
  }
  if (drawerAppSubtitleInputEl) {
    drawerAppSubtitleInputEl.value = appSubtitle;
  }
  if (canvasBoardPathInputEl) {
    canvasBoardPathInputEl.value = getCanvasBoardSavePath();
  }
  if (drawerCanvasBoardPathInputEl) {
    drawerCanvasBoardPathInputEl.value = getCanvasBoardSavePath();
  }
  syncCanvasPathActionButtons(getCanvasBoardSavePath());
  if (canvasTitleEl) {
    canvasTitleEl.textContent = canvasTitle;
  }
  if (canvasTitleInputEl) {
    canvasTitleInputEl.value = canvasTitle;
  }
  if (customizeSummaryEl) {
    customizeSummaryEl.textContent = `${truncate(appName, 18)} · ${truncate(appSubtitle, 22)}`;
  }
  if (conversationModelLabelEl && state.model) {
    conversationModelLabelEl.textContent = getModelDisplayName(state.model);
  }

  applyThemeAppearance();
  applySidebarLayout();
  renderSidebarLayoutSettings();

  updatePromptPlaceholder();
  renderCurrentSessionHeader();
  if (state.sessions.length || state.currentSessionId) {
    renderCurrentSession();
  }
}

function normalizeClipboardStore(payload = {}) {
  const maxItems = Math.min(Math.max(Number(payload?.maxItems) || CONFIG.clipboardMaxItems, 5), 100);
  const items = Array.isArray(payload?.items) ? payload.items : [];

  return {
    mode: payload?.mode === "auto" ? "auto" : "manual",
    maxItems,
    items: items
      .map((item) => ({
        id: String(item?.id || ""),
        content: String(item?.content || ""),
        source: item?.source === "auto" ? "auto" : "manual",
        createdAt: Number(item?.createdAt) || Date.now(),
      }))
      .filter((item) => item.id && item.content.trim())
      .slice(0, maxItems),
  };
}

function readUiSettingsCache() {
  try {
    const raw = localStorage.getItem(CONFIG.uiSettingsCacheKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeUiSettingsCache(payload = {}) {
  try {
    localStorage.setItem(CONFIG.uiSettingsCacheKey, JSON.stringify(normalizeUiSettings(payload)));
  } catch {
    // Ignore local cache failures.
  }
}

function renderClipboardStore() {
  if (clipboardModeSelect) {
    clipboardModeSelect.value = state.clipboardStore.mode;
  }

  if (clipboardCountEl) {
    clipboardCountEl.textContent = `${state.clipboardStore.items.length} 条内容`;
  }
  if (clipboardSummaryEl) {
    const latest = state.clipboardStore.items[0]?.content?.replace(/\s+/g, " ").trim() || "";
    clipboardSummaryEl.textContent = latest
      ? `${state.clipboardStore.mode === "auto" ? "自动" : "手动"} · ${truncate(latest, 24)}`
      : state.clipboardStore.mode === "auto"
        ? "自动监测剪贴板"
        : "点击手动入队保存内容";
  }

  if (clipboardStatusPillEl) {
    const modeLabel = state.clipboardStore.mode === "auto" ? "自动队列中" : "手动存储模式";
    clipboardStatusPillEl.textContent = modeLabel;
  }

  if (!clipboardListEl) return;

  if (!state.clipboardStore.items.length) {
    clipboardListEl.innerHTML = `
      <div class="clipboard-empty">
        <strong>暂无剪贴板内容</strong>
        <span>${state.clipboardStore.mode === "auto" ? "自动模式会在复制新内容后入队" : "点击“手动入队”保存当前剪贴板"}</span>
      </div>
    `;
    return;
  }

  clipboardListEl.innerHTML = state.clipboardStore.items
    .map(
      (item) => `
        <article class="clipboard-item" data-clipboard-id="${escapeHtml(item.id)}">
          <div class="clipboard-item-meta">
            <span class="pill-note">${item.source === "auto" ? "自动" : "手动"}</span>
            <span>${formatTime(item.createdAt)}</span>
          </div>
          <div class="clipboard-item-content">${escapeHtml(truncate(item.content.replace(/\s+/g, " ").trim(), 180))}</div>
          <div class="clipboard-item-actions">
            <button class="ghost-btn compact-btn" type="button" data-clipboard-copy="${escapeHtml(item.id)}">复制</button>
            <button class="ghost-btn compact-btn" type="button" data-clipboard-remove="${escapeHtml(item.id)}">删除</button>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadClipboardStore() {
  try {
    const response = await fetch("/api/clipboard-store");
    const data = await readJsonResponse(response, "剪贴板队列");

    if (!response.ok || !data.ok) {
      throw new Error(data.details || data.error || "无法读取剪贴板队列");
    }

    state.clipboardStore = normalizeClipboardStore(data);
  } catch (error) {
    state.clipboardStore = normalizeClipboardStore();
    setStatus(`剪贴板队列读取失败：${error.message}`, "warning");
  }

  state.lastClipboardText = state.clipboardStore.items[0]?.content || "";
  renderClipboardStore();
}

async function saveClipboardStore() {
  const response = await fetch("/api/clipboard-store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.clipboardStore),
  });
  const data = await readJsonResponse(response, "剪贴板队列");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "无法保存剪贴板队列");
  }

  state.clipboardStore = normalizeClipboardStore(data);
  renderClipboardStore();
}

function readLegacyCanvasBoardFromStorage() {
  try {
    const raw = localStorage.getItem(CONFIG.canvasBoardKey);
    return raw ? normalizeCanvasBoard(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function clearLegacyCanvasBoardStorage() {
  try {
    localStorage.removeItem(CONFIG.canvasBoardKey);
  } catch {
    // Ignore legacy cleanup failures.
  }
}

function hasCanvasBoardContent(board = state.canvasBoard) {
  const view = board?.view || {};
  return Boolean(
    (Array.isArray(board?.items) && board.items.length) ||
      (Array.isArray(board?.selectedIds) && board.selectedIds.length) ||
      Number(view.scale) !== CONFIG.canvasDefaultScale ||
      Number(view.offsetX) !== CONFIG.canvasDefaultOffsetX ||
      Number(view.offsetY) !== CONFIG.canvasDefaultOffsetY
  );
}

function applyCanvasBoardStorageInfo(data) {
  state.canvasBoardStorageInfo = {
    file: data.file || state.canvasBoardStorageInfo.file,
    fileSizeBytes: Number(data.fileSizeBytes) || 0,
    updatedAt: data.updatedAt ? Number(data.updatedAt) : state.canvasBoardStorageInfo.updatedAt,
  };
}

function getCanvasBoardSavePath() {
  return String(state.uiSettings?.canvasBoardSavePath || "").trim();
}

function syncCanvasPathActionButtons(pathValue = getCanvasBoardSavePath()) {
  const hasPath = Boolean(String(pathValue || "").trim());
  if (canvasBoardPathBrowseBtn) {
    canvasBoardPathBrowseBtn.disabled = !DESKTOP_SHELL?.pickCanvasBoardPath;
  }
  if (drawerCanvasBoardPathBrowseBtn) {
    drawerCanvasBoardPathBrowseBtn.disabled = !DESKTOP_SHELL?.pickCanvasBoardPath;
  }
  if (canvasBoardPathOpenBtn) {
    canvasBoardPathOpenBtn.disabled = !DESKTOP_SHELL?.revealPath || !hasPath;
  }
  if (drawerCanvasBoardPathOpenBtn) {
    drawerCanvasBoardPathOpenBtn.disabled = !DESKTOP_SHELL?.revealPath || !hasPath;
  }
}

async function loadCanvasBoard() {
  let boardFromFile = normalizeCanvasBoard();

  try {
    const response = await fetch(API_ROUTES.canvasBoard);
    const data = await readJsonResponse(response, "画布文件");

    if (!response.ok || !data.ok) {
      throw new Error(data.details || data.error || "无法读取画布文件");
    }

    boardFromFile = normalizeCanvasBoard(data.board || {});
    applyCanvasBoardStorageInfo(data);
  } catch (error) {
    const legacyBoard = readLegacyCanvasBoardFromStorage();
    state.canvasBoard = legacyBoard || normalizeCanvasBoard();
    if (!legacyBoard) {
      setStatus(`画布文件读取失败：${error.message}`, "warning");
    }
    return;
  }

  const legacyBoard = readLegacyCanvasBoardFromStorage();
  const shouldMigrateLegacy = hasCanvasBoardContent(legacyBoard) && !hasCanvasBoardContent(boardFromFile);

  state.canvasBoard = shouldMigrateLegacy ? legacyBoard : boardFromFile;

  if (!shouldMigrateLegacy) {
    return;
  }

  try {
    await queueCanvasBoardPersist(true);
    clearLegacyCanvasBoardStorage();
    setStatus("已将旧浏览器画布迁移到本地文件", "success");
  } catch (error) {
    setStatus(`画布迁移失败：${error.message}`, "warning");
  }
}

function queueCanvasBoardPersist(immediate = false) {
  if (state.canvasBoardPersistTimer) {
    clearTimeout(state.canvasBoardPersistTimer);
    state.canvasBoardPersistTimer = null;
  }

  const run = () => {
    const payload = {
      ...state.canvasBoard,
    };

    state.canvasBoardPersistPromise = state.canvasBoardPersistPromise
      .catch(() => {})
      .then(async () => {
        const response = await fetch(API_ROUTES.canvasBoard, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await readJsonResponse(response, "画布文件");

        if (!response.ok || !data.ok) {
          throw new Error(data.details || data.error || "画布文件写入失败");
        }

        state.canvasBoard = normalizeCanvasBoard(data.board || payload);
        applyCanvasBoardStorageInfo(data);
        clearLegacyCanvasBoardStorage();
      })
      .catch((error) => {
        setStatus(`画布保存失败：${error.message}`, "warning");
        throw error;
      });

    return state.canvasBoardPersistPromise;
  };

  if (immediate) {
    return run();
  }

  state.canvasBoardPersistTimer = setTimeout(run, 250);
  return state.canvasBoardPersistPromise;
}

function saveCanvasBoardToStorage() {
  return queueCanvasBoardPersist();
}

async function loadCanvasBoardFromStorage() {
  await loadCanvasBoard();
}

function setCanvasStatus(text) {
  if (canvasStatusPillEl) {
    canvasStatusPillEl.textContent = text;
  }
}

function getCanvasScalePercent(scale = state.canvasBoard.view.scale) {
  return Math.round(clampCanvasScale(scale) * 100);
}

function setCanvasScaleContinuous(nextScale, { persist = true, status = true } = {}) {
  const scale = clampCanvasScale(nextScale);
  updateCanvasView({ scale }, { persist });
  if (status) {
    setCanvasStatus(`画布缩放：${getCanvasScalePercent(scale)}%`);
  }
}

function focusNearestCanvasItem() {
  if (!canvasViewportEl || !Array.isArray(state.canvasBoard.items) || !state.canvasBoard.items.length) {
    setCanvasStatus("画布中还没有元素");
    return;
  }

  const viewportRect = canvasViewportEl.getBoundingClientRect();
  const viewportCenterX = viewportRect.left + viewportRect.width / 2;
  const viewportCenterY = viewportRect.top + viewportRect.height / 2;

  let targetCard = null;
  let targetDistance = Number.POSITIVE_INFINITY;
  const selectedIds = new Set(state.canvasBoard.selectedIds || []);

  for (const item of state.canvasBoard.items) {
    const card = canvasItemsEl?.querySelector(`[data-canvas-item-id="${item.id}"]`);
    if (!card) continue;
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(centerX - viewportCenterX, centerY - viewportCenterY);
    if (selectedIds.has(item.id)) {
      targetCard = card;
      targetDistance = distance;
      break;
    }
    if (distance < targetDistance) {
      targetCard = card;
      targetDistance = distance;
    }
  }

  if (!targetCard) {
    setCanvasStatus("没有找到可定位的画布元素");
    return;
  }

  const cardRect = targetCard.getBoundingClientRect();
  const cardCenterX = cardRect.left + cardRect.width / 2;
  const cardCenterY = cardRect.top + cardRect.height / 2;
  const deltaX = viewportCenterX - cardCenterX;
  const deltaY = viewportCenterY - cardCenterY;

  updateCanvasView({
    offsetX: (Number(state.canvasBoard.view.offsetX) || 0) + deltaX,
    offsetY: (Number(state.canvasBoard.view.offsetY) || 0) + deltaY,
  });
  setCanvasStatus(selectedIds.size ? "已返回当前选中的画布元素" : "已返回最近的画布元素");
}

  function getCanvasFileExtension(name = "") {
    const cleanName = String(name || "").trim().split(/[\\/]/).pop() || "";
    const dotIndex = cleanName.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex === cleanName.length - 1) {
      return "";
    }
    return cleanName.slice(dotIndex + 1).toLowerCase();
  }

  function getCanvasCardIcon(item) {
    const kind = item?.kind;
    const mimeType = String(item?.mimeType || "").toLowerCase();
    const extension = getCanvasFileExtension(item?.fileName || item?.title || "");

    if (kind === "image") {
      return { label: "IMG", badge: "图片", tone: "is-image" };
    }
    if (kind === "text") {
      return { label: "TXT", badge: "文本", tone: "is-text" };
    }
    if (item?.isDirectory || mimeType === "inode/directory") {
      return { label: "DIR", badge: "文件夹", tone: "is-folder" };
    }
    if (/pdf/.test(mimeType) || extension === "pdf") {
      return { label: "PDF", badge: "PDF 文档", tone: "is-pdf" };
    }
    if (/word|rtf|officedocument\.wordprocessingml/.test(mimeType) || ["doc", "docx", "rtf", "odt"].includes(extension)) {
      return { label: "DOC", badge: "文档", tone: "is-doc" };
    }
    if (/excel|spreadsheet|csv/.test(mimeType) || ["xls", "xlsx", "csv", "ods"].includes(extension)) {
      return { label: "XLS", badge: "表格", tone: "is-sheet" };
    }
    if (/powerpoint|presentation/.test(mimeType) || ["ppt", "pptx", "key"].includes(extension)) {
      return { label: "PPT", badge: "演示文稿", tone: "is-slide" };
    }
    if (/zip|rar|7z|tar|gzip|compressed|x-zip/.test(mimeType) || ["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) {
      return { label: "ZIP", badge: "压缩包", tone: "is-archive" };
    }
    if (/audio\//.test(mimeType) || ["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(extension)) {
      return { label: "AUD", badge: "音频", tone: "is-audio" };
    }
    if (/video\//.test(mimeType) || ["mp4", "mov", "avi", "mkv", "webm"].includes(extension)) {
      return { label: "VID", badge: "视频", tone: "is-video" };
    }
    if (
      /json|xml|javascript|typescript|x-python|x-shellscript|html|css/.test(mimeType) ||
      [
        "js",
        "cjs",
        "mjs",
        "ts",
        "tsx",
        "jsx",
        "py",
        "java",
        "c",
        "cpp",
        "h",
        "hpp",
        "cs",
        "go",
        "rs",
        "php",
        "rb",
        "swift",
        "kt",
        "html",
        "css",
        "scss",
        "json",
        "md",
        "yml",
        "yaml",
        "xml",
        "sql",
        "sh",
        "ps1",
        "bat",
        "vue",
      ].includes(extension)
    ) {
      return { label: "CODE", badge: "代码 / 配置", tone: "is-code" };
    }
    if (["psd", "ai", "fig", "sketch", "xd"].includes(extension)) {
      return { label: "UI", badge: "设计文件", tone: "is-design" };
    }
    if (["blend", "glb", "gltf", "fbx", "obj", "stl"].includes(extension)) {
      return { label: "3D", badge: "三维素材", tone: "is-3d" };
    }
    if (["exe", "msi", "apk", "dmg", "pkg", "app"].includes(extension)) {
      return { label: "APP", badge: "应用程序", tone: "is-app" };
    }
    return { label: "FILE", badge: mimeType || (extension ? `${extension.toUpperCase()} 文件` : "文件"), tone: "is-file" };
  }

  function describeCanvasFile(item) {
    const parts = [];
    const iconMeta = getCanvasCardIcon(item);
    if (item.fileName) parts.push(item.fileName);
    if (item.isDirectory) {
      parts.push("文件夹");
    } else if (item.mimeType) {
      parts.push(item.mimeType);
    } else if (iconMeta.badge) {
      parts.push(iconMeta.badge);
    }
    if (item.fileSize) parts.push(formatBytes(item.fileSize));
    return parts.join(" · ");
  }

function getCanvasItemsByIds(itemIds = []) {
  if (!Array.isArray(itemIds) || !itemIds.length) {
    return [];
  }

  return state.canvasBoard.items.filter((item) => itemIds.includes(item.id));
}

function getSelectedCanvasItems(itemIds = state.canvasBoard.selectedIds) {
  return getCanvasItemsByIds(itemIds);
}

function buildCanvasSelectionContext(itemIds = state.canvasBoard.selectedIds) {
  const selectedItems = getSelectedCanvasItems(itemIds);
  if (!selectedItems.length) {
    return "";
  }

  return selectedItems
    .map((item, index) => {
      const typeLabel = item.kind === "textbox" ? "文本框" : item.kind;
      const header = `画布元素 ${index + 1}｜${typeLabel}｜${item.title}`;
      if (item.kind === "image") {
        return `${header}\n文件名：${item.fileName || item.title}\n说明：这是画布中选中的图片素材卡。`;
      }
      if (item.kind === "file") {
        return `${header}\n文件名：${item.fileName || item.title}\n类型：${
          item.isDirectory ? "文件夹" : item.mimeType || getCanvasCardIcon(item).badge || "未知"
        }\n内容摘要：${truncate(item.text || "文件已加入画布。", 1200)}`;
      }
      if (item.kind === "textbox") {
        return `${header}\n字号：${item.fontSize || CONFIG.canvasTextBoxDefaultFontSize}\n样式：${
          [item.bold ? "加粗" : "", item.highlighted ? "高光" : ""].filter(Boolean).join(" / ") || "常规"
        }\n内容：${truncate(item.text || "", 1600)}`;
      }
      return `${header}\n内容：${truncate(item.text || "", 1600)}`;
    })
    .join("\n\n");
}

function normalizeComposerAttachments(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: String(item?.id || "").trim(),
      title: String(item?.title || item?.fileName || "").trim() || "未命名文件",
      kind: ["text", "image", "file"].includes(item?.kind) ? item.kind : "file",
    }))
    .filter((item) => item.id && !seen.has(item.id) && seen.add(item.id))
    .slice(0, 12);
}

function renderComposerAttachments() {
  if (!composerAttachmentsEl) return;

  const attachments = normalizeComposerAttachments(state.composerAttachments);
  state.composerAttachments = attachments;
  composerAttachmentsEl.classList.toggle("is-hidden", attachments.length === 0);

  if (!attachments.length) {
    composerAttachmentsEl.innerHTML = "";
    return;
  }

  composerAttachmentsEl.innerHTML = attachments
    .map(
      (item) => `
        <button class="composer-attachment-chip" type="button" data-remove-composer-attachment="${escapeHtml(item.id)}">
          <span class="composer-attachment-chip-label">${escapeHtml(item.title)}</span>
          <span class="composer-attachment-chip-remove" aria-hidden="true">×</span>
        </button>
      `
    )
    .join("");
}

function setComposerAttachments(items = []) {
  state.composerAttachments = normalizeComposerAttachments(items);
  renderComposerAttachments();
}

function appendComposerAttachments(items = []) {
  state.composerAttachments = normalizeComposerAttachments([...state.composerAttachments, ...items]);
  renderComposerAttachments();
}

function clearComposerAttachments() {
  state.composerAttachments = [];
  renderComposerAttachments();
}

function buildAttachmentPromptPrefix(attachments = []) {
  const normalized = normalizeComposerAttachments(attachments);
  if (!normalized.length) return "";
  return `已附加文件：\n${normalized.map((item) => `- ${item.title}`).join("\n")}`;
}

function removeCanvasSelectionByIds(itemIds = []) {
  if (!Array.isArray(itemIds) || !itemIds.length) return;
  state.canvasBoard.selectedIds = state.canvasBoard.selectedIds.filter((id) => !itemIds.includes(id));
  renderCanvasBoard();
  saveCanvasBoardToStorage();
}

function buildCanvasTextTitle(text = "") {
  const firstLine =
    String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || "文本框";
  return truncate(firstLine, 24);
}

function isEditableElement(target) {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    Boolean(target?.closest?.('[contenteditable="true"]'))
  );
}

function normalizeAppClipboardItem(item = {}) {
  const kind = ["text", "image", "file", "textbox"].includes(item?.kind) ? item.kind : "text";
  return {
    id: String(item?.id || crypto.randomUUID()),
    kind,
    title: String(item?.title || item?.fileName || "未命名内容").trim() || "未命名内容",
    text: kind === "textbox" ? sanitizeCanvasTextboxText(item?.text || "") : sanitizeCanvasTextPreview(item?.text || ""),
    filePath: String(item?.filePath || "").trim(),
    fileName: String(item?.fileName || "").trim(),
    mimeType: String(item?.mimeType || "").trim(),
    isDirectory: Boolean(item?.isDirectory),
    fileSize: Number(item?.fileSize) || 0,
    dataUrl: typeof item?.dataUrl === "string" ? item.dataUrl : "",
    width: Math.max(44, Number(item?.width) || 0),
    height: Math.max(44, Number(item?.height) || 0),
    fontSize: normalizeCanvasTextBoxFontSize(item?.fontSize),
    bold: Boolean(item?.bold),
    highlighted: Boolean(item?.highlighted),
  };
}

function normalizeAppClipboardPayload(payload = {}) {
  return {
    source: ["canvas", "chat"].includes(payload?.source) ? payload.source : "",
    text: String(payload?.text || ""),
    items: (Array.isArray(payload?.items) ? payload.items : []).map((item) => normalizeAppClipboardItem(item)),
    createdAt: Number(payload?.createdAt) || 0,
  };
}

function setAppClipboardPayload(payload = {}) {
  state.appClipboard = normalizeAppClipboardPayload({
    ...payload,
    createdAt: Date.now(),
  });
}

function getActiveAppClipboardPayload() {
  const payload = normalizeAppClipboardPayload(state.appClipboard);
  if (!payload.source || Date.now() - payload.createdAt > APP_CLIPBOARD_TTL_MS) {
    return null;
  }
  return payload;
}

function setActiveClipboardZone(zone = "") {
  activeClipboardZone = ["canvas", "assistant", "screen"].includes(zone) ? zone : "";
}

function getClipboardZoneFromTarget(target) {
  if (!(target instanceof Element)) {
    return "";
  }

  if (
    target.closest("#canvas-viewport") ||
    target.closest("#canvas-items") ||
    target.closest(".desktop-clear-stage")
  ) {
    return "canvas";
  }

  if (target.closest("#screen-source-panel") || target.closest("#screen-source-header-slot")) {
    return "screen";
  }

  if (target.closest(".conversation-panel")) {
    return "assistant";
  }

  return "";
}

function getActiveClipboardZone() {
  return activeClipboardZone;
}

function getClipboardPlainText(dataTransfer) {
  return String(dataTransfer?.getData?.("text/plain") || "").trim();
}

function shouldUseAppClipboardPayload(payload, dataTransfer = null) {
  if (!payload) return false;
  const plainText = getClipboardPlainText(dataTransfer);
  if (!plainText) {
    return true;
  }
  if (payload.text && plainText === payload.text.trim()) {
    return true;
  }
  return false;
}

function extractConversationCopyText(target) {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const start = Number(target.selectionStart);
    const end = Number(target.selectionEnd);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return String(target.value || "").slice(start, end).trim();
    }
    return "";
  }

  return String(window.getSelection?.()?.toString() || "").trim();
}

function insertTextIntoPrompt(text = "", { focus = true } = {}) {
  if (!promptInput) return false;

  const insertion = String(text || "");
  const start = Number.isFinite(promptInput.selectionStart) ? promptInput.selectionStart : promptInput.value.length;
  const end = Number.isFinite(promptInput.selectionEnd) ? promptInput.selectionEnd : promptInput.value.length;
  const before = promptInput.value.slice(0, start);
  const after = promptInput.value.slice(end);
  promptInput.value = `${before}${insertion}${after}`;
  const nextCursor = before.length + insertion.length;
  promptInput.selectionStart = nextCursor;
  promptInput.selectionEnd = nextCursor;
  autoresize();
  if (focus) {
    promptInput.focus();
  }
  return true;
}

function createCanvasItemsFromClipboardPayload(items = []) {
  const offsetStep = 28;
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    kind: item.kind === "textbox" ? "textbox" : item.kind,
    title: item.title,
    text: item.text,
    filePath: item.filePath,
    fileName: item.fileName,
    mimeType: item.mimeType,
    isDirectory: item.isDirectory,
    fileSize: item.fileSize,
    dataUrl: item.dataUrl,
    width: item.width,
    height: item.height,
    fontSize: item.fontSize,
    bold: item.bold,
    highlighted: item.highlighted,
    x: index * offsetStep,
    y: index * offsetStep,
  }));
}

function pasteAppClipboardToCanvas(payload) {
  if (!payload) return false;

  if (payload.source === "canvas" && payload.items.length) {
    upsertCanvasItems(createCanvasItemsFromClipboardPayload(payload.items), "已将复制的画布内容粘贴回左侧画布");
    return true;
  }

  const text = String(payload.text || "").trim();
  if (!text) return false;
  upsertCanvasItems(
    [
      {
        kind: "text",
        title: payload.source === "chat" ? "交互文本" : "剪贴板文本",
        text,
      },
    ],
    payload.source === "chat" ? "已把右侧交互内容粘贴到左侧画布" : "已把剪贴板文本放入无限画布"
  );
  return true;
}

function pasteAppClipboardToComposer(payload) {
  if (!payload) return false;

  const attachmentItems = payload.items.filter((item) => item.kind === "file" || item.kind === "image");
  if (attachmentItems.length) {
    appendComposerAttachments(attachmentItems);
  }

  const textItems = payload.items.filter((item) => item.kind === "text" || item.kind === "textbox");
  const textChunks = [];
  if (payload.text) {
    textChunks.push(payload.text);
  } else if (textItems.length) {
    textChunks.push(...textItems.map((item) => item.text).filter(Boolean));
  }

  if (textChunks.length) {
    const nextText = textChunks.join("\n\n");
    if (promptInput?.value?.trim()) {
      insertTextIntoPrompt(`\n${nextText}`);
    } else {
      insertTextIntoPrompt(nextText);
    }
  } else if (promptInput) {
    promptInput.focus();
  }

  if (attachmentItems.length || textChunks.length) {
    promptInput?.focus();
    setStatus(payload.source === "canvas" ? "已将左侧画布内容粘贴到右侧交互区" : "已将右侧交互内容粘贴到输入区", "success");
    return true;
  }

  return false;
}

async function importClipboardToComposer(dataTransfer) {
  if (!promptInput) return false;

  let importedItems = [];
  if (hasClipboardFiles(dataTransfer)) {
    for (const file of [...(dataTransfer?.files || [])]) {
      importedItems.push(await fileToCanvasItem(file));
    }
  } else if (IS_DESKTOP_APP) {
    const paths = await readClipboardFilePaths();
    for (const filePath of paths) {
      importedItems.push(await filePathToCanvasItem(filePath));
    }
  }

  if (importedItems.length) {
    const insertedItems = upsertCanvasItems(importedItems, "剪贴板文件已同步到左侧画布");
    appendComposerAttachments(insertedItems.filter((item) => item.kind === "file" || item.kind === "image"));
    promptInput.focus();
    setStatus("已将剪贴板文件加入右侧交互区，并同步到左侧画布", "success");
    return true;
  }

  const plainText = getClipboardPlainText(dataTransfer);
  if (plainText) {
    insertTextIntoPrompt(promptInput.value.trim() ? `\n${plainText}` : plainText);
    setStatus("已将剪贴板文本粘贴到右侧交互区", "success");
    return true;
  }

  return false;
}

function getCanvasItemById(itemId) {
  return state.canvasBoard.items.find((item) => item.id === itemId);
}

function getCanvasTextBoxItemById(itemId) {
  const item = getCanvasItemById(itemId);
  return isCanvasTextItem(item) ? item : null;
}

function getCanvasPositionFromClientPoint(clientX, clientY) {
  if (!canvasViewportEl) {
    return { x: 0, y: 0 };
  }

  const rect = canvasViewportEl.getBoundingClientRect();
  const scale = clampCanvasScale(state.canvasBoard.view.scale);
  const offsetX = Number(state.canvasBoard.view.offsetX) || 0;
  const offsetY = Number(state.canvasBoard.view.offsetY) || 0;
  return {
    x: rect.width / 2 + (clientX - rect.left - rect.width / 2 - offsetX) / scale,
    y: rect.height / 2 + (clientY - rect.top - rect.height / 2 - offsetY) / scale,
  };
}

function formatCanvasTextboxHtml(text = "") {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function readCanvasTextboxEditorText(editor) {
  return sanitizeCanvasTextboxText(
    String(editor?.innerText || "")
      .replace(/\u00a0/g, " ")
      .replace(/\n$/, "")
  );
}

function setSelectionToCanvasItem(itemId, { additive = false } = {}) {
  const targetId = String(itemId || "").trim();
  if (!targetId) return;
  if (additive) {
    const next = new Set(state.canvasBoard.selectedIds || []);
    if (next.has(targetId)) {
      next.delete(targetId);
    } else {
      next.add(targetId);
    }
    state.canvasBoard.selectedIds = Array.from(next).slice(0, 24);
    return;
  }
  state.canvasBoard.selectedIds = [targetId];
}

function clearCanvasSelection({ persist = true, statusText = "" } = {}) {
  if (!state.canvasBoard.selectedIds.length) return false;
  state.canvasBoard.selectedIds = [];
  renderCanvasBoard();
  if (persist) {
    saveCanvasBoardToStorage();
  }
  if (statusText) {
    setCanvasStatus(statusText);
  }
  return true;
}

function startEditingCanvasTextbox(itemId) {
  const item = getCanvasTextBoxItemById(itemId);
  if (!item) return;
  state.canvasEditingTextId = item.id;
  state.canvasBoard.selectedIds = [item.id];
  renderCanvasBoard();
}

function stopEditingCanvasTextbox({ persist = true } = {}) {
  if (!state.canvasEditingTextId) return;
  state.canvasEditingTextId = null;
  renderCanvasBoard();
  if (persist) {
    saveCanvasBoardToStorage();
  }
}

function updateCanvasTextboxMetrics(item, editor = null) {
  if (!item || !isCanvasTextItem(item)) return;
  const baseHeight = Math.max(getCanvasTextDisplayFontSize(item) * 1.7 + 20, CONFIG.canvasTextBoxDefaultHeight);
  const measuredHeight = editor ? editor.scrollHeight + 18 : 0;
  item.height = Math.max(baseHeight, measuredHeight || item.height || 0);
}

function syncCanvasTextboxEditor(editor, item) {
  if (!editor || !item) return;
  item.text = readCanvasTextboxEditorText(editor);
  item.title = buildCanvasTextTitle(item.text);
  updateCanvasTextboxMetrics(item, editor);
  const wrapper = editor.closest(".canvas-textbox");
  if (wrapper) {
    wrapper.style.minHeight = `${Math.round(item.height)}px`;
  }
}

function focusCanvasTextboxEditor(editor) {
  if (!editor) return;
  editor.focus();
  const selection = window.getSelection?.();
  const range = document.createRange?.();
  if (!selection || !range) return;
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function bindCanvasTextboxEditor() {
  const itemId = state.canvasEditingTextId;
  if (!itemId || !canvasItemsEl) return;
  const item = getCanvasTextBoxItemById(itemId);
  const editor = canvasItemsEl.querySelector(`[data-canvas-textbox-editor="${itemId}"]`);
  if (!item || !editor) {
    state.canvasEditingTextId = null;
    return;
  }

  editor.addEventListener("input", () => {
    syncCanvasTextboxEditor(editor, item);
  });
  editor.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stopEditingCanvasTextbox();
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      stopEditingCanvasTextbox();
    }
  });
  editor.addEventListener("blur", () => {
    if (state.canvasEditingTextId !== itemId) return;
    syncCanvasTextboxEditor(editor, item);
    stopEditingCanvasTextbox();
  });

  requestAnimationFrame(() => {
    if (state.canvasEditingTextId !== itemId) return;
    focusCanvasTextboxEditor(editor);
    syncCanvasTextboxEditor(editor, item);
  });
}

function isCanvasTextItem(item) {
  return item?.kind === "textbox" || item?.kind === "text";
}

function getCanvasTextDisplayFontSize(item) {
  if (item?.kind === "textbox") {
    return Math.min(24, Math.max(16, normalizeCanvasTextBoxFontSize(item.fontSize)));
  }
  return 16;
}

function getCanvasMaterialDimensions(item) {
  if (isCanvasTextItem(item)) {
    return {
      width: Math.max(260, Math.min(420, Number(item?.width) || CONFIG.canvasTextBoxDefaultWidth)),
      minHeight: Math.max(88, Math.min(180, Number(item?.height) || CONFIG.canvasTextBoxDefaultHeight)),
    };
  }

  if (item?.kind === "image") {
    return {
      width: Math.max(220, Math.min(420, Number(item?.width) || 280)),
      minHeight: Math.max(180, Math.min(420, Number(item?.height) || 220)),
    };
  }

  return {
    width: CONFIG.canvasCardWidth,
    minHeight: CONFIG.canvasCardHeight,
  };
}

function getCanvasFileMetaLine(item) {
  if (item?.isDirectory) {
    return "folder";
  }

  const extension = getCanvasFileExtension(item?.fileName || item?.title || "");
  const mimeType = String(item?.mimeType || "").trim().toLowerCase();
  const typeLabel = extension || (mimeType ? mimeType.split("/").pop() : "file");
  const parts = [String(typeLabel || "file").toLowerCase()];
  if (item?.fileSize) {
    parts.push(formatBytes(item.fileSize));
  }
  return parts.join(" · ");
}

function getCanvasCardTitle(item) {
  return String(item?.fileName || item?.title || "未命名素材").trim() || "未命名素材";
}

function escapeCssColor(value = "") {
  return String(value || "").replace(/["'<>]/g, "").trim();
}

function removeCanvasItemsByIds(itemIds = [], statusText = "") {
  const normalizedIds = [...new Set((Array.isArray(itemIds) ? itemIds : []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!normalizedIds.length) return false;

  state.canvasBoard.items = state.canvasBoard.items.filter((entry) => !normalizedIds.includes(entry.id));
  state.canvasBoard.selectedIds = state.canvasBoard.selectedIds.filter((id) => !normalizedIds.includes(id));
  if (normalizedIds.includes(state.canvasEditingTextId)) {
    state.canvasEditingTextId = null;
  }

  renderCanvasBoard();
  saveCanvasBoardToStorage();
  setCanvasStatus(statusText || `已删除 ${normalizedIds.length} 个素材卡`);
  return true;
}

async function copySelectedCanvasItems() {
  const selectedItems = getSelectedCanvasItems();
  if (!selectedItems.length) {
    throw new Error("没有选中的素材卡");
  }
  return copyCanvasItemsToClipboard(selectedItems);
}

async function cutSelectedCanvasItems() {
  const selectedItems = getSelectedCanvasItems();
  if (!selectedItems.length) {
    throw new Error("没有选中的素材卡");
  }
  const result = await copyCanvasItemsToClipboard(selectedItems);
  removeCanvasItemsByIds(
    selectedItems.map((item) => item.id),
    `已剪切 ${selectedItems.length} 个素材卡`
  );
  return result;
}

async function pasteIntoCanvasFromSystemClipboard() {
  const appClipboard = getActiveAppClipboardPayload();
  if (shouldUseAppClipboardPayload(appClipboard) && pasteAppClipboardToCanvas(appClipboard)) {
    return true;
  }

  const handledFiles = await importClipboardFilesFromDesktop().catch(() => false);
  if (handledFiles) {
    return true;
  }

  await importClipboardTextToCanvas();
  return true;
}

async function openCanvasItem(item) {
  if (!item || isCanvasTextItem(item)) return false;
  const filePath = String(item.filePath || "").trim();
  if (!filePath || !DESKTOP_SHELL?.openPath) {
    return false;
  }

  const result = await DESKTOP_SHELL.openPath(filePath);
  if (!result?.ok) {
    throw new Error(result?.error || "打开文件失败");
  }
  return true;
}

function createCanvasContextMenu() {
  const menu = document.createElement("div");
  menu.className = "canvas-context-menu is-hidden";
  menu.innerHTML = `
    <button class="canvas-context-menu-item" type="button" data-canvas-menu-action="copy">复制</button>
    <button class="canvas-context-menu-item" type="button" data-canvas-menu-action="cut">剪切</button>
    <button class="canvas-context-menu-item" type="button" data-canvas-menu-action="delete">删除</button>
    <button class="canvas-context-menu-item" type="button" data-canvas-menu-action="paste">粘贴</button>
  `;
  document.body.appendChild(menu);
  return menu;
}

function closeCanvasContextMenu() {
  canvasContextMenuEl?.classList.add("is-hidden");
}

function openCanvasContextMenu(clientX, clientY) {
  if (!canvasContextMenuEl) return;

  const hasSelection = state.canvasBoard.selectedIds.length > 0;
  for (const actionEl of canvasContextMenuEl.querySelectorAll("[data-canvas-menu-action]")) {
    const action = actionEl.dataset.canvasMenuAction;
    actionEl.disabled = ["copy", "cut", "delete"].includes(action) ? !hasSelection : false;
  }

  canvasContextMenuEl.classList.remove("is-hidden");
  const rect = canvasContextMenuEl.getBoundingClientRect();
  const nextX = Math.min(clientX, window.innerWidth - rect.width - 12);
  const nextY = Math.min(clientY, window.innerHeight - rect.height - 12);
  canvasContextMenuEl.style.left = `${Math.max(12, nextX)}px`;
  canvasContextMenuEl.style.top = `${Math.max(12, nextY)}px`;
}

function createCanvasImageLightbox() {
  const lightbox = document.createElement("div");
  lightbox.className = "canvas-image-lightbox is-hidden";
  lightbox.innerHTML = `
    <button class="canvas-image-lightbox-close" type="button" aria-label="关闭图片预览">×</button>
    <img class="canvas-image-lightbox-image" alt="" />
  `;
  document.body.appendChild(lightbox);
  return lightbox;
}

function openCanvasImageLightbox(item) {
  if (!canvasImageLightboxEl || item?.kind !== "image" || !item?.dataUrl) return;
  const imageEl = canvasImageLightboxEl.querySelector(".canvas-image-lightbox-image");
  if (!(imageEl instanceof HTMLImageElement)) return;
  imageEl.src = item.dataUrl;
  imageEl.alt = getCanvasCardTitle(item);
  canvasImageLightboxEl.classList.remove("is-hidden");
  scheduleDesktopWindowShapeSync();
}

function closeCanvasImageLightbox() {
  if (!canvasImageLightboxEl) return;
  canvasImageLightboxEl.classList.add("is-hidden");
  scheduleDesktopWindowShapeSync();
}

function createCanvasTextboxAt(clientX, clientY) {
  const point = getCanvasPositionFromClientPoint(clientX, clientY);
  const items = upsertCanvasItems(
    [
      {
        kind: "textbox",
        title: "文本框",
        text: "",
        x: point.x - 12,
        y: point.y - 12,
        width: CONFIG.canvasTextBoxDefaultWidth,
        height: CONFIG.canvasTextBoxDefaultHeight,
        fontSize: CONFIG.canvasTextBoxDefaultFontSize,
        bold: false,
        highlighted: false,
      },
    ],
    "已在画布中创建文本框"
  );
  if (!items.length) return;
  state.canvasEditingTextId = items[0].id;
  renderCanvasBoard();
}

function renderCanvasBoard() {
  if (!canvasSurfaceEl || !canvasItemsEl) return;

  const view = state.canvasBoard.view || {};
  const scale = clampCanvasScale(view.scale);
  const offsetX = Number(view.offsetX) || 0;
  const offsetY = Number(view.offsetY) || 0;
  canvasSurfaceEl.style.setProperty("--canvas-scale", scale.toFixed(3));
  canvasSurfaceEl.style.setProperty("--canvas-offset-x", `${offsetX}px`);
  canvasSurfaceEl.style.setProperty("--canvas-offset-y", `${offsetY}px`);

  if (canvasZoomLabelEl) {
    canvasZoomLabelEl.textContent = `${Math.round(scale * 100)}%`;
  }
  if (canvasZoomRangeEl) {
    canvasZoomRangeEl.value = String(Math.round(scale * 100));
  }
  if (canvasItemCountEl) {
    canvasItemCountEl.textContent = String(state.canvasBoard.items.length);
  }
  state.canvasBoard.selectedIds = (state.canvasBoard.selectedIds || []).filter((id) =>
    state.canvasBoard.items.some((item) => item.id === id)
  );
  if (state.canvasEditingTextId && !state.canvasBoard.items.some((item) => item.id === state.canvasEditingTextId)) {
    state.canvasEditingTextId = null;
  }
  if (canvasEmptyStateEl) {
    canvasEmptyStateEl.classList.toggle("is-hidden", state.canvasBoard.items.length > 0);
  }

  canvasItemsEl.innerHTML = state.canvasBoard.items
    .map((item) => {
      const renderX = CONFIG.canvasWorldOrigin + Math.round(item.x);
      const renderY = CONFIG.canvasWorldOrigin + Math.round(item.y);
      const selected = state.canvasBoard.selectedIds.includes(item.id);
      const editing = state.canvasEditingTextId === item.id;
      const dimensions = getCanvasMaterialDimensions(item);

      if (isCanvasTextItem(item)) {
        const style = `left:${renderX}px;top:${renderY}px;width:${Math.round(
          dimensions.width
        )}px;min-height:${Math.round(dimensions.minHeight)}px;--canvas-text-font-size:${getCanvasTextDisplayFontSize(item)}px;`;
        const textHtml = formatCanvasTextboxHtml(item.text || "");
        return `
          <article
            class="canvas-textbox${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}${item.bold ? " is-bold" : ""}${
              item.highlighted ? " is-highlighted" : ""
            }"
            data-canvas-item-id="${escapeHtml(item.id)}"
            style="${style}"
          >
            ${
              editing
                ? `<div class="canvas-textbox-editor" contenteditable="true" spellcheck="false" data-placeholder="输入文本" data-canvas-textbox-editor="${escapeHtml(
                    item.id
                  )}">${textHtml}</div>`
                : `<div class="canvas-textbox-copy">${textHtml || '<span class="canvas-textbox-placeholder">双击输入文本</span>'}</div>`
            }
          </article>
        `;
      }

      if (item.kind === "image" && item.dataUrl) {
        const style = `left:${renderX}px;top:${renderY}px;width:${Math.round(dimensions.width)}px;height:${Math.round(
          dimensions.minHeight
        )}px;`;
        return `
          <article
            class="canvas-card canvas-card-image${selected ? " is-selected" : ""}"
            data-canvas-item-id="${escapeHtml(item.id)}"
            style="${style}"
          >
            <img class="canvas-card-image-asset" src="${item.dataUrl}" alt="${escapeHtml(getCanvasCardTitle(item))}" draggable="false" />
            <button class="canvas-image-resize-handle canvas-image-resize-handle-left" type="button" data-canvas-image-resize="${escapeHtml(
              item.id
            )}" data-canvas-image-resize-handle="left" aria-label="调整左边缘"></button>
            <button class="canvas-image-resize-handle canvas-image-resize-handle-right" type="button" data-canvas-image-resize="${escapeHtml(
              item.id
            )}" data-canvas-image-resize-handle="right" aria-label="调整右边缘"></button>
            <button class="canvas-image-resize-handle canvas-image-resize-handle-bottom" type="button" data-canvas-image-resize="${escapeHtml(
              item.id
            )}" data-canvas-image-resize-handle="bottom" aria-label="调整底边缘"></button>
            <button class="canvas-image-resize-handle canvas-image-resize-handle-top-left" type="button" data-canvas-image-resize="${escapeHtml(
              item.id
            )}" data-canvas-image-resize-handle="top-left" aria-label="等比调整左上角"></button>
            <button class="canvas-image-resize-handle canvas-image-resize-handle-top-right" type="button" data-canvas-image-resize="${escapeHtml(
              item.id
            )}" data-canvas-image-resize-handle="top-right" aria-label="等比调整右上角"></button>
            <button class="canvas-image-resize-handle canvas-image-resize-handle-bottom-left" type="button" data-canvas-image-resize="${escapeHtml(
              item.id
            )}" data-canvas-image-resize-handle="bottom-left" aria-label="等比调整左下角"></button>
            <button class="canvas-image-resize-handle canvas-image-resize-handle-bottom-right" type="button" data-canvas-image-resize="${escapeHtml(
              item.id
            )}" data-canvas-image-resize-handle="bottom-right" aria-label="等比调整右下角"></button>
          </article>
        `;
      }

      const style = `left:${renderX}px;top:${renderY}px;width:${Math.round(dimensions.width)}px;min-height:${Math.round(
        dimensions.minHeight
      )}px;`;
      const fileTypeMeta = getCanvasFileTypeTagMeta(item);
      const tagStyle = [
        `--canvas-file-tag-bg:${escapeCssColor(fileTypeMeta?.background || "#F1F3F5")}`,
        `--canvas-file-tag-color:${escapeCssColor(fileTypeMeta?.textColor || "#5F6B76")}`,
        `--canvas-file-tag-border:${escapeCssColor(fileTypeMeta?.borderColor || "#D7DDE3")}`,
      ].join(";");
      return `
        <article
          class="canvas-card canvas-card-${escapeHtml(item.kind)}${selected ? " is-selected" : ""}"
          data-canvas-item-id="${escapeHtml(item.id)}"
          style="${style}"
        >
          ${item.isDirectory ? '<span class="canvas-card-folder-icon" aria-hidden="true">📂</span>' : ""}
          <span class="canvas-file-type-tag" style="${tagStyle}">${escapeHtml(fileTypeMeta?.label || "文件")}</span>
          <div class="canvas-card-head">
            <strong class="canvas-card-title">${escapeHtml(getCanvasCardTitle(item))}</strong>
            <div class="canvas-card-subtitle">${escapeHtml(getCanvasFileMetaLine(item))}</div>
          </div>
        </article>
      `;
    })
    .join("");

  bindCanvasTextboxEditor();

  const selectedCount = state.canvasBoard.selectedIds.length;
  if (selectedCount > 0) {
    setCanvasStatus(`已选中 ${selectedCount} 个素材卡`);
  }
}

function updateCanvasView(nextView = {}, { persist = true } = {}) {
  state.canvasBoard.view = {
    ...state.canvasBoard.view,
    ...nextView,
    scale: clampCanvasScale(nextView.scale ?? state.canvasBoard.view.scale),
  };
  renderCanvasBoard();
  if (persist) {
    saveCanvasBoardToStorage();
  }
}

function createCanvasItem(base = {}) {
  const index = state.canvasBoard.items.length;
  const defaultX = 140 + (index % 3) * 48;
  const defaultY = 120 + Math.floor(index / 3) * 34;
  const kind = ["text", "image", "file", "textbox"].includes(base.kind) ? base.kind : "text";
  const text = kind === "textbox" ? sanitizeCanvasTextboxText(base.text || "") : sanitizeCanvasTextPreview(base.text || "");

  return {
    id: crypto.randomUUID(),
    kind,
    title:
      kind === "textbox"
        ? buildCanvasTextTitle(text || base.title || "文本框")
        : base.title || `素材 ${index + 1}`,
    text,
    dataUrl: base.dataUrl || "",
    imageWidth: Math.max(0, Number(base.imageWidth) || 0),
    imageHeight: Math.max(0, Number(base.imageHeight) || 0),
    filePath: String(base.filePath || "").trim(),
    fileName: base.fileName || "",
    mimeType: base.mimeType || "",
    isDirectory: Boolean(base.isDirectory),
    fileSize: Number(base.fileSize) || 0,
    x: Number.isFinite(Number(base.x)) ? Number(base.x) : defaultX,
    y: Number.isFinite(Number(base.y)) ? Number(base.y) : defaultY,
    width:
      (kind === "textbox" || kind === "text")
        ? Math.max(220, Math.min(420, Number(base.width) || CONFIG.canvasTextBoxDefaultWidth))
        : Math.max(220, Number(base.width) || CONFIG.canvasCardWidth),
    height:
      (kind === "textbox" || kind === "text")
        ? Math.max(88, Math.min(180, Number(base.height) || CONFIG.canvasTextBoxDefaultHeight))
        : Math.max(88, Number(base.height) || CONFIG.canvasCardHeight),
    fontSize:
      kind === "textbox"
        ? normalizeCanvasTextBoxFontSize(base.fontSize)
        : kind === "text"
          ? 16
          : normalizeCanvasTextBoxFontSize(base.fontSize),
    bold: Boolean(base.bold),
    highlighted: Boolean(base.highlighted),
    createdAt: Date.now(),
  };
}

function upsertCanvasItems(items = [], statusText = "") {
  const nextItems = items.map((item) => createCanvasItem(item));
  state.canvasBoard.items = [...nextItems, ...state.canvasBoard.items].slice(0, 120);
  state.canvasBoard.selectedIds = nextItems.map((item) => item.id);
  renderCanvasBoard();
  saveCanvasBoardToStorage();
  if (statusText) {
    setCanvasStatus(statusText);
  }
  return nextItems;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: Math.max(1, Number(image.naturalWidth) || 1),
        height: Math.max(1, Number(image.naturalHeight) || 1),
      });
    };
    image.onerror = () => resolve({ width: 1, height: 1 });
    image.src = dataUrl;
  });
}

function getAdaptiveImageCardSize(imageWidth, imageHeight) {
  const sourceWidth = Math.max(1, Number(imageWidth) || 1);
  const sourceHeight = Math.max(1, Number(imageHeight) || 1);
  const maxPreviewWidth = 360;
  const maxPreviewHeight = 280;
  const minPreviewWidth = 160;
  const minPreviewHeight = 120;
  const scale = Math.min(maxPreviewWidth / sourceWidth, maxPreviewHeight / sourceHeight, 1);
  const previewWidth = Math.max(minPreviewWidth, Math.round(sourceWidth * scale));
  const previewHeight = Math.max(minPreviewHeight, Math.round(sourceHeight * scale));

  return {
    width: Math.min(420, Math.max(220, previewWidth + 24)),
    height: Math.min(420, Math.max(210, previewHeight + 112)),
    imageWidth: sourceWidth,
    imageHeight: sourceHeight,
  };
}

async function fileToCanvasItem(file) {
  const cleanName = String(file?.name || "").trim() || "未命名文件";
  const mimeType = String(file?.type || "").trim();
  const realFilePath =
    (typeof DESKTOP_SHELL?.getPathForFile === "function" ? DESKTOP_SHELL.getPathForFile(file) : "") ||
    String(file?.path || "").trim();
  const isImage = mimeType.startsWith("image/");
  const isTextLike = /^(text\/|application\/json|application\/xml|image\/svg\+xml)/i.test(mimeType);

  if (isImage) {
    const dataUrl = await fileToDataUrl(file);
    const dimensions = await readImageDimensions(dataUrl);
    const cardSize = getAdaptiveImageCardSize(dimensions.width, dimensions.height);
    return {
      kind: "image",
      title: cleanName,
      dataUrl,
      imageWidth: cardSize.imageWidth,
      imageHeight: cardSize.imageHeight,
      filePath: realFilePath,
      fileName: cleanName,
      mimeType,
      fileSize: file.size,
      width: cardSize.width,
      height: cardSize.height,
    };
  }

  if (isTextLike && file.size <= 1024 * 256) {
    return {
      kind: "file",
      title: cleanName,
      text: await file.text(),
      filePath: realFilePath,
      fileName: cleanName,
      mimeType,
      fileSize: file.size,
    };
  }

  if (isExtractableCanvasFile(cleanName, mimeType) && realFilePath) {
    try {
      const response = await fetch("/api/file-text-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: realFilePath,
          fileName: cleanName,
          mimeType,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.ok && String(payload.text || "").trim()) {
        return {
          kind: "file",
          title: cleanName,
          text: String(payload.text || "").trim(),
          filePath: realFilePath,
          fileName: cleanName,
          mimeType,
          fileSize: file.size,
        };
      }
    } catch {
      // Fall back to metadata-only cards when structured extraction is unavailable.
    }
  }

  return {
    kind: "file",
    title: cleanName,
    text: `${cleanName}\n${mimeType || "未知类型"}\n${formatBytes(file.size || 0)}`,
    filePath: realFilePath,
    fileName: cleanName,
    mimeType,
    fileSize: file.size,
  };
}

async function filePathToCanvasItem(filePath) {
  const cleanPath = String(filePath || "").trim();
  if (!cleanPath) {
    throw new Error("缺少文件路径");
  }

  const cleanName = getFileNameFromPath(cleanPath);
  if (isExtractableCanvasFile(cleanName, "")) {
    try {
      const response = await fetch("/api/file-text-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: cleanPath,
          fileName: cleanName,
          mimeType: "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.ok && String(payload.text || "").trim()) {
        return {
          kind: "file",
          title: cleanName,
          text: String(payload.text || "").trim(),
          filePath: cleanPath,
          fileName: cleanName,
          mimeType: "",
        };
      }
    } catch {
      // Fall back to metadata-only cards when structured extraction is unavailable.
    }
  }

  const extension = getFileExtension(cleanName);
  return {
    kind: "file",
    title: cleanName,
    text: `${cleanName}\n${extension ? `${extension.toUpperCase()} 文件` : "文件"}\n${cleanPath}`,
    filePath: cleanPath,
    fileName: cleanName,
    mimeType: "",
  };
}

function hasClipboardFiles(dataTransfer) {
  if (!dataTransfer) return false;
  if (Number(dataTransfer.files?.length) > 0) return true;
  return [...(dataTransfer.items || [])].some((item) => item?.kind === "file");
}

async function readClipboardFilePaths() {
  if (!DESKTOP_SHELL?.readClipboardFiles) {
    return [];
  }

  const result = await DESKTOP_SHELL.readClipboardFiles();
  if (!result?.ok) {
    throw new Error(result?.error || "无法读取系统剪贴板中的文件");
  }

  return Array.isArray(result.paths) ? result.paths.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

async function importClipboardFilesFromDesktop() {
  const paths = await readClipboardFilePaths();
  if (!paths.length) {
    return false;
  }

  const items = [];
  for (const filePath of paths) {
    items.push(await filePathToCanvasItem(filePath));
  }

  if (!items.length) {
    return false;
  }

  return upsertCanvasItems(items, "系统剪贴板文件已加入画布");
}

function getDroppedDirectoryItems(dataTransfer) {
  const entries = [];

  for (const item of [...(dataTransfer?.items || [])]) {
    if (typeof item?.webkitGetAsEntry !== "function") continue;
    const entry = item.webkitGetAsEntry();
    if (!entry?.isDirectory) continue;

    entries.push({
      kind: "file",
      title: entry.name || "未命名文件夹",
      text: `文件夹：${entry.name || "未命名文件夹"}\n这是拖入无限画布的目录素材卡。你可以让 AI 基于这个目录继续规划或整理任务。`,
      fileName: `${entry.name || "未命名文件夹"}/`,
      mimeType: "inode/directory",
      isDirectory: true,
      fileSize: 0,
      width: 320,
      height: 180,
    });
  }

  return entries;
}

async function importClipboardOrDroppedData(dataTransfer, source = "paste") {
  if (!dataTransfer) return false;

  const items = [];
  if (source === "drop") {
    items.push(...getDroppedDirectoryItems(dataTransfer));
  }
  const files = [...(dataTransfer.files || [])];

  for (const file of files) {
    items.push(await fileToCanvasItem(file));
  }

  const plainText = String(dataTransfer.getData?.("text/plain") || "").trim();
  if (plainText) {
    items.push({
      kind: "text",
      title: source === "drop" ? "拖拽文本" : "粘贴文本",
      text: plainText,
    });
  }

  if (!items.length) {
    return false;
  }

  return upsertCanvasItems(items, source === "drop" ? "新素材已拖入画布" : "新素材已粘贴到画布");
}

async function readClipboardText() {
  if (DESKTOP_SHELL?.readClipboardText) {
    const result = await DESKTOP_SHELL.readClipboardText();
    if (!result?.ok) {
      throw new Error(result?.error || "无法读取系统剪贴板");
    }
    return String(result.text || "");
  }

  if (navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }

  throw new Error("当前环境不支持读取剪贴板");
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(String(text || ""));
    return;
  }

  throw new Error("当前环境不支持写入剪贴板");
}

async function copyCanvasItemToClipboard(item) {
  const filePath = String(item?.filePath || "").trim();
  if ((item?.kind === "file" || item?.kind === "image") && filePath && DESKTOP_SHELL?.copyFilesToClipboard) {
    const result = await DESKTOP_SHELL.copyFilesToClipboard([filePath]);
    if (result?.ok) {
      return {
        mode: "file",
        count: Number(result.count) || 1,
        text: "",
      };
    }
    if (result?.error) {
      throw new Error(result.error);
    }
  }

  const text =
    item?.kind === "file"
      ? [item.fileName || item.title, item.isDirectory ? "文件夹" : item.mimeType || getCanvasCardIcon(item).badge || "文件", filePath]
          .filter(Boolean)
          .join("\n")
      : item?.kind === "image"
        ? item.fileName || item.title
        : item?.text || item?.fileName || item?.title;
  await writeClipboardText(text);
  return { mode: "text", count: 1, text };
}

async function copyCanvasItemsToClipboard(items = []) {
  const normalizedItems = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!normalizedItems.length) {
    throw new Error("没有可复制的画布内容");
  }

  setAppClipboardPayload({
    source: "canvas",
    text: normalizedItems
      .map((item) => item.text || item.fileName || item.title)
      .filter(Boolean)
      .join("\n\n"),
    items: normalizedItems.map((item) => normalizeAppClipboardItem(item)),
  });

  if (normalizedItems.length === 1) {
    return copyCanvasItemToClipboard(normalizedItems[0]);
  }

  const fileItems = normalizedItems.filter(
    (item) => (item.kind === "file" || item.kind === "image") && String(item.filePath || "").trim()
  );
  if (fileItems.length === normalizedItems.length && fileItems.length && DESKTOP_SHELL?.copyFilesToClipboard) {
    const result = await DESKTOP_SHELL.copyFilesToClipboard(fileItems.map((item) => item.filePath));
    if (result?.ok) {
      return {
        mode: "file",
        count: Number(result.count) || fileItems.length,
        text: "",
      };
    }
  }

  const summaryText =
    normalizedItems
      .map((item) => item.text || item.fileName || item.title)
      .filter(Boolean)
      .join("\n\n") || normalizedItems.map((item) => item.title).join("\n");
  await writeClipboardText(summaryText);
  return {
    mode: "text",
    count: normalizedItems.length,
    text: summaryText,
  };
}

function handleCanvasExternalDrop(items = [], zone = "outside") {
  const normalizedItems = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!normalizedItems.length) return false;

  const clipboardPayload = {
    source: "canvas",
    text: normalizedItems
      .map((item) => item.text || item.fileName || item.title)
      .filter(Boolean)
      .join("\n\n"),
    items: normalizedItems.map((item) => normalizeAppClipboardItem(item)),
  };

  if (zone === "composer") {
    setAppClipboardPayload(clipboardPayload);
    const handled = pasteAppClipboardToComposer(getActiveAppClipboardPayload());
    if (handled) {
      setCanvasStatus("已将素材卡发送到右侧交互区", "success");
      return true;
    }
  }

  copyCanvasItemsToClipboard(normalizedItems)
    .then((result) => {
      setCanvasStatus(
        zone === "screen"
          ? result.mode === "file"
            ? `已复制 ${result.count} 个文件，可在 AI 镜像中粘贴`
            : "已复制到系统剪贴板，可在 AI 镜像中粘贴"
          : result.mode === "file"
            ? `已将${result.count > 1 ? `${result.count} 个` : ""}文件复制到系统剪贴板`
            : "已复制到系统剪贴板"
      );
    })
    .catch((error) => {
      setCanvasStatus(`复制失败：${error.message}`);
    });
  return true;
}

async function captureClipboardEntry(source = "manual") {
  const content = String(await readClipboardText()).trim();
  if (!content) {
    throw new Error("当前剪贴板为空");
  }

  if (state.clipboardStore.items[0]?.content === content) {
    clipboardStatusPillEl.textContent = "最新剪贴板已在队列中";
    return false;
  }

  state.lastClipboardText = content;
  state.clipboardStore.items = [
    {
      id: crypto.randomUUID(),
      content,
      source: source === "auto" ? "auto" : "manual",
      createdAt: Date.now(),
    },
    ...state.clipboardStore.items,
  ].slice(0, state.clipboardStore.maxItems);

  await saveClipboardStore();
  clipboardStatusPillEl.textContent = source === "auto" ? "已自动保存新剪贴板" : "已手动保存到队列";
  return true;
}

async function importClipboardTextToCanvas() {
  const content = String(await readClipboardText()).trim();
  if (!content) {
    throw new Error("当前剪贴板没有可导入的文本");
  }

  upsertCanvasItems(
    [
      {
        kind: "text",
        title: "剪贴板文本",
        text: content,
      },
    ],
    "已把剪贴板文本放入无限画布"
  );
}

function stopClipboardPolling() {
  if (state.clipboardPollTimer) {
    clearInterval(state.clipboardPollTimer);
    state.clipboardPollTimer = null;
  }
}

function startClipboardPolling() {
  stopClipboardPolling();

  if (state.clipboardStore.mode !== "auto") {
    return;
  }

  state.clipboardPollTimer = window.setInterval(async () => {
    try {
      const text = String(await readClipboardText()).trim();
      if (!text || text === state.lastClipboardText) {
        return;
      }

      state.lastClipboardText = text;
      await captureClipboardEntry("auto");
    } catch {
      // Keep polling silent; manual mode remains available even if clipboard polling fails.
    }
  }, CONFIG.clipboardPollIntervalMs);
}

async function loadUiSettings() {
  const cached = readUiSettingsCache();
  try {
    const response = await fetch(API_ROUTES.uiSettings);
    const data = await readJsonResponse(response, "界面设置");

    if (!response.ok || !data.ok) {
      throw new Error(data.details || data.error || "无法读取界面设置");
    }

    state.uiSettings = normalizeUiSettings({
      ...cached,
      ...data,
    });
  } catch (error) {
    state.uiSettings = normalizeUiSettings(cached);
    setStatus(`界面设置读取失败：${error.message}`, "warning");
  }

  writeUiSettingsCache(state.uiSettings);
  applyUiSettings();
}

function buildUiSettingsPayload(overrides = {}) {
  return normalizeUiSettings({
    appName: overrides.appName ?? appNameInput?.value ?? state.uiSettings?.appName,
    appSubtitle: overrides.appSubtitle ?? appSubtitleInput?.value ?? state.uiSettings?.appSubtitle,
    canvasTitle: overrides.canvasTitle ?? canvasTitleInputEl?.value ?? state.uiSettings?.canvasTitle,
    canvasBoardSavePath:
      overrides.canvasBoardSavePath ?? canvasBoardPathInputEl?.value ?? state.uiSettings?.canvasBoardSavePath,
    panelOpacity: overrides.panelOpacity ?? state.uiSettings?.panelOpacity,
    backgroundColor: overrides.backgroundColor ?? state.uiSettings?.backgroundColor,
    backgroundOpacity: overrides.backgroundOpacity ?? state.uiSettings?.backgroundOpacity,
    textColor: overrides.textColor ?? state.uiSettings?.textColor,
    patternColor: overrides.patternColor ?? state.uiSettings?.patternColor,
    buttonColor: overrides.buttonColor ?? state.uiSettings?.buttonColor,
    buttonTextColor: overrides.buttonTextColor ?? state.uiSettings?.buttonTextColor,
    themePreset: overrides.themePreset ?? state.uiSettings?.themePreset,
    sidebarSections: overrides.sidebarSections ?? state.uiSettings?.sidebarSections,
  });
}

function buildThemeSettingsPayload(overrides = {}) {
  return normalizeThemeSettings({
    panelOpacity: overrides.panelOpacity ?? state.uiSettings?.panelOpacity,
    backgroundColor: overrides.backgroundColor ?? state.uiSettings?.backgroundColor,
    backgroundOpacity: overrides.backgroundOpacity ?? state.uiSettings?.backgroundOpacity,
    textColor: overrides.textColor ?? state.uiSettings?.textColor,
    patternColor: overrides.patternColor ?? state.uiSettings?.patternColor,
    buttonColor: overrides.buttonColor ?? state.uiSettings?.buttonColor,
    buttonTextColor: overrides.buttonTextColor ?? state.uiSettings?.buttonTextColor,
    themePreset: overrides.themePreset ?? state.uiSettings?.themePreset,
  });
}

async function saveUiSettings(overrides = {}) {
  const previousCanvasBoardPath = getCanvasBoardSavePath();
  const payload = buildUiSettingsPayload(overrides);
  writeUiSettingsCache(payload);

  const response = await fetch(API_ROUTES.uiSettings, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJsonResponse(response, "界面设置");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "保存界面设置失败");
  }

  state.uiSettings = normalizeUiSettings({
    ...payload,
    ...data,
  });
  writeUiSettingsCache(state.uiSettings);
  applyUiSettings();

  if (getCanvasBoardSavePath() !== previousCanvasBoardPath) {
    try {
      await queueCanvasBoardPersist(true);
      setCanvasStatus("画布已保存到新的文件地址");
    } catch (error) {
      throw new Error(`设置已保存，但新画布地址写入失败：${error.message}`);
    }
  }
}

async function saveThemeSettings(overrides = {}) {
  const themePayload = buildThemeSettingsPayload(overrides);
  writeUiSettingsCache({
    ...state.uiSettings,
    ...themePayload,
  });

  const response = await fetch(API_ROUTES.themeSettings, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(themePayload),
  });
  const data = await readJsonResponse(response, "主题设置");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "保存主题设置失败");
  }

  state.uiSettings = normalizeUiSettings({
    ...state.uiSettings,
    ...themePayload,
    ...data,
  });
  writeUiSettingsCache(state.uiSettings);
  applyUiSettings();
}

function renderCurrentSessionHeader() {
  const session = getCurrentSession();
  const isEditingCurrent = state.editingSessionId && session?.id === state.editingSessionId;

  if (conversationTitleEl) {
    conversationTitleEl.textContent = session?.title || CONFIG.defaultSessionTitle;
    conversationTitleEl.classList.toggle("is-hidden", Boolean(isEditingCurrent));
  }

  if (conversationTitleInputEl) {
    conversationTitleInputEl.classList.toggle("is-hidden", !isEditingCurrent);
    if (isEditingCurrent) {
      conversationTitleInputEl.value = session?.title || CONFIG.defaultSessionTitle;
    }
  }

  renameSessionBtn?.classList.toggle("is-hidden", Boolean(isEditingCurrent));
  saveSessionRenameBtn?.classList.toggle("is-hidden", !isEditingCurrent);
  cancelSessionRenameBtn?.classList.toggle("is-hidden", !isEditingCurrent);
}

function focusSessionRenameInput(sessionId) {
  requestAnimationFrame(() => {
    if (sessionId === state.currentSessionId && conversationTitleInputEl && !conversationTitleInputEl.classList.contains("is-hidden")) {
      conversationTitleInputEl.focus();
      conversationTitleInputEl.select();
      return;
    }

    const inlineInput = historyListEl?.querySelector(`[data-inline-session-input="${sessionId}"]`);
    if (inlineInput) {
      inlineInput.focus();
      inlineInput.select();
    }
  });
}

function getEditingSessionValue(sessionId) {
  if (sessionId === state.currentSessionId && conversationTitleInputEl && !conversationTitleInputEl.classList.contains("is-hidden")) {
    return conversationTitleInputEl.value;
  }

  const inlineInput = historyListEl?.querySelector(`[data-inline-session-input="${sessionId}"]`);
  return inlineInput?.value || "";
}

function getRecentSessions() {
  return state.sessions.slice(0, 4);
}

function getRemainingSessions() {
  return state.sessions.slice(4);
}

function syncOutputModeUi() {
  const label = state.outputMode === "stream" ? "流式输出" : "同步 / 非流式";
  if (outputModeSelect) {
    outputModeSelect.value = state.outputMode;
  }
  if (responseModeLabelEl) {
    responseModeLabelEl.textContent = label;
  }
  if (conversationModePillEl) {
    conversationModePillEl.textContent = label;
  }
}

async function bootstrap() {
  document.body.classList.toggle("desktop-mode", IS_DESKTOP_APP);
  state.activeControlMenu = localStorage.getItem(CONFIG.controlMenuKey) || "overview";
  state.activeRightPanelView = normalizeRightPanelView(localStorage.getItem(CONFIG.rightPanelViewKey));
  await loadUiSettings();
  await loadCanvasBoardFromStorage();
  await loadSessions();
  await loadClipboardStore();

  try {
    await loadPermissions();
  } catch (error) {
    state.permissionStore = getDefaultPermissionStore();
    setStatus(`权限配置读取失败：${error.message}`, "warning");
  }

  if (!state.sessions.length) {
    createSession({ switchTo: true, persist: false });
  } else if (!getCurrentSession()) {
    state.currentSessionId = state.sessions[0].id;
  }

  renderSessions();
  renderCurrentSession();
  renderContextStats();
  renderPermissions();
  renderAllowedRoots();
  renderSystemStats();
  renderCanvasBoard();
  renderRightPanelView();
  setDrawerOpen(false);
  initializePaneLayout();
  await initializeDesktopShell();
  startClipboardPolling();
  autoresize();
  syncComposerOffset();
  observeComposerSize();
  observeScreenSourcePreviewSize();
  observeScreenSourceToolbarSize();
  agentModeToggle.checked = localStorage.getItem(CONFIG.agentModeKey) === "true";
  state.outputMode = localStorage.getItem(CONFIG.outputModeKey) === "stream" ? "stream" : "nonstream";
  syncOutputModeUi();
  updatePromptPlaceholder();
  document.body.classList.remove("app-booting");

  try {
    await loadModelProfiles();
  } catch (error) {
    setStatus(`模型档案读取失败：${error.message}`, "warning");
  }

  try {
    setStatus("正在连接模型服务并读取模型列表");
  const response = await fetch(API_ROUTES.meta);
    const data = await readJsonResponse(response, "模型信息");

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "无法读取模型信息");
    }

    state.provider = data.provider || "ollama";
    state.providerLabel =
      data.providerLabel ||
      (state.provider === "lmstudio"
        ? "LM Studio"
        : state.provider === "bigmodel"
          ? "BigModel"
          : state.provider === "hybrid"
            ? "本地 + BigModel"
            : "Ollama");
    state.supportsRuntimeOptions = data.supportsRuntimeOptions !== false;
    defaultModelEl.textContent = getModelDisplayName(data.defaultModel);
    connectionStatusEl.textContent = "已连接";
    state.hardware = {
      preferredGpuName: data.preferredGpuName || "",
      videoControllers: Array.isArray(data.videoControllers) ? data.videoControllers : [],
    };
    syncProviderCapabilities();

    const models = normalizeModelList(data.models, data.defaultModel);
    state.availableModels = models;
    mergeModelProfiles(models.map((item) => item.name));
    modelSelect.innerHTML = models
      .map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.displayName || getModelDisplayName(item.name))}</option>`)
      .join("");

    const currentSession = getCurrentSession();
    const initialModel = resolveExistingModelSelection(currentSession?.activeModel, models) || data.defaultModel;
    applyModelSelection(initialModel, { announce: false, persistSession: false });

    setStatus(`已连接到 ${state.providerLabel}，发现 ${models.length} 个可用模型`, "success");
  } catch (error) {
    const providerFallbackModel = state.provider === "bigmodel" ? `${CLOUD_MODEL_PREFIX}glm-4.7-flash` : `${LOCAL_MODEL_PREFIX}qwen3.5:4b`;
    const fallbackModels = normalizeModelList([], state.model || providerFallbackModel);
    state.availableModels = fallbackModels;
    modelSelect.innerHTML = fallbackModels
      .map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.displayName || getModelDisplayName(item.name))}</option>`)
      .join("");
    mergeModelProfiles(fallbackModels.map((item) => item.name));
    applyModelSelection(fallbackModels[0]?.name || providerFallbackModel, { announce: false, persistSession: false });
    defaultModelEl.textContent = "不可用";
    connectionStatusEl.textContent = "连接失败";
    setStatus(error.message, "error");
  }
}

function setDrawerOpen(open) {
  state.drawerOpen = Boolean(open);
  if (state.drawerOpen) {
    void setDesktopClickThrough(false);
  }
  insightDrawerEl?.classList.toggle("is-open", state.drawerOpen);
  drawerBackdropEl?.classList.toggle("is-open", state.drawerOpen);
  document.body.classList.toggle("drawer-open", state.drawerOpen);
  conversationSettingsBtn?.setAttribute("aria-expanded", String(state.drawerOpen));
  drawerToggleBtn?.setAttribute("aria-expanded", String(state.drawerOpen));
  insightDrawerHandleEl?.setAttribute("aria-expanded", String(state.drawerOpen));
  insightDrawerEl?.setAttribute("aria-hidden", String(!state.drawerOpen));
  syncEmbeddedWindowOverlayVisibility();
  scheduleDesktopWindowShapeSync();
}

function initializePaneLayout() {
  if (!workspaceEl) return;

  state.leftPanelCollapsed = false;
  state.rightPanelCollapsed = false;
  state.historyExpanded = localStorage.getItem(CONFIG.historyExpandedKey) === "true";

  localStorage.removeItem(CONFIG.leftPanelCollapsedKey);
  localStorage.removeItem(CONFIG.rightPanelCollapsedKey);

  applyPaneWidths({
    left: readPaneWidth(CONFIG.leftPanelWidthKey, CONFIG.leftPanelDefaultWidth),
    right: readPaneWidth(CONFIG.rightPanelWidthKey, CONFIG.rightPanelDefaultWidth),
  });
  loadStagePanelsState();
  applyStagePanelsState({ persist: false });
  syncPaneVisibility();
  scheduleDesktopWindowShapeSync();
}

function setDesktopMenuOpen(open) {
  desktopMenuPanel?.classList.toggle("is-hidden", !open);
  desktopMenuBtn?.setAttribute("aria-expanded", String(Boolean(open)));
  syncEmbeddedWindowOverlayVisibility();
}

function readPaneWidth(storageKey, fallback) {
  const value = Number(localStorage.getItem(storageKey));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clampPaneWidth(value, min, max) {
    return Math.min(Math.max(Number(value) || min, min), max);
  }

function resolveResponsivePaneWidths(left, right) {
  const workspaceWidth = workspaceEl?.clientWidth || Math.max(0, window.innerWidth - 40);
  let leftWidth = clampPaneWidth(left, CONFIG.leftPanelMinWidth, Math.min(CONFIG.leftPanelMaxWidth, workspaceWidth));
  let rightWidth = clampPaneWidth(right, CONFIG.rightPanelMinWidth, Math.min(CONFIG.rightPanelMaxWidth, workspaceWidth));

  const maxCombined = Math.max(0, workspaceWidth);

  let overflow = leftWidth + rightWidth - maxCombined;
  if (overflow > 0) {
    const leftReducible = Math.max(0, leftWidth - CONFIG.leftPanelMinWidth);
    const rightReducible = Math.max(0, rightWidth - CONFIG.rightPanelMinWidth);
    const totalReducible = leftReducible + rightReducible;
    if (totalReducible > 0) {
      const leftShare = leftReducible / totalReducible;
      const leftReduce = Math.min(leftReducible, Math.round(overflow * leftShare));
      leftWidth -= leftReduce;
      overflow -= leftReduce;
      const rightReduce = Math.min(rightReducible, overflow);
      rightWidth -= rightReduce;
      overflow -= rightReduce;
      if (overflow > 0 && leftWidth > CONFIG.leftPanelMinWidth) {
        leftWidth -= Math.min(leftWidth - CONFIG.leftPanelMinWidth, overflow);
      }
    }
  }

  return {
    left: leftWidth,
    right: rightWidth,
  };
}
  
function applyPaneWidths({ left, right }) {
  if (!workspaceEl) return;

  const { left: leftWidth, right: rightWidth } = resolveResponsivePaneWidths(left, right);

  workspaceEl.style.setProperty("--left-panel-width", `${leftWidth}px`);
  workspaceEl.style.setProperty("--right-panel-width", `${rightWidth}px`);

  localStorage.setItem(CONFIG.leftPanelWidthKey, String(leftWidth));
  localStorage.setItem(CONFIG.rightPanelWidthKey, String(rightWidth));
  state.leftPanelCollapsed = leftWidth <= 6;
  state.rightPanelCollapsed = rightWidth <= 6;
  syncPaneVisibility();
  scheduleDesktopWindowShapeSync();
}

function normalizeStagePanelState(input = {}) {
  const normalizeSide = (side) => ({
    x: Number.isFinite(Number(input?.[side]?.x)) ? Number(input[side].x) : 0,
    y: Number.isFinite(Number(input?.[side]?.y)) ? Number(input[side].y) : 0,
    hidden: Boolean(input?.[side]?.hidden),
  });

  return {
    left: normalizeSide("left"),
    right: normalizeSide("right"),
  };
}

function saveStagePanelsState() {
  try {
    localStorage.setItem(CONFIG.stagePanelsKey, JSON.stringify(state.stagePanels));
  } catch {
    // Ignore transient storage failures and keep layout in memory.
  }
}

function clearStagePanelsState() {
  try {
    localStorage.removeItem(CONFIG.stagePanelsKey);
  } catch {
    // Ignore transient storage failures and keep layout in memory.
  }
}

function loadStagePanelsState() {
  if (IS_DESKTOP_APP) {
    clearStagePanelsState();
    state.stagePanels = normalizeStagePanelState();
    return;
  }

  try {
    const raw = localStorage.getItem(CONFIG.stagePanelsKey);
    state.stagePanels = normalizeStagePanelState(raw ? JSON.parse(raw) : {});
  } catch {
    state.stagePanels = normalizeStagePanelState();
  }
}

function clampStagePanelToViewport(side) {
  const panelState = state.stagePanels[side];
  const element = getStagePanelElement(side);
  if (!panelState || !element || panelState.hidden) return;

  const rect = element.getBoundingClientRect();
  const padding = 20;
  const baseLeft = rect.left - panelState.x;
  const baseTop = rect.top - panelState.y;
  const minLeft = padding;
  const maxLeft = Math.max(padding, window.innerWidth - rect.width - padding);
  const minTop = padding;
  const maxTop = Math.max(padding, window.innerHeight - rect.height - padding);
  const nextLeft = Math.min(Math.max(baseLeft + panelState.x, minLeft), maxLeft);
  const nextTop = Math.min(Math.max(baseTop + panelState.y, minTop), maxTop);

  panelState.x = Math.round(nextLeft - baseLeft);
  panelState.y = Math.round(nextTop - baseTop);
}

function getStagePanelElement(side) {
  if (side === "left") return desktopClearStageEl;
  if (side === "right") return conversationPanel;
  return null;
}

function getStagePanelResizer(side) {
  if (side === "left") return leftPaneResizerEl;
  if (side === "right") return rightPaneResizerEl;
  return null;
}

function setStagePanelFront(side) {
  desktopClearStageEl?.classList.toggle("is-stage-front", side === "left");
  conversationPanel?.classList.toggle("is-stage-front", side === "right");
}

function isStagePanelDetached(side) {
  const panel = state.stagePanels?.[side];
  return Boolean(panel?.hidden || panel?.x || panel?.y);
}

function renderStageRestoreDock() {
  const needsRestore =
    state.stagePanels.left.hidden ||
    state.stagePanels.right.hidden ||
    state.stagePanels.left.x !== 0 ||
    state.stagePanels.left.y !== 0 ||
    state.stagePanels.right.x !== 0 ||
    state.stagePanels.right.y !== 0;

  stageRestoreDockEl?.classList.toggle("is-hidden", !needsRestore);
}

function applyStagePanelsState({ persist = true, syncShape = true } = {}) {
  const sides = ["left", "right"];
  for (const side of sides) {
    clampStagePanelToViewport(side);
  }
  for (const side of sides) {
    const panelState = state.stagePanels[side] || { x: 0, y: 0, hidden: false };
    const element = getStagePanelElement(side);
    const resizer = getStagePanelResizer(side);
    element?.style.setProperty("--stage-panel-x", `${panelState.x}px`);
    element?.style.setProperty("--stage-panel-y", `${panelState.y}px`);
    element?.classList.toggle("is-stage-hidden", panelState.hidden);
    resizer?.classList.toggle("is-hidden", isStagePanelDetached(side));
  }

  renderStageRestoreDock();
  if (persist) {
    saveStagePanelsState();
  }
  if (syncShape) {
    scheduleDesktopWindowShapeSync();
  }
}

function restoreDefaultStagePanels() {
  state.leftPanelCollapsed = false;
  state.rightPanelCollapsed = false;
  applyPaneWidths({
    left: CONFIG.leftPanelDefaultWidth,
    right: CONFIG.rightPanelDefaultWidth,
  });
  state.stagePanels = normalizeStagePanelState();
  syncPaneVisibility();
  applyStagePanelsState();
  setStatus("已恢复默认布局", "success");
}

function setStagePanelHidden(side, hidden) {
  if (!state.stagePanels[side]) return;
  state.stagePanels[side].hidden = Boolean(hidden);
  applyStagePanelsState();
}

function resetStagePanelPosition(side) {
  if (!state.stagePanels[side]) return;
  state.stagePanels[side] = { x: 0, y: 0, hidden: false };
  applyStagePanelsState();
}

function beginStagePanelMove(side, event) {
  const element = getStagePanelElement(side);
  const panelState = state.stagePanels[side];
  if (!element || !panelState || panelState.hidden) return;

  event.preventDefault();
  event.stopPropagation();
  setStagePanelFront(side);

  const initialX = panelState.x;
  const initialY = panelState.y;
  const startX = event.clientX;
  const startY = event.clientY;
  const startRect = element.getBoundingClientRect();
  const padding = 20;

  const handleMove = (moveEvent) => {
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    const nextLeft = Math.min(
      Math.max(padding, startRect.left + deltaX),
      Math.max(padding, window.innerWidth - startRect.width - padding)
    );
    const nextTop = Math.min(
      Math.max(padding, startRect.top + deltaY),
      Math.max(padding, window.innerHeight - startRect.height - padding)
    );

    state.stagePanels[side].x = Math.round(initialX + (nextLeft - startRect.left));
    state.stagePanels[side].y = Math.round(initialY + (nextTop - startRect.top));
    applyStagePanelsState({ persist: false, syncShape: false });
  };

  const handleUp = () => {
    document.removeEventListener("pointermove", handleMove);
    document.removeEventListener("pointerup", handleUp);
    document.body.classList.remove("is-resizing");
    document.body.classList.remove("is-stage-dragging");
    saveStagePanelsState();
    scheduleDesktopWindowShapeSync();
  };

  document.body.classList.add("is-stage-dragging");
  document.body.classList.add("is-resizing");
  document.addEventListener("pointermove", handleMove);
  document.addEventListener("pointerup", handleUp, { once: true });
}

function syncPaneVisibility() {
  if (!workspaceEl) return;

  workspaceEl.classList.toggle("left-collapsed", state.leftPanelCollapsed);
  workspaceEl.classList.toggle("right-collapsed", state.rightPanelCollapsed);

  sidePanelEl?.classList.toggle("is-collapsed", state.leftPanelCollapsed);
  conversationPanel?.classList.toggle("is-collapsed", state.rightPanelCollapsed);
  desktopClearStageEl?.classList.toggle("is-pane-collapsed", state.leftPanelCollapsed);
  conversationPanel?.classList.toggle("is-pane-collapsed", state.rightPanelCollapsed);
  leftPaneResizerEl?.classList.toggle("is-hidden", state.leftPanelCollapsed || isStagePanelDetached("left"));
  rightPaneResizerEl?.classList.toggle("is-hidden", state.rightPanelCollapsed || isStagePanelDetached("right"));

  restoreLeftPaneBtn?.classList.toggle("is-hidden", !state.leftPanelCollapsed);
  restoreRightPaneBtn?.classList.toggle("is-hidden", !state.rightPanelCollapsed);
  if (restoreLeftPaneBtn) {
    restoreLeftPaneBtn.textContent = "抽出画板";
  }
  if (restoreRightPaneBtn) {
    restoreRightPaneBtn.textContent = "抽出对话";
  }

  if (toggleLeftPaneBtn) {
    toggleLeftPaneBtn.textContent = state.leftPanelCollapsed ? "展开菜单" : "收起菜单";
  }
  if (toggleRightPaneBtn) {
    toggleRightPaneBtn.textContent = state.rightPanelCollapsed ? "展开对话" : "收起对话";
  }

  localStorage.setItem(CONFIG.leftPanelCollapsedKey, String(state.leftPanelCollapsed));
  localStorage.setItem(CONFIG.rightPanelCollapsedKey, String(state.rightPanelCollapsed));
  scheduleDesktopWindowShapeSync();
}

function setPaneCollapsed(side, collapsed) {
  const next = Boolean(collapsed);
  const currentLeft = readPaneWidth(CONFIG.leftPanelWidthKey, CONFIG.leftPanelDefaultWidth);
  const currentRight = readPaneWidth(CONFIG.rightPanelWidthKey, CONFIG.rightPanelDefaultWidth);

  if (side === "left") {
    applyPaneWidths({
      left: next ? 0 : Math.max(currentLeft, CONFIG.leftPanelDefaultWidth),
      right: currentRight,
    });
    return;
  }

  applyPaneWidths({
    left: currentLeft,
    right: next ? 0 : Math.max(currentRight, CONFIG.rightPanelDefaultWidth),
  });
}

function beginPaneResize(side, startX, pointerId) {
  if (side === "left" && state.leftPanelCollapsed) {
    setPaneCollapsed("left", false);
  }
  if (side === "right" && state.rightPanelCollapsed) {
    setPaneCollapsed("right", false);
  }

  const initialLeft = readPaneWidth(CONFIG.leftPanelWidthKey, CONFIG.leftPanelDefaultWidth);
  const initialRight = readPaneWidth(CONFIG.rightPanelWidthKey, CONFIG.rightPanelDefaultWidth);

  const handleMove = (event) => {
    const deltaX = event.clientX - startX;
    if (side === "left") {
      applyPaneWidths({
        left: initialLeft + deltaX,
        right: initialRight,
      });
      return;
    }

    applyPaneWidths({
      left: initialLeft,
      right: initialRight - deltaX,
    });
  };

  const handleUp = () => {
    document.removeEventListener("pointermove", handleMove);
    document.removeEventListener("pointerup", handleUp);
    document.body.classList.remove("is-resizing");
  };

  if (side === "left") {
    leftPaneResizerEl?.setPointerCapture?.(pointerId);
  } else {
    rightPaneResizerEl?.setPointerCapture?.(pointerId);
  }

  document.body.classList.add("is-resizing");
  document.addEventListener("pointermove", handleMove);
  document.addEventListener("pointerup", handleUp, { once: true });
}

async function initializeDesktopShell() {
  if (!IS_DESKTOP_APP) {
    return;
  }

  desktopShellControlsEl?.classList.remove("is-hidden");
  desktopWindowBarEl?.classList.add("is-visible");
  setDesktopMenuOpen(false);
  removeDesktopShellStateListener?.();
  removeDesktopShellStateListener = DESKTOP_SHELL?.onStateChange?.((nextState) => {
    syncDesktopShellState(nextState);
  });
  await refreshDesktopShellState();
  await setDesktopClickThrough(false);
  scheduleDesktopWindowShapeSync();
}

function applyFullClickThroughUiState(enabled) {
  document.body.classList.toggle("desktop-full-pass-through", Boolean(enabled));

  if (enabled) {
    setDesktopMenuOpen(false);
    setConversationShellMenuOpen(false);
    closeConversationModelMenu();
    setDrawerOpen(false);
  }

  scheduleDesktopWindowShapeSync();
}

function syncDesktopShellState(nextState = {}) {
  const clickThrough = Boolean(nextState?.clickThrough);
  const nextFullClickThrough = clickThrough;

  state.desktopShellState.pinned = Boolean(nextState?.pinned);
  state.desktopShellState.fullscreen = Boolean(nextState?.fullscreen);
  state.desktopShellState.clickThrough = clickThrough;

  if (state.desktopShellState.fullClickThrough !== nextFullClickThrough) {
    state.desktopShellState.fullClickThrough = nextFullClickThrough;
    applyFullClickThroughUiState(nextFullClickThrough);
  }

  desktopPinBtn?.classList.toggle("is-active", state.desktopShellState.pinned);
  desktopFullscreenBtn?.classList.toggle("is-active", state.desktopShellState.fullscreen);
  desktopClickThroughBtn?.classList.toggle("is-active", state.desktopShellState.fullClickThrough);

  if (desktopPinBtn) {
    desktopPinBtn.textContent = state.desktopShellState.pinned ? "取消固定" : "固定";
  }
  if (desktopFullscreenBtn) {
    desktopFullscreenBtn.textContent = state.desktopShellState.fullscreen ? "退出全屏" : "全屏";
  }
  if (desktopClickThroughBtn) {
    desktopClickThroughBtn.textContent = state.desktopShellState.fullClickThrough ? "退出完全穿透" : "完全穿透";
  }

  desktopStatusBannerEl?.classList.toggle("is-hidden", !state.desktopShellState.pinned);
  if (desktopStatusBannerTextEl) {
    desktopStatusBannerTextEl.textContent = state.desktopShellState.pinned ? "固定中 · 始终置顶" : "";
  }
  desktopPassThroughHintEl?.classList.toggle("is-hidden", !state.desktopShellState.fullClickThrough);
  renderConversationShellMenuState();
}

async function refreshDesktopShellState() {
  if (!IS_DESKTOP_APP || !DESKTOP_SHELL?.getState) {
    return;
  }

  try {
    const nextState = await DESKTOP_SHELL.getState();
    syncDesktopShellState(nextState);
  } catch {
    state.desktopShellState = {
      pinned: false,
      fullscreen: false,
      clickThrough: false,
      fullClickThrough: false,
    };
    applyFullClickThroughUiState(false);
    if (desktopPinBtn) {
      desktopPinBtn.textContent = "固定";
    }
    if (desktopFullscreenBtn) {
      desktopFullscreenBtn.textContent = "全屏";
    }
    if (desktopClickThroughBtn) {
      desktopClickThroughBtn.textContent = "完全穿透";
    }
    desktopStatusBannerEl?.classList.add("is-hidden");
    desktopPassThroughHintEl?.classList.add("is-hidden");
    renderConversationShellMenuState();
  }
}

async function setDesktopClickThrough(enabled) {
  if (!IS_DESKTOP_APP || !DESKTOP_SHELL?.setClickThrough) {
    return;
  }

  if (state.desktopShellState.clickThrough === Boolean(enabled)) {
    return;
  }

  desktopSurfaceSyncPromise = desktopSurfaceSyncPromise
    .catch(() => {})
    .then(async () => {
      const nextState = await DESKTOP_SHELL.setClickThrough(enabled);
      syncDesktopShellState(nextState);
    });

  return desktopSurfaceSyncPromise;
}

async function syncDesktopSurfaceInteraction(target, { force = false } = {}) {
  if (!IS_DESKTOP_APP || state.desktopShellState.fullClickThrough) {
    return;
  }

  if (!force && state.desktopShellState.clickThrough === false) {
    return;
  }

  try {
    await setDesktopClickThrough(false);
  } catch {
    // Ignore transient IPC errors during pointer transitions.
  }
}

function getElementShapeRect(element, padding = 0) {
  if (!(element instanceof Element) || element.classList.contains("is-hidden")) {
    return null;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
    return null;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return null;
  }

  const left = Math.max(0, Math.floor(rect.left - padding));
  const top = Math.max(0, Math.floor(rect.top - padding));
  const right = Math.min(window.innerWidth, Math.ceil(rect.right + padding));
  const bottom = Math.min(window.innerHeight, Math.ceil(rect.bottom + padding));

  if (right - left < 2 || bottom - top < 2) {
    return null;
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function collectDesktopWindowShapeRects() {
  if (canvasImageLightboxEl && !canvasImageLightboxEl.classList.contains("is-hidden")) {
    return [
      {
        x: 0,
        y: 0,
        width: Math.max(2, window.innerWidth),
        height: Math.max(2, window.innerHeight),
      },
    ];
  }

  return [
    getElementShapeRect(desktopClearStageEl, 4),
    getElementShapeRect(sidePanelEl, 2),
    getElementShapeRect(leftPaneResizerEl, 2),
    getElementShapeRect(rightPaneResizerEl, 2),
    getElementShapeRect(conversationPanel, 2),
    getElementShapeRect(stageRestoreDockEl, 6),
    getElementShapeRect(desktopShellControlsEl, 6),
    getElementShapeRect(restoreLeftPaneBtn, 6),
    getElementShapeRect(restoreRightPaneBtn, 6),
    getElementShapeRect(insightDrawerHandleEl, 4),
    state.drawerOpen ? getElementShapeRect(insightDrawerEl, 4) : null,
  ].filter(Boolean);
}

async function syncDesktopWindowShape() {
  if (!IS_DESKTOP_APP || !DESKTOP_SHELL?.setWindowShape || state.desktopShellState.fullClickThrough) {
    return;
  }

  try {
    await DESKTOP_SHELL.setWindowShape(collectDesktopWindowShapeRects());
  } catch {
    // Keep the widget usable even if shape sync fails.
  }
}

function scheduleDesktopWindowShapeSync() {
  if (!IS_DESKTOP_APP || state.desktopShellState.fullClickThrough) {
    scheduleEmbeddedScreenSourceSync();
    return;
  }

  if (desktopShapeSyncFrame) {
    window.cancelAnimationFrame(desktopShapeSyncFrame);
  }

  desktopShapeSyncFrame = window.requestAnimationFrame(() => {
    desktopShapeSyncFrame = 0;
    syncDesktopWindowShape();
    scheduleEmbeddedScreenSourceSync();
  });
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();
  const attachmentSnapshot = normalizeComposerAttachments(state.composerAttachments);
  const attachmentPromptPrefix = buildAttachmentPromptPrefix(attachmentSnapshot);
  const finalPromptBody =
    prompt || (attachmentSnapshot.length ? "请先阅读我附加的文件，并根据这些文件回答我的问题。" : "");
  const finalPrompt = [attachmentPromptPrefix, finalPromptBody].filter(Boolean).join("\n\n").trim();
  if (!finalPrompt || state.abortController) return;

  const model = modelSelect.value || state.model;

  if (agentModeToggle.checked) {
    await runAgentModeTask(finalPrompt);
    return;
  }

  if (isDoubaoWebModel(model)) {
    await runDoubaoWebTask(finalPrompt);
    return;
  }

  const session = ensureCurrentSession();
  session.activeModel = model;

  addMessage({ role: "user", content: finalPrompt });
  promptInput.value = "";
  removeCanvasSelectionByIds(attachmentSnapshot.map((item) => item.id));
  clearComposerAttachments();
  autoresize();

  await maybeCompressConversation(session, model);

  const assistantMessage = addMessage({
    role: "assistant",
    content: "",
    model,
    thinkingEnabled: getModelProfile(model).thinkingEnabled,
    deviceMode: isLocalModel(model) ? getModelDeviceMode(model) : "cloud",
    pending: true,
  });
  state.currentAssistantId = assistantMessage.dataset.messageId;
  state.abortController = new AbortController();
  state.activeTaskRoute = "chat";
  setComposerState(true);
  setStatus("回复等待中");

  try {
    if (state.outputMode === "stream") {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: applyThinkingDirective(
            buildPayloadMessages(
              session,
              attachmentSnapshot.map((item) => item.id)
            ),
            model
          ),
          options: buildRequestOptions(model),
        }),
        signal: state.abortController.signal,
      });

      if (!response.ok || !response.body) {
        const errorText = await safeErrorText(response);
        throw new Error(errorText || "聊天请求失败");
      }

      await consumeNdjsonStream(response.body);
      updateAssistantMessage(getCurrentSession()
        ?.messages?.find((item) => item.id === state.currentAssistantId)?.content || "", {
        thinkingContent:
          getCurrentSession()?.messages?.find((item) => item.id === state.currentAssistantId)?.thinkingContent || "",
        pending: false,
      });
    } else {
  const response = await fetch(API_ROUTES.chatOnce, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: applyThinkingDirective(
            buildPayloadMessages(
              session,
              attachmentSnapshot.map((item) => item.id)
            ),
            model
          ),
          options: buildRequestOptions(model),
        }),
        signal: state.abortController.signal,
      });

      const data = await readJsonResponse(response, "聊天");
      if (!response.ok || !data.ok) {
        throw new Error(data.details || data.error || "聊天请求失败");
      }

      updateAssistantMessage(data.message || "模型没有返回内容。", {
        thinkingContent: data.thinking || "",
        pending: false,
      });
    }
    setStatus("回复完成", "success");
  } catch (error) {
    if (error.name === "AbortError") {
      updateAssistantMessage("已停止当前生成。", {
        pending: false,
      });
      setStatus("已停止当前生成", "warning");
    } else {
      updateAssistantMessage(`发生错误：${error.message}`, {
        pending: false,
      });
      setStatus(error.message, "error");
    }
  } finally {
    state.abortController = null;
    state.currentAssistantId = null;
    state.activeTaskRoute = "";
    setComposerState(false);
    persistSessions();
    renderSessions();
    renderContextStats();
  }
});

stopBtn.addEventListener("click", () => {
  if (state.activeTaskRoute === "doubao-web") {
    fetch("/api/doubao-web/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  }
  state.abortController?.abort();
});

composerThinkingBtn?.addEventListener("click", async () => {
  const activeModel = modelSelect?.value || state.model;
  if (!activeModel || !supportsThinkingToggle(activeModel)) return;
  await setThinkingEnabledForActiveModel(!getModelProfile(activeModel).thinkingEnabled);
});

clearBtn.addEventListener("click", async () => {
  if (state.abortController) return;

  const previousSessionId = state.currentSessionId;
  createSession({ switchTo: true });
  await resetDesktopAgentSession(previousSessionId);
  renderSessions();
  renderCurrentSession();
  renderContextStats();
  setStatus("已创建新会话");
});

clearHistoryBtn.addEventListener("click", async () => {
  if (state.abortController) return;
  if (!window.confirm("确定要清空全部会话历史吗？")) return;

  const sessionIds = state.sessions.map((session) => session.id);
  state.sessions = [];
  state.currentSessionId = null;
  createSession({ switchTo: true, persist: false });
  await Promise.all(sessionIds.map((sessionId) => resetDesktopAgentSession(sessionId)));
  persistSessions();
  renderSessions();
  renderCurrentSession();
  renderContextStats();
  setStatus("全部会话历史已清空");
});

agentModeToggle?.addEventListener("change", () => {
  localStorage.setItem(CONFIG.agentModeKey, agentModeToggle.checked ? "true" : "false");
  updatePromptPlaceholder();
  setStatus(
    agentModeToggle.checked
      ? `已开启管家模式，当前将优先使用 ${getModelDisplayName(getPreferredAgentModel())}`
      : "已切换回普通聊天模式"
  );
});

outputModeSelect?.addEventListener("change", () => {
  state.outputMode = outputModeSelect.value === "stream" ? "stream" : "nonstream";
  localStorage.setItem(CONFIG.outputModeKey, state.outputMode);
  syncOutputModeUi();
  setStatus(state.outputMode === "stream" ? "已切换为流式输出" : "已切换为同步 / 非流式", "success");
});

leftPaneResizerEl?.addEventListener("pointerdown", (event) => {
  beginPaneResize("left", event.clientX, event.pointerId);
});

rightPaneResizerEl?.addEventListener("pointerdown", (event) => {
  beginPaneResize("right", event.clientX, event.pointerId);
});

leftPaneResizerEl?.addEventListener("dblclick", () => {
  applyPaneWidths({
    left: CONFIG.leftPanelDefaultWidth,
    right: readPaneWidth(CONFIG.rightPanelWidthKey, CONFIG.rightPanelDefaultWidth),
  });
});

rightPaneResizerEl?.addEventListener("dblclick", () => {
  applyPaneWidths({
    left: readPaneWidth(CONFIG.leftPanelWidthKey, CONFIG.leftPanelDefaultWidth),
    right: CONFIG.rightPanelDefaultWidth,
  });
});

stagePanelDragEls.forEach((triggerEl) => {
  triggerEl.addEventListener("pointerdown", (event) => {
    const side = triggerEl.dataset.stagePanelDrag;
    if (!side) return;
    beginStagePanelMove(side, event);
  });
});

stagePanelActionEls.forEach((actionEl) => {
  actionEl.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const side = actionEl.dataset.stagePanelSide;
    const action = actionEl.dataset.stagePanelAction;
    if (!side || !action) return;
    if (action === "close") {
      setStagePanelHidden(side, true);
      setStatus(`${side === "left" ? "左侧" : "右侧"}面板已关闭，可用“恢复默认布局”找回`, "success");
      return;
    }
    if (action === "reset") {
      resetStagePanelPosition(side);
      setStatus(`${side === "left" ? "左侧" : "右侧"}面板已恢复默认位置`, "success");
    }
  });
});

stageRestoreBtn?.addEventListener("click", () => {
  restoreDefaultStagePanels();
});

toggleLeftPaneBtn?.addEventListener("click", () => {
  setPaneCollapsed("left", !state.leftPanelCollapsed);
});

toggleRightPaneBtn?.addEventListener("click", () => {
  setPaneCollapsed("right", !state.rightPanelCollapsed);
});

conversationShellMoreBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  const willOpen = conversationShellMenuEl?.classList.contains("is-hidden");
  setConversationShellMenuOpen(Boolean(willOpen));
});

conversationSettingsBtn?.addEventListener("click", async (event) => {
  event.preventDefault();
  setConversationShellMenuOpen(false);
  const willOpen = !state.drawerOpen;
  if (willOpen) {
    await suspendScreenSourceForDrawer();
    setDrawerOpen(true);
    return;
  }
  setDrawerOpen(false);
  await resumeScreenSourceAfterDrawerClose();
});

conversationAppRenameTriggerEl?.addEventListener("dblclick", (event) => {
  event.preventDefault();
  event.stopPropagation();
  beginConversationAppRename();
});

conversationAppNameInputEl?.addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    await commitConversationAppRename();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    cancelConversationAppRename();
  }
});

conversationAppNameInputEl?.addEventListener("blur", async () => {
  if (conversationAppNameInputEl.classList.contains("is-hidden")) return;
  await commitConversationAppRename();
});

canvasTitleRenameTriggerEl?.addEventListener("dblclick", (event) => {
  event.preventDefault();
  event.stopPropagation();
  beginCanvasTitleRename();
});

canvasTitleInputEl?.addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    await commitCanvasTitleRename();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    cancelCanvasTitleRename();
  }
});

canvasTitleInputEl?.addEventListener("blur", async () => {
  if (canvasTitleInputEl.classList.contains("is-hidden") || canvasTitleRenameInFlight) return;
  await commitCanvasTitleRename();
});

conversationModelGroupsEl?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-model-option]");
  if (!option) return;
  const modelName = option.dataset.modelOption;
  if (!modelName) return;
  applyModelSelection(modelName, { announce: true, persistSession: true });
  closeConversationModelMenu();
});

conversationModelGuideBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  conversationModelGuideEl?.classList.toggle("is-hidden");
});

conversationShellPinBtn?.addEventListener("click", () => {
  setConversationShellMenuOpen(false);
  desktopPinBtn?.click();
});

conversationShellFullscreenBtn?.addEventListener("click", () => {
  setConversationShellMenuOpen(false);
  desktopFullscreenBtn?.click();
});

conversationShellClickThroughBtn?.addEventListener("click", () => {
  setConversationShellMenuOpen(false);
  desktopClickThroughBtn?.click();
});

conversationShellRefreshBtn?.addEventListener("click", () => {
  setConversationShellMenuOpen(false);
  desktopRefreshBtn?.click();
});

conversationShellCloseBtn?.addEventListener("click", () => {
  setConversationShellMenuOpen(false);
  desktopCloseBtn?.click();
});

restoreLeftPaneBtn?.addEventListener("click", () => {
  setPaneCollapsed("left", false);
});

restoreRightPaneBtn?.addEventListener("click", () => {
  setPaneCollapsed("right", false);
});

desktopRefreshBtn?.addEventListener("click", async () => {
  setDesktopMenuOpen(false);
  if (IS_DESKTOP_APP && DESKTOP_SHELL?.reload) {
    try {
      await DESKTOP_SHELL.reload();
      return;
    } catch (error) {
      setStatus(`刷新界面失败：${error.message}`, "warning");
      return;
    }
  }

  window.location.reload();
});

desktopFullscreenBtn?.addEventListener("click", async () => {
  setDesktopMenuOpen(false);
  if (!DESKTOP_SHELL?.toggleFullscreen) return;

  try {
    await DESKTOP_SHELL.toggleFullscreen();
    await refreshDesktopShellState();
    setStatus("已切换全屏状态", "success");
  } catch (error) {
    setStatus(`切换全屏失败：${error.message}`, "warning");
  }
});

desktopClickThroughBtn?.addEventListener("click", async () => {
  if (!DESKTOP_SHELL?.setClickThrough) return;

  try {
    const nextEnabled = !state.desktopShellState.fullClickThrough;
    state.desktopShellState.fullClickThrough = nextEnabled;
    applyFullClickThroughUiState(nextEnabled);
    const nextState = await DESKTOP_SHELL.setClickThrough(nextEnabled);
    syncDesktopShellState(nextState);
    await refreshDesktopShellState();
    setDesktopMenuOpen(false);
    setStatus(
      nextEnabled
        ? "已开启完全穿透。左右栏已隐藏，按 Ctrl+Shift+X 可退出。"
        : "已退出完全穿透，已恢复正常交互。",
      "success"
    );
  } catch (error) {
    state.desktopShellState.fullClickThrough = false;
    applyFullClickThroughUiState(false);
    setStatus(`切换穿透模式失败：${error.message}`, "warning");
  }
});

desktopPinBtn?.addEventListener("click", async () => {
  if (!DESKTOP_SHELL?.setPinned) return;

  try {
    const nextState = await DESKTOP_SHELL.setPinned(!state.desktopShellState.pinned);
    syncDesktopShellState(nextState);
    setDesktopMenuOpen(false);
    setStatus(state.desktopShellState.pinned ? "已固定到桌面最顶层" : "已解除固定", "success");
  } catch (error) {
    setStatus(`切换置顶失败：${error.message}`, "warning");
  }
});

desktopMinimizeBtn?.addEventListener("click", async () => {
  if (!DESKTOP_SHELL?.minimize) return;

  try {
    setDesktopMenuOpen(false);
    await DESKTOP_SHELL.minimize();
  } catch (error) {
    setStatus(`最小化失败：${error.message}`, "warning");
  }
});

desktopCloseBtn?.addEventListener("click", async () => {
  if (!DESKTOP_SHELL?.close) return;

  try {
    setDesktopMenuOpen(false);
    await DESKTOP_SHELL.close();
  } catch (error) {
    setStatus(`关闭桌面挂件失败：${error.message}`, "warning");
  }
});

saveUiSettingsBtn?.addEventListener("click", async () => {
  try {
    await saveUiSettings();
    setStatus("工作台名称与画布保存地址已保存", "success");
  } catch (error) {
    setStatus(`保存界面设置失败：${error.message}`, "warning");
  }
});

drawerSaveUiSettingsBtn?.addEventListener("click", async () => {
  try {
    await saveUiSettings({
      appName: drawerAppNameInputEl?.value,
      appSubtitle: drawerAppSubtitleInputEl?.value,
      canvasBoardSavePath: drawerCanvasBoardPathInputEl?.value,
    });
    setStatus("工作台名称与画布保存地址已保存", "success");
  } catch (error) {
    setStatus(`保存界面设置失败：${error.message}`, "warning");
  }
});

canvasBoardPathBrowseBtn?.addEventListener("click", async () => {
  if (!DESKTOP_SHELL?.pickCanvasBoardPath) {
    setStatus("当前环境不支持原生文件选择，请直接输入路径", "warning");
    return;
  }

  try {
    const result = await DESKTOP_SHELL.pickCanvasBoardPath({
      defaultPath: canvasBoardPathInputEl?.value || getCanvasBoardSavePath(),
    });
    if (result?.canceled || !result?.filePath) {
      return;
    }

    if (canvasBoardPathInputEl) {
      canvasBoardPathInputEl.value = result.filePath;
    }
  } catch (error) {
    setStatus(`选择画布保存地址失败：${error.message}`, "warning");
  }
});

drawerCanvasBoardPathBrowseBtn?.addEventListener("click", async () => {
  if (!DESKTOP_SHELL?.pickCanvasBoardPath) {
    setStatus("当前环境不支持原生文件选择，请直接输入路径", "warning");
    return;
  }

  try {
    const result = await DESKTOP_SHELL.pickCanvasBoardPath({
      defaultPath: drawerCanvasBoardPathInputEl?.value || getCanvasBoardSavePath(),
    });
    if (result?.canceled || !result?.filePath) {
      return;
    }

    if (drawerCanvasBoardPathInputEl) {
      drawerCanvasBoardPathInputEl.value = result.filePath;
    }
    if (canvasBoardPathInputEl) {
      canvasBoardPathInputEl.value = result.filePath;
    }
    syncCanvasPathActionButtons(result.filePath);
  } catch (error) {
    setStatus(`选择画布保存地址失败：${error.message}`, "warning");
  }
});

canvasBoardPathOpenBtn?.addEventListener("click", async () => {
  const targetPath = canvasBoardPathInputEl?.value || getCanvasBoardSavePath();
  if (!targetPath || !DESKTOP_SHELL?.revealPath) {
    return;
  }

  try {
    const result = await DESKTOP_SHELL.revealPath(targetPath);
    if (result?.ok === false) {
      throw new Error(result.error || "打开路径失败");
    }
  } catch (error) {
    setStatus(`打开画布保存地址失败：${error.message}`, "warning");
  }
});

drawerCanvasBoardPathOpenBtn?.addEventListener("click", async () => {
  const targetPath = drawerCanvasBoardPathInputEl?.value || getCanvasBoardSavePath();
  if (!targetPath || !DESKTOP_SHELL?.revealPath) {
    return;
  }

  try {
    const result = await DESKTOP_SHELL.revealPath(targetPath);
    if (result?.ok === false) {
      throw new Error(result.error || "打开路径失败");
    }
  } catch (error) {
    setStatus(`打开画布保存地址失败：${error.message}`, "warning");
  }
});

canvasBoardPathInputEl?.addEventListener("input", () => {
  const nextValue = String(canvasBoardPathInputEl.value || "").trim();
  if (drawerCanvasBoardPathInputEl && drawerCanvasBoardPathInputEl.value !== nextValue) {
    drawerCanvasBoardPathInputEl.value = nextValue;
  }
  syncCanvasPathActionButtons(nextValue);
});

drawerCanvasBoardPathInputEl?.addEventListener("input", () => {
  const nextValue = String(drawerCanvasBoardPathInputEl.value || "").trim();
  if (canvasBoardPathInputEl && canvasBoardPathInputEl.value !== nextValue) {
    canvasBoardPathInputEl.value = nextValue;
  }
  syncCanvasPathActionButtons(nextValue);
});

sidebarLayoutListEl?.addEventListener("click", (event) => {
  const actionBtn = event.target.closest("[data-layout-action]");
  if (!actionBtn) return;

  const action = actionBtn.dataset.layoutAction;
  const key = actionBtn.dataset.layoutKey;
  const items = [...normalizeSidebarSections(state.uiSettings?.sidebarSections)];
  const index = items.findIndex((item) => item.key === key);
  if (index < 0) return;

  if (action === "toggle") {
    const visibleCount = items.filter((item) => item.visible !== false).length;
    if (items[index].visible !== false && visibleCount <= 1) {
      setStatus("控制菜单至少保留一个板块可见", "warning");
      return;
    }
    items[index] = {
      ...items[index],
      visible: !(items[index].visible !== false),
    };
  }

  if (action === "up" && index > 0) {
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
  }

  if (action === "down" && index < items.length - 1) {
    [items[index + 1], items[index]] = [items[index], items[index + 1]];
  }

  state.uiSettings = normalizeUiSettings({
    ...state.uiSettings,
    sidebarSections: items,
  });
  applyUiSettings();
});

controlMenuTabsEl?.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-control-menu-key]");
  if (!tab) return;
  setActiveControlMenu(tab.dataset.controlMenuKey);
});

canvasZoomInBtn?.addEventListener("click", () => {
  setCanvasScaleContinuous(state.canvasBoard.view.scale * 1.12);
});

canvasZoomOutBtn?.addEventListener("click", () => {
  setCanvasScaleContinuous(state.canvasBoard.view.scale / 1.12);
});

canvasReturnBtn?.addEventListener("click", () => {
  focusNearestCanvasItem();
});

canvasZoomRangeEl?.addEventListener("input", () => {
  const nextScale = Number(canvasZoomRangeEl.value) / 100;
  setCanvasScaleContinuous(nextScale, { persist: false, status: true });
});

canvasZoomRangeEl?.addEventListener("change", () => {
  saveCanvasBoardToStorage();
});

canvasPasteBtn?.addEventListener("click", async () => {
  try {
    await pasteIntoCanvasFromSystemClipboard();
  } catch (error) {
    setCanvasStatus(`导入失败：${error.message}`);
  }
});

canvasResetViewBtn?.addEventListener("click", () => {
  updateCanvasView({
    scale: CONFIG.canvasDefaultScale,
    offsetX: CONFIG.canvasDefaultOffsetX,
    offsetY: CONFIG.canvasDefaultOffsetY,
  });
  setCanvasStatus("画布视图已重置");
});

canvasClearBtn?.addEventListener("click", () => {
  if (!window.confirm("确定要清空整个无限画布吗？")) return;
  state.canvasBoard.items = [];
  renderCanvasBoard();
  saveCanvasBoardToStorage();
  setCanvasStatus("无限画布已清空");
});

canvasViewportEl?.addEventListener("paste", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (isEditableElement(target)) {
    return;
  }

  if (getActiveClipboardZone() !== "canvas") {
    return;
  }

  try {
    const appClipboard = getActiveAppClipboardPayload();
    if (shouldUseAppClipboardPayload(appClipboard, event.clipboardData)) {
      const handledAppPaste = pasteAppClipboardToCanvas(appClipboard);
      if (handledAppPaste) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    const handled = await importClipboardOrDroppedData(event.clipboardData, "paste");
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  } catch (error) {
    setCanvasStatus(`粘贴失败：${error.message}`);
  }
});

canvasViewportEl?.addEventListener("dragover", (event) => {
  event.preventDefault();
  canvasViewportEl.classList.add("is-dragover");
});

canvasViewportEl?.addEventListener("dragstart", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest?.("[data-canvas-item-id]")) {
    event.preventDefault();
  }
});

canvasViewportEl?.addEventListener("dragleave", (event) => {
  if (event.target === canvasViewportEl) {
    canvasViewportEl.classList.remove("is-dragover");
  }
});

canvasViewportEl?.addEventListener("drop", async (event) => {
  event.preventDefault();
  canvasViewportEl.classList.remove("is-dragover");
  try {
    await importClipboardOrDroppedData(event.dataTransfer, "drop");
  } catch (error) {
    setCanvasStatus(`拖拽导入失败：${error.message}`);
  }
});

canvasViewportEl?.addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const currentScale = state.canvasBoard.view.scale;
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    setCanvasScaleContinuous(currentScale * zoomFactor);
  },
  { passive: false }
);

canvasViewportEl?.addEventListener("pointerdown", canvasItemInteractionController.handlePointerDown);
canvasViewportEl?.addEventListener("dblclick", canvasItemInteractionController.handleDoubleClick);
canvasViewportEl?.addEventListener("click", canvasItemInteractionController.handleClick);
canvasViewportEl?.addEventListener("contextmenu", canvasItemInteractionController.handleContextMenu);
document.addEventListener("pointermove", canvasItemInteractionController.handlePointerMove);
window.addEventListener("pointerup", canvasItemInteractionController.handlePointerUp);
window.addEventListener("pointercancel", canvasItemInteractionController.handlePointerUp);

desktopMenuBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  const willOpen = desktopMenuPanel?.classList.contains("is-hidden");
  setDesktopMenuOpen(Boolean(willOpen));
});

document.addEventListener(
  "pointermove",
  (event) => {
    syncDesktopSurfaceInteraction(event.target);
  },
  true
);

document.addEventListener(
  "pointerdown",
  (event) => {
    syncDesktopSurfaceInteraction(event.target, { force: true });
  },
  true
);

document.addEventListener("click", (event) => {
  if (event.target.closest(".conversation-shell-menu-wrap")) return;
  setConversationShellMenuOpen(false);
  if (conversationModelMenuEl?.contains(event.target)) return;
  closeConversationModelMenu();
  if (screenSourceHeaderMenuEl?.contains(event.target)) return;
  closeScreenSourceHeaderMenu();
});

document.addEventListener(
  "focusin",
  (event) => {
    syncDesktopSurfaceInteraction(event.target, { force: true });
  },
  true
);

desktopClearStageEl?.addEventListener("mouseenter", () => {
  syncDesktopSurfaceInteraction(desktopClearStageEl, { force: true });
});

desktopClearStageEl?.addEventListener("pointerdown", () => {
  setStagePanelFront("left");
});

sidePanelEl?.addEventListener("mouseenter", () => {
  syncDesktopSurfaceInteraction(sidePanelEl, { force: true });
});

conversationPanel?.addEventListener("mouseenter", () => {
  syncDesktopSurfaceInteraction(conversationPanel, { force: true });
});

conversationPanel?.addEventListener("pointerdown", () => {
  setStagePanelFront("right");
});

insightDrawerEl?.addEventListener("mouseenter", () => {
  syncDesktopSurfaceInteraction(insightDrawerEl, { force: true });
});

desktopShellControlsEl?.addEventListener("mouseenter", () => {
  syncDesktopSurfaceInteraction(desktopShellControlsEl, { force: true });
});

window.addEventListener("blur", () => {
  if (!state.desktopShellState.fullClickThrough) {
    setDesktopClickThrough(false);
  }
});

window.addEventListener("resize", () => {
  scheduleDesktopWindowShapeSync();
  scheduleEmbeddedScreenSourceSync();
});

renameSessionBtn?.addEventListener("click", () => {
  renameSession(state.currentSessionId);
});

saveSessionRenameBtn?.addEventListener("click", () => {
  commitSessionRename();
});

cancelSessionRenameBtn?.addEventListener("click", () => {
  cancelSessionRename();
});

conversationTitleInputEl?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitSessionRename();
  }
  if (event.key === "Escape") {
    cancelSessionRename();
  }
});

drawerToggleBtn?.addEventListener("click", async () => {
  const willOpen = !state.drawerOpen;
  if (willOpen) {
    await suspendScreenSourceForDrawer();
    setDrawerOpen(true);
    return;
  }
  setDrawerOpen(false);
  await resumeScreenSourceAfterDrawerClose();
});

drawerCloseBtn?.addEventListener("click", () => {
  setDrawerOpen(false);
  resumeScreenSourceAfterDrawerClose();
});

drawerBackdropEl?.addEventListener("click", () => {
  setDrawerOpen(false);
  resumeScreenSourceAfterDrawerClose();
});

insightDrawerHandleEl?.addEventListener("click", async () => {
  const willOpen = !state.drawerOpen;
  if (willOpen) {
    await suspendScreenSourceForDrawer();
    setDrawerOpen(true);
    return;
  }
  setDrawerOpen(false);
  await resumeScreenSourceAfterDrawerClose();
});

refreshStorageBtn?.addEventListener("click", async () => {
  refreshStorageBtn.disabled = true;
  setStatus("正在刷新会话文件占用空间");

  try {
    await refreshStorageUsage();
    renderContextStats();
    setStatus("已刷新历史对话占用空间", "success");
  } catch (error) {
    setStatus(`刷新失败：${error.message}`, "warning");
  } finally {
    refreshStorageBtn.disabled = false;
  }
});

savePermissionsBtn?.addEventListener("click", async () => {
  savePermissionsBtn.disabled = true;
  setStatus("正在保存本地权限配置");

  try {
    await savePermissions();
    setStatus("本地权限配置已保存", "success");
  } catch (error) {
    setStatus(`权限保存失败：${error.message}`, "warning");
  } finally {
    savePermissionsBtn.disabled = false;
  }
});

refreshPermissionsBtn?.addEventListener("click", async () => {
  refreshPermissionsBtn.disabled = true;
  setStatus("正在刷新权限配置");

  try {
    await loadPermissions();
    renderPermissions();
    renderAllowedRoots();
    setStatus("权限配置已刷新", "success");
  } catch (error) {
    setStatus(`权限刷新失败：${error.message}`, "warning");
  } finally {
    refreshPermissionsBtn.disabled = false;
  }
});

refreshSystemBtn?.addEventListener("click", async () => {
  refreshSystemBtn.disabled = true;
  setStatus("正在刷新系统监控信息");

  try {
    await refreshSystemStats();
    renderSystemStats();
    setStatus("系统监控信息已刷新", "success");
  } catch (error) {
    setStatus(`监控刷新失败：${error.message}`, "warning");
  } finally {
    refreshSystemBtn.disabled = false;
  }
});

addRootBtn?.addEventListener("click", async () => {
  const nextRoot = rootPathInput.value.trim();
  if (!nextRoot) return;

  if (!state.permissionStore.allowedRoots.includes(nextRoot)) {
    state.permissionStore.allowedRoots.push(nextRoot);
  }

  renderAllowedRoots();
  rootPathInput.value = "";
  await savePermissions().catch(() => {});
});

promptInput.addEventListener("input", autoresize);
promptInput.addEventListener("focus", () => {
  setActiveClipboardZone("assistant");
});
promptInput.addEventListener("paste", async (event) => {
  if (event.defaultPrevented) {
    return;
  }

  setActiveClipboardZone("assistant");

  try {
    const appClipboard = getActiveAppClipboardPayload();
    if (shouldUseAppClipboardPayload(appClipboard, event.clipboardData) && appClipboard?.source === "canvas") {
      event.preventDefault();
      pasteAppClipboardToComposer(appClipboard);
      return;
    }

    const handled = await importClipboardToComposer(event.clipboardData);
    if (!handled) return;
    event.preventDefault();
  } catch (error) {
    setStatus(`粘贴到右侧交互区失败：${error.message}`, "warning");
  }
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

composerAttachmentsEl?.addEventListener("click", (event) => {
  const removeBtn = event.target.closest("[data-remove-composer-attachment]");
  if (!removeBtn) return;

  removeCanvasSelectionByIds([removeBtn.dataset.removeComposerAttachment]);
  state.composerAttachments = state.composerAttachments.filter(
    (item) => item.id !== removeBtn.dataset.removeComposerAttachment
  );
  renderComposerAttachments();
});

renderComposerAttachments();

canvasViewportEl?.addEventListener("mouseenter", () => {
  setActiveClipboardZone("canvas");
});

canvasViewportEl?.addEventListener("pointerdown", () => {
  setActiveClipboardZone("canvas");
});

canvasViewportEl?.addEventListener(
  "focusin",
  (event) => {
    if (getClipboardZoneFromTarget(event.target) === "canvas") {
      setActiveClipboardZone("canvas");
    }
  },
  true
);

threadViewport?.addEventListener("mouseenter", () => {
  setActiveClipboardZone("assistant");
});

chatForm?.addEventListener("mouseenter", () => {
  setActiveClipboardZone("assistant");
});

chatLog?.addEventListener("mouseenter", () => {
  setActiveClipboardZone("assistant");
});

threadViewport?.addEventListener(
  "focusin",
  (event) => {
    if (getClipboardZoneFromTarget(event.target) === "assistant") {
      setActiveClipboardZone("assistant");
    }
  },
  true
);

chatForm?.addEventListener(
  "focusin",
  (event) => {
    if (getClipboardZoneFromTarget(event.target) === "assistant") {
      setActiveClipboardZone("assistant");
    }
  },
  true
);

screenSourcePanelEl?.addEventListener("mouseenter", () => {
  setActiveClipboardZone("screen");
});

screenSourcePanelEl?.addEventListener("pointerdown", () => {
  setActiveClipboardZone("screen");
});

screenSourceHeaderSlotEl?.addEventListener("mouseenter", () => {
  setActiveClipboardZone("screen");
});

screenSourcePanelEl?.addEventListener(
  "focusin",
  (event) => {
    if (getClipboardZoneFromTarget(event.target) === "screen") {
      setActiveClipboardZone("screen");
    }
  },
  true
);

screenSourceHeaderSlotEl?.addEventListener(
  "focusin",
  (event) => {
    if (getClipboardZoneFromTarget(event.target) === "screen") {
      setActiveClipboardZone("screen");
    }
  },
  true
);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && canvasImageLightboxEl && !canvasImageLightboxEl.classList.contains("is-hidden")) {
    closeCanvasImageLightbox();
    return;
  }

  if (event.key === "Escape" && state.canvasEditingTextId) {
    stopEditingCanvasTextbox();
    return;
  }

  if (event.key === "Escape" && state.drawerOpen) {
    setDrawerOpen(false);
    resumeScreenSourceAfterDrawerClose();
    return;
  }

  if (event.key === "Escape" && desktopMenuPanel && !desktopMenuPanel.classList.contains("is-hidden")) {
    setDesktopMenuOpen(false);
    return;
  }

  if (event.key === "Escape" && state.editingSessionId) {
    cancelSessionRename();
  }
});

document.addEventListener("copy", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const zone = getClipboardZoneFromTarget(target);
  if (zone) {
    setActiveClipboardZone(zone);
  }

  if (zone !== "assistant") {
    return;
  }

  const copiedText = extractConversationCopyText(
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : event.target
  );
  if (!copiedText) {
    return;
  }

  setAppClipboardPayload({
    source: "chat",
    text: copiedText,
  });
});

document.addEventListener("keydown", async (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "c") {
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  const withinCanvas =
    Boolean(target?.closest?.("#canvas-viewport")) ||
    Boolean(target?.closest?.("#canvas-items")) ||
    Boolean(target?.closest?.(".desktop-clear-stage"));
  if (isEditableElement(target) || !withinCanvas) {
    return;
  }

  const selectedItems = getSelectedCanvasItems();
  if (!selectedItems.length) {
    return;
  }

  event.preventDefault();

  try {
    const result = await copySelectedCanvasItems();
    setCanvasStatus(
      result.mode === "file"
        ? `已将${result.count > 1 ? `${result.count} 个` : ""}文件复制到系统剪贴板`
        : "已复制选中的素材卡"
    );
  } catch (error) {
    setCanvasStatus(`复制失败：${error.message}`);
  }
});

document.addEventListener("keydown", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (isEditableElement(target)) {
    return;
  }

  const withinCanvas =
    Boolean(target?.closest?.("#canvas-viewport")) ||
    Boolean(target?.closest?.("#canvas-items")) ||
    getActiveClipboardZone() === "canvas";
  if (!withinCanvas) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "x") {
    if (!state.canvasBoard.selectedIds.length) return;
    event.preventDefault();
    try {
      await cutSelectedCanvasItems();
    } catch (error) {
      setCanvasStatus(`剪切失败：${error.message}`);
    }
    return;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && state.canvasBoard.selectedIds.length) {
    event.preventDefault();
    removeCanvasItemsByIds(state.canvasBoard.selectedIds, `已删除 ${state.canvasBoard.selectedIds.length} 个素材卡`);
  }
});

window.addEventListener("resize", () => {
  closeCanvasContextMenu();
  applyPaneWidths({
    left: readPaneWidth(CONFIG.leftPanelWidthKey, CONFIG.leftPanelDefaultWidth),
    right: readPaneWidth(CONFIG.rightPanelWidthKey, CONFIG.rightPanelDefaultWidth),
  });
  syncPaneVisibility();
  scheduleScreenSourceToolbarLayoutSync();
  scheduleRightPanelWindowSliderSync();
});

window.addEventListener("beforeunload", () => {
  screenSourceEmptyLoader?.destroy?.();
  stopScreenSourceCapture({ announce: false, statusText: "画面映射已停止" });
  stopClipboardPolling();
});

document.addEventListener("pointerdown", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest?.(".canvas-context-menu")) {
    return;
  }
  closeCanvasContextMenu();
});

canvasImageLightboxEl?.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest?.(".canvas-image-lightbox-image")) {
    return;
  }
  closeCanvasImageLightbox();
});

canvasContextMenuEl?.addEventListener("click", async (event) => {
  const actionBtn = event.target.closest("[data-canvas-menu-action]");
  if (!actionBtn) return;
  closeCanvasContextMenu();

  try {
    switch (actionBtn.dataset.canvasMenuAction) {
      case "copy": {
        const result = await copySelectedCanvasItems();
        setCanvasStatus(
          result.mode === "file"
            ? `已将${result.count > 1 ? `${result.count} 个` : ""}文件复制到系统剪贴板`
            : "已复制选中的素材卡"
        );
        break;
      }
      case "cut":
        await cutSelectedCanvasItems();
        break;
      case "delete":
        removeCanvasItemsByIds(state.canvasBoard.selectedIds, `已删除 ${state.canvasBoard.selectedIds.length} 个素材卡`);
        break;
      case "paste":
        await pasteIntoCanvasFromSystemClipboard();
        break;
      default:
        break;
    }
  } catch (error) {
    setCanvasStatus(`画布操作失败：${error.message}`);
  }
});

rightPanelViewTabEls.forEach((tab) => {
  tab.addEventListener("click", () => {
    setActiveRightPanelView(tab.dataset.rightPanelView);
  });
});

for (const button of screenSourceActionButtonEls.refresh) {
  button.addEventListener("click", async () => {
    try {
      if (!state.screenSource.availableSources.length) {
        await refreshScreenSourceTargets({ preserveSelection: true });
      }
      await ensureScreenSourceCapture({ force: Boolean(state.screenSource.stream || state.screenSource.embeddedSourceId) });
      setStatus("AI 镜像已重新建立", "success");
    } catch (error) {
      setStatus(`重新建立 AI 镜像失败：${error.message}`, "warning");
    } finally {
      closeScreenSourceHeaderMenu();
      closeScreenSourceOverflowMenu();
    }
  });
}

screenSourceSelectEl?.addEventListener("change", async () => {
  state.screenSource.selectedSourceId = String(screenSourceSelectEl.value || "").trim();
  const selected = state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId);
  state.screenSource.selectedSourceLabel = selected?.label || selected?.name || "";
  if (state.screenSource.stream || state.screenSource.embeddedSourceId) {
    try {
      await ensureScreenSourceCapture({ force: true });
    } catch (error) {
      setStatus(`切换映射目标失败：${error.message}`, "warning");
      return;
    }
  } else {
    state.screenSource.statusText = state.screenSource.selectedSourceLabel
      ? `已选择 ${state.screenSource.selectedSourceLabel}`
      : "未选择映射目标";
    renderScreenSourceState();
  }
});

screenSourceFitModeSelectEl?.addEventListener("change", async () => {
  const sourceId = String(state.screenSource.selectedSourceId || "").trim();
  if (!sourceId) {
    renderScreenSourceState();
    return;
  }

  const nextFitMode = normalizeScreenSourceFitMode(screenSourceFitModeSelectEl.value);
  updateScreenSourceEmbedPolicy(sourceId, { fitMode: nextFitMode });
  renderScreenSourceState();

  if (state.screenSource.embeddedSourceId === sourceId) {
    try {
      await syncEmbeddedScreenSourceBounds();
      setStatus(`已切换嵌入适配模式：${screenSourceFitModeSelectEl.selectedOptions?.[0]?.textContent || nextFitMode}`, "success");
    } catch (error) {
      setStatus(`切换嵌入适配模式失败：${error.message}`, "warning");
    }
  }
});

screenSourceHeaderMenuEl?.addEventListener("toggle", () => {
  scheduleScreenSourceToolbarLayoutSync();
  syncEmbeddedWindowOverlayVisibility();
});

screenSourceOverflowMenuEl?.addEventListener("toggle", () => {
  syncEmbeddedWindowOverlayVisibility();
});

for (const button of screenSourceActionButtonEls.start) {
  button.addEventListener("click", async () => {
    try {
      if (IS_DESKTOP_APP && !state.screenSource.availableSources.length) {
        await refreshScreenSourceTargets({ preserveSelection: true });
      }
      await ensureScreenSourceCapture({ force: Boolean(state.screenSource.stream || state.screenSource.embeddedSourceId) });
      renderRightPanelView();
    } catch (error) {
      setStatus(`画面映射启动失败：${error.message}`, "warning");
    } finally {
      closeScreenSourceHeaderMenu();
      closeScreenSourceOverflowMenu();
    }
  });
}

for (const button of screenSourceActionButtonEls.stop) {
  button.addEventListener("click", async () => {
    try {
      await stopScreenSourceCapture();
    } finally {
      closeScreenSourceHeaderMenu();
      closeScreenSourceOverflowMenu();
    }
  });
}

modelSelect.addEventListener("change", () => {
  applyModelSelection(modelSelect.value, { announce: true, persistSession: true });
});

contextLimitSelect.addEventListener("change", async () => {
  const activeModel = modelSelect.value || state.model;
  if (!activeModel) return;

  const nextLimit = normalizeStoredContextLimit(contextLimitSelect.value);
  state.modelProfiles[activeModel] = {
    ...getModelProfile(activeModel),
    contextLimit: nextLimit,
  };

  state.contextLimit = nextLimit;
  renderContextStats();

  try {
    await saveModelProfiles();
    setStatus(`已保存 ${activeModel} 的上下文窗口：${nextLimit}`, "success");
  } catch (error) {
    setStatus(`模型档案保存失败：${error.message}`, "warning");
  }
});

deviceModeSelect?.addEventListener("change", async () => {
  const activeModel = modelSelect.value || state.model;
  if (!activeModel) return;

  state.modelProfiles[activeModel] = {
    ...getModelProfile(activeModel),
    deviceMode: deviceModeSelect.value === "cpu" ? "cpu" : "auto",
  };

  try {
    await saveModelProfiles();
    setStatus(
      `已保存 ${getModelDisplayName(activeModel)} 的设备模式：${getDeviceModeLabel(
        getModelDeviceMode(activeModel),
        state.hardware.preferredGpuName
      )}`,
      "success"
    );
  } catch (error) {
    setStatus(`模型档案保存失败：${error.message}`, "warning");
  }
});

thinkingToggle?.addEventListener("change", async () => {
  const activeModel = modelSelect.value || state.model;
  if (!activeModel || !supportsThinkingToggle(activeModel)) return;
  await setThinkingEnabledForActiveModel(thinkingToggle.checked);
});

clipboardModeSelect?.addEventListener("change", async () => {
  state.clipboardStore.mode = clipboardModeSelect.value === "auto" ? "auto" : "manual";

  try {
    await saveClipboardStore();
    startClipboardPolling();
    setStatus(
      state.clipboardStore.mode === "auto" ? "已开启剪贴板自动队列" : "已切换到剪贴板手动存储",
      "success"
    );
  } catch (error) {
    setStatus(`剪贴板模式保存失败：${error.message}`, "warning");
  }
});

clipboardCaptureBtn?.addEventListener("click", async () => {
  try {
    const inserted = await captureClipboardEntry("manual");
    if (inserted) {
      await importClipboardTextToCanvas().catch(() => {});
      setStatus("当前剪贴板已加入保留队列", "success");
    }
  } catch (error) {
    setStatus(`剪贴板保存失败：${error.message}`, "warning");
  }
});

clipboardSaveChatBtn?.addEventListener("click", async () => {
  try {
    const inserted = await captureClipboardEntry("manual");
    if (inserted) {
      setStatus("已从右侧快捷保存当前剪贴板", "success");
    }
  } catch (error) {
    setStatus(`剪贴板保存失败：${error.message}`, "warning");
  }
});

clipboardClearBtn?.addEventListener("click", async () => {
  state.clipboardStore.items = [];

  try {
    await saveClipboardStore();
    clipboardStatusPillEl.textContent = "队列已清空";
    setStatus("剪贴板队列已清空", "success");
  } catch (error) {
    setStatus(`剪贴板清空失败：${error.message}`, "warning");
  }
});

clipboardListEl?.addEventListener("click", async (event) => {
  const copyBtn = event.target.closest("[data-clipboard-copy]");
  if (copyBtn) {
    const item = state.clipboardStore.items.find((entry) => entry.id === copyBtn.dataset.clipboardCopy);
    if (!item) return;

    try {
      await writeClipboardText(item.content);
      setAppClipboardPayload({
        source: "chat",
        text: item.content,
      });
      state.lastClipboardText = item.content;
      setStatus("已将内容复制回系统剪贴板", "success");
    } catch (error) {
      setStatus(`复制失败：${error.message}`, "warning");
    }
    return;
  }

  const removeBtn = event.target.closest("[data-clipboard-remove]");
  if (removeBtn) {
    state.clipboardStore.items = state.clipboardStore.items.filter(
      (entry) => entry.id !== removeBtn.dataset.clipboardRemove
    );

    try {
      await saveClipboardStore();
      setStatus("已从剪贴板队列移除内容", "success");
    } catch (error) {
      setStatus(`剪贴板队列更新失败：${error.message}`, "warning");
    }
  }
});

chatLog.addEventListener("click", async (event) => {
  const suggestionBtn = event.target.closest("[data-suggestion]");
  if (suggestionBtn) {
    promptInput.value = suggestionBtn.dataset.suggestion || "";
    autoresize();
    promptInput.focus();
    return;
  }

  const copyBtn = event.target.closest(".code-copy-btn");
  if (copyBtn) {
    const codeEl = copyBtn.closest(".code-block")?.querySelector("code");
    const codeText = codeEl?.innerText ?? "";
    if (!codeText) return;

    try {
      await navigator.clipboard.writeText(codeText);
      setAppClipboardPayload({
        source: "chat",
        text: codeText,
      });
      copyBtn.textContent = "已复制";
      setTimeout(() => {
        copyBtn.textContent = "复制";
      }, 1200);
    } catch {
      copyBtn.textContent = "复制失败";
      setTimeout(() => {
        copyBtn.textContent = "复制";
      }, 1200);
    }
  }
});

historyListEl.addEventListener("click", (event) => {
  if (state.abortController) return;

  if (event.target.closest("[data-inline-session-input]")) {
    return;
  }

  const saveRenameBtn = event.target.closest("[data-save-session-rename]");
  if (saveRenameBtn) {
    commitSessionRename(saveRenameBtn.dataset.saveSessionRename);
    return;
  }

  const cancelRenameBtn = event.target.closest("[data-cancel-session-rename]");
  if (cancelRenameBtn) {
    cancelSessionRename();
    return;
  }

  const deleteBtn = event.target.closest("[data-delete-session]");
  if (deleteBtn) {
    const sessionId = deleteBtn.dataset.deleteSession;
    deleteSession(sessionId);
    return;
  }

  const renameBtn = event.target.closest("[data-rename-session]");
  if (renameBtn) {
    renameSession(renameBtn.dataset.renameSession);
    return;
  }

  const item = event.target.closest("[data-session-id]");
  if (!item) return;

  switchSession(item.dataset.sessionId);
});

historyListEl.addEventListener("dblclick", (event) => {
  if (state.abortController) return;

  const item = event.target.closest("[data-session-id]");
  if (!item) return;

  renameSession(item.dataset.sessionId);
});

historyListEl.addEventListener("keydown", (event) => {
  const input = event.target.closest("[data-inline-session-input]");
  if (!input) return;

  if (event.key === "Enter") {
    event.preventDefault();
    commitSessionRename(input.dataset.inlineSessionInput);
  }

  if (event.key === "Escape") {
    cancelSessionRename();
  }
});

historyListEl.addEventListener(
  "toggle",
  (event) => {
  const details = event.target.closest(".history-group");
  if (!details) return;

  state.historyExpanded = details.open;
  localStorage.setItem(CONFIG.historyExpandedKey, String(state.historyExpanded));
  },
  true
);

permissionGridEl?.addEventListener("change", (event) => {
  const toggle = event.target.closest("[data-permission-key]");
  if (!toggle) return;

  state.permissionStore.permissions[toggle.dataset.permissionKey] = toggle.checked;
});

allowedRootListEl?.addEventListener("click", (event) => {
  const removeBtn = event.target.closest("[data-remove-root]");
  if (!removeBtn) return;

  state.permissionStore.allowedRoots = state.permissionStore.allowedRoots.filter(
    (root) => root !== removeBtn.dataset.removeRoot
  );
  renderAllowedRoots();
});

document.addEventListener("click", async (event) => {
  if (!event.target.closest(".desktop-shell-menu-wrap")) {
    setDesktopMenuOpen(false);
  }

  const actionBtn = event.target.closest(".control-action-btn");
  if (!actionBtn) return;

  const action = actionBtn.dataset.action;
  const args = {};

  if (actionBtn.dataset.app) {
    args.appName = actionBtn.dataset.app;
  }
  if (actionBtn.dataset.task) {
    args.taskName = actionBtn.dataset.task;
  }

  actionBtn.disabled = true;
  setStatus(`正在执行本地动作：${action}`);

  try {
    const response = await executeControlActionRequest(action, args);
    addMessage({
      role: "assistant",
      content: formatControlResult(response.action, response.result),
    });

    if (action === "system_stats") {
      state.systemStats = response.result;
      renderSystemStats();
    }

    setStatus(`本地动作已完成：${action}`, "success");
  } catch (error) {
    const hint = guidePermissionResolution(error.message);
    const message = hint || error.message;
    addMessage({
      role: "assistant",
      content: `本地动作执行失败：${message}`,
    });
    setStatus(`本地动作失败：${message}`, "warning");
  } finally {
    actionBtn.disabled = false;
  }
});

document.addEventListener("paste", async (event) => {
  if (event.defaultPrevented) {
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  const targetZone = getClipboardZoneFromTarget(target);
  const activeZone = targetZone || getActiveClipboardZone();
  if (
    isEditableElement(target) ||
    target?.closest?.("#canvas-viewport") ||
    target?.closest?.("#screen-source-panel") ||
    target?.closest?.("#screen-source-header-slot") ||
    state.activeRightPanelView === "screen"
  ) {
    return;
  }

  try {
    if (activeZone === "screen") {
      return;
    }

    if (activeZone === "assistant" || target?.closest?.(".conversation-panel")) {
      const appClipboard = getActiveAppClipboardPayload();
      if (shouldUseAppClipboardPayload(appClipboard, event.clipboardData) && pasteAppClipboardToComposer(appClipboard)) {
        event.preventDefault();
        return;
      }

      const handledConversationPaste = await importClipboardToComposer(event.clipboardData);
      if (handledConversationPaste) {
        event.preventDefault();
      }
      return;
    }

    if (activeZone === "canvas") {
      const appClipboard = getActiveAppClipboardPayload();
      if (shouldUseAppClipboardPayload(appClipboard, event.clipboardData) && pasteAppClipboardToCanvas(appClipboard)) {
        event.preventDefault();
        return;
      }

      const handled = await importClipboardOrDroppedData(event.clipboardData, "paste");
      if (handled) {
        event.preventDefault();
      }
    }
  } catch (error) {
    setCanvasStatus(`粘贴失败：${error.message}`);
  }
});

async function consumeNdjsonStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalState = {
    content: "",
    thinkingContent: "",
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      finalState = handleStreamLine(line, finalState);
    }
  }

  if (buffer.trim()) {
    finalState = handleStreamLine(buffer, finalState);
  }

  updateAssistantMessage(finalState.content || (finalState.thinkingContent ? "" : "模型没有返回内容。"), {
    thinkingContent: finalState.thinkingContent,
  });
}

function createSession({ switchTo = true, persist = true } = {}) {
  const now = Date.now();
  const session = {
    id: crypto.randomUUID(),
    title: CONFIG.defaultSessionTitle,
    createdAt: now,
    updatedAt: now,
    activeModel: state.model || "",
    summary: "",
    summaryUpdatedAt: null,
    messages: [],
  };

  state.sessions.unshift(session);

  if (switchTo) {
    state.currentSessionId = session.id;
  }

  if (persist) {
    persistSessions();
  }

  return session;
}

function deleteSession(sessionId) {
  if (!sessionId) return;

  state.sessions = state.sessions.filter((session) => session.id !== sessionId);
  resetDesktopAgentSession(sessionId);

  if (!state.sessions.length) {
    createSession({ switchTo: true, persist: false });
  } else if (state.currentSessionId === sessionId) {
    state.currentSessionId = state.sessions[0].id;
  }

  persistSessions();
  renderSessions();
  renderCurrentSession();
  renderContextStats();
  setStatus("会话已删除");
}

function switchSession(sessionId) {
  if (!sessionId || sessionId === state.currentSessionId) return;

  state.currentSessionId = sessionId;
  const session = getCurrentSession();
  if (session?.activeModel) {
    applyModelSelection(session.activeModel, { announce: false, persistSession: false });
  }
  persistSessions();
  renderSessions();
  renderCurrentSession();
  renderContextStats();
  setStatus("已切换会话");
}

function renameSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;

  state.editingSessionId = session.id;
  renderCurrentSessionHeader();
  renderSessions();
  focusSessionRenameInput(session.id);
}

function cancelSessionRename() {
  state.editingSessionId = null;
  renderCurrentSessionHeader();
  renderSessions();
}

function commitSessionRename(targetSessionId = state.editingSessionId) {
  const session = state.sessions.find((item) => item.id === targetSessionId);
  if (!session) {
    cancelSessionRename();
    return;
  }

  const cleaned = truncate(cleanTitle(getEditingSessionValue(session.id)), 40) || CONFIG.defaultSessionTitle;
  session.title = cleaned;
  touchSession(session);
  state.editingSessionId = null;
  persistSessions();
  renderSessions();
  renderCurrentSessionHeader();
  setStatus("会话名称已更新", "success");
}

function ensureCurrentSession() {
  let session = getCurrentSession();
  if (!session) {
    session = createSession({ switchTo: true, persist: false });
  }
  return session;
}

function getCurrentSession() {
  return state.sessions.find((session) => session.id === state.currentSessionId) || null;
}

function resolveExistingModelSelection(requestedModel, models = []) {
  const requested = String(requestedModel || "").trim();
  if (!requested) return "";

  const exact = models.find((item) => item.name === requested);
  if (exact) return exact.name;

  const requestedRaw = stripRoutedModelName(requested);
  const byRaw = models.find((item) => stripRoutedModelName(item.name) === requestedRaw);
  return byRaw?.name || "";
}

function addMessage({
  role,
  content,
  transient = false,
  model = "",
  thinkingEnabled = null,
  deviceMode = "",
  thinkingContent = "",
  reasoningLabel = "",
  pending = false,
}) {
  const session = ensureCurrentSession();
  clearEmptyState();
  const normalizedAssistantParts =
    role === "assistant"
      ? normalizeAssistantParts(content, thinkingContent, thinkingEnabled !== false)
      : {
          content: String(content || ""),
          thinkingContent: "",
        };

  const message = {
    id: crypto.randomUUID(),
    role,
    content: normalizedAssistantParts.content,
    model: role === "assistant" ? model : "",
    thinkingEnabled: role === "assistant" ? thinkingEnabled : null,
    deviceMode: role === "assistant" ? deviceMode : "",
    thinkingContent: role === "assistant" ? normalizedAssistantParts.thinkingContent : "",
    reasoningLabel: role === "assistant" ? String(reasoningLabel || "").trim() : "",
    pending: role === "assistant" ? Boolean(pending) : false,
    transient,
    summarized: false,
    createdAt: Date.now(),
  };

  session.messages.push(message);
  updateSessionTitle(session, message);
  touchSession(session);
  persistSessions();
  renderSessions();
  renderCurrentSessionHeader();

  const element = appendMessageElement(message);
  renderContextStats();
  scrollThreadToBottom();
  return element;
}

function updateAssistantMessage(content, streamingOrOptions = false, legacyThinkingContent = "") {
  const session = getCurrentSession();
  const targetId = state.currentAssistantId;
  if (!session || !targetId) return;

  const message = session.messages.find((item) => item.id === targetId);
  if (!message) return;

  const options =
    typeof streamingOrOptions === "object" && streamingOrOptions !== null
        ? streamingOrOptions
        : {
            streaming: Boolean(streamingOrOptions),
            thinkingContent: legacyThinkingContent,
          };
  const normalizedAssistantParts = normalizeAssistantParts(
    content,
    options.thinkingContent,
    message.thinkingEnabled !== false
  );

  message.content = normalizedAssistantParts.content;
  message.thinkingContent = normalizedAssistantParts.thinkingContent;
  if (typeof options.reasoningLabel === "string") {
    message.reasoningLabel = options.reasoningLabel.trim();
  }
  message.pending = Boolean(options.pending);
  touchSession(session);
  persistSessions();
  renderSessions();

  const target = chatLog.querySelector(`[data-message-id="${targetId}"]`);
  if (!target) return;

  hydrateMessageElement(target, message, { streaming: Boolean(options.streaming) });
  renderContextStats();
  scrollThreadToBottom();
}

function renderCurrentSession() {
  const session = getCurrentSession();
  chatLog.innerHTML = "";
  renderCurrentSessionHeader();

  if (!session || !session.messages.length) {
    renderEmptyState();
    return;
  }

  for (const message of session.messages) {
    appendMessageElement(message);
  }

  scrollThreadToBottom();
}

function appendMessageElement(message) {
  const fragment = messageTemplate.content.cloneNode(true);
  const messageEl = fragment.querySelector(".message");
  messageEl.dataset.messageId = message.id;
  hydrateMessageElement(messageEl, message);
  chatLog.appendChild(fragment);
  return chatLog.querySelector(`[data-message-id="${message.id}"]`);
}

function hydrateMessageElement(messageEl, message, { streaming = false } = {}) {
  const roleEl = messageEl.querySelector(".message-role");
  const timeEl = messageEl.querySelector(".message-time");
  const badgeEl = messageEl.querySelector(".message-badge");
  const contentEl = messageEl.querySelector(".message-content");

  messageEl.className = "message";
  messageEl.classList.add(message.role);
  roleEl.textContent = message.role === "user" ? "你" : getAppDisplayName();
  timeEl.textContent = formatTime(message.createdAt);
  const badgeParts = [];
  if (message.role === "assistant" && message.model) {
    badgeParts.push(getModelDisplayName(message.model));
  }
  if (message.role === "assistant" && message.deviceMode) {
    badgeParts.push(getDeviceModeLabel(message.deviceMode, state.hardware.preferredGpuName));
  }
  if (message.role === "assistant" && supportsThinkingToggle(message.model)) {
    badgeParts.push(message.thinkingEnabled ? "Thinking" : "No Thinking");
  }
  if (message.summarized) {
    badgeParts.push("已压缩");
  }
  badgeEl.textContent = badgeParts.join(" · ");
  badgeEl.hidden = badgeParts.length === 0;

  setRichMessageContent(contentEl, message.content, {
    streaming,
    thinkingContent: message.thinkingContent,
    reasoningLabel: message.reasoningLabel,
    pending: Boolean(message.pending),
  });
}

function setRichMessageContent(
  container,
  content,
  { streaming = false, thinkingContent = "", reasoningLabel = "", pending = false } = {}
) {
  if (pending && !String(content || "").trim() && !String(thinkingContent || "").trim()) {
    container.innerHTML = `
      <div class="pending-reply" aria-live="polite" aria-label="回复等待中">
        <span class="pending-reply-label">回复等待中</span>
        <span class="pending-reply-dots" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </div>
    `;
    return;
  }

  const html = renderMessageHTML(content || (streaming ? "" : " "), thinkingContent, reasoningLabel);
  container.innerHTML = html || "<p></p>";

  if (streaming) {
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.textContent = " ";
    container.appendChild(cursor);
  }
}

function renderMessageHTML(text, thinkingText = "", reasoningLabel = "") {
  const messageParts = splitThinkingContent(text, thinkingText);
  const chunks = [];

  if (messageParts.thinkingContent) {
    chunks.push(renderThinkingBlock(messageParts.thinkingContent, reasoningLabel || "Thinking"));
  }

  if (messageParts.content) {
    chunks.push(renderStructuredContent(messageParts.content));
  }

  return chunks.join("");
}

function splitThinkingContent(text, thinkingText = "") {
  const source = String(text || "").replace(/\r\n/g, "\n");
  const extractedThinking = [];
  let cleanedContent = "";
  let cursor = 0;
  const thinkingRegex = /<think>([\s\S]*?)(?:<\/think>|$)/gi;
  let thinkingMatch;

  while ((thinkingMatch = thinkingRegex.exec(source))) {
    cleanedContent += source.slice(cursor, thinkingMatch.index);
    extractedThinking.push(String(thinkingMatch[1] || "").trim());
    cursor = thinkingRegex.lastIndex;
  }

  cleanedContent += source.slice(cursor);

  const mergedThinking = [String(thinkingText || "").trim(), ...extractedThinking]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join("\n\n")
    .trim();

  return {
    content: cleanedContent.trim(),
    thinkingContent: mergedThinking,
  };
}

function normalizeAssistantParts(content, thinkingText = "", allowThinking = true) {
  const parts = splitThinkingContent(content, thinkingText);
  return {
    content: parts.content,
    thinkingContent: allowThinking ? parts.thinkingContent : "",
  };
}

function renderThinkingBlock(text, label = "Thinking") {
  const body = renderStructuredContent(text);
  if (!body) return "";

  return `
    <section class="thinking-block">
      <div class="thinking-head">
        <span class="thinking-dot"></span>
        <span>${escapeHtml(label)}</span>
      </div>
      <div class="thinking-body">${body}</div>
    </section>
  `;
}

function renderStructuredContent(text) {
  const source = String(text || "").replace(/\r\n/g, "\n");
  const regex = /```([\w.+-]*)\n?([\s\S]*?)```/g;
  const chunks = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(source))) {
    const plain = source.slice(lastIndex, match.index);
    if (plain.trim()) {
      chunks.push(renderTextBlocks(plain));
    }

    const language = (match[1] || "").trim();
    const code = match[2].replace(/\n$/, "");
    chunks.push(renderCodeBlock(code, language));
    lastIndex = regex.lastIndex;
  }

  const tail = source.slice(lastIndex);
  if (tail.trim()) {
    chunks.push(renderTextBlocks(tail));
  }

  if (!chunks.length && source) {
    return renderTextBlocks(source);
  }

  return chunks.join("");
}

function renderTextBlocks(text) {
  const blocks = text
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean);

  return blocks.map((block) => renderTextBlock(block)).join("");
}

function renderTextBlock(block) {
  const lines = block.split("\n").filter((line) => line.length > 0);
  if (!lines.length) return "";

  if (lines.every((line) => /^\s*[-*•]\s+/.test(line))) {
    return `<ul>${lines
      .map((line) => `<li>${renderInlineText(line.replace(/^\s*[-*•]\s+/, ""))}</li>`)
      .join("")}</ul>`;
  }

  if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
    return `<ol>${lines
      .map((line) => `<li>${renderInlineText(line.replace(/^\s*\d+\.\s+/, ""))}</li>`)
      .join("")}</ol>`;
  }

  const heading = lines[0].match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
    const level = Math.min(heading[1].length + 2, 5);
    return `<h${level}>${renderInlineText(heading[2])}</h${level}>`;
  }

  return `<p>${lines.map((line) => renderInlineText(line)).join("<br>")}</p>`;
}

function renderInlineText(text) {
  const tokens = String(text).split(/(`[^`]+`)/g);

  return tokens
    .map((token) => {
      if (/^`[^`]+`$/.test(token)) {
        return `<code class="inline-code">${escapeHtml(token.slice(1, -1))}</code>`;
      }

      return applyBasicMarkup(escapeHtml(token));
    })
    .join("");
}

function applyBasicMarkup(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function renderCodeBlock(code, language) {
  const safeLang = sanitizeLanguage(language);
  const highlighted = highlightCode(code, safeLang);
  const displayLang = safeLang || "code";

  return `
    <section class="code-block">
      <div class="code-toolbar">
        <span class="code-lang">${escapeHtml(displayLang)}</span>
        <button class="code-copy-btn" type="button">复制</button>
      </div>
      <pre><code class="hljs ${safeLang ? `language-${safeLang}` : ""}">${highlighted}</code></pre>
    </section>
  `;
}

function highlightCode(code, language) {
  const hljs = window.hljs;
  const plain = escapeHtml(code);

  if (!hljs) return plain;

  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }

    return hljs.highlightAuto(code).value;
  } catch {
    return plain;
  }
}

function sanitizeLanguage(language) {
  return String(language || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9#+.-]/g, "");
}

function setComposerState(isBusy) {
  sendBtn.disabled = isBusy;
  stopBtn.disabled = !isBusy;
  clearBtn.disabled = isBusy;
  clearHistoryBtn.disabled = isBusy;
  if (refreshStorageBtn) {
    refreshStorageBtn.disabled = isBusy;
  }
  if (savePermissionsBtn) {
    savePermissionsBtn.disabled = isBusy;
  }
  if (refreshPermissionsBtn) {
    refreshPermissionsBtn.disabled = isBusy;
  }
  if (refreshSystemBtn) {
    refreshSystemBtn.disabled = isBusy;
  }
  if (addRootBtn) {
    addRootBtn.disabled = isBusy;
  }
  if (agentModeToggle) {
    agentModeToggle.disabled = isBusy;
  }
  if (saveUiSettingsBtn) {
    saveUiSettingsBtn.disabled = isBusy;
  }
  if (renameSessionBtn) {
    renameSessionBtn.disabled = isBusy;
  }
  if (saveSessionRenameBtn) {
    saveSessionRenameBtn.disabled = isBusy;
  }
  if (cancelSessionRenameBtn) {
    cancelSessionRenameBtn.disabled = isBusy;
  }
  if (toggleLeftPaneBtn) {
    toggleLeftPaneBtn.disabled = isBusy;
  }
  if (toggleRightPaneBtn) {
    toggleRightPaneBtn.disabled = isBusy;
  }
  modelSelect.disabled = isBusy;
  if (deviceModeSelect) {
    deviceModeSelect.disabled = isBusy || !supportsRuntimeOptionsForModel(state.model);
  }
  if (outputModeSelect) {
    outputModeSelect.disabled = isBusy;
  }
  contextLimitSelect.disabled = isBusy;
  sendBtn.textContent = isBusy ? "生成中" : "发送";
  historyListEl.classList.toggle("is-disabled", isBusy);
}

function setStatus(text, tone = "") {
  statusTextEl.textContent = text;
  statusPillEl.classList.remove("status-error", "status-success", "status-warning");

  if (tone === "error") {
    statusPillEl.classList.add("status-error");
  }
  if (tone === "success") {
    statusPillEl.classList.add("status-success");
  }
  if (tone === "warning") {
    statusPillEl.classList.add("status-warning");
  }
}

function getPermissionMeta(permissionKey) {
  return PERMISSION_META.find((item) => item.key === permissionKey) || null;
}

function extractDisabledPermission(errorMessage) {
  const match = String(errorMessage || "").match(/Permission "([^"]+)" is disabled/);
  return match?.[1] || "";
}

function guidePermissionResolution(errorMessage) {
  const permissionKey = extractDisabledPermission(errorMessage);
  if (!permissionKey) return null;

  const meta = getPermissionMeta(permissionKey);
  const label = meta?.name || permissionKey;

  if (permissionAttentionTimer) {
    clearTimeout(permissionAttentionTimer);
  }

  permissionsSectionEl?.classList.add("is-attention");

  const targetItem = permissionGridEl
    ?.querySelector(`[data-permission-key="${permissionKey}"]`)
    ?.closest(".permission-item");
  targetItem?.classList.add("is-attention");

  setDrawerOpen(true);
  window.setTimeout(() => {
    permissionsSectionEl?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, 120);

  permissionAttentionTimer = setTimeout(() => {
    permissionsSectionEl?.classList.remove("is-attention");
    permissionGridEl
      ?.querySelectorAll(".permission-item.is-attention")
      .forEach((item) => item.classList.remove("is-attention"));
  }, 2600);

  return `需要先开启「${label}」权限，并点击“保存权限”`;
}

function renderEmptyState() {
  chatLog.innerHTML = `
    <div class="empty-state" data-empty-state="true">
      <div class="empty-state-card">
        <h3>${escapeHtml(getAppDisplayName())} 已就绪</h3>
        <p>你可以先把文本、图片、文件贴到左侧无限画布，再在这里对话；右侧控制菜单负责模型、历史、剪贴板和设置。</p>
        <div class="suggestion-grid">
          <button class="suggestion-btn" type="button" data-suggestion="请总结这段代码的职责、输入输出和潜在风险。">
            <strong>代码分析</strong>
            <span>梳理模块职责、关键逻辑和风险点。</span>
          </button>
          <button class="suggestion-btn" type="button" data-suggestion="帮我把下面的需求整理成可执行的开发任务列表。">
            <strong>任务拆解</strong>
            <span>把模糊需求整理成开发步骤和优先级。</span>
          </button>
          <button class="suggestion-btn" type="button" data-suggestion="请根据这个主题，起草一版简洁专业的邮件内容。">
            <strong>文本起草</strong>
            <span>生成邮件、文案或产品说明初稿。</span>
          </button>
          <button class="suggestion-btn" type="button" data-suggestion="请给我一个调试方案，包含排查步骤、观察指标和可能根因。">
            <strong>问题排查</strong>
            <span>输出可执行的调试路径和定位思路。</span>
          </button>
          <button class="suggestion-btn" type="button" data-suggestion="帮我把桌面上的文件按类型整理一下。">
            <strong>桌面整理</strong>
            <span>在本地管家模式下自动改写成可执行桌面动作。</span>
          </button>
          <button class="suggestion-btn" type="button" data-suggestion="帮我看一下现在电脑的 CPU、内存和磁盘占用。">
            <strong>系统监控</strong>
            <span>把自然语言请求转成本地系统状态查询。</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function clearEmptyState() {
  const emptyState = chatLog.querySelector('[data-empty-state="true"]');
  if (emptyState) {
    emptyState.remove();
  }
}

function renderSessionItem(session) {
  const active = session.id === state.currentSessionId;
  const editing = session.id === state.editingSessionId;
  const preview = escapeHtml(getSessionPreview(session));

  if (editing) {
    return `
      <article class="history-item ${active ? "is-active" : ""} is-editing" data-session-id="${session.id}">
        <div class="history-main">
          <input
            class="panel-input history-title-input"
            type="text"
            maxlength="40"
            value="${escapeHtml(session.title)}"
            data-inline-session-input="${session.id}"
          />
          <div class="history-preview">${preview}</div>
        </div>
        <div class="history-meta">
          <span>${formatRelativeTime(session.updatedAt)}</span>
          <div class="history-actions">
            <button class="history-rename" type="button" data-save-session-rename="${session.id}">保存</button>
            <button class="history-delete" type="button" data-cancel-session-rename="${session.id}">取消</button>
          </div>
        </div>
      </article>
    `;
  }

  return `
    <article class="history-item ${active ? "is-active" : ""}" data-session-id="${session.id}">
      <div class="history-main">
        <div class="history-title">${escapeHtml(session.title)}</div>
        <div class="history-preview">${preview}</div>
      </div>
      <div class="history-meta">
        <span>${formatRelativeTime(session.updatedAt)}</span>
        <div class="history-actions">
          <button class="history-rename" type="button" data-rename-session="${session.id}">重命名</button>
          <button class="history-delete" type="button" data-delete-session="${session.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderSessions() {
  const sessions = [...state.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  state.sessions = sessions;

  historyCountEl.textContent = `${sessions.length} 个会话`;
  if (historySummaryEl) {
    const latestSession = sessions[0];
    historySummaryEl.textContent = latestSession
      ? `${truncate(latestSession.title || CONFIG.defaultSessionTitle, 18)} · ${truncate(getSessionPreview(latestSession), 22)}`
      : "暂无会话";
  }

  if (!sessions.length) {
    historyListEl.innerHTML = `
      <div class="history-empty">还没有历史会话。</div>
    `;
    return;
  }

  const recentSessions = getRecentSessions();
  const remainingSessions = getRemainingSessions();
  const shouldOpenAll = state.historyExpanded || remainingSessions.some((session) => session.id === state.currentSessionId);

  historyListEl.innerHTML = `
    <section class="history-group-card">
      <div class="history-group-head">
        <div class="eyebrow">Recent</div>
        <strong class="panel-title">最近会话</strong>
      </div>
      <div class="history-group-list">
        ${recentSessions.map((session) => renderSessionItem(session)).join("")}
      </div>
    </section>
    ${
      remainingSessions.length
        ? `
      <details class="history-group" ${shouldOpenAll ? "open" : ""}>
        <summary class="history-group-summary">
          <div>
            <div class="eyebrow">Archive</div>
            <strong class="panel-title">全部会话</strong>
          </div>
          <span class="secondary-menu-indicator">${remainingSessions.length} 条</span>
        </summary>
        <div class="history-group-list history-group-list-all">
          ${remainingSessions.map((session) => renderSessionItem(session)).join("")}
        </div>
      </details>
    `
        : ""
    }
  `;
}

function renderContextStats() {
  const session = getCurrentSession();
  const stats = getContextStats(session);
  const storageRows = getStorageRows();

  contextSummaryEl.textContent = `${stats.used} / ${state.contextLimit} tokens`;
  contextUsedEl.textContent = String(stats.used);
  contextRemainingEl.textContent = String(stats.remaining);
  messageCountEl.textContent = String(stats.activeMessages.length);
  contextRatioEl.textContent = `${Math.round(stats.ratio)}%`;
  contextProgressEl.style.width = `${stats.ratio}%`;

  budgetCardEl.classList.remove("progress-warning", "progress-danger");
  if (stats.ratio >= 90) {
    budgetCardEl.classList.add("progress-danger");
  } else if (stats.ratio >= 75) {
    budgetCardEl.classList.add("progress-warning");
  }

  if (!storageRows.length) {
    contextBreakdownEl.innerHTML = `
      <div class="usage-row">
        <div class="snippet">当前还没有历史对话写入会话文件。</div>
        <div class="token">0 B</div>
      </div>
    `;
    return;
  }

  const rows = [
    `
      <div class="usage-row summary-row">
        <div>
          <div class="label">会话文件总占用</div>
          <div class="snippet">sessions.json</div>
          <div class="sub-snippet">${escapeHtml(state.storageInfo.file || "D:\\FreeFlow-WorkBoard\\data\\sessions.json")}</div>
        </div>
        <div class="token">${formatBytes(state.storageInfo.fileSizeBytes)}</div>
      </div>
    `,
    ...storageRows.map((row) => `
      <div class="usage-row ${row.id === state.currentSessionId ? "summary-row" : ""}">
        <div>
          <div class="label">${row.id === state.currentSessionId ? "当前会话" : "历史会话"}</div>
          <div class="snippet">${escapeHtml(row.title)}</div>
        </div>
        <div class="token">${formatBytes(row.bytes)}</div>
      </div>
    `),
  ];

  contextBreakdownEl.innerHTML = rows.join("");
}

function renderPermissions() {
  permissionGridEl.innerHTML = PERMISSION_META.map((item) => {
    const enabled = Boolean(state.permissionStore.permissions[item.key]);
    return `
      <label class="permission-item" data-permission-item="${item.key}">
        <div class="permission-meta">
          <div class="permission-name">${item.name}</div>
          <div class="permission-desc">${item.description}</div>
        </div>
        <input type="checkbox" data-permission-key="${item.key}" ${enabled ? "checked" : ""} />
      </label>
    `;
  }).join("");
}

function renderAllowedRoots() {
  if (!state.permissionStore.allowedRoots.length) {
    allowedRootListEl.innerHTML = `
      <div class="usage-row">
        <div class="snippet">当前还没有授权目录。</div>
      </div>
    `;
    return;
  }

  allowedRootListEl.innerHTML = state.permissionStore.allowedRoots
    .map((root) => `
      <div class="root-row">
        <div class="snippet">${escapeHtml(root)}</div>
        <button class="remove-root-btn" type="button" data-remove-root="${escapeHtml(root)}">移除</button>
      </div>
    `)
    .join("");
}

function renderSystemStats() {
  if (!state.systemStats) {
    systemStatsEl.innerHTML = `
      <div class="stat-row">
        <div class="snippet">点击“刷新监控”后显示 CPU、内存、磁盘实时状态。</div>
      </div>
    `;
    return;
  }

  const mem = state.systemStats.memory || {};
  const firstDisk = state.systemStats.disks?.[0];

  systemStatsEl.innerHTML = `
    <div class="stat-row">
      <div class="snippet">CPU 占用</div>
      <div class="token">${state.systemStats.cpuPercent}%</div>
    </div>
    <div class="stat-row">
      <div class="snippet">内存占用</div>
      <div class="token">${formatBytes(mem.usedBytes || 0)} / ${formatBytes(mem.totalBytes || 0)}</div>
    </div>
    <div class="stat-row">
      <div class="snippet">主磁盘 ${firstDisk?.device || ""}</div>
      <div class="token">${firstDisk ? `${formatBytes(firstDisk.usedBytes)} / ${formatBytes(firstDisk.sizeBytes)}` : "无"}</div>
    </div>
    <div class="stat-row">
      <div class="snippet">系统运行时长</div>
      <div class="token">${formatDuration(state.systemStats.uptimeSeconds || 0)}</div>
    </div>
  `;
}

function getContextStats(session) {
  const activeMessages = session
    ? session.messages.filter((item) => !item.transient && !item.summarized && item.content.trim())
    : [];

  const summaryTokens = session?.summary ? estimateTokens(session.summary) + CONFIG.summaryOverhead : 0;
  const hasContext = summaryTokens > 0 || activeMessages.length > 0;
  const used = hasContext
    ? summaryTokens +
      CONFIG.contextOverhead +
      activeMessages.reduce((total, item) => total + estimateTokens(item.content) + CONFIG.messageOverhead, 0)
    : 0;
  const remaining = Math.max(state.contextLimit - used, 0);
  const ratio = state.contextLimit ? Math.min((used / state.contextLimit) * 100, 100) : 0;

  return {
    used,
    remaining,
    ratio,
    summaryTokens,
    activeMessages,
  };
}

function getStorageRows() {
  return [...state.sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((session) => ({
      id: session.id,
      title: session.title || CONFIG.defaultSessionTitle,
      bytes: estimateSessionBytes(session),
    }));
}

async function loadPermissions() {
  const response = await fetch("/api/permissions");
  const data = await readJsonResponse(response, "权限配置");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "无法读取权限配置");
  }

  state.permissionStore = {
    file: data.file || "",
    desktopDir: data.desktopDir || "",
    workspaceDir: data.workspaceDir || "",
    permissions: { ...(data.permissions || {}) },
    allowedRoots: Array.isArray(data.allowedRoots) ? data.allowedRoots : [],
  };
}

async function loadModelProfiles() {
  const response = await fetch("/api/model-profiles");
  const data = await readJsonResponse(response, "模型档案");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "无法读取模型档案");
  }

  const normalized = sanitizeModelProfilesMap(data.profiles);
  state.modelProfiles = normalized.profiles;

  if (normalized.changed) {
    saveModelProfiles().catch(() => {});
  }
}

async function saveModelProfiles() {
  const response = await fetch("/api/model-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profiles: state.modelProfiles,
    }),
  });
  const data = await readJsonResponse(response, "模型档案");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "无法保存模型档案");
  }

  state.modelProfiles = sanitizeModelProfilesMap(data.profiles).profiles;
}

function mergeModelProfiles(modelNames) {
  let changed = false;

  for (const modelName of modelNames) {
    const normalized = normalizeModelProfileEntry(modelName, state.modelProfiles[modelName]);
    if (
      !state.modelProfiles[modelName] ||
      Number(state.modelProfiles[modelName].contextLimit) !== normalized.contextLimit ||
      state.modelProfiles[modelName].deviceMode !== normalized.deviceMode ||
      Boolean(state.modelProfiles[modelName].thinkingEnabled) !== normalized.thinkingEnabled
    ) {
      state.modelProfiles[modelName] = normalized;
      changed = true;
    }
  }

  if (changed) {
    saveModelProfiles().catch(() => {});
  }
}

async function savePermissions() {
  const response = await fetch("/api/permissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      permissions: state.permissionStore.permissions,
      allowedRoots: state.permissionStore.allowedRoots,
    }),
  });
  const data = await readJsonResponse(response, "权限配置");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "无法保存权限配置");
  }

  state.permissionStore = {
    file: data.file || "",
    desktopDir: data.desktopDir || "",
    workspaceDir: data.workspaceDir || "",
    permissions: { ...(data.permissions || {}) },
    allowedRoots: Array.isArray(data.allowedRoots) ? data.allowedRoots : [],
  };

  renderPermissions();
  renderAllowedRoots();
}

async function refreshSystemStats() {
  const response = await fetch("/api/system/stats");
  const data = await readJsonResponse(response, "系统监控");

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "无法获取系统监控信息");
  }

  state.systemStats = data.stats;
}

async function executeControlActionRequest(action, args = {}) {
  const response = await fetch("/api/control/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
  const data = await readJsonResponse(response, `本地动作 ${action}`);

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "本地动作执行失败");
  }

  return data;
}

async function resetDesktopAgentSession(sessionId) {
  const cleanSessionId = String(sessionId || "").trim();
  if (!cleanSessionId) return;

  await fetch("/api/desktop-agent/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: cleanSessionId }),
  }).catch(() => {});
}

function formatDesktopAgentTraceEntry(entry, index) {
  const stepLabel = entry?.step ? `Step ${entry.step}` : `Log ${index + 1}`;

  switch (entry?.type) {
    case "user_input":
      return `- 输入任务：${entry.preview || "无内容"}`;
    case "step_start":
      return `- ${stepLabel}：开始推理`;
    case "model_request":
      return `- ${stepLabel}：请求模型 ${entry.model || state.model}`;
    case "model_response":
      return `- ${stepLabel}：模型返回 ${entry.preview || "(空)"}`;
    case "tool_call":
      return `- ${stepLabel}：调用工具 ${entry.toolName || "unknown"} -> ${JSON.stringify(entry.args || {})}`;
    case "tool_result": {
      const status = entry?.result?.status || "ok";
      const reason = entry?.result?.reason ? `，原因：${entry.result.reason}` : "";
      const preview = entry?.result?.preview ? `，摘要：${entry.result.preview}` : "";
      return `- ${stepLabel}：工具 ${entry.toolName || "unknown"} 返回 ${status}${reason}${preview}`;
    }
    case "model_error":
      return `- ${stepLabel}：模型请求失败：${entry.message || "未知错误"}`;
    case "model_timeout":
      return `- ${stepLabel}：模型请求超时：${entry.message || "等待模型返回过久"}`;
    case "forced_stop":
      return `- 中断：${entry.message || "已触发最大步数限制"}`;
    case "validation":
      return `- 校验：${entry.message || "输入无效"}`;
    default:
      return `- ${stepLabel}：${JSON.stringify(entry)}`;
  }
}

function formatDesktopAgentConversation(reply, trace = []) {
  const lines = ["桌面 Agent 执行记录："];

  if (Array.isArray(trace) && trace.length) {
    lines.push(...trace.map((entry, index) => formatDesktopAgentTraceEntry(entry, index)));
  } else {
    lines.push("- 本轮没有记录到工具执行轨迹。");
  }

  lines.push("", "最终回复：", String(reply || "桌面 Agent 未返回有效内容。"));
  return lines.join("\n");
}

async function consumeDesktopAgentStream(stream, { model }) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let trace = [];
  let finalPayload = null;
  let lastHeartbeatMs = 0;

  const renderProgress = (message = "") => {
    const heartbeatLine = lastHeartbeatMs
      ? `- 运行中：${Math.max(1, Math.round(lastHeartbeatMs / 1000))} 秒，桌面 Agent 仍在工作`
      : "";
    const progressReply = message || "桌面 Agent 正在执行中...";
    const content = formatDesktopAgentConversation(progressReply, trace);
    updateAssistantMessage(heartbeatLine ? `${content}\n${heartbeatLine}` : content);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if (event.type === "status") {
        renderProgress(event.message || "桌面 Agent 已开始执行");
        continue;
      }

      if (event.type === "heartbeat") {
        lastHeartbeatMs = Number(event.elapsedMs) || lastHeartbeatMs;
        renderProgress(event.message || "桌面 Agent 仍在执行中");
        setStatus(`桌面 Agent 执行中：${Math.max(1, Math.round(lastHeartbeatMs / 1000))} 秒`, "warning");
        continue;
      }

      if (event.type === "trace" && event.entry) {
        trace = [...trace, event.entry];
        renderProgress("桌面 Agent 正在规划或执行工具...");
        continue;
      }

      if (event.type === "final") {
        finalPayload = event;
        trace = Array.isArray(event.trace) ? event.trace : trace;
        updateAssistantMessage(formatDesktopAgentConversation(event.reply, trace));
        return event;
      }

      if (event.type === "error") {
        throw new Error(event.error || "桌面 Agent 执行失败");
      }
    }
  }

  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer.trim());
      if (event.type === "final") {
        finalPayload = event;
      } else if (event.type === "error") {
        throw new Error(event.error || "桌面 Agent 执行失败");
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
    }
  }

  if (!finalPayload) {
    throw new Error(`桌面 Agent 未返回最终结果：${model}`);
  }

  return finalPayload;
}

async function runAgentModeTask(prompt) {
  const model = getPreferredAgentModel();
  const session = ensureCurrentSession();
  const flowSteps = [
    `接收用户请求：${truncate(String(prompt || "").trim(), 80) || "空请求"}`,
    `切换到管家模型：${getModelDisplayName(model)}`,
    "读取当前会话上下文并理解用户意图",
  ];
  const syncAgentFlow = (content, extraOptions = {}) => {
    updateAssistantMessage(content, {
      pending: Boolean(extraOptions.pending),
      thinkingContent: buildExecutionFlowText(flowSteps),
      reasoningLabel: "执行流",
    });
  };

  addMessage({ role: "user", content: prompt });
  promptInput.value = "";
  autoresize();

      const placeholder = addMessage({
        role: "assistant",
        content: `管家模式已接收任务，正在用 ${getModelDisplayName(model)} 理解你的意图...`,
        model,
        thinkingEnabled: getModelProfile(model).thinkingEnabled,
        deviceMode: isLocalModel(model) ? getModelDeviceMode(model) : "cloud",
    thinkingContent: buildExecutionFlowText(flowSteps),
    reasoningLabel: "执行流",
    pending: true,
  });
  state.currentAssistantId = placeholder.dataset.messageId;
  state.abortController = new AbortController();
  state.activeTaskRoute = "agent";
  setComposerState(true);
  setStatus(`管家模式正在处理任务：${getModelDisplayName(model)}`);

  try {
    syncAgentFlow(`管家模式已接收任务，正在用 ${getModelDisplayName(model)} 理解你的意图...`, {
      pending: true,
    });
    const decision = await rewriteAgentTask(prompt, session, model);

    if (!decision || !decision.mode) {
      throw new Error("模型没有返回有效的管家决策");
    }

    if (decision.mode === "clarify") {
      flowSteps.push("判定结果：信息不足，需要向用户追问");
      syncAgentFlow(decision.reply || "我还需要你补充一点信息，才能继续处理这个任务。");
      setStatus("管家模式需要补充信息", "warning");
      return;
    }

      if (decision.mode === "reply") {
        flowSteps.push("判定结果：这是对话请求，直接给出自然语言回复");
        if (isLocalModel(model)) {
          flowSteps.push("当前由本地模型负责对话理解与任务规划");
        }
        syncAgentFlow(decision.reply || "我理解了你的问题，当前不需要实际执行电脑动作。");
        setStatus(`管家模式已回复：${getModelDisplayName(model)}`, "success");
        return;
      }

    const rewrittenTask = String(decision.task || "").trim();
    if (!rewrittenTask) {
      throw new Error("模型决定执行动作，但没有返回标准命令");
    }

    flowSteps.push(`判定结果：需要执行本地动作`);
    flowSteps.push(`规划命令：${rewrittenTask}`);
    if (isLocalModel(model)) {
      flowSteps.push("当前由本地模型负责意图理解与动作规划");
      if (/^(分析界面|识别文字|点击按钮)/.test(rewrittenTask)) {
        flowSteps.push("视觉识别阶段将调用云端视觉模型执行截图理解与定位");
      }
    }
    syncAgentFlow(
      `${decision.reply || "我已经理解你的请求，准备执行本地动作。"}\n\n规划命令：${rewrittenTask}\n\n正在执行本地动作...`,
      { pending: true }
    );

    const response = await fetch("/api/agent/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: rewrittenTask,
      }),
      signal: state.abortController.signal,
    });
    const data = await readJsonResponse(response, "管家模式");

    if (!response.ok || !data.ok) {
      throw new Error(data.details || data.error || "管家模式执行失败");
    }

    if (!data.planned) {
      flowSteps.push("执行层反馈：标准命令未被本地控制器识别");
      syncAgentFlow(data.message || "当前管家模式无法解析这个任务。");
      setStatus("管家模式未能解析任务", "warning");
      return;
    }

    flowSteps.push(`执行动作：${data.action}`);
    flowSteps.push("执行完成，正在整理结果回复");
    syncAgentFlow(
      `${decision.reply || "我已经完成这个任务。"}\n\n规划命令：${rewrittenTask}\n\n执行结果：\n${formatControlResult(
        data.action,
        data.result
      )}`
    );
    if (data.action === "system_stats") {
      state.systemStats = data.result;
      renderSystemStats();
    }
    setStatus(`管家模式已完成任务：${getModelDisplayName(model)}`, "success");
  } catch (error) {
    if (error.name === "AbortError") {
      flowSteps.push("任务被用户中止");
      syncAgentFlow("管家模式已停止当前任务。");
      setStatus("已停止当前管家模式任务", "warning");
    } else {
      const hint = guidePermissionResolution(error.message);
      const message = hint || error.message;
      flowSteps.push(`执行失败：${message}`);
      syncAgentFlow(`管家模式执行失败：${message}`);
      setStatus(`管家模式失败：${message}`, "warning");
    }
  } finally {
    state.abortController = null;
    state.currentAssistantId = null;
    state.activeTaskRoute = "";
    setComposerState(false);
  }
}

async function runDoubaoWebTask(prompt) {
  if (!IS_DESKTOP_APP) {
    throw new Error("豆包网页版桥接只在桌面版可用，请使用 npm run start:desktop 启动。");
  }

  const model = modelSelect.value || state.model || DOUBAO_WEB_MODEL;
  const session = ensureCurrentSession();
  session.activeModel = model;

  addMessage({ role: "user", content: prompt });
  promptInput.value = "";
  autoresize();

  const assistantMessage = addMessage({
    role: "assistant",
    content: "正在激活豆包网页版...",
    model,
    deviceMode: "browser",
  });
  state.currentAssistantId = assistantMessage.dataset.messageId;
  state.abortController = new AbortController();
  state.activeTaskRoute = "doubao-web";
  setComposerState(true);
  setStatus("正在通过后端调用豆包网页版");

  const abortHandler = () => {
    fetch("/api/doubao-web/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  };
  state.abortController.signal.addEventListener("abort", abortHandler, { once: true });

  try {
    updateAssistantMessage("后端正在打开豆包网页、输入消息并等待回复...");
    const response = await fetch("/api/doubao-web/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        timeoutMs: 120000,
      }),
      signal: state.abortController.signal,
    });
    const result = await readJsonResponse(response, "豆包网页版");

    if (!response.ok) {
      throw new Error(result?.error || "豆包网页版接口调用失败");
    }

    if (!result?.ok) {
      if (result?.aborted || state.abortController.signal.aborted) {
        throw new DOMException("豆包网页调用已取消", "AbortError");
      }
      const stage = result?.stage ? `阶段：${result.stage}。` : "";
      throw new Error(`${stage}${result?.error || "豆包网页调用失败"}`);
    }

    updateAssistantMessage(result.reply || "豆包网页没有返回可读取内容。");
    setStatus(result.partial ? "豆包网页版返回了部分回答" : "豆包网页版回复完成", "success");
  } catch (error) {
    if (error.name === "AbortError") {
      updateAssistantMessage("已停止当前豆包网页任务。");
      setStatus("已停止当前豆包网页任务", "warning");
    } else {
      const message = formatDoubaoBridgeError(error);
      updateAssistantMessage(`豆包网页调用失败：${message}`);
      setStatus(`豆包网页失败：${message}`, "warning");
    }
  } finally {
    state.abortController = null;
    state.currentAssistantId = null;
    state.activeTaskRoute = "";
    setComposerState(false);
    persistSessions();
    renderSessions();
    renderContextStats();
  }
}

function formatDoubaoBridgeError(error) {
  const raw = String(error?.message || error || "").trim();
  if (!raw) {
    return "未知错误";
  }

  if (
    raw.includes("No handler registered for 'desktop-shell:chat-with-doubao'") ||
    raw.includes("No handler registered for \"desktop-shell:chat-with-doubao\"")
  ) {
    return "桌面主进程还是旧版本。请完整关闭桌面版窗口后重新执行 npm run start:desktop，再试一次。";
  }

  if (
    raw.includes("No handler registered for 'desktop-shell:open-doubao-window'") ||
    raw.includes("No handler registered for 'desktop-shell:cancel-doubao-chat'")
  ) {
    return "豆包网页桥接尚未载入到 Electron 主进程。请完整重启桌面版。";
  }

  if (raw.includes("网页没有接受自动输入")) {
    return "已找到豆包输入框，但当前网页控件没有接受自动输入。需要继续兼容豆包当前网页编辑器。";
  }

  return raw;
}

function formatControlResult(action, result) {
  switch (action) {
    case "system_stats":
      return [
        "本地系统监控结果：",
        `- CPU: ${result.cpuPercent}%`,
        `- 内存: ${formatBytes(result.memory.usedBytes)} / ${formatBytes(result.memory.totalBytes)}`,
        ...(result.disks || []).map(
          (disk) => `- 磁盘 ${disk.device}: ${formatBytes(disk.usedBytes)} / ${formatBytes(disk.sizeBytes)}`
        ),
      ].join("\n");
    case "organize_desktop":
      return `桌面整理完成。\n已移动 ${result.movedCount} 个文件。`;
    case "launch_app":
      return `已打开应用：${result.launched}`;
    case "close_app":
      return `已关闭应用：${result.closed}`;
    case "list_windows":
      return `窗口列表：\n${(result.windows || [])
        .map((item) => `- ${item.title || "(无标题)"} [${item.processName}]`)
        .join("\n") || "未发现可用窗口"}`;
    case "focus_window":
      return `已聚焦窗口：${result.title || result.query}\n进程：${result.processName || "未知"}`;
    case "analyze_window_ui":
      return [
        `界面理解完成：${result.window?.title || "当前窗口"}`,
        result.analysis || "视觉模型没有返回说明。",
      ].join("\n\n");
    case "recognize_window_text":
      return [
        `文字识别完成：${result.window?.title || "当前窗口"}`,
        `OCR 引擎：${result.engine || "未知"}`,
        result.text || "没有识别到可用文字。",
      ].join("\n\n");
    case "click_window_element":
      return [
        `已点击界面元素：${result.target || "未命名目标"}`,
        `窗口：${result.window?.title || "当前窗口"}`,
        `坐标：(${result.x}, ${result.y})`,
        result.reason ? `定位说明：${result.reason}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "read_file":
      return `已读取文件：${result.path}\n\n${result.content}`;
    case "write_file":
      return `已写入文件：${result.path}\n写入大小：${formatBytes(result.bytesWritten)}`;
    case "list_directory":
      return `目录内容：${result.path}\n${result.entries.map((entry) => `- [${entry.type}] ${entry.name}`).join("\n")}`;
    case "keyboard_text":
      return `已发送键盘文本输入。`;
    case "mouse_click":
      return `已执行鼠标点击：(${result.x}, ${result.y})`;
    case "run_script":
      return `脚本执行完成。\n${result.stdout || result.stderr || "无输出"}`;
    case "repair_task":
      return `修复任务已执行：${result.task}\n${result.stdout || result.stderr || "无输出"}`;
    default:
      return JSON.stringify(result, null, 2);
  }
}

async function maybeCompressConversation(session, model) {
  if (!session || state.compressionInFlight) return false;

  const stats = getContextStats(session);
  if (stats.ratio < CONFIG.compressionTriggerRatio * 100) return false;

  const unsummarized = session.messages.filter((item) => !item.transient && !item.summarized && item.content.trim());
  if (unsummarized.length <= CONFIG.keepRecentMessages) return false;

  const candidates = unsummarized.slice(0, -CONFIG.keepRecentMessages);
  if (candidates.length < CONFIG.minMessagesToCompress) return false;

  state.compressionInFlight = true;
  setStatus("正在压缩早期对话上下文");

  try {
  const response = await fetch(API_ROUTES.chatOnce, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        options: buildRequestOptions(model, {
          temperature: 0.2,
        }),
        messages: applyThinkingDirective(
          [
            {
              role: "system",
              content:
                "你是对话压缩器。请把已有对话总结成供另一个模型继续工作的上下文摘要。保留用户目标、限制条件、关键事实、已做决定、未解决问题、文件名或代码线索。不要回答问题，不要扩展内容，输出简洁中文项目符号。",
            },
            {
              role: "user",
              content: buildSummaryPrompt(session.summary, candidates),
            },
          ],
          model
        ),
      }),
    });

    const data = await readJsonResponse(response, "对话压缩");
    if (!response.ok || !data.ok || !data.message?.trim()) {
      throw new Error(data.details || data.error || "摘要压缩失败");
    }

    session.summary = data.message.trim();
    session.summaryUpdatedAt = Date.now();

    for (const item of candidates) {
      item.summarized = true;
    }

    touchSession(session);
    persistSessions();
    renderSessions();
    renderCurrentSession();
    setStatus("早期对话已压缩", "success");
    return true;
  } catch (error) {
    setStatus(`对话压缩失败：${error.message}`, "warning");
    return false;
  } finally {
    state.compressionInFlight = false;
  }
}

function buildPayloadMessages(session, canvasItemIds = []) {
  const messages = [];
  const canvasContext = buildCanvasSelectionContext(
    Array.isArray(canvasItemIds) && canvasItemIds.length ? canvasItemIds : state.canvasBoard.selectedIds
  );

  if (session?.summary) {
    messages.push({
      role: "system",
      content: `以下是当前会话的运行摘要，请作为上下文继续处理：\n${session.summary}`,
    });
  }

  if (canvasContext) {
    messages.push({
      role: "system",
      content: `以下是左侧无限画布中当前选中的素材卡，请优先把它们作为本次回复的上下文：\n${canvasContext}`,
    });
  }

  messages.push(
    ...session.messages
      .filter((item) => !item.transient && !item.summarized && item.content.trim())
      .map(({ role, content }) => ({ role, content }))
  );

  return messages;
}

function buildSummaryPrompt(existingSummary, messages) {
  const messageText = messages
    .map((item) => `[${item.role === "user" ? "用户" : getAppDisplayName()}] ${item.content}`)
    .join("\n\n");

  return `已有摘要：
${existingSummary || "暂无"}

请将下面这些较早消息压缩进新的运行摘要：
${messageText}

要求：
- 输出简洁项目符号
- 保留目标、限制、已确认决定、未解决事项
- 如涉及代码或文件，保留文件名、接口名、关键参数
- 不要添加原文中没有的信息`;
}

function updateSessionTitle(session, message) {
  if (message.role !== "user") return;
  if (session.title !== CONFIG.defaultSessionTitle) return;

  const title = truncate(cleanTitle(message.content), CONFIG.maxTitleLength);
  session.title = title || CONFIG.defaultSessionTitle;
}

function cleanTitle(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/[`*_#>-]/g, "")
    .trim();
}

function touchSession(session) {
  session.updatedAt = Date.now();
  state.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

function getSessionPreview(session) {
  const latest = [...session.messages].reverse().find((item) => item.content.trim());
  if (latest) return truncate(latest.content.replace(/\s+/g, " ").trim(), 44);
  if (session.summary) return truncate(`摘要: ${session.summary}`, 44);
  return "空会话";
}

function scrollThreadToBottom() {
  requestAnimationFrame(() => {
    threadViewport.scrollTop = threadViewport.scrollHeight;
  });
}

function autoresize() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 220)}px`;
  syncComposerOffset();
}

function syncComposerOffset() {
  if (!conversationPanel || !chatForm) return;

  const composerOffset = chatForm.offsetHeight + 30;
  conversationPanel.style.setProperty("--composer-offset", `${composerOffset}px`);
}

function observeComposerSize() {
  if (!window.ResizeObserver || !chatForm) return;

  const observer = new ResizeObserver(() => {
    syncComposerOffset();
  });

  observer.observe(chatForm);
  window.addEventListener("resize", syncComposerOffset);
}

function observeScreenSourcePreviewSize() {
  if (!window.ResizeObserver || !screenSourcePreviewShellEl) return;

  const observer = new ResizeObserver(() => {
    scheduleEmbeddedScreenSourceSync();
  });

  observer.observe(screenSourcePreviewShellEl);
}

function observeScreenSourceToolbarSize() {
  if (!window.ResizeObserver || !screenSourceToolbarEl) return;

  const observer = new ResizeObserver(() => {
    scheduleScreenSourceToolbarLayoutSync();
  });

  observer.observe(screenSourceToolbarEl);
  if (screenSourcePanelEl) {
    observer.observe(screenSourcePanelEl);
  }
}

async function safeErrorText(response) {
  try {
    const payload = await readJsonResponse(response);
    return payload.details || payload.error;
  } catch {
    try {
      const text = await response.text();
      return text.slice(0, 160);
    } catch {
      return "";
    }
  }
}

function handleStreamLine(line, currentState) {
  if (!line.trim()) return currentState;

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return currentState;
  }

  const chunk = String(parsed.message?.content ?? "");
  const thinkingChunk = String(parsed.message?.thinking ?? "");
  if (!chunk && !thinkingChunk) return currentState;

  const nextState = {
    content: mergeStreamText(currentState.content, chunk),
    thinkingContent: mergeStreamText(currentState.thinkingContent, thinkingChunk),
  };

  updateAssistantMessage(nextState.content, {
    streaming: true,
    thinkingContent: nextState.thinkingContent,
  });
  return nextState;
}

function mergeStreamText(currentText, incomingChunk) {
  const current = String(currentText || "");
  const incoming = String(incomingChunk || "");

  if (!incoming) return current;
  if (!current) return incoming;
  if (incoming === current) return current;
  if (incoming.startsWith(current)) return incoming;
  if (current.endsWith(incoming)) return current;

  const maxOverlap = Math.min(current.length, incoming.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (current.slice(-size) === incoming.slice(0, size)) {
      return current + incoming.slice(size);
    }
  }

  return current + incoming;
}

function estimateTokens(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  if (!compact) return 0;

  const cjkChars = (compact.match(/[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g) || []).length;
  const otherChars = Math.max(compact.length - cjkChars, 0);
  return Math.max(1, Math.round(cjkChars * 1.08 + otherChars / 3.6));
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(value) {
  const diff = Date.now() - value;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;

  return new Date(value).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

async function loadSessions() {
  try {
  const response = await fetch(API_ROUTES.sessions);
    const data = await readJsonResponse(response, "会话文件");

    if (!response.ok || !data.ok) {
      throw new Error(data.details || data.error || "无法读取会话文件");
    }

    const normalizedSessions = normalizeSessions(data.sessions);
    applyStorageInfo(data);

    if (!normalizedSessions.length) {
      const migrated = migrateLegacyLocalSessions();
      if (migrated) {
        state.sessions = migrated.sessions;
        state.currentSessionId = migrated.currentSessionId;
        await persistSessions(true);
        setStatus("已将旧浏览器会话迁移到本地文件", "success");
        return;
      }
    }

    state.sessions = normalizedSessions;
    state.currentSessionId = data.currentSessionId || normalizedSessions[0]?.id || null;
  } catch (error) {
    state.sessions = [];
    state.currentSessionId = null;
    setStatus(`会话文件读取失败：${error.message}`, "warning");
  }
}

function persistSessions(immediate = false) {
  if (state.persistTimer) {
    clearTimeout(state.persistTimer);
    state.persistTimer = null;
  }

  const run = () => {
    const payload = {
      currentSessionId: state.currentSessionId,
      sessions: state.sessions,
    };

    state.persistPromise = state.persistPromise
      .catch(() => {})
      .then(() =>
        fetch(API_ROUTES.sessions, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) {
            throw new Error(data.details || data.error || "会话文件写入失败");
          }

          applyStorageInfo(data);
        })
      )
      .catch((error) => {
        setStatus(`会话保存失败：${error.message}`, "warning");
      });
  };

  if (immediate) {
    run();
    return state.persistPromise;
  }

  state.persistTimer = setTimeout(run, 250);
  return state.persistPromise;
}

function normalizeSessions(input) {
  return Array.isArray(input)
    ? input
        .map((session) => ({
          id: session.id || crypto.randomUUID(),
          title: session.title || CONFIG.defaultSessionTitle,
          createdAt: Number(session.createdAt) || Date.now(),
          updatedAt: Number(session.updatedAt) || Date.now(),
          activeModel: typeof session.activeModel === "string" ? session.activeModel : "",
          summary: session.summary || "",
          summaryUpdatedAt: session.summaryUpdatedAt ? Number(session.summaryUpdatedAt) : null,
          messages: Array.isArray(session.messages)
            ? session.messages.map((message) => {
                const role = message.role === "assistant" ? "assistant" : "user";
                const normalizedAssistantParts =
                  role === "assistant"
                    ? normalizeAssistantParts(
                        String(message.content || ""),
                        typeof message.thinkingContent === "string" ? message.thinkingContent : "",
                        message.thinkingEnabled !== false
                      )
                    : {
                        content: String(message.content || ""),
                        thinkingContent: "",
                      };

                  return {
                    id: message.id || crypto.randomUUID(),
                    role,
                    content: normalizedAssistantParts.content,
                    model: typeof message.model === "string" ? message.model : "",
                    thinkingContent: normalizedAssistantParts.thinkingContent,
                    reasoningLabel: typeof message.reasoningLabel === "string" ? message.reasoningLabel : "",
                    thinkingEnabled:
                      typeof message.thinkingEnabled === "boolean" ? message.thinkingEnabled : null,
                    deviceMode: typeof message.deviceMode === "string" ? message.deviceMode : "",
                  transient: Boolean(message.transient),
                  summarized: Boolean(message.summarized),
                  createdAt: Number(message.createdAt) || Date.now(),
                };
              })
            : [],
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    : [];
}

async function refreshStorageUsage() {
  const response = await fetch(API_ROUTES.sessions);
  const data = await readJsonResponse(response, "会话文件");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "无法读取会话文件");
  }

  state.sessions = normalizeSessions(data.sessions);
  state.currentSessionId = data.currentSessionId || state.sessions[0]?.id || null;
  applyStorageInfo(data);
  renderSessions();
  renderCurrentSession();
}

function applyStorageInfo(data) {
  state.storageInfo = {
    file: data.file || state.storageInfo.file,
    fileSizeBytes: Number(data.fileSizeBytes) || 0,
    updatedAt: data.updatedAt ? Number(data.updatedAt) : state.storageInfo.updatedAt,
  };
}

function estimateSessionBytes(session) {
  try {
    return new TextEncoder().encode(JSON.stringify(session)).length;
  } catch {
    return 0;
  }
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(seconds) {
  const value = Math.max(Number(seconds) || 0, 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function migrateLegacyLocalSessions() {
  try {
    const raw = localStorage.getItem(CONFIG.legacyStorageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const sessions = normalizeSessions(parsed);
    if (!sessions.length) return null;

    const currentSessionId =
      localStorage.getItem(CONFIG.legacyCurrentSessionKey) || sessions[0]?.id || null;

    localStorage.removeItem(CONFIG.legacyStorageKey);
    localStorage.removeItem(CONFIG.legacyCurrentSessionKey);

    return {
      sessions,
      currentSessionId,
    };
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

