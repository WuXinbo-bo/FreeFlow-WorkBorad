function normalizeProviderBaseUrl(baseUrl) {
  const input = String(baseUrl || "").trim();
  if (!input) throw new Error("请先填写 Base URL");
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("Base URL 格式无效");
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error("Base URL 只支持 HTTP 或 HTTPS");
  if (parsed.username || parsed.password) throw new Error("Base URL 不能包含账号或密码");
  if (parsed.search || parsed.hash) throw new Error("Base URL 不能包含查询参数或片段");
  return parsed.toString().replace(/\/+$/, "");
}

function providerApiRoot(provider, baseUrl) {
  const suffixes = provider === "claude" ? /\/(?:v1\/)?(?:models|messages)$/i : /\/(?:v1\/)?(?:models|responses|chat\/completions)$/i;
  const normalized = normalizeProviderBaseUrl(baseUrl).replace(suffixes, "");
  return /\/v1$/i.test(normalized) ? normalized : `${normalized}/v1`;
}

function assertProvider(provider) {
  const id = String(provider || "").trim().toLowerCase();
  if (!new Set(["codex", "claude"]).has(id)) throw Object.assign(new Error("不支持的 Provider"), { statusCode: 400 });
  return id;
}

function endpointCandidates(provider, baseUrl, resource) {
  const id = assertProvider(provider);
  const suffixes = id === "claude" ? /\/(?:v1\/)?(?:models|messages)$/i : /\/(?:v1\/)?(?:models|responses|chat\/completions)$/i;
  const rawRoot = normalizeProviderBaseUrl(baseUrl).replace(suffixes, "");
  return [...new Set([`${providerApiRoot(id, baseUrl)}/${resource}`, `${rawRoot}/${resource}`])];
}

function headersFor(provider, apiKey) {
  if (provider === "claude") {
    return {
      "content-type": "application/json",
      accept: "application/json",
      "x-api-key": apiKey,
      authorization: `Bearer ${apiKey}`,
      "anthropic-version": "2023-06-01",
    };
  }
  return { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${apiKey}` };
}

function modelOptions(payload) {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload?.items)
          ? payload.items
          : [];
  const seen = new Set();
  const result = [];
  for (const entry of source) {
    const item = typeof entry === "string" ? { id: entry } : entry;
    const id = String(item?.id || item?.model || item?.name || "").trim().slice(0, 200);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, displayName: String(item?.display_name || item?.displayName || item?.name || id).trim() || id });
  }
  return result.sort((left, right) => left.id.localeCompare(right.id));
}

async function responsePayload(response) {
  const text = await response.text();
  try {
    return { text, json: text ? JSON.parse(text) : {} };
  } catch {
    return { text, json: null };
  }
}

function redirectError(response) {
  if (response.status < 300 || response.status >= 400) return null;
  const location = response.headers?.get?.("location") || "未知地址";
  return new Error(`上游接口要求重定向（HTTP ${response.status}，${location}），为保护凭据已拒绝自动跳转`);
}

function upstreamMessage(payload, fallback) {
  const value = payload?.error?.message || payload?.error || payload?.message || fallback;
  return String(value || fallback).replace(/\s+/g, " ").slice(0, 300);
}

function createAgentConnectionService(options = {}) {
  const settingsService = options.settingsService;
  const fetchImpl = options.fetch || globalThis.fetch;
  const validateRuntime = options.validateRuntime;
  if (!settingsService || typeof fetchImpl !== "function") throw new Error("Agent connection dependencies are unavailable");

  async function saveConnection(provider, input = {}) {
    provider = assertProvider(provider);
    const baseUrl = String(input.baseUrl || "").trim().replace(/\/+$/, "");
    providerApiRoot(provider, baseUrl);
    return settingsService.updateProviderConnection(provider, {
      baseUrl,
      apiKey: String(input.apiKey || ""),
      apiKeyAction: String(input.apiKeyAction || "keep"),
    });
  }

  async function refreshModels(provider) {
    provider = assertProvider(provider);
    const current = await settingsService.readAgentRuntimeSettings(provider);
    if (!current.apiKey) throw new Error("请先保存 API Key");
    let lastError = null;
    for (const endpoint of endpointCandidates(provider, current.baseUrl, "models")) {
      const response = await fetchImpl(endpoint, {
        method: "GET",
        headers: headersFor(provider, current.apiKey),
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      const redirect = redirectError(response);
      if (redirect) throw redirect;
      const payload = await responsePayload(response);
      if (!response.ok) {
        lastError = new Error(`模型列表请求失败（HTTP ${response.status}）：${upstreamMessage(payload.json, payload.text)}`);
        if ([404, 405].includes(response.status)) continue;
        throw lastError;
      }
      if (!payload.json) throw new Error("模型列表接口返回了无法解析的 JSON");
      const models = modelOptions(payload.json);
      if (!models.length) {
        lastError = new Error("接口返回成功，但没有可识别的模型");
        continue;
      }
      const settings = await settingsService.updateProviderModels(provider, models);
      return { provider, endpoint, models, settings };
    }
    throw lastError || new Error("未发现可用模型");
  }

  async function selectModel(provider, model) {
    provider = assertProvider(provider);
    const settings = await settingsService.selectProviderModel(provider, String(model || "").trim());
    return { provider, model, settings };
  }

  async function testConnection(provider) {
    provider = assertProvider(provider);
    const current = await settingsService.readAgentRuntimeSettings(provider);
    if (!current.apiKey) throw new Error("请先保存 API Key");
    if (!current.selectedModel) throw new Error("请先刷新并选择模型");
    const resource = provider === "claude" ? "messages" : "responses";
    const body = provider === "claude"
      ? { model: current.selectedModel, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }
      : { model: current.selectedModel, input: "Reply with OK.", max_output_tokens: 16 };
    let lastError = null;
    for (const endpoint of endpointCandidates(provider, current.baseUrl, resource)) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: headersFor(provider, current.apiKey),
        body: JSON.stringify(body),
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      const redirect = redirectError(response);
      if (redirect) throw redirect;
      const payload = await responsePayload(response);
      if (!response.ok) {
        lastError = new Error(`模型验证失败（HTTP ${response.status}）：${upstreamMessage(payload.json, payload.text)}`);
        if ([404, 405].includes(response.status)) continue;
        throw lastError;
      }
      if (!payload.json) throw new Error("模型验证接口返回了无法解析的 JSON");
      if (provider === "codex") {
        if (typeof validateRuntime !== "function") throw new Error("Codex app-server 验证器不可用");
        await validateRuntime(provider);
      }
      const settings = await settingsService.markProviderValidated(provider);
      return { provider, endpoint, model: current.selectedModel, ready: true, settings };
    }
    throw lastError || new Error("模型验证失败");
  }

  return { saveConnection, refreshModels, selectModel, testConnection };
}

module.exports = {
  createAgentConnectionService,
  headersFor,
  modelOptions,
  providerApiRoot,
  normalizeProviderBaseUrl,
  endpointCandidates,
};
