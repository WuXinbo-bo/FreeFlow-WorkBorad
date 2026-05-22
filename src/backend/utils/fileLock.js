const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

/**
 * 文件锁工具
 * 用于防止多个进程/实例同时写入同一文件
 *
 * 实现策略：
 * 1. 使用文件系统锁文件（.lock 后缀）
 * 2. 锁文件包含进程 ID 和时间戳
 * 3. 自动检测死锁（基于过期时间）
 * 4. 支持锁超时和自动释放
 */

const DEFAULT_LOCK_OPTIONS = Object.freeze({
  // 锁文件后缀
  lockSuffix: ".lock",
  // 锁超时时间（毫秒）
  lockTimeoutMs: 30_000,
  // 锁过期时间（毫秒）- 超过此时间认为锁已失效
  lockExpiryMs: 60_000,
  // 重试间隔（毫秒）
  retryIntervalMs: 100,
  // 最大重试次数
  maxRetries: 50,
  // 锁信息
  processId: process.pid,
  hostname: os.hostname(),
});

/**
 * 生成锁文件路径
 */
function generateLockFilePath(targetPath, lockSuffix = ".lock") {
  return `${targetPath}${lockSuffix}`;
}

/**
 * 生成锁标识符
 */
function generateLockId() {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * 读取锁文件信息
 */
async function readLockInfo(lockPath) {
  try {
    const content = await fs.readFile(lockPath, "utf8");
    const data = JSON.parse(content);

    // 验证锁文件格式
    if (!data.processId || !data.lockId || !data.createdAt) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * 检查锁是否已过期
 */
function isLockExpired(lockInfo, expiryMs = 60_000) {
  if (!lockInfo) {
    return true;
  }

  const lockAge = Date.now() - lockInfo.createdAt;
  return lockAge > expiryMs;
}

/**
 * 检查锁是否由当前进程持有
 */
function isLockOwnedByCurrentProcess(lockInfo) {
  if (!lockInfo) {
    return false;
  }

  return (
    lockInfo.processId === process.pid &&
    lockInfo.hostname === os.hostname()
  );
}

/**
 * 创建锁文件
 */
async function createLockFile(lockPath, lockId) {
  const lockInfo = {
    processId: process.pid,
    hostname: os.hostname(),
    lockId,
    createdAt: Date.now(),
    lockPath,
  };

  try {
    await fs.writeFile(lockPath, JSON.stringify(lockInfo, null, 2), "utf8");
    return lockInfo;
  } catch (error) {
    throw new Error(`创建锁文件失败: ${error.message}`);
  }
}

/**
 * 删除锁文件
 */
async function removeLockFile(lockPath, lockId) {
  try {
    // 验证锁是否仍由当前进程持有
    const lockInfo = await readLockInfo(lockPath);
    if (lockInfo && lockInfo.lockId === lockId) {
      await fs.unlink(lockPath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 获取文件锁
 * @param {string} targetPath - 要锁定的文件路径
 * @param {object} options - 配置选项
 * @returns {Promise<{lockId: string, lockPath: string, release: () => Promise<boolean>}>}
 */
async function acquireFileLock(targetPath, options = {}) {
  const opts = { ...DEFAULT_LOCK_OPTIONS, ...options };
  const lockPath = generateLockFilePath(targetPath, opts.lockSuffix);
  const lockId = generateLockId();

  const startTime = Date.now();

  while (true) {
    try {
      // 尝试创建锁文件（原子操作）
      await createLockFile(lockPath, lockId);
      return {
        lockId,
        lockPath,
        release: () => releaseFileLock(lockPath, lockId),
      };
    } catch {
      // 锁文件已存在，检查是否过期
      const existingLock = await readLockInfo(lockPath);

      if (isLockExpired(existingLock, opts.lockExpiryMs)) {
        // 锁已过期，尝试删除
        try {
          await fs.unlink(lockPath);
          // 短暂等待确保其他进程也检测到锁过期
          await new Promise(resolve => setTimeout(resolve, 10));
          continue;
        } catch {
          // 删除失败，可能是其他进程正在操作
        }
      }

      // 检查是否由当前进程持有
      if (isLockOwnedByCurrentProcess(existingLock)) {
        // 已经持有锁，直接返回
        return {
          lockId: existingLock.lockId,
          lockPath,
          release: () => releaseFileLock(lockPath, existingLock.lockId),
        };
      }

      // 检查是否超时
      const elapsed = Date.now() - startTime;
      if (elapsed >= opts.lockTimeoutMs) {
        throw new Error(
          `获取文件锁超时 (${opts.lockTimeoutMs}ms): ${targetPath}`
        );
      }

      // 等待重试
      await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
    }
  }
}

/**
 * 释放文件锁
 */
async function releaseFileLock(lockPath, lockId) {
  return removeLockFile(lockPath, lockId);
}

/**
 * 在锁保护下执行操作
 * @param {string} targetPath - 要锁定的文件路径
 * @param {Function} operation - 要执行的操作
 * @param {object} options - 配置选项
 * @returns {Promise<*>}
 */
async function withFileLock(targetPath, operation, options = {}) {
  const { lockId, lockPath, release } = await acquireFileLock(targetPath, options);

  try {
    const result = await operation();
    return result;
  } finally {
    await release();
  }
}

/**
 * 检查文件是否被锁定
 */
async function isFileLocked(targetPath, options = {}) {
  const opts = { ...DEFAULT_LOCK_OPTIONS, ...options };
  const lockPath = generateLockFilePath(targetPath, opts.lockSuffix);

  const lockInfo = await readLockInfo(lockPath);
  if (!lockInfo) {
    return false;
  }

  // 检查是否过期
  if (isLockExpired(lockInfo, opts.lockExpiryMs)) {
    return false;
  }

  // 检查是否由当前进程持有
  if (isLockOwnedByCurrentProcess(lockInfo)) {
    return false;
  }

  return true;
}

/**
 * 清理过期的锁文件
 */
async function cleanupExpiredLocks(targetPath, options = {}) {
  const opts = { ...DEFAULT_LOCK_OPTIONS, ...options };
  const lockPath = generateLockFilePath(targetPath, opts.lockSuffix);

  const lockInfo = await readLockInfo(lockPath);
  if (!lockInfo) {
    return false;
  }

  if (isLockExpired(lockInfo, opts.lockExpiryMs)) {
    try {
      await fs.unlink(lockPath);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

module.exports = {
  acquireFileLock,
  releaseFileLock,
  withFileLock,
  isFileLocked,
  cleanupExpiredLocks,
  readLockInfo,
  isLockExpired,
  isLockOwnedByCurrentProcess,
  generateLockFilePath,
  DEFAULT_LOCK_OPTIONS,
};
