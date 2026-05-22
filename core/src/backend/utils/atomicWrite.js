const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

/**
 * 原子文件写入工具
 *
 * 使用 write-to-temp + rename 策略确保文件写入的原子性：
 * 1. 写入临时文件
 * 2. 强制 fsync 到磁盘
 * 3. 原子重命名覆盖目标文件
 * 4. 清理临时文件
 *
 * 在同一文件系统上，rename 是原子操作
 */

const DEFAULT_ATOMIC_WRITE_OPTIONS = Object.freeze({
  // 临时文件后缀
  tempSuffix: ".tmp",
  // 是否强制 fsync
  fsync: true,
  // 写入失败时是否保留临时文件用于诊断
  preserveTempOnFailure: false,
  // 文件权限（模式）
  mode: 0o644,
  // 编码
  encoding: "utf8",
});

/**
 * 生成唯一的临时文件名
 */
function generateTempFilePath(targetPath, suffix = ".tmp") {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const randomId = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now();
  return path.join(dir, `.${base}.${timestamp}.${randomId}${suffix}`);
}

/**
 * 强制将文件内容刷新到磁盘
 */
async function fsyncFile(fileHandle) {
  try {
    await fileHandle.sync();
  } catch (syncError) {
    // Windows 可能不支持 sync，尝试 fsync 文件描述符
    try {
      await fileHandle.datasync?.();
    } catch {
      // 忽略 fsync 失败，这不是致命的
    }
  }
}

/**
 * 原子写入文件
 * @param {string} targetPath - 目标文件路径
 * @param {string|Buffer} data - 要写入的数据
 * @param {object} options - 配置选项
 * @returns {Promise<{ok: boolean, bytesWritten: number, tempPath?: string, error?: string}>}
 */
async function atomicWriteFile(targetPath, data, options = {}) {
  const opts = { ...DEFAULT_ATOMIC_WRITE_OPTIONS, ...options };
  const tempPath = generateTempFilePath(targetPath, opts.tempSuffix);

  let fileHandle = null;

  try {
    // 确保目录存在
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // 1. 写入临时文件
    fileHandle = await fs.open(tempPath, "w", opts.mode);

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, opts.encoding);
    await fileHandle.write(buffer);

    // 2. 强制刷新到磁盘（确保数据持久化）
    if (opts.fsync) {
      await fsyncFile(fileHandle);
    }

    await fileHandle.close();
    fileHandle = null;

    // 3. 原子重命名（在同一文件系统上是原子操作）
    await fs.rename(tempPath, targetPath);

    // 4. 同步目录确保文件元数据持久化
    if (opts.fsync) {
      try {
        const dirHandle = await fs.open(path.dirname(targetPath), "r");
        await dirHandle.sync();
        await dirHandle.close();
      } catch {
        // 目录 sync 不是关键，失败时忽略
      }
    }

    return {
      ok: true,
      bytesWritten: buffer.length,
      tempPath: null,
    };

  } catch (error) {
    // 清理临时文件
    if (!opts.preserveTempOnFailure) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // 忽略清理失败
      }
    }

    // 关闭文件句柄
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch {
        // 忽略
      }
    }

    return {
      ok: false,
      bytesWritten: 0,
      tempPath: opts.preserveTempOnFailure ? tempPath : undefined,
      error: error.message || String(error),
    };
  }
}

/**
 * 带备份的原子写入
 * 写入新文件前先创建原文件的备份
 * @param {string} targetPath - 目标文件路径
 * @param {string|Buffer} data - 要写入的数据
 * @param {object} options - 配置选项
 * @returns {Promise<{ok: boolean, bytesWritten: number, backupPath?: string, error?: string}>}
 */
async function atomicWriteFileWithBackup(targetPath, data, options = {}) {
  const backupOptions = {
    backupSuffix: `.backup-${Date.now()}`,
    maxBackups: 3,
    ...options,
  };

  let backupPath = null;

  try {
    // 检查原文件是否存在
    await fs.access(targetPath);

    // 创建备份
    backupPath = `${targetPath}${backupOptions.backupSuffix}`;
    await fs.copyFile(targetPath, backupPath, fs.constants.COPYFILE_FICLONE);
  } catch {
    // 原文件不存在，无需备份
  }

  // 执行原子写入
  const result = await atomicWriteFile(targetPath, data, options);

  if (result.ok && backupPath) {
    result.backupPath = backupPath;

    // 清理旧备份（保留最近 N 个）
    try {
      const dir = path.dirname(targetPath);
      const base = path.basename(targetPath);
      const entries = await fs.readdir(dir, { withFileTypes: true });

      const backups = entries
        .filter(entry => entry.isFile() && entry.name.startsWith(`.${base}.backup-`))
        .map(entry => ({
          name: entry.name,
          path: path.join(dir, entry.name),
          time: parseInt(entry.name.match(/\.backup-(\d+)$/)?.[1] || 0, 10),
        }))
        .filter(b => !isNaN(b.time))
        .sort((a, b) => b.time - a.time);

      // 删除超出限制的旧备份
      for (const oldBackup of backups.slice(backupOptions.maxBackups)) {
        try {
          await fs.unlink(oldBackup.path);
        } catch {
          // 忽略清理失败
        }
      }
    } catch {
      // 忽略备份清理失败
    }
  }

  return result;
}

/**
 * 安全写入 JSON 文件
 * 带格式化和原子性保证
 */
async function atomicWriteJsonFile(targetPath, data, options = {}) {
  const jsonOptions = {
    space: 2,
    replacer: null,
    ...options,
  };

  try {
    const content = JSON.stringify(data, jsonOptions.replacer, jsonOptions.space);
    return await atomicWriteFileWithBackup(targetPath, content, jsonOptions);
  } catch (error) {
    return {
      ok: false,
      bytesWritten: 0,
      error: `JSON 序列化失败: ${error.message || String(error)}`,
    };
  }
}

module.exports = {
  atomicWriteFile,
  atomicWriteFileWithBackup,
  atomicWriteJsonFile,
  generateTempFilePath,
  fsyncFile,
  DEFAULT_ATOMIC_WRITE_OPTIONS,
};
