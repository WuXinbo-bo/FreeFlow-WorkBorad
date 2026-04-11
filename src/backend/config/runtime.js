const os = require("os");

const PORT = process.env.PORT || 3000;
const AI_PROVIDER = String(process.env.AI_PROVIDER || "ollama").trim().toLowerCase();
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OPENAI_COMPAT_BASE_URL = process.env.OPENAI_COMPAT_BASE_URL || "http://127.0.0.1:1234/v1";
const BIGMODEL_BASE_URL = process.env.BIGMODEL_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
const BIGMODEL_API_KEY = String(process.env.BIGMODEL_API_KEY || "").trim();
const LOCAL_MODEL_PREFIX = "local::";
const CLOUD_MODEL_PREFIX = "cloud::";
const DEFAULT_MODEL =
  process.env.AI_MODEL ||
  process.env.OLLAMA_MODEL ||
  process.env.LMSTUDIO_MODEL ||
  process.env.BIGMODEL_MODEL ||
  "qwen2.5:0.5b-instruct-q4_0";
const CPU_THREAD_COUNT = Math.max(
  1,
  typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length
);
const CPU_FALLBACK_THREAD_COUNT = Math.max(
  1,
  Number(process.env.OLLAMA_NUM_THREAD) || Math.floor(CPU_THREAD_COUNT / 2)
);
const RECOMMENDED_MODELS = ["qwen3.5:4b"];
const BIGMODEL_MODELS = ["glm-4.7-flash", "glm-4.6v-flash"];
const AGENT_VISUAL_MODEL = "glm-4.6v-flash";
const AGENT_SCREENSHOT_SETTLE_MS = 350;

module.exports = {
  PORT,
  AI_PROVIDER,
  OLLAMA_BASE_URL,
  OPENAI_COMPAT_BASE_URL,
  BIGMODEL_BASE_URL,
  BIGMODEL_API_KEY,
  LOCAL_MODEL_PREFIX,
  CLOUD_MODEL_PREFIX,
  DEFAULT_MODEL,
  CPU_THREAD_COUNT,
  CPU_FALLBACK_THREAD_COUNT,
  RECOMMENDED_MODELS,
  BIGMODEL_MODELS,
  AGENT_VISUAL_MODEL,
  AGENT_SCREENSHOT_SETTLE_MS,
};
