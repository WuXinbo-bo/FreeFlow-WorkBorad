/**
 * 带深度限制的 JSON 解析器
 *
 * 防止恶意或畸形 JSON 导致栈溢出
 * 最大深度默认为 32 层（足以覆盖正常的 board 数据结构）
 */

const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_STRING_LENGTH = 1024 * 1024; // 1MB per string
const DEFAULT_MAX_ARRAY_LENGTH = 100_000;
const DEFAULT_MAX_OBJECT_KEYS = 10_000;

const DEFAULT_SAFE_PARSE_OPTIONS = Object.freeze({
  maxDepth: DEFAULT_MAX_DEPTH,
  maxStringLength: DEFAULT_MAX_STRING_LENGTH,
  maxArrayLength: DEFAULT_MAX_ARRAY_LENGTH,
  maxObjectKeys: DEFAULT_MAX_OBJECT_KEYS,
  throwOnError: false,
});

/**
 * 安全解析 JSON，带深度和大小限制
 * @param {string} text - 要解析的 JSON 字符串
 * @param {object} options - 配置选项
 * @returns {any} 解析结果，失败时返回 undefined
 */
export function safeJsonParse(text, options = {}) {
  const opts = { ...DEFAULT_SAFE_PARSE_OPTIONS, ...options };
  const cleanText = String(text || "").replace(/^﻿/, "").trim();
  if (!cleanText) {
    return opts.throwOnError ? undefined : undefined;
  }

  // 先做快速检查
  if (cleanText.length > 100 * 1024 * 1024) {
    // 100MB 以上直接拒绝
    if (opts.throwOnError) {
      throw new Error("JSON 文本过大，超过安全限制");
    }
    return undefined;
  }

  // 先尝试标准 JSON.parse（更快）
  try {
    const result = JSON.parse(cleanText);
    // 然后验证深度
    return validateDepth(result, opts);
  } catch (error) {
    if (opts.throwOnError) {
      throw error;
    }
    return undefined;
  }
}

/**
 * 验证 JSON 值的深度和大小
 */
function validateDepth(value, opts, currentDepth = 0) {
  if (currentDepth > opts.maxDepth) {
    throw new Error(`JSON 深度超过安全限制 (${opts.maxDepth} 层)`);
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (value.length > opts.maxStringLength) {
      throw new Error(`JSON 字符串长度超过安全限制 (${opts.maxStringLength} 字符)`);
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > opts.maxArrayLength) {
      throw new Error(`JSON 数组长度超过安全限制 (${opts.maxArrayLength} 元素)`);
    }
    return value.map((item) => validateDepth(item, opts, currentDepth + 1));
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length > opts.maxObjectKeys) {
      throw new Error(`JSON 对象键数量超过安全限制 (${opts.maxObjectKeys} 个键)`);
    }
    const result = {};
    for (const key of keys) {
      result[key] = validateDepth(value[key], opts, currentDepth + 1);
    }
    return result;
  }

  return value;
}

/**
 * 获取 JSON 的估算深度（不解析完整内容）
 */
export function estimateJsonDepth(text) {
  const cleanText = String(text || "").replace(/^﻿/, "").trim();
  if (!cleanText || !cleanText.startsWith("{") && !cleanText.startsWith("[")) {
    return 0;
  }
  let maxDepth = 0;
  let currentDepth = 0;
  let inString = false;
  let escaping = false;
  for (let i = 0; i < cleanText.length && i < 10_000; i += 1) {
    const char = cleanText[i];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      currentDepth += 1;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === "}" || char === "]") {
      currentDepth = Math.max(0, currentDepth - 1);
    }
  }
  return maxDepth;
}

/**
 * 快速检查 JSON 是否可能超过深度限制
 */
export function exceedsDepthLimit(text, maxDepth = DEFAULT_MAX_DEPTH) {
  return estimateJsonDepth(text) > maxDepth;
}

/**
 * 安全解析 board 文件文本
 * 带深度限制的 board JSON 解析
 */
export function safeParseBoardFileText(text, options = {}) {
  const opts = {
    maxDepth: DEFAULT_MAX_DEPTH,
    ...options,
  };
  return safeJsonParse(text, opts);
}

export default {
  safeJsonParse,
  estimateJsonDepth,
  exceedsDepthLimit,
  safeParseBoardFileText,
  DEFAULT_MAX_DEPTH,
  DEFAULT_SAFE_PARSE_OPTIONS,
};
