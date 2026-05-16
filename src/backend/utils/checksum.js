const crypto = require("crypto");

/**
 * 文件校验和工具
 * 为 .freeflow 文件提供完整性验证
 *
 * 实现策略：
 * 1. 支持 CRC32 和 SHA-256 两种校验和算法
 * 2. 校验和存储在文件 envelope 的 meta.checksum 字段
 * 3. 支持低开锈校验（可选）
 */

const CHECKSUM_ALGORITHMS = Object.freeze({
  CRC32: "crc32",
  SHA256: "sha256",
});

const DEFAULT_CHECKSUM_OPTIONS = Object.freeze({
  algorithm: CHECKSUM_ALGORITHMS.CRC32,
  includePayloadOnly: false, // true = 只校验 payload，false = 校验整个 envelope
});

/**
 * 计算 CRC32 校验和（快速检测）
 */
function computeCrc32(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const crcTable = computeCrc32.crcTable || (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let j = 0; j < 8; j += 1) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    computeCrc32.crcTable = table;
    return table;
  })();

  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc = (crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8)) >>> 0;
  }
  crc = (crc ^ 0xFFFFFFFF) >>> 0;
  return crc.toString(16).toUpperCase().padStart(8, "0");
}

/**
 * 计算 SHA-256 校验和（安全强度高）
 */
function computeSha256(data) {
  const hash = crypto.createHash("sha256");
  hash.update(Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"));
  return hash.digest("hex").toUpperCase();
}

/**
 * 计算数据校验和
 * @param {string|Buffer} data - 要校验的数据
 * @param {string} algorithm - 算法 ('crc32' 或 'sha256')
 * @returns {string} 校验和字符串
 */
function computeChecksum(data, algorithm = CHECKSUM_ALGORITHMS.CRC32) {
  switch (algorithm.toLowerCase()) {
    case CHECKSUM_ALGORITHMS.CRC32:
      return computeCrc32(data);
    case CHECKSUM_ALGORITHMS.SHA256:
      return computeSha256(data);
    default:
      throw new Error(`不支持的校验和算法: ${algorithm}`);
  }
}

/**
 * 为画布 envelope 添加校验和
 * @param {object} envelope - 画布文件 envelope
 * @param {object} options - 配置选项
 * @returns {object} 带校验和的 envelope
 */
function addChecksumToEnvelope(envelope, options = {}) {
  const opts = { ...DEFAULT_CHECKSUM_OPTIONS, ...options };

  // 创建要校验的数据
  let dataToCheck;
  if (opts.includePayloadOnly) {
    // 只校验 payload（不含 createdAt 等元数据）
    dataToCheck = JSON.stringify(envelope.payload || {});
  } else {
    // 创建无校验和版本的 envelope 副本进行校验
    const sanitizedEnvelope = {
      kind: envelope.kind,
      formatVersion: envelope.formatVersion,
      app: envelope.app,
      source: envelope.source,
      createdAt: envelope.createdAt,
      updatedAt: envelope.updatedAt,
      payloadKind: envelope.payloadKind,
      payload: envelope.payload,
    };
    dataToCheck = JSON.stringify(sanitizedEnvelope);
  }

  const checksum = computeChecksum(dataToCheck, opts.algorithm);

  return {
    ...envelope,
    meta: {
      ...envelope.meta,
      checksum: {
        algorithm: opts.algorithm,
        value: checksum,
        timestamp: Date.now(),
        scope: opts.includePayloadOnly ? "payload" : "envelope",
      },
    },
  };
}

/**
 * 验证画布 envelope 的校验和
 * @param {object} envelope - 画布文件 envelope
 * @param {object} options - 配置选项
 * @returns {{valid: boolean, algorithm?: string, expected?: string, actual?: string, error?: string}}
 */
function verifyEnvelopeChecksum(envelope, options = {}) {
  const opts = { ...DEFAULT_CHECKSUM_OPTIONS, ...options };

  // 检查是否有校验和信息
  const checksum = envelope?.meta?.checksum;
  if (!checksum) {
    // 无校验和信息，视为旧版本文件（返回 warning 但不报错）
    return {
      valid: true,
      warning: "文件无校验和信息（旧版本格式）",
      algorithm: null,
      expected: null,
      actual: null,
    };
  }

  const algorithm = checksum.algorithm || opts.algorithm;
  const expectedChecksum = checksum.value;

  if (!expectedChecksum) {
    return {
      valid: false,
      error: "校验和信息缺失",
      algorithm,
    };
  }

  // 计算实际校验和
  const includePayloadOnly = checksum.scope === "payload";
  let dataToCheck;
  if (includePayloadOnly) {
    dataToCheck = JSON.stringify(envelope.payload || {});
  } else {
    const sanitizedEnvelope = {
      kind: envelope.kind,
      formatVersion: envelope.formatVersion,
      app: envelope.app,
      source: envelope.source,
      createdAt: envelope.createdAt,
      updatedAt: envelope.updatedAt,
      payloadKind: envelope.payloadKind,
      payload: envelope.payload,
    };
    dataToCheck = JSON.stringify(sanitizedEnvelope);
  }

  try {
    const actualChecksum = computeChecksum(dataToCheck, algorithm);

    if (actualChecksum !== expectedChecksum.toUpperCase()) {
      return {
        valid: false,
        error: "文件校验和不匹配 - 文件可能已损坏",
        algorithm,
        expected: expectedChecksum.toUpperCase(),
        actual: actualChecksum,
      };
    }

    return {
      valid: true,
      algorithm,
      expected: expectedChecksum.toUpperCase(),
      actual: actualChecksum,
    };
  } catch (err) {
    return {
      valid: false,
      error: `校验和计算失败: ${err.message}`,
      algorithm,
    };
  }
}

/**
 * 为画布内容生成简要校验和（用于快速对比）
 * @param {object} content - 画布内容
 * @returns {string} 快速校验和
 */
function generateContentFingerprint(content) {
  const str = JSON.stringify(content);
  // 使用前缀和长度作为快速指纹
  const prefix = str.slice(0, 200);
  const len = str.length;
  const hash = crypto.createHash("md5");
  hash.update(`${prefix}:${len}:${Buffer.byteLength(str)}`);
  return hash.digest("base64").slice(0, 12);
}

module.exports = {
  CHECKSUM_ALGORITHMS,
  DEFAULT_CHECKSUM_OPTIONS,
  computeChecksum,
  addChecksumToEnvelope,
  verifyEnvelopeChecksum,
  generateContentFingerprint,
};
