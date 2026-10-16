export function summarizeSyncPlan(plan) {
  const counts = plan?.counts || {};
  return {
    upload: Number(counts["local-only"] || 0) + Number(counts["local-changed"] || 0) + Number(counts["local-renamed"] || 0),
    pull: Number(counts["remote-only"] || 0) + Number(counts["remote-changed"] || 0) + Number(counts["remote-renamed"] || 0) + Number(counts["local-missing"] || 0),
    conflict: Number(counts["both-changed"] || 0) + Number(counts.conflict || 0) + Number(counts["path-collision"] || 0) + Number(counts["duplicate-id"] || 0),
    deleted: Number(counts["deleted-remote"] || 0),
  };
}

export function boardSyncLabel({ state = "", cached = false, changed = false, connected = false, dirty = false, reloadRequired = false } = {}) {
  if (reloadRequired) return "磁盘已更新 · 待重载";
  if (dirty) return connected ? "未保存 · 待上传" : "未保存";
  if (!connected) return "仅本地";
  if (changed) return "本地已更新 · 待检查";
  const labels = { synced: "上次已同步", "up-to-date": cached ? "上次已同步" : "已同步", "local-only": "待首次上传", "local-changed": "待上传", "local-renamed": "名称待上传", "remote-only": "待拉取", "remote-changed": "待拉取", "remote-renamed": "远端已改名", "local-missing": "本机文件缺失", "duplicate-id": "画布身份重复", "both-changed": "有冲突", conflict: "有冲突", "path-collision": "路径冲突", "deleted-remote": "远程已删除", error: "同步失败" };
  return labels[state] || "尚未检查";
}
