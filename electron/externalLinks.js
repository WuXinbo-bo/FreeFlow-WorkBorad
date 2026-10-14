"use strict";

async function openExternalLink(shell, value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
      return { ok: false, error: "不支持的链接类型" };
    }
    await shell.openExternal(url.toString());
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "链接打开失败" };
  }
}

module.exports = { openExternalLink };
