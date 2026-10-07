# FreeFlow GitHub 同步实现说明

FreeFlow 的 GitHub 同步是本地优先模式。每位用户授权自己的 GitHub 私有仓库，应用只在该仓库中维护 `.freeflow/` 数据目录；源码仓库和用户画布数据彼此隔离。

## 用户授权与仓库

桌面端优先支持 GitHub App Device Flow，也支持在应用内粘贴个人访问令牌。访问令牌只保存到本机凭据存储，不写入画布、设置草稿或 `localStorage`。用户可以选择已有私有仓库，也可以在明确操作后创建 `freeflow-workspace` 私有仓库。应用不要求用户把画布上传到 FreeFlow 的源码仓库。

设备授权需要在构建或运行环境提供授权应用的公开 Client ID；没有 Client ID 时可以使用个人访问令牌：

```text
FREEFLOW_GITHUB_CLIENT_ID=...
```

个人访问令牌建议使用 Fine-grained token：Resource owner 选择自己的账号，只选择同步仓库，并授予 Contents `Read and write`。OAuth App 的设备授权需要启用 Device Flow，并请求私有仓库的 `repo` 范围；GitHub App 需要安装到目标仓库并授予 Contents 读写权限。令牌验证成功后，应用只记录 GitHub 用户的 login/id 和授权方式。

仓库列表和绑定会再次校验仓库是当前账号名下的私有仓库，并使用该仓库的 `default_branch`。如果 GitHub 的 REST 创建仓库接口返回暂时性 5xx，应用会先确认仓库不存在，再通过 GitHub GraphQL 创建私有仓库并初始化一个小型 README；不会强制覆盖已有仓库。

## 数据布局

```text
.freeflow/
  workspace.json
  boards/<boardId>/board.freeflow
  boards/<boardId>/manifest.json
  assets/<sha256>.<ext>
```

Git commit 是历史版本。上传使用 Git Database API 的 blob → tree → commit → 非强制 ref 更新顺序；远端分支在上传期间变化时返回冲突，不静默覆盖。

设置中的“立即同步当前画布”先通过画布引擎保存当前打开的文件，再上传该文件。未保存到本机的画布会提示先保存，不会回退去上传无关的默认画布。同步账本保存本机文件路径和云端 boardId 的对应关系，连续编辑、保存、同步时保持同一画布 ID；路径仅保留在本机账本中。

## 附件策略

默认只同步结构化画布数据和小型附件：图片上限 5 MiB，普通文件上限 10 MiB，视频默认不同步，单次附件批次上限 25 MiB。超限或不支持的资源保留文件名、类型、大小和原因，转换成占位框同步；原设备仍保留本地路径，另一台设备可重新关联。

策略由 `attachmentPolicyService` 集中判断。不要在渲染器中重复实现一套阈值，否则会出现“界面显示可同步但上传失败”的分叉。

## 本地状态

同步账本位于应用数据目录的 `github-sync-ledger.json`，记录仓库、画布基线 commit、远端 HEAD、本地内容哈希、同步状态和跳过附件统计。画布本地保存成功与 GitHub 上传成功是两个独立状态，断网时必须保留本地编辑和待同步状态。

## 平台维护

授权、仓库 API、同步账本、附件策略、序列化和冲突逻辑属于共享代码，必须同步到 `main` 和 `mac`。Windows 使用 DPAPI；其他平台使用现有的本机 AES-GCM 凭据存储。每次发布前要在两个分支分别运行 `node scripts/check-github-sync-core.js`、`node scripts/check-github-sync-auth.js` 和后端安全检查。

真实 Electron 集成测试是显式执行项，不随常规测试访问个人账号。设置 `FREEFLOW_GITHUB_TEST_TOKEN_FILE`（令牌文件）、`FREEFLOW_GITHUB_TEST_LOGIN`（预期账号）和 `FREEFLOW_GITHUB_TEST_REPOSITORY`（测试仓库名），再运行 `node scripts/check-github-sync-live-desktop.js`。首次运行创建私有测试仓库；仅在明确重复使用该测试仓库时设置 `FREEFLOW_GITHUB_TEST_REUSE=1`。应用数据和画布放在临时目录，不读取日常画布；测试结束清理临时凭据，远端测试仓库保留供检查。

参考 GitHub 官方文档：[Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)、[个人访问令牌](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)、[创建仓库 REST API](https://docs.github.com/en/rest/repos/repos#create-a-repository-for-the-authenticated-user)、[GraphQL createRepository](https://docs.github.com/en/graphql/reference/mutations#createrepository)。
