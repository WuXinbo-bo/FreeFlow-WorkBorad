# FreeFlow GitHub 同步实现说明

FreeFlow 的 GitHub 同步是本地优先模式。每位用户授权自己的 GitHub 私有仓库，应用只在该仓库中维护 `.freeflow/` 数据目录；源码仓库和用户画布数据彼此隔离。

## 用户授权与仓库

桌面端使用 GitHub App Device Flow。访问令牌只保存到本机凭据存储，不写入画布或 `localStorage`。用户可以选择已有私有仓库，也可以在明确操作后创建 `freeflow-workspace` 私有仓库。应用不要求用户把画布上传到 FreeFlow 的源码仓库。

需要在构建或运行环境提供 GitHub App 的公开 Client ID：

```text
FREEFLOW_GITHUB_CLIENT_ID=...
```

## 数据布局

```text
.freeflow/
  workspace.json
  boards/<boardId>/board.freeflow
  boards/<boardId>/manifest.json
  assets/<sha256>.<ext>
```

Git commit 是历史版本。上传使用 Git Database API 的 blob → tree → commit → 非强制 ref 更新顺序；远端分支在上传期间变化时返回冲突，不静默覆盖。

## 附件策略

默认只同步结构化画布数据和小型附件：图片上限 5 MiB，普通文件上限 10 MiB，视频默认不同步，单次附件批次上限 25 MiB。超限或不支持的资源保留文件名、类型、大小和原因，转换成占位框同步；原设备仍保留本地路径，另一台设备可重新关联。

策略由 `attachmentPolicyService` 集中判断。不要在渲染器中重复实现一套阈值，否则会出现“界面显示可同步但上传失败”的分叉。

## 本地状态

同步账本位于应用数据目录的 `github-sync-ledger.json`，记录仓库、画布基线 commit、远端 HEAD、本地内容哈希、同步状态和跳过附件统计。画布本地保存成功与 GitHub 上传成功是两个独立状态，断网时必须保留本地编辑和待同步状态。

## 平台维护

授权、仓库 API、同步账本、附件策略、序列化和冲突逻辑属于共享代码，必须同步到 `main` 和 `mac`。凭据存储的 macOS Keychain 适配只进入 `mac`；Windows DPAPI 适配只进入 `main`。每次发布前要在两个分支分别运行 `npm run test:github-sync-core` 和后端安全检查。
