import { DESKTOP_SHELL, IS_DESKTOP_APP } from "../config/index.js";

function normalizeTargetEntry(item = {}) {
  return {
    id: String(item.id || "").trim(),
    name: String(item.name || item.label || "").trim(),
    label: String(item.label || item.name || "").trim(),
    kind: "window",
    note: String(item.note || "").trim(),
  };
}

export async function listAiMirrorTargets() {
  if (!IS_DESKTOP_APP || typeof DESKTOP_SHELL?.listAiMirrorTargets !== "function") {
    return [];
  }

  const response = await DESKTOP_SHELL.listAiMirrorTargets();
  if (!response?.ok) {
    throw new Error(response?.error || "无法读取 AI 镜像目标");
  }

  return (Array.isArray(response.targets) ? response.targets : []).map(normalizeTargetEntry).filter((item) => item.id);
}

export async function prepareAiMirrorTarget(targetId = "") {
  if (!IS_DESKTOP_APP || typeof DESKTOP_SHELL?.prepareAiMirrorTarget !== "function") {
    throw new Error("当前环境不支持 AI 镜像");
  }

  const response = await DESKTOP_SHELL.prepareAiMirrorTarget({
    targetId: String(targetId || "").trim(),
  });
  if (!response?.ok) {
    throw new Error(response?.error || "无法准备 AI 镜像目标");
  }

  return response;
}

export async function stopAiMirrorTarget(targetId = "") {
  if (!IS_DESKTOP_APP || typeof DESKTOP_SHELL?.stopAiMirrorTarget !== "function") {
    return { ok: true, active: false };
  }

  const response = await DESKTOP_SHELL.stopAiMirrorTarget({
    targetId: String(targetId || "").trim(),
  });
  if (!response?.ok) {
    throw new Error(response?.error || "无法停止 AI 镜像目标");
  }

  return response;
}
